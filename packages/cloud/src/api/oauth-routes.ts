import { Router, Request, Response } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

/**
 * OAuth 2.0 Authorization Server routes for external MCP client authentication.
 *
 * Supports:
 *  - Client Credentials grant (RFC 6749 §4.4) — existing per-user mcp_clients
 *  - Authorization Code + PKCE grant (RFC 7636) — for Claude Desktop / Claude.ai
 *  - Dynamic Client Registration (RFC 7591) — required by Claude.ai MCP 2025 spec
 *
 * Discovery endpoints (RFC 8414, RFC 9728):
 *  - GET /.well-known/oauth-authorization-server
 *  - GET /.well-known/oauth-protected-resource
 *
 * Mount BEFORE authenticateRequest middleware — these endpoints are public.
 */
export function createOAuthRoutes(db: Pool): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // CORS — allow https://claude.ai to call all OAuth & discovery endpoints
  // ---------------------------------------------------------------------------
  router.use((req: Request, res: Response, next) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && (origin === 'https://claude.ai' || origin.endsWith('.claude.ai'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // In-memory state (single-instance; use Redis for horizontal scale)
  // ---------------------------------------------------------------------------

  /** Dynamically registered clients (from Claude.ai/Claude Desktop via RFC 7591) */
  const dynamicClients = new Map<string, {
    clientId: string;
    redirectUris: string[];
    clientName?: string;
    createdAt: number;
  }>();

  /** Pending authorization codes (10-minute TTL) */
  const pendingCodes = new Map<string, {
    userId: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    scope: string;
    expiresAt: number;
  }>();

  /** Cap sizes to prevent unbounded growth */
  const MAX_DYNAMIC_CLIENTS = 500;
  const MAX_PENDING_CODES   = 200;

  // Periodic cleanup
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of pendingCodes) {
      if (v.expiresAt < now) pendingCodes.delete(k);
    }
    for (const [k, v] of dynamicClients) {
      if (v.createdAt < now - 24 * 3600 * 1000) dynamicClients.delete(k);
    }
  }, 10 * 60 * 1000);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getBaseUrl(req: Request): string {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)
      ?.split(',')[0].trim() ?? req.protocol;
    const host = req.headers['host'] as string;
    return `${proto}://${host}`;
  }

  function isAllowedRedirectUri(uri: string): boolean {
    try {
      const url = new URL(uri);
      return url.protocol === 'https:' && url.hostname === 'claude.ai';
    } catch {
      return false;
    }
  }

  function evictOldestIfNeeded<K, V>(map: Map<K, V>, max: number): void {
    if (map.size >= max) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
  }

  // ---------------------------------------------------------------------------
  // GET /.well-known/oauth-protected-resource — RFC 9728
  // Required by Claude.ai MCP 2025 spec: tells the client where the
  // authorization server is before it starts the OAuth flow.
  // ---------------------------------------------------------------------------
  router.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
    const base = getBaseUrl(req);
    res.json({
      resource: base,
      authorization_servers: [`${base}/.well-known/oauth-authorization-server`],
    });
  });

  // ---------------------------------------------------------------------------
  // GET /.well-known/oauth-authorization-server — RFC 8414
  // ---------------------------------------------------------------------------
  router.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    const base = getBaseUrl(req);
    res.json({
      issuer:                                 base,
      authorization_endpoint:                 `${base}/oauth/authorize`,
      token_endpoint:                         `${base}/oauth/token`,
      registration_endpoint:                  `${base}/oauth/register`,
      grant_types_supported:                  ['authorization_code', 'client_credentials'],
      response_types_supported:               ['code'],
      code_challenge_methods_supported:       ['S256'],
      token_endpoint_auth_methods_supported:  ['client_secret_basic', 'client_secret_post', 'none'],
      scopes_supported:                       ['claudeai'],
    });
  });

  // ---------------------------------------------------------------------------
  // POST /oauth/register — RFC 7591 Dynamic Client Registration
  // Claude.ai registers itself here before starting the authorization flow.
  // ---------------------------------------------------------------------------
  router.post('/oauth/register', (req: Request, res: Response) => {
    const { redirect_uris, client_name } = req.body as {
      redirect_uris?: string[];
      client_name?: string;
    };

    if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris required' });
      return;
    }

    for (const uri of redirect_uris) {
      if (!isAllowedRedirectUri(uri)) {
        res.status(400).json({
          error: 'invalid_redirect_uri',
          error_description: `Redirect URI not allowed: ${uri}`,
        });
        return;
      }
    }

    evictOldestIfNeeded(dynamicClients, MAX_DYNAMIC_CLIENTS);

    const clientId = 'dyn_' + randomBytes(16).toString('hex');
    dynamicClients.set(clientId, {
      clientId,
      redirectUris: redirect_uris,
      clientName: client_name,
      createdAt: Date.now(),
    });

    console.log('[OAuth] dynamic_client_registered', { clientId, redirectUris: redirect_uris });

    res.status(201).json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });

  // ---------------------------------------------------------------------------
  // GET /oauth/authorize — show PA Core login form
  // ---------------------------------------------------------------------------
  router.get('/oauth/authorize', (req: Request, res: Response) => {
    const {
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      state,
      scope = '',
      resource = '',
    } = req.query as Record<string, string>;

    // Validate required params
    if (!client_id || !redirect_uri || !code_challenge) {
      res.status(400).send('Missing required OAuth parameters');
      return;
    }
    if (code_challenge_method !== 'S256') {
      res.status(400).send('Only code_challenge_method=S256 is supported');
      return;
    }
    if (!isAllowedRedirectUri(redirect_uri)) {
      res.status(400).send('Invalid redirect_uri');
      return;
    }
    // Accept both pre-registered mcp_clients (mcp_xxx) and dynamic clients (dyn_xxx)
    if (!client_id.startsWith('mcp_') && !dynamicClients.has(client_id)) {
      res.status(400).send('Unknown client_id');
      return;
    }

    const base = getBaseUrl(req);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const dynamicClient = dynamicClients.get(client_id);
    const clientHint = dynamicClient?.clientName ?? client_id;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PA Core – Authorize</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #f9fafb; display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; padding: 20px; }
  .card { background: white; border-radius: 12px; padding: 32px; width: 100%; max-width: 400px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  h1 { margin: 0 0 4px; font-size: 20px; color: #111; }
  .hint { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 4px; }
  input[type=email], input[type=password] {
    display: block; width: 100%; padding: 9px 12px; border: 1px solid #d1d5db;
    border-radius: 6px; font-size: 14px; margin-bottom: 16px; outline: none;
  }
  input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
  button { background: #2563eb; color: white; border: none; padding: 10px;
           border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; width: 100%; }
  button:hover { background: #1d4ed8; }
</style>
</head>
<body>
<div class="card">
  <h1>Sign in to PA Core</h1>
  <p class="hint">Authorizing: ${esc(clientHint)}</p>
  <form method="POST" action="${esc(base)}/oauth/authorize">
    <input type="hidden" name="client_id"             value="${esc(client_id)}">
    <input type="hidden" name="redirect_uri"          value="${esc(redirect_uri)}">
    <input type="hidden" name="code_challenge"        value="${esc(code_challenge)}">
    <input type="hidden" name="code_challenge_method" value="${esc(code_challenge_method)}">
    <input type="hidden" name="state"                 value="${esc(state ?? '')}">
    <input type="hidden" name="scope"                 value="${esc(scope)}">
    <input type="hidden" name="resource"              value="${esc(resource)}">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" required autofocus placeholder="you@example.com">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" required placeholder="Your PA Core password">
    <button type="submit">Authorize</button>
  </form>
</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action ${base}`);
    res.send(html);
  });

  // ---------------------------------------------------------------------------
  // POST /oauth/authorize — validate credentials, issue code, redirect
  // ---------------------------------------------------------------------------
  router.post('/oauth/authorize', async (req: Request, res: Response) => {
    const {
      email,
      password,
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      state,
      scope = '',
      resource = '',
    } = req.body as Record<string, string>;

    const base = getBaseUrl(req);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

    const renderError = (msg: string) => {
      const clientHint = dynamicClients.get(client_id)?.clientName ?? client_id ?? 'Unknown';
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>PA Core – Authorize</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #f9fafb; display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; padding: 20px; }
  .card { background: white; border-radius: 12px; padding: 32px; width: 100%; max-width: 400px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  h1 { margin: 0 0 4px; font-size: 20px; color: #111; }
  .hint { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
  .error { color: #dc2626; background: #fef2f2; border: 1px solid #fecaca;
           border-radius: 6px; padding: 8px 12px; font-size: 13px; margin-bottom: 16px; }
  label { display: block; font-size: 13px; font-weight: 500; color: #374151; margin-bottom: 4px; }
  input[type=email], input[type=password] {
    display: block; width: 100%; padding: 9px 12px; border: 1px solid #d1d5db;
    border-radius: 6px; font-size: 14px; margin-bottom: 16px; outline: none;
  }
  input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
  button { background: #2563eb; color: white; border: none; padding: 10px;
           border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; width: 100%; }
  button:hover { background: #1d4ed8; }
</style>
</head>
<body>
<div class="card">
  <h1>Sign in to PA Core</h1>
  <p class="hint">Authorizing: ${esc(clientHint)}</p>
  <div class="error">${esc(msg)}</div>
  <form method="POST" action="${esc(base)}/oauth/authorize">
    <input type="hidden" name="client_id"             value="${esc(client_id ?? '')}">
    <input type="hidden" name="redirect_uri"          value="${esc(redirect_uri ?? '')}">
    <input type="hidden" name="code_challenge"        value="${esc(code_challenge ?? '')}">
    <input type="hidden" name="code_challenge_method" value="${esc(code_challenge_method ?? '')}">
    <input type="hidden" name="state"                 value="${esc(state ?? '')}">
    <input type="hidden" name="scope"                 value="${esc(scope)}">
    <input type="hidden" name="resource"              value="${esc(resource)}">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" required autofocus value="${esc(email ?? '')}" placeholder="you@example.com">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" required placeholder="Your PA Core password">
    <button type="submit">Authorize</button>
  </form>
</div>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action ${base}`);
      res.status(400).send(html);
    };

    try {
      // Basic validation
      if (!client_id || !redirect_uri || !code_challenge || !code_challenge_method) {
        renderError('Missing required parameters.');
        return;
      }
      if (!email || !password) {
        renderError('Email and password are required.');
        return;
      }
      if (!isAllowedRedirectUri(redirect_uri)) {
        res.status(400).send('Invalid redirect_uri');
        return;
      }

      // Verify credentials against PA Core users table
      const userResult = await db.query(
        'SELECT id, email, password_hash FROM users WHERE email = $1',
        [email.toLowerCase().trim()],
      );
      if (!userResult.rows[0]) {
        renderError('Invalid email or password.');
        return;
      }
      const user = userResult.rows[0];
      const passwordValid = await bcrypt.compare(password, user.password_hash);
      if (!passwordValid) {
        renderError('Invalid email or password.');
        return;
      }

      // Issue authorization code (10-minute TTL)
      evictOldestIfNeeded(pendingCodes, MAX_PENDING_CODES);

      const code = randomBytes(24).toString('hex');
      pendingCodes.set(code, {
        userId:              user.id,
        clientId:            client_id,
        redirectUri:         redirect_uri,
        codeChallenge:       code_challenge,
        codeChallengeMethod: code_challenge_method,
        scope,
        expiresAt:           Date.now() + 10 * 60 * 1000,
      });

      console.log('[OAuth] authorize.code_issued', { userId: user.id, clientId: client_id });

      // Redirect back to client with code
      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set('code', code);
      if (state) callbackUrl.searchParams.set('state', state);
      if (scope) callbackUrl.searchParams.set('scope', scope);

      res.redirect(callbackUrl.toString());
    } catch (err: any) {
      console.error('[OAuth] authorize error:', err);
      renderError('An error occurred. Please try again.');
    }
  });

  // ---------------------------------------------------------------------------
  // POST /oauth/token — Client Credentials + Authorization Code grants
  // ---------------------------------------------------------------------------
  router.post('/oauth/token', async (req: Request, res: Response) => {
    console.log('[OAuth] token.request', { grantType: req.body?.grant_type, clientId: req.body?.client_id });
    try {
      const grantType = req.body?.grant_type as string | undefined;

      // ---- Authorization Code + PKCE ----------------------------------------
      if (grantType === 'authorization_code') {
        const { code, redirect_uri, client_id, code_verifier } = req.body as Record<string, string>;

        if (!code || !redirect_uri || !client_id || !code_verifier) {
          console.warn('[OAuth] token.authorization_code.missing_params');
          res.status(400).json({ error: 'invalid_request', error_description: 'Missing required parameters' });
          return;
        }

        const pending = pendingCodes.get(code);
        if (!pending || pending.expiresAt < Date.now()) {
          console.warn('[OAuth] token.authorization_code.invalid_code');
          pendingCodes.delete(code);
          res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code expired or invalid' });
          return;
        }

        if (pending.clientId !== client_id) {
          console.warn('[OAuth] token.authorization_code.client_mismatch');
          res.status(400).json({ error: 'invalid_grant', error_description: 'client_id mismatch' });
          return;
        }

        if (pending.redirectUri !== redirect_uri) {
          console.warn('[OAuth] token.authorization_code.redirect_uri_mismatch');
          res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
          return;
        }

        // Verify PKCE S256: SHA-256(code_verifier) === code_challenge
        const expectedChallenge = createHash('sha256')
          .update(code_verifier)
          .digest('base64url');

        let challengeMatch = false;
        try {
          challengeMatch = timingSafeEqual(
            Buffer.from(expectedChallenge),
            Buffer.from(pending.codeChallenge),
          );
        } catch {
          challengeMatch = false;
        }

        if (!challengeMatch) {
          console.warn('[OAuth] token.authorization_code.pkce_failed');
          res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
          return;
        }

        // Code is single-use — delete immediately
        pendingCodes.delete(code);

        // Issue opaque access token
        const rawToken  = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

        await db.query(
          `INSERT INTO oauth_access_tokens (token_hash, client_id, user_id, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [tokenHash, client_id, pending.userId, expiresAt],
        );

        console.log('[OAuth] token.authorization_code.issued', { userId: pending.userId, clientId: client_id });

        res.json({
          access_token: rawToken,
          token_type:   'bearer',
          expires_in:   3600,
          scope:        pending.scope || undefined,
        });
        return;
      }

      // ---- Client Credentials -----------------------------------------------
      if (grantType === 'client_credentials') {
        let clientId: string | undefined;
        let clientSecret: string | undefined;

        // Support Basic auth: Authorization: Basic base64(client_id:client_secret)
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Basic ')) {
          const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
          const colonIdx = decoded.indexOf(':');
          if (colonIdx !== -1) {
            clientId     = decoded.slice(0, colonIdx);
            clientSecret = decoded.slice(colonIdx + 1);
          }
        }

        if (!clientId) clientId     = req.body?.client_id;
        if (!clientSecret) clientSecret = req.body?.client_secret;

        if (!clientId || !clientSecret) {
          res.status(401).json({ error: 'invalid_client' });
          return;
        }

        const clientResult = await db.query(
          'SELECT id, user_id, secret_hash FROM mcp_clients WHERE client_id = $1',
          [clientId],
        );
        if (!clientResult.rows[0]) {
          res.status(401).json({ error: 'invalid_client' });
          return;
        }

        const client       = clientResult.rows[0];
        const providedHash = createHash('sha256').update(clientSecret).digest('hex');
        if (providedHash !== client.secret_hash) {
          res.status(401).json({ error: 'invalid_client' });
          return;
        }

        const rawToken  = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 3600 * 1000);

        await db.query(
          `INSERT INTO oauth_access_tokens (token_hash, client_id, user_id, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [tokenHash, clientId, client.user_id, expiresAt],
        );

        await db.query(
          'UPDATE mcp_clients SET last_used_at = NOW() WHERE client_id = $1',
          [clientId],
        );

        console.log('[OAuth] token.client_credentials.issued', { clientId, userId: client.user_id });

        res.json({
          access_token: rawToken,
          token_type:   'bearer',
          expires_in:   3600,
        });
        return;
      }

      res.status(400).json({ error: 'unsupported_grant_type' });
    } catch (err: any) {
      console.error('[OAuth] token endpoint error:', err);
      res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
}
