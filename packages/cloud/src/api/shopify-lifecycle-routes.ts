/**
 * Shopify lifecycle webhook handlers — app/uninstalled and shop/redact.
 *
 * These endpoints are public (no JWT auth) and HMAC-verified.
 * Raw body parsing is registered in gateway.ts before these routes mount.
 *
 * HMAC secret resolution (two-tier):
 *   1. Platform-level SHOPIFY_APP_CLIENT_SECRET env var (no DB lookup needed).
 *   2. Per-connection clientSecret from the credential store — only for connections
 *      that have a shopify_client_id set (indicating an operator-supplied custom app).
 *
 * Trying the platform secret first avoids unnecessary credential fetches for the
 * common case (Clarissi platform app) and reduces timing variance before auth.
 * HMAC verification is always required — there is no empty-key fallback.
 */

import { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { Pool } from 'pg';
import { CredentialManager } from '../mcp/credential-manager';

export interface ShopifyLifecycleConfig {
  db: Pool;
  credentialManager: CredentialManager;
}

/**
 * Verifies a Shopify lifecycle webhook HMAC against all available secrets.
 *
 * Tries the platform env-var secret first (no DB round-trip), then falls back
 * to per-connection secrets for connections that belong to a custom Shopify app.
 * Returns true if any available secret produces a matching HMAC; false otherwise.
 * Returns false immediately if no secrets are configured at all.
 */
async function verifyLifecycleHmac(
  rawBody: Buffer,
  shopifyHmac: string,
  customAppConnections: Array<{ id: string; org_id: string }>,
  credentialManager: CredentialManager,
): Promise<boolean> {
  // 1. Platform-level secret (fast path — no credential store access needed)
  const platformSecret = process.env.SHOPIFY_APP_CLIENT_SECRET;
  if (platformSecret) {
    const expected = createHmac('sha256', platformSecret).update(rawBody).digest('base64');
    try {
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(shopifyHmac))) return true;
    } catch {
      // timingSafeEqual throws if buffers differ in length — not this secret
    }
  }

  // 2. Per-connection secrets for custom-app connections
  for (const row of customAppConnections) {
    const creds = await credentialManager.getCredentials(
      { type: 'org', orgId: row.org_id }, row.id,
    ) as Record<string, unknown> | null;
    const secret = creds?.clientSecret;
    if (!secret || typeof secret !== 'string') continue;
    const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
    try {
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(shopifyHmac))) return true;
    } catch { /* length mismatch */ }
  }

  return false;
}

