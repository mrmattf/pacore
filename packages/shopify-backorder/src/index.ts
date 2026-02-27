import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { loadConfig } from './config';
import { logger, initAlerts, alertSlack } from './logger';
import { ShopifyClient, ShopifyOrder } from './clients/shopify';
import { ShopifyTokenManager } from './clients/shopify-token-manager';
import { GorgiasClient } from './clients/gorgias';
import { MCPServer } from './mcp/server';
import { handleBackorderCheck } from './handler/backorder';
import { getTemplateConfig, setTemplateConfig, TemplateConfig } from './templates/template-store';

// Early startup logging (before config validation)
console.log('Starting shopify-backorder service...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT env:', process.env.PORT);

// Load configuration
console.log('Loading configuration...');
const config = loadConfig();
console.log('Configuration loaded successfully. Port:', config.port);

// Initialize Shopify token manager (handles OAuth token refresh automatically)
const shopifyTokenManager = new ShopifyTokenManager(config);
const shopifyClient = new ShopifyClient(config, shopifyTokenManager);

// Only create Gorgias client if enabled
const gorgiasClient = config.gorgiasEnabled ? new GorgiasClient(config) : null;

// Initialize MCP server
const mcpServer = new MCPServer(shopifyClient, gorgiasClient, config.gorgiasEnabled);

if (!config.gorgiasEnabled) {
  console.log('\n⚠️  GORGIAS DISABLED - Running in dry-run mode');
  console.log('   Gorgias calls will be logged to console instead of sent.\n');
}

// Initialize alerting
initAlerts(config.slackWebhookUrl);

// Create Express app
const app = express();

// Raw body for webhook signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// API Key authentication middleware
function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.get('Authorization');

  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Invalid Authorization format. Use: Bearer <token>' });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  const isValid = token.length === config.apiSecret.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(config.apiSecret));

  if (!isValid) {
    logger.warn('auth.invalid.api.key', { ip: req.ip });
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  next();
}

// ── OAuth 2.0 Authorization Code + PKCE flow ──────────────────────────────────
//
// Claude Desktop opens a browser to /oauth/authorize, the user enters the
// API secret, the server generates an auth code and redirects back to Claude.
// Claude then exchanges the code for an access token at /oauth/token.
//
// The issued access_token is the API_SECRET itself, so the existing
// requireApiKey middleware accepts it without any changes.

// In-memory auth code store (single-merchant, codes expire in 5 minutes)
interface PendingCode {
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  expiresAt: number;
}
const pendingCodes = new Map<string, PendingCode>();

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// OAuth metadata discovery
app.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0].trim() ?? req.protocol;
  const host = req.headers['host'];
  const base = `${proto}://${host}`;

  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    grant_types_supported: ['authorization_code'],
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256', 'plain'],
  });
});

