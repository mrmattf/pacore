import { Request, Response, Router } from 'express';
import { createHash } from 'crypto';
import { Pool } from 'pg';
import { CredentialManager } from '../mcp/credential-manager';

/**
 * Verifies a Cloudflare Turnstile token against the secret.
 * Returns true if valid (or if CF_TURNSTILE_SECRET is not set — dev mode).
 */
async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.CF_TURNSTILE_SECRET;
  if (!secret) return true; // dev mode: skip verification

  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    const data = await resp.json() as { success: boolean };
    return data.success === true;
  } catch {
    return false;
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
export function createOnboardingRoutes(db: Pool, credentialManager: CredentialManager): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // GET /v1/onboard/:token — look up token, mark opened_at if first visit
  // ---------------------------------------------------------------------------
  router.get('/:token', async (req: Request, res: Response) => {
    try {
      const tokenHash = createHash('sha256').update(req.params.token).digest('hex');

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
  // POST /v1/onboard/:token — submit credentials (one-time, atomic)
  // Body: {
  //   shopify?: { domain, apiKey, apiSecretKey },
  //   gorgias?: { domain, email, apiKey },
  //   cfTurnstileToken: string
  // }
  // ---------------------------------------------------------------------------
  router.post('/:token', async (req: Request, res: Response) => {
    try {
      const { shopify, gorgias, cfTurnstileToken } = req.body;

      // Verify Turnstile (skipped in dev if CF_TURNSTILE_SECRET not set)
      if (!cfTurnstileToken || !(await verifyTurnstile(cfTurnstileToken))) {
        return res.status(400).json({ error: 'Bot verification failed. Please try again.' });
      }

      if (!shopify && !gorgias) {
        return res.status(400).json({ error: 'At least one credential set (shopify or gorgias) is required' });
      }

      if (shopify) {
        const { domain, apiKey, apiSecretKey } = shopify;
        if (!domain || !apiKey || !apiSecretKey) {
          return res.status(400).json({ error: 'shopify requires domain, apiKey, and apiSecretKey' });
        }
      }

      if (gorgias) {
        const { domain, email, apiKey } = gorgias;
        if (!domain || !email || !apiKey) {
          return res.status(400).json({ error: 'gorgias requires domain, email, and apiKey' });
        }
      }

      const tokenHash = createHash('sha256').update(req.params.token).digest('hex');

      // Atomic token consumption — check + consume in a single UPDATE...RETURNING
      const consumeResult = await db.query(
        `UPDATE credential_intake_tokens
         SET used_at = NOW()
         WHERE token_hash = $1 AND expires_at > NOW() AND used_at IS NULL
         RETURNING org_id, operator_id`,
        [tokenHash],
      );

      if (consumeResult.rows.length === 0) {
        return res.status(409).json({
          error: 'This link has expired or has already been used.',
          hint: 'Contact your operator for a new link.',
        });
      }

      const { org_id: orgId } = consumeResult.rows[0];
      const scope = { type: 'org' as const, orgId };
      const received: Record<string, { domain: string }> = {};

      // Store Shopify credentials — use field names the ShopifyOrderAdapter expects
      if (shopify) {
        await credentialManager.storeCredentials(scope, 'shopify', {
          storeDomain: shopify.domain,
          clientId: shopify.apiKey,
          clientSecret: shopify.apiSecretKey,
        });
        received.shopify = { domain: maskDomain(shopify.domain) };
      }

      // Store Gorgias credentials — use field names the GorgiasNotificationAdapter expects
      if (gorgias) {
        await credentialManager.storeCredentials(scope, 'gorgias', {
          subdomain: gorgias.domain,
          email: gorgias.email,
          apiKey: gorgias.apiKey,
        });
        received.gorgias = { domain: maskDomain(gorgias.domain) };
      }

      // Mark customer as onboarded
      await db.query(
        `UPDATE customer_profiles SET onboarded_at = NOW(), updated_at = NOW() WHERE org_id = $1`,
        [orgId],
      );

      res.json({ success: true, received });
    } catch (error: any) {
      console.error('Onboard POST error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