export function createShopifyLifecycleRoutes(config: ShopifyLifecycleConfig): Router {
  const router = Router();

  // POST /app-uninstalled
  // Shopify calls this when a merchant removes the app.
  // Marks integration_connections inactive, then deletes the access token.
  // Order matters: deactivate first so the row is immediately de-armed even if
  // credential deletion fails. Shopify Partner Agreement requires cleanup within 48h.
  router.post('/app-uninstalled', async (req: Request, res: Response) => {
    try {
      const shopDomain = req.headers['x-shopify-shop-domain'] as string | undefined;
      const shopifyHmac = req.headers['x-shopify-hmac-sha256'] as string | undefined;
      const rawBody = req.body as Buffer;

      if (!shopDomain) return res.status(400).send('Missing X-Shopify-Shop-Domain header');
      if (!shopifyHmac) return res.status(401).send('Missing HMAC header');

      // Fetch active connections for this shop domain — includes shopify_client_id
      // so we know which connections belong to custom apps vs. the platform app.
      const connRows = await config.db.query<{ id: string; org_id: string; shopify_client_id: string | null }>(
        `SELECT id, org_id, shopify_client_id FROM integration_connections
         WHERE integration_key = 'shopify' AND display_name = $1 AND status = 'active'`,
        [`${shopDomain} (Shopify)`],
      );

      // Custom-app connections: those with a non-null shopify_client_id.
      // Platform-app connections use the env-var secret (verified in step 1 above).
      const customAppConns = connRows.rows.filter(r => r.shopify_client_id !== null);

      const verified = await verifyLifecycleHmac(rawBody, shopifyHmac, customAppConns, config.credentialManager);
      if (!verified) {
        console.warn('[shopify-uninstall] HMAC verification failed', { shopDomain });
        return res.status(401).send('HMAC verification failed');
      }

      if (connRows.rows.length === 0) {
        console.log('[shopify-uninstall] no active connections found, nothing to do', { shopDomain });
        return res.status(200).send('OK');
      }

      // Deactivate first — connection is de-armed even if credential deletion fails below
      const updateResult = await config.db.query(
        `UPDATE integration_connections
         SET status = 'inactive', uninstalled_at = NOW()
         WHERE integration_key = 'shopify' AND display_name = $1 AND status = 'active'`,
        [`${shopDomain} (Shopify)`],
      );

      // Delete credentials — Shopify revokes the token immediately on uninstall
      for (const row of connRows.rows) {
        await config.credentialManager.deleteCredentials(
          { type: 'org', orgId: row.org_id }, row.id,
        );
      }

      console.log('[shopify-uninstall] marked inactive + deleted credentials', {
        shopDomain, rowsUpdated: updateResult.rowCount,
      });
      res.status(200).send('OK');
    } catch (error: any) {
      console.error('[shopify-uninstall] error', { error: error.message });
      res.status(500).send('Internal error');
    }
  });

  // POST /shop-redact
  // Shopify sends this 48h after app/uninstalled — hard GDPR deadline to erase all merchant data.
  // Anonymizes skill_executions (nulls PII payload/result) and deletes the connection record.
  // Execution rows are preserved — billing counts (executions-per-month) depend on them.
  router.post('/shop-redact', async (req: Request, res: Response) => {
    try {
      const shopDomain = req.headers['x-shopify-shop-domain'] as string | undefined;
      const shopifyHmac = req.headers['x-shopify-hmac-sha256'] as string | undefined;
      const rawBody = req.body as Buffer;

      if (!shopDomain) return res.status(400).send('Missing X-Shopify-Shop-Domain header');
      if (!shopifyHmac) return res.status(401).send('Missing HMAC header');

      // Connections may already be inactive (app/uninstalled ran 48h ago) — fetch regardless
      const connRows = await config.db.query<{ id: string; org_id: string; shopify_client_id: string | null }>(
        `SELECT id, org_id, shopify_client_id FROM integration_connections
         WHERE integration_key = 'shopify' AND display_name = $1`,
        [`${shopDomain} (Shopify)`],
      );

      const customAppConns = connRows.rows.filter(r => r.shopify_client_id !== null);

      const verified = await verifyLifecycleHmac(rawBody, shopifyHmac, customAppConns, config.credentialManager);
      if (!verified) {
        console.warn('[shopify-redact] HMAC verification failed', { shopDomain });
        return res.status(401).send('HMAC verification failed');
      }

      if (connRows.rows.length === 0) {
        // Already fully erased or never existed — idempotent
        console.log('[shopify-redact] no connections found, nothing to delete', { shopDomain });
        return res.status(200).send('OK');
      }

      const connectionIds = connRows.rows.map(r => r.id);

      // Anonymize skill_executions: null out payload + result (order/customer PII).
      // The execution row itself is kept for billing-count accuracy.
      await config.db.query(
        `UPDATE skill_executions
         SET payload = NULL, result = NULL
         WHERE user_skill_id IN (
           SELECT us.id FROM user_skills us
           WHERE EXISTS (
             SELECT 1 FROM jsonb_each_text(us.configuration->'slotConnections') slot
             WHERE slot.value = ANY($1)
           )
         )`,
        [connectionIds],
      );

      // Belt-and-suspenders: delete any remaining credentials
      // (should be gone after app/uninstalled, but clean up in case of partial failure)
      for (const row of connRows.rows) {
        await config.credentialManager.deleteCredentials(
          { type: 'org', orgId: row.org_id }, row.id,
        );
      }

      // Delete the connection records
      await config.db.query(
        `DELETE FROM integration_connections
         WHERE integration_key = 'shopify' AND display_name = $1`,
        [`${shopDomain} (Shopify)`],
      );

      console.log('[shopify-redact] shop data erased', { shopDomain, connectionCount: connectionIds.length });
      res.status(200).send('OK');
    } catch (error: any) {
      console.error('[shopify-redact] error', { error: error.message });
      res.status(500).send('Internal error');
    }
  });

  return router;
}
