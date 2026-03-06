import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';

/**
 * OAuth 2.0 Authorization Server routes for external MCP client authentication.
 *
 * Supports the Client Credentials grant (RFC 6749 §4.4).
 * Clients are per-user MCP credentials generated in the PA Core UI.
 *
 * Mount BEFORE authenticateRequest middleware — these endpoints are public.
 */
export function createOAuthRoutes(db: Pool): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // GET /.well-known/oauth-authorization-server — RFC 8414 metadata discovery
  // Claude Desktop reads this to find the token endpoint automatically.
  // ---------------------------------------------------------------------------
  router.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      issuer: baseUrl,
      token_endpoint: `${baseUrl}/oauth/token`,
      grant_types_supported: ['client_credentials'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      response_types_supported: [],
    });
  });

  // ---------------------------------------------------------------------------
  // POST /oauth/token — Client Credentials grant
  // Accepts client_id + client_secret via Basic auth header or request body.
  // Returns a short-lived opaque access token (1 hour).
  // ---------------------------------------------------------------------------
  router.post('/oauth/token', async (req: Request, res: Response) => {
    try {
      let clientId: string | undefined;
      let clientSecret: string | undefined;

      // Support Basic auth: Authorization: Basic base64(client_id:client_secret)
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Basic ')) {
        const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
        const colonIdx = decoded.indexOf(':');
        if (colonIdx !== -1) {
          clientId = decoded.slice(0, colonIdx);
          clientSecret = decoded.slice(colonIdx + 1);
        }
      }

      // Fall back to request body params
      if (!clientId) clientId = req.body?.client_id;
      if (!clientSecret) clientSecret = req.body?.client_secret;

      const grantType = req.body?.grant_type;
      if (grantType !== 'client_credentials') {
        return res.status(400).json({ error: 'unsupported_grant_type' });
      }

      if (!clientId || !clientSecret) {
        return res.status(401).json({ error: 'invalid_client' });
      }

      // Look up the client
      const clientResult = await db.query(
        'SELECT id, user_id, secret_hash FROM mcp_clients WHERE client_id = $1',
        [clientId],
      );
      if (!clientResult.rows[0]) {
        return res.status(401).json({ error: 'invalid_client' });
      }

      const client = clientResult.rows[0];
      const providedHash = createHash('sha256').update(clientSecret).digest('hex');
      if (providedHash !== client.secret_hash) {
        return res.status(401).json({ error: 'invalid_client' });
      }

      // Issue opaque access token (stored as SHA-256 hash)
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

      await db.query(
        `INSERT INTO oauth_access_tokens (token_hash, client_id, user_id, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [tokenHash, clientId, client.user_id, expiresAt],
      );

      await db.query(
        'UPDATE mcp_clients SET last_used_at = NOW() WHERE client_id = $1',
        [clientId],
      );

      res.json({
        access_token: rawToken,
        token_type: 'bearer',
        expires_in: 3600,
      });
    } catch (err: any) {
      console.error('[OAuth] Token endpoint error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
}
