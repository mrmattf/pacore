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

// ── OAuth 2.0 endpoints (public — these ARE the auth mechanism) ───────────────
//
// Claude Desktop's "Custom Connector" UI requires OAuth. We implement the
// simplest possible flow: client_credentials grant where:
//   client_id  = anything (not validated — only the secret matters)
//   client_secret = API_SECRET (the same key used for /mcp Bearer auth)
//
// The issued access_token is the API_SECRET itself, so the existing
// requireApiKey middleware accepts it without changes.

// OAuth metadata discovery
app.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0].trim() ?? req.protocol;
  const host = req.headers['host'];
  const base = `${proto}://${host}`;

  res.json({
    issuer: base,
    token_endpoint: `${base}/oauth/token`,
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    grant_types_supported: ['client_credentials'],
    response_types_supported: ['token'],
  });
});

// Token endpoint — client_credentials grant
app.post('/oauth/token', express.urlencoded({ extended: false }), (req: Request, res: Response) => {
  const grantType = req.body.grant_type ?? req.body['grant_type'];
  const clientSecret = req.body.client_secret ?? req.body['client_secret'];

  // Also support HTTP Basic Auth (Authorization: Basic base64(id:secret))
  let resolvedSecret = clientSecret;
  if (!resolvedSecret) {
    const basic = req.get('Authorization');
    if (basic?.startsWith('Basic ')) {
      const decoded = Buffer.from(basic.slice(6), 'base64').toString('utf8');
      resolvedSecret = decoded.split(':')[1] ?? '';
    }
  }

  if (grantType !== 'client_credentials') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }

  // Constant-time comparison
  const isValid =
    resolvedSecret?.length === config.apiSecret.length &&
    crypto.timingSafeEqual(Buffer.from(resolvedSecret), Buffer.from(config.apiSecret));

  if (!isValid) {
    logger.warn('oauth.token.invalid_secret', { ip: req.ip });
    res.status(401).json({ error: 'invalid_client' });
    return;
  }

  logger.info('oauth.token.issued', { ip: req.ip });

  res.json({
    access_token: config.apiSecret,
    token_type: 'Bearer',
    expires_in: 86400, // 24 hours — Claude Desktop will re-fetch as needed
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
    const orderResult = await mcpServer.callTool('shopify.get_order', { order_id: orderId });

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
