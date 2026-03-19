import { Request, Response, Router } from 'express';
import { createHash, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { CredentialManager } from '../mcp/credential-manager';
import { buildShopifyAuthUrl } from '../integrations/shopify/shopify-oauth';

/**
 * Verifies a Cloudflare Turnstile token against the secret.
 * Returns true if valid (or if CF_TURNSTILE_SECRET is not set — dev mode).
 */
async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.CF_TURNSTILE_SECRET;
  if (!secret) return true; // dev mode: skip verification

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
      signal: controller.signal,
    });
    const data = await resp.json() as { success: boolean; 'error-codes'?: string[] };
    if (!data.success) {
      console.warn('[turnstile] verification failed:', data['error-codes']);
    }
    return data.success === true;
  } catch (err) {
    console.error('[turnstile] fetch error:', err);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function maskDomain(domain: string): string {
  // Returns the domain as-is for confirmation display (already non-secret)
  return domain;
}

/**
 * Public onboarding routes — no JWT auth required.
 * Mounted BEFORE the auth middleware in gateway.ts.
 */
export function createOnboardingRoutes(db: Pool, credentialManager: CredentialManager, jwtPrivateKey: string): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // GET /v1/onboard/:token — look up token, mark opened_at if first visit
  // ---------------------------------------------------------------------------
  router.get('/:token', async (req: Request, res: Response) => {
    try {
      const rawToken = req.params.token;
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const result = await db.query(
        `SELECT cit.id, cit.org_id, cit.operator_id, cit.expires_at, cit.used_at,
                o.name AS org_name, u.name AS operator_name, u.email AS operator_email
         FROM credential_intake_tokens cit
         JOIN organizations o ON o.id = cit.org_id
         JOIN users u ON u.id = cit.operator_id
         WHERE cit.token_hash = $1`,
        [tokenHash],
      );

      const row = result.rows[0];
      if (!row) {
        return res.status(410).json({
          error: 'This link has expired or has already been used.',
          hint: 'Contact your operator for a new link.',
        });
      }

      if (new Date(row.expires_at) < new Date()) {
        return res.status(410).json({
          error: 'This link has expired.',
          hint: `Contact ${row.operator_name} at ${row.operator_email} for a new link.`,
          operatorName: row.operator_name,
          operatorEmail: row.operator_email,
        });
      }

      if (row.used_at) {
        return res.status(410).json({
          error: 'This link has already been used.',
          hint: `Contact ${row.operator_name} at ${row.operator_email} if you need to resubmit.`,
          operatorName: row.operator_name,
          operatorEmail: row.operator_email,
        });
      }

      // Set opened_at on first visit (link-click tracking)
      await db.query(
        `UPDATE credential_intake_tokens SET opened_at = NOW() WHERE token_hash = $1 AND opened_at IS NULL`,
        [tokenHash],
      );

      res.json({
        orgName: row.org_name,
        operatorName: row.operator_name,
        operatorEmail: row.operator_email,
        requiredConnections: ['shopify', 'gorgias'],
      });
    } catch (error: any) {
      console.error('Onboard GET error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /v1/onboard/:token/shopify/start — initiate Shopify OAuth from within intake session
  // ---------------------------------------------------------------------------
  router.post('/:token/shopify/start', async (req: Request, res: Response) => {
    try {
      const rawToken = req.params.token;
      const { shop } = req.body as { shop?: string };

      if (!shop || !/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) {
        console.warn('[shopify-oauth] shopify/start: invalid shop format', { shop });
        return res.status(400).json({ error: 'shop must be a valid myshopify.com domain (e.g. my-store.myshopify.com)' });
      }

      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const result = await db.query(
        `SELECT org_id, expires_at, used_at, shopify_client_id, shopify_client_secret
         FROM credential_intake_tokens WHERE token_hash = $1`,
        [tokenHash]
      );

      const row = result.rows[0];
      if (!row) {
        console.warn('[shopify-oauth] shopify/start: intake token not found', { shop });
        return res.status(410).json({ error: 'This link has expired or has already been used.' });
      }
      if (new Date(row.expires_at) < new Date()) {
        console.warn('[shopify-oauth] shopify/start: intake token expired', { shop, orgId: row.org_id });
        return res.status(410).json({ error: 'This link has expired.' });
      }
      if (row.used_at) {
        console.warn('[shopify-oauth] shopify/start: intake token already used', { shop, orgId: row.org_id });
        return res.status(410).json({ error: 'This link has already been used.' });
      }

      // Per-store custom app credentials (may be null — falls back to platform app)
      const shopifyClientId: string | undefined = row.shopify_client_id ?? undefined;
      const shopifyClientSecret: string | undefined = row.shopify_client_secret ?? undefined;

      const appMode = shopifyClientId ? 'custom' : 'platform';
      console.log('[shopify-oauth] shopify/start: initiating OAuth', { shop, orgId: row.org_id, appMode });

      const stateClaims: Record<string, unknown> = {
        orgId: row.org_id, shop, intakeToken: rawToken, aud: 'shopify-oauth',
      };
      if (shopifyClientId) stateClaims.shopifyClientId = shopifyClientId;
      if (shopifyClientSecret) stateClaims.shopifyClientSecret = shopifyClientSecret;

      const state = jwt.sign(stateClaims, jwtPrivateKey, { algorithm: 'ES256', expiresIn: '10m' });

      let authUrl: string;
      try {
        authUrl = buildShopifyAuthUrl(shop, state, shopifyClientId);
      } catch (err: any) {
        console.error('[shopify-oauth] shopify/start: failed to build auth URL', { shop, orgId: row.org_id, error: err.message });
        throw err;
      }

      console.log('[shopify-oauth] shopify/start: redirecting to Shopify', { shop, orgId: row.org_id, appMode });
      res.json({ authUrl });
    } catch (error: any) {
      console.error('[shopify-oauth] shopify/start error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /v1/onboard/:token — submit Gorgias credentials (one-time, atomic)
  // Shopify is connected separately via OAuth before this call.
  // Body: {
  //   gorgias: { domain, email, apiKey },
  //   cfTurnstileToken: string
  // }
  // ---------------------------------------------------------------------------
  router.post('/:token', async (req: Request, res: Response) => {
    const { gorgias, cfTurnstileToken } = req.body;

    // Verify Turnstile (skipped in dev if CF_TURNSTILE_SECRET not set)
    if (!cfTurnstileToken) {
      console.warn('[turnstile] no token received in request body');
      return res.status(400).json({ error: 'Bot verification failed. Please try again.' });
    }
    if (!(await verifyTurnstile(cfTurnstileToken))) {
      return res.status(400).json({ error: 'Bot verification failed. Please try again.' });
    }

    if (!gorgias) {
      return res.status(400).json({ error: 'Gorgias credentials are required' });
    }

    if (gorgias) {
      const { domain, email, apiKey } = gorgias;
      if (!domain || !email || !apiKey) {
        return res.status(400).json({ error: 'gorgias requires domain, email, and apiKey' });
      }
    }

    const rawToken = req.params.token;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const client = await db.connect();
    let storedOrgId = '';
    const storedConnectionIds: string[] = [];
    try {
      await client.query('BEGIN');

      // Consume token inside transaction — rolls back if credential storage fails
      const consumeResult = await client.query(
        `UPDATE credential_intake_tokens
         SET used_at = NOW()
         WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL
         RETURNING org_id, operator_id`,
        [tokenHash],
      );

      if (consumeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'This link has expired or has already been used.',
          hint: 'Contact your operator for a new link.',
        });
      }

      const { org_id: orgId } = consumeResult.rows[0];
      storedOrgId = orgId;
      const scope = { type: 'org' as const, orgId };
      const received: Record<string, { domain: string }> = {};

      // Check if Shopify was already connected via OAuth (outside this transaction)
      const shopifyConn = await client.query(
        `SELECT id, display_name FROM integration_connections WHERE org_id = $1 AND integration_key = 'shopify' LIMIT 1`,
        [orgId]
      );
      if (shopifyConn.rows.length > 0) {
        received.shopify = { domain: maskDomain(shopifyConn.rows[0].display_name.replace(' (Shopify)', '')) };
      }

      const connectionId = randomUUID();
      await client.query(
        `INSERT INTO integration_connections (id, org_id, integration_key, display_name, status, last_tested_at)
         VALUES ($1, $2, 'gorgias', $3, 'active', NOW())`,
        [connectionId, orgId, `${gorgias.domain} (Gorgias)`],
      );
      await credentialManager.storeCredentials(scope, connectionId, {
        subdomain: gorgias.domain,
        email: gorgias.email,
        apiKey: gorgias.apiKey,
      });
      storedConnectionIds.push(connectionId);
      received.gorgias = { domain: maskDomain(gorgias.domain) };

      await client.query(
        `UPDATE customer_profiles SET onboarded_at = NOW(), updated_at = NOW() WHERE org_id = $1`,
        [orgId],
      );

      await client.query('COMMIT');
      res.json({ success: true, received });
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (storedOrgId && storedConnectionIds.length > 0) {
        const scope = { type: 'org' as const, orgId: storedOrgId };
        await Promise.all(storedConnectionIds.map(id => credentialManager.deleteCredentials(scope, id).catch(() => {})));
      }
      console.error('Onboard POST error:', error);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  return router;
}
