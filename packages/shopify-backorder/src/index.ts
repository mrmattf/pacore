import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { loadConfig } from './config';
import { logger, initAlerts, alertSlack } from './logger';
import { ShopifyClient, ShopifyOrder } from './clients/shopify';
import { GorgiasClient } from './clients/gorgias';
import { MCPServer } from './mcp/server';
import { handleBackorderCheck } from './handler/backorder';

// Early startup logging (before config validation)
console.log('Starting shopify-backorder service...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT env:', process.env.PORT);

// Load configuration
console.log('Loading configuration...');
const config = loadConfig();
console.log('Configuration loaded successfully. Port:', config.port);

// Initialize clients
const shopifyClient = new ShopifyClient(config);
const gorgiasClient = new GorgiasClient(config);

// Initialize MCP server
const mcpServer = new MCPServer(shopifyClient, gorgiasClient);

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
  let order: ShopifyOrder;
  try {
    order = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
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

// Start server - bind to 0.0.0.0 for Railway
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