// Authorization endpoint — browser opens this, user enters API secret
app.get('/oauth/authorize', (req: Request, res: Response) => {
  const { response_type, client_id, redirect_uri, state, code_challenge, code_challenge_method } = req.query as Record<string, string>;

  if (response_type !== 'code') {
    res.status(400).send('unsupported_response_type');
    return;
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect — Backorder MCP Server</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           background: #f7fafc; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; padding: 20px; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08);
            padding: 40px; max-width: 420px; width: 100%; }
    h1 { font-size: 22px; color: #1a202c; margin-bottom: 8px; }
    p  { color: #718096; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
    label { display: block; font-size: 13px; font-weight: 600; color: #4a5568; margin-bottom: 6px; }
    input[type=password] { width: 100%; padding: 10px 14px; border: 1px solid #e2e8f0;
                           border-radius: 8px; font-size: 15px; outline: none; }
    input[type=password]:focus { border-color: #1a202c; box-shadow: 0 0 0 3px rgba(26,32,44,.1); }
    button { margin-top: 20px; width: 100%; padding: 12px; background: #1a202c; color: #fff;
             border: none; border-radius: 8px; font-size: 15px; font-weight: 600;
             cursor: pointer; }
    button:hover { background: #2d3748; }
    .error { margin-top: 12px; color: #e53e3e; font-size: 13px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect to Backorder MCP</h1>
    <p>Enter your API secret to authorize Claude to manage your backorder notification templates.</p>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id"             value="${escapeHtml(client_id ?? '')}">
      <input type="hidden" name="redirect_uri"          value="${escapeHtml(redirect_uri ?? '')}">
      <input type="hidden" name="state"                 value="${escapeHtml(state ?? '')}">
      <input type="hidden" name="code_challenge"        value="${escapeHtml(code_challenge ?? '')}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(code_challenge_method ?? 'plain')}">
      <label for="api_secret">API Secret</label>
      <input type="password" id="api_secret" name="api_secret" placeholder="Enter your API secret" autofocus required>
      <button type="submit">Authorize</button>
    </form>
  </div>
</body>
</html>`);
});

// Authorization form submission
app.post('/oauth/authorize', express.urlencoded({ extended: false }), (req: Request, res: Response) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, api_secret } = req.body as Record<string, string>;

  if (!redirect_uri) {
    res.status(400).send('missing redirect_uri');
    return;
  }

  const isValid =
    typeof api_secret === 'string' &&
    api_secret.length === config.apiSecret.length &&
    crypto.timingSafeEqual(Buffer.from(api_secret), Buffer.from(config.apiSecret));

  if (!isValid) {
    logger.warn('oauth.authorize.invalid_secret', { ip: req.ip });
    // Redirect back with error so Claude Desktop gets a proper response
    const url = new URL(redirect_uri);
    url.searchParams.set('error', 'access_denied');
    if (state) url.searchParams.set('state', state);
    res.redirect(url.toString());
    return;
  }

  // Generate one-time auth code (expires in 5 minutes)
  const code = crypto.randomBytes(32).toString('hex');
  pendingCodes.set(code, {
    codeChallenge: code_challenge ?? '',
    codeChallengeMethod: code_challenge_method ?? 'plain',
    redirectUri: redirect_uri,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  logger.info('oauth.authorize.code_issued', { ip: req.ip, clientId: client_id });

  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  res.redirect(url.toString());
});

// Token endpoint — exchanges auth code for access token
app.post('/oauth/token', express.urlencoded({ extended: false }), (req: Request, res: Response) => {
  const { grant_type, code, code_verifier, redirect_uri } = req.body as Record<string, string>;

  if (grant_type !== 'authorization_code') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }

  const pending = pendingCodes.get(code);

  if (!pending) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'Unknown or expired code' });
    return;
  }

  if (Date.now() > pending.expiresAt) {
    pendingCodes.delete(code);
    res.status(400).json({ error: 'invalid_grant', error_description: 'Code expired' });
    return;
  }

  if (pending.redirectUri !== redirect_uri) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    return;
  }

  // Verify PKCE code_verifier if a code_challenge was sent
  if (pending.codeChallenge) {
    let computed = code_verifier ?? '';
    if (pending.codeChallengeMethod === 'S256') {
      computed = crypto.createHash('sha256').update(code_verifier ?? '').digest('base64url');
    }
    if (computed !== pending.codeChallenge) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      return;
    }
  }

  pendingCodes.delete(code); // single-use
  logger.info('oauth.token.issued', { ip: req.ip });

  res.json({
    access_token: config.apiSecret,
    token_type: 'Bearer',
    expires_in: 86400,
  });
});

// Health check (public)
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'shopify-backorder',
    mcp: {
      tools: mcpServer.getCapabilities().tools.map(t => t.name),
    },
  });
});

// Mount MCP server routes (protected)
app.use('/mcp', requireApiKey, mcpServer.getRouter());

// Verify Shopify webhook signature
function verifyShopifyWebhook(req: Request, secret: string): boolean {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  if (!hmac) return false;

  const hash = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('base64');

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

// Shopify webhook endpoint (protected by HMAC signature)
app.post('/webhook/orders/create', async (req: Request, res: Response) => {
  // Verify webhook signature if secret is configured
  if (config.shopifyWebhookSecret) {
    if (!verifyShopifyWebhook(req, config.shopifyWebhookSecret)) {
      logger.warn('webhook.invalid.signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  // Parse the order from webhook payload
  // express.raw() gives a Buffer, so we must call .toString() before JSON.parse
  let order: ShopifyOrder;
  try {
    const raw = req.body;
    order = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw);
  } catch (error) {
    logger.error('webhook.parse.failed', error as Error);
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  // Acknowledge webhook immediately (Shopify expects response within 5s)
  res.status(200).json({ received: true });

  // Process asynchronously
  try {
    const result = await handleBackorderCheck(order, mcpServer);

    if (result.hasBackorders) {
      logger.info('webhook.processed.backorder', {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        ticketId: result.ticketId,
      });
    } else {
      logger.info('webhook.processed.ok', {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
      });
    }
  } catch (error) {
    logger.error('webhook.processing.failed', error as Error, {
      orderId: order.id,
    });
  }
});

// Manual trigger endpoint (protected by API key)
app.post('/trigger/:orderId', requireApiKey, async (req: Request, res: Response) => {
  const orderId = parseInt(req.params.orderId, 10);

  if (isNaN(orderId)) {
    res.status(400).json({ error: 'Invalid order ID' });
    return;
  }

  try {
    // Use MCP tool to get order
    const orderResult = await mcpServer.callTool('shopify_get_order', { order_id: orderId });

    if (!orderResult.success) {
      res.status(500).json({ error: orderResult.error });
      return;
    }

    const order = orderResult.data as ShopifyOrder;
    const result = await handleBackorderCheck(order, mcpServer);
    res.json(result);
  } catch (error) {
    logger.error('trigger.failed', error as Error, { orderId });
    res.status(500).json({ error: (error as Error).message });
  }
});

// Email template customization endpoints (protected by API key)
// GET  /api/template — returns current config (style + messages)
// PUT  /api/template — deep-merges style and messages sections; unknown keys stripped
const CSS_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$|^[a-zA-Z]+$/;
const STYLE_STRING_KEYS = ['brandName', 'signOff', 'footerText'] as const;
const MSG_STRING_KEYS_PARTIAL = ['subject', 'intro', 'optionsTitle', 'closing'] as const;
const MSG_STRING_KEYS_ALL = ['subject', 'intro', 'waitMessage', 'cancelMessage', 'closing'] as const;

app.get('/api/template', requireApiKey, (_req: Request, res: Response) => {
  res.json(getTemplateConfig());
});

app.put('/api/template', requireApiKey, (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const current = getTemplateConfig();

  // ── Validate and merge style ──────────────────────────────────────────────
  const mergedStyle = { ...(current.style ?? {}) };

  if ('style' in body) {
    const style = body['style'];
    if (typeof style !== 'object' || style === null || Array.isArray(style)) {
      res.status(400).json({ error: '"style" must be an object' });
      return;
    }
    const s = style as Record<string, unknown>;

    for (const key of STYLE_STRING_KEYS) {
      if (key in s) {
        const val = s[key];
        if (val === null || val === undefined || val === '') { delete mergedStyle[key]; continue; }
        if (typeof val !== 'string') { res.status(400).json({ error: `style.${key} must be a string` }); return; }
        mergedStyle[key] = val;
      }
    }

    for (const key of ['primaryColor', 'accentColor'] as const) {
      if (key in s) {
        const val = s[key];
        if (val === null || val === undefined || val === '') { delete mergedStyle[key]; continue; }
        if (typeof val !== 'string' || !CSS_COLOR_RE.test(val)) {
          res.status(400).json({ error: `style.${key} must be a valid hex color (e.g. #1a365d)` });
          return;
        }
        mergedStyle[key] = val;
      }
    }

    if ('logoUrl' in s) {
      const val = s['logoUrl'];
      if (val === null || val === undefined || val === '') { delete mergedStyle.logoUrl; }
      else if (typeof val !== 'string' || !val.startsWith('https://')) {
        res.status(400).json({ error: 'style.logoUrl must start with https://' });
        return;
      } else {
        mergedStyle.logoUrl = val;
      }
    }
  }

  // ── Validate and merge messages ───────────────────────────────────────────
  const mergedMessages = {
    partialBackorder: { ...(current.messages?.partialBackorder ?? {}) },
    allBackordered: { ...(current.messages?.allBackordered ?? {}) },
  };

  if ('messages' in body) {
    const messages = body['messages'];
    if (typeof messages !== 'object' || messages === null || Array.isArray(messages)) {
      res.status(400).json({ error: '"messages" must be an object' });
      return;
    }
    const m = messages as Record<string, unknown>;

    // partialBackorder
    if ('partialBackorder' in m) {
      const pb = m['partialBackorder'];
      if (typeof pb !== 'object' || pb === null || Array.isArray(pb)) {
        res.status(400).json({ error: '"messages.partialBackorder" must be an object' });
        return;
      }
      const pbObj = pb as Record<string, unknown>;

      for (const key of MSG_STRING_KEYS_PARTIAL) {
        if (key in pbObj) {
          const val = pbObj[key];
          if (val === null || val === undefined || val === '') { delete mergedMessages.partialBackorder[key]; continue; }
          if (typeof val !== 'string') { res.status(400).json({ error: `messages.partialBackorder.${key} must be a string` }); return; }
          mergedMessages.partialBackorder[key] = val;
        }
      }

      if ('options' in pbObj) {
        const opts = pbObj['options'];
        if (opts === null || opts === undefined) {
          delete mergedMessages.partialBackorder.options;
        } else {
          if (!Array.isArray(opts)) {
            res.status(400).json({ error: 'messages.partialBackorder.options must be an array' });
            return;
          }
          for (let i = 0; i < opts.length; i++) {
            const opt = opts[i] as Record<string, unknown>;
            if (typeof opt !== 'object' || opt === null) {
              res.status(400).json({ error: `messages.partialBackorder.options[${i}] must be an object` });
              return;
            }
            if (typeof opt['label'] !== 'string' || !opt['label']) {
              res.status(400).json({ error: `messages.partialBackorder.options[${i}].label must be a non-empty string` });
              return;
            }
            if (typeof opt['description'] !== 'string') {
              res.status(400).json({ error: `messages.partialBackorder.options[${i}].description must be a string` });
              return;
            }
          }
          mergedMessages.partialBackorder.options = opts.map(o => ({
            label: (o as Record<string, unknown>)['label'] as string,
            description: (o as Record<string, unknown>)['description'] as string,
          }));
        }
      }
    }

    // allBackordered
    if ('allBackordered' in m) {
      const ab = m['allBackordered'];
      if (typeof ab !== 'object' || ab === null || Array.isArray(ab)) {
        res.status(400).json({ error: '"messages.allBackordered" must be an object' });
        return;
      }
      const abObj = ab as Record<string, unknown>;

      for (const key of MSG_STRING_KEYS_ALL) {
        if (key in abObj) {
          const val = abObj[key];
          if (val === null || val === undefined || val === '') { delete mergedMessages.allBackordered[key]; continue; }
          if (typeof val !== 'string') { res.status(400).json({ error: `messages.allBackordered.${key} must be a string` }); return; }
          mergedMessages.allBackordered[key] = val;
        }
      }
    }
  }

  // ── Validate and merge html overrides ────────────────────────────────────────
  const mergedHtml = { ...(current.html ?? {}) };

  if ('html' in body) {
    const html = body['html'];
    if (typeof html !== 'object' || html === null || Array.isArray(html)) {
      res.status(400).json({ error: '"html" must be an object' });
      return;
    }
    const h = html as Record<string, unknown>;
    for (const key of ['partialBackorder', 'allBackordered'] as const) {
      if (key in h) {
        const val = h[key];
        if (val === null || val === undefined || val === '') {
          delete mergedHtml[key];
        } else if (typeof val !== 'string') {
          res.status(400).json({ error: `html.${key} must be a string` });
          return;
        } else {
          mergedHtml[key] = val;
        }
      }
    }
  }

  const merged: TemplateConfig = {
    style: Object.keys(mergedStyle).length > 0 ? mergedStyle : undefined,
    messages: {
      partialBackorder: Object.keys(mergedMessages.partialBackorder).length > 0 ? mergedMessages.partialBackorder : undefined,
      allBackordered: Object.keys(mergedMessages.allBackordered).length > 0 ? mergedMessages.allBackordered : undefined,
    },
    html: Object.keys(mergedHtml).length > 0 ? mergedHtml : undefined,
  };

  setTemplateConfig(merged);
  logger.info('template.updated', merged as unknown as Record<string, unknown>);
  res.json(merged);
});

// Initialize token manager then start server
shopifyTokenManager.initialize()
  .then(() => {
    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`Server listening on 0.0.0.0:${config.port}`);
      logger.info('server.started', {
        port: config.port,
        mcpTools: mcpServer.getCapabilities().tools.map(t => t.name),
      });
      alertSlack('Backorder service started', 'info');
    });

    server.on('error', (err) => {
      console.error('Server failed to start:', err);
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize Shopify token:', err);
    process.exit(1);
  });
