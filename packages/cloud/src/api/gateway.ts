import express, { Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { Orchestrator } from '../orchestration';
import { createHash } from 'crypto';
import { createAuthRoutes } from './auth-routes';
import { createOAuthRoutes } from './oauth-routes';
import { createMcpCredentialRoutes } from './mcp-credential-routes';
import { createAdminRoutes } from './admin-routes';
import { createOperatorRoutes, createOrgOperatorContactRoute } from './operator-routes';
import { createOnboardingRoutes } from './onboarding-routes';
import { createConversationRoutes } from './conversation-routes';
import { createMcpServerRoutes } from './mcp-server-routes';
import { createWorkflowRoutes } from './workflow-routes';
import { createOrgRoutes } from './org-routes';
import { createSkillRoutes } from './skill-routes';
import { buildShopifyAuthUrl, exchangeCodeForToken, storeShopifyConnection, verifyShopifyCallbackHmac, registerAppUninstalledWebhook } from '../integrations/shopify/shopify-oauth';
import { createShopifyLifecycleRoutes } from './shopify-lifecycle-routes';
import { MCPRegistry, CredentialManager, CredentialScope } from '../mcp';
import { WorkflowManager, WorkflowExecutor, WorkflowBuilder } from '../workflow';
import { OrgManager } from '../organizations/org-manager';
import { Router } from 'express';
import { SkillRegistry } from '../skills/skill-registry';
import { SkillTemplateRegistry } from '../skills/skill-template-registry';
import { MCPGateway } from '../mcp/mcp-gateway';
import { SkillDispatcher } from '../skills/skill-dispatcher';
import { WebhookTriggerHandler } from '../triggers/webhook-trigger';
import { BillingManager } from '../billing';
import { AdapterRegistry } from '../integrations/adapter-registry';

export interface GatewayConfig {
  port: number;
  jwtPublicKey: string;   // ES256 PEM public key — verifies access tokens
  jwtPrivateKey: string;  // ES256 PEM private key — signs access tokens (used by auth routes)
  corsOrigins?: string[];
  db: Pool;
  mcpRegistry: MCPRegistry;
  credentialManager: CredentialManager;
  workflowManager: WorkflowManager;
  workflowExecutor: WorkflowExecutor;
  workflowBuilder: WorkflowBuilder;
  orgManager: OrgManager;
  skillRegistry: SkillRegistry;
  skillDispatcher: SkillDispatcher;
  skillTemplateRegistry?: SkillTemplateRegistry;
  webhookTriggerHandler: WebhookTriggerHandler;
  billingManager?: BillingManager;
  adapterRegistry?: AdapterRegistry;
  // Internal MCP sub-routers (mounted at /internal/mcp/*)
  shopifyMcpRouter?: Router;
  gorgiasMcpRouter?: Router;
  zendeskMcpRouter?: Router;
  skillsMcpRouter?: Router;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    [key: string]: any;
  };
}

/**
 * API Gateway for handling HTTP and WebSocket requests
 */
export class APIGateway {
  private app = express();
  private server: Server;
  private wss?: WebSocketServer;

  constructor(
    private orchestrator: Orchestrator,
    private config: GatewayConfig,
  ) {
    this.server = createServer(this.app);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    // Raw body MUST be registered before express.json() so that
    // HMAC verification on the webhook path can access original bytes.
    this.app.use('/v1/triggers/webhook', express.raw({ type: '*/*' }));
    this.app.use('/v1/webhooks/shopify', express.raw({ type: '*/*' }));

    this.app.use(express.json());
    // Required for HTML form POSTs (e.g. /oauth/authorize login form)
    this.app.use(express.urlencoded({ extended: false }));

    // CORS
    this.app.use((req, res, next) => {
      const origin = req.headers.origin as string | undefined;
      // Always allow configured origins; also allow claude.ai for OAuth/MCP endpoints
      const isClaudeOrigin = origin && (origin === 'https://claude.ai' || origin.endsWith('.claude.ai'));
      if (origin && (this.config.corsOrigins?.includes(origin) || isClaudeOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // OAuth + metadata endpoints — public, mounted before auth middleware
    this.app.use(createOAuthRoutes(this.config.db));

    // Authentication middleware (async to support opaque token DB lookup)
    this.app.use((req, res, next) => {
      this.authenticateRequest(req as AuthenticatedRequest, res, next).catch(next);
    });
  }

  private async authenticateRequest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Skip auth for: health, auth routes, webhook triggers, OAuth endpoints, onboarding intake, static assets
    if (
      req.path === '/health' ||
      req.path.startsWith('/v1/auth/') ||
      req.path.startsWith('/v1/admin/') ||
      req.path.startsWith('/v1/triggers/webhook/') ||
      req.path.startsWith('/v1/webhooks/shopify/') ||
      req.path.startsWith('/v1/onboard/') ||
      req.path === '/v1/integrations/shopify/callback' ||
      req.path.startsWith('/oauth/') ||
      req.path.startsWith('/.well-known/') ||
      (!req.path.startsWith('/v1') && !req.path.startsWith('/internal'))
    ) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0].trim() ?? req.protocol;
      const host  = req.headers.host as string;
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${proto}://${host}/.well-known/oauth-protected-resource"`);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.slice(7);

    // Opaque token (no dots) → look up in oauth_access_tokens table
    if (!token.includes('.')) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const result = await this.config.db.query(
        `SELECT oat.user_id, u.email
         FROM oauth_access_tokens oat JOIN users u ON u.id = oat.user_id
         WHERE oat.token_hash = $1 AND oat.expires_at > NOW()`,
        [tokenHash],
      );
      if (!result.rows[0]) {
        const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0].trim() ?? req.protocol;
        const host  = req.headers.host as string;
        res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${proto}://${host}/.well-known/oauth-protected-resource"`);
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      req.user = { id: result.rows[0].user_id, email: result.rows[0].email, type: 'oauth' };
      return next();
    }

    // JWT → verify with ES256 public key
    try {
      const decoded = jwt.verify(token, this.config.jwtPublicKey, { algorithms: ['ES256'] }) as any;
      req.user = decoded;
      next();
    } catch {
      const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0].trim() ?? req.protocol;
      const host  = req.headers.host as string;
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${proto}://${host}/.well-known/oauth-protected-resource"`);
      res.status(401).json({ error: 'Invalid token' });
    }
  }

  private setupRoutes(): void {
    // -------------------------------------------------------------------------
    // Health check
    // -------------------------------------------------------------------------
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Auth routes
    const authRoutes = createAuthRoutes({
      jwtPrivateKey: this.config.jwtPrivateKey,
      jwtPublicKey: this.config.jwtPublicKey,
      db: this.config.db,
    });
    this.app.use('/v1/auth', authRoutes);

    // MCP client credential management (per-user client_id + secret pairs)
    this.app.use(createMcpCredentialRoutes(this.config.db));

    // Admin routes — protected by X-Admin-Secret header, bypass JWT auth
    this.app.use('/v1/admin', createAdminRoutes(this.config.db, this.config.orgManager));

    // Onboarding intake routes — public (no auth), mounted before JWT auth middleware applies
    this.app.use('/v1/onboard', createOnboardingRoutes(this.config.db, this.config.credentialManager, this.config.jwtPrivateKey));

    // Operator routes — JWT-authenticated, operator role required
    if (this.config.orgManager && this.config.skillRegistry) {
      this.app.use('/v1/operator', createOperatorRoutes(
        this.config.db,
        this.config.credentialManager,
        this.config.orgManager,
        this.config.skillRegistry,
      ));
      this.app.use('/v1/organizations', createOrgOperatorContactRoute(this.config.db));
    }

    // -------------------------------------------------------------------------
    // MCP Gateway — multi-tenant aggregated tool endpoint for AI clients
    // -------------------------------------------------------------------------
    const mcpGateway = new MCPGateway({
      mcpRegistry: this.config.mcpRegistry,
      credentialManager: this.config.credentialManager,
      skillRegistry: this.config.skillRegistry,
      orgManager: this.config.orgManager,
      adapterRegistry: this.config.adapterRegistry ?? new AdapterRegistry(),
      skillTemplateRegistry: this.config.skillTemplateRegistry,
      listConnections: async (scope: CredentialScope) => {
        const column = 'org_id';
        const value  = scope.orgId;
        const result = await this.config.db.query(
          `SELECT id, integration_key, display_name FROM integration_connections WHERE ${column} = $1 AND status = 'active' ORDER BY created_at ASC`,
          [value]
        );
        return result.rows.map((r: any) => ({
          id: r.id,
          integrationKey: r.integration_key,
          displayName: r.display_name,
        }));
      },
    });
    // Wire MCPGateway into the orchestrator so agent mode can call adapter tools in-process
    this.orchestrator.setMcpGateway(mcpGateway);
    this.app.use('/v1/mcp', mcpGateway.getRouter());

    // -------------------------------------------------------------------------
    // Webhook trigger (unauthenticated — token in path is the identity)
    // -------------------------------------------------------------------------
    this.app.post('/v1/triggers/webhook/:token', async (req: Request, res: Response) => {
      try {
        const { token } = req.params;
        const result = await this.config.webhookTriggerHandler.handle(token, req);
        res.status(result.status).send(result.body);
      } catch (err: any) {
        console.error('[WebhookTrigger] Unhandled error in webhook handler:', err);
        res.status(500).send('Internal server error');
      }
    });

    // -------------------------------------------------------------------------
    // Shopify lifecycle webhooks — public, HMAC-verified, raw body
    // Handlers live in shopify-lifecycle-routes.ts; mounted here so the raw-body
    // middleware registered above (/v1/webhooks/shopify) applies automatically.
    // -------------------------------------------------------------------------
    this.app.use(
      '/v1/webhooks/shopify',
      createShopifyLifecycleRoutes({
        db: this.config.db,
        credentialManager: this.config.credentialManager,
      }),
    );

    // -------------------------------------------------------------------------
    // Complete endpoint with SSE streaming support
    // -------------------------------------------------------------------------
    this.app.post('/v1/complete', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { messages, options } = req.body;
        const userId = req.user!.id;

        // Extract last user message
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'user') {
          return res.status(400).json({ error: 'Invalid messages format' });
        }

        // Check if streaming is requested
        if (options?.stream === true) {
          // Set SSE headers
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

          // Stream chunks
          for await (const chunk of this.orchestrator.processStreamingRequest(
            userId,
            lastMessage.content,
            options,
          )) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }

          res.end();
        } else {
          // Non-streaming request
          const response = await this.orchestrator.processRequest(
            userId,
            lastMessage.content,
            options,
          );

          res.json(response);
        }
      } catch (error: any) {
        console.error('Complete error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Provider configuration
    this.app.post(
      '/v1/providers/:providerId/configure',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { providerId } = req.params;
          const config = req.body;
          const userId = req.user!.id;

          await this.orchestrator.registry.configureLLMForUser(
            userId,
            providerId,
            config,
          );

          res.json({ success: true });
        } catch (error: any) {
          console.error('Configure error:', error);
          res.status(400).json({ error: error.message });
        }
      },
    );

    // List available providers
    this.app.get('/v1/providers', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const configuredProviders = this.orchestrator.registry.getUserProviders(userId);
        const allProviders = this.orchestrator.registry.getProviders();

        res.json({
          configured: configuredProviders,
          available: allProviders.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
          })),
        });
      } catch (error: any) {
        console.error('List providers error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.use(createConversationRoutes(this.orchestrator.memory));

    this.app.use(createMcpServerRoutes(
      this.config.mcpRegistry,
      this.config.credentialManager,
      this.config.orgManager,
    ));

    this.app.use(createWorkflowRoutes(
      this.config.workflowManager,
      this.config.workflowExecutor,
      this.config.workflowBuilder,
    ));

    this.app.use(createOrgRoutes(
      this.config.db,
      this.config.orgManager,
      this.config.billingManager,
      this.config.mcpRegistry,
      this.config.credentialManager,
    ));

    // Internal MCP sub-routers (credentials resolved per-request via headers)
    if (this.config.shopifyMcpRouter) {
      this.app.use('/internal/mcp/shopify', this.config.shopifyMcpRouter);
    }
    if (this.config.gorgiasMcpRouter) {
      this.app.use('/internal/mcp/gorgias', this.config.gorgiasMcpRouter);
    }
    if (this.config.zendeskMcpRouter) {
      this.app.use('/internal/mcp/zendesk', this.config.zendeskMcpRouter);
    }
    if (this.config.skillsMcpRouter) {
      this.app.use('/internal/mcp/skills', this.config.skillsMcpRouter);
    }

    this.app.use(createSkillRoutes(
      this.config.db,
      this.config.skillRegistry,
      this.config.skillTemplateRegistry,
      this.config.skillDispatcher,
      this.config.orgManager,
      this.config.adapterRegistry,
      this.config.credentialManager,
      this.config.billingManager,
    ));

    // -------------------------------------------------------------------------
    // Billing — plan catalog (platform-wide)
    // -------------------------------------------------------------------------

    this.app.get('/v1/plans', async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!this.config.billingManager) return res.json([]);
        res.json(this.config.billingManager.listPlans());
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // -------------------------------------------------------------------------
    // Shopify OAuth — authenticated self-service connect flow
    // -------------------------------------------------------------------------

    // POST /v1/integrations/shopify/start — generate Shopify auth URL (JWT auth required)
    this.app.post('/v1/integrations/shopify/start', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { shop } = req.body as { shop?: string };
        if (!shop || !/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) {
          return res.status(400).json({ error: 'shop must be a valid myshopify.com domain (e.g. my-store.myshopify.com)' });
        }

        const orgId = req.user?.orgId ?? req.user?.id;
        if (!orgId) return res.status(401).json({ error: 'Unauthorized' });

        const state = jwt.sign(
          { orgId, shop, aud: 'shopify-oauth' },
          this.config.jwtPrivateKey,
          { algorithm: 'ES256', expiresIn: '10m' }
        );

        const authUrl = buildShopifyAuthUrl(shop, state);
        res.json({ authUrl });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /v1/integrations/shopify/callback — public, called by Shopify after authorization
    this.app.get('/v1/integrations/shopify/callback', async (req: Request, res: Response) => {
      const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') ?? '';
      try {
        // Normalize: only keep scalar string values. Express parses repeated params as arrays;
        // passing arrays to verifyShopifyCallbackHmac would produce a non-matching message string.
        const queryStrings: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.query)) {
          if (typeof v === 'string') queryStrings[k] = v;
        }
        const { code, shop: callbackShop, state, error: shopifyError, error_description } = queryStrings;

        // Shopify may send error params if the merchant denies the app or something goes wrong
        if (shopifyError) {
          console.error('[shopify-oauth] callback: Shopify returned error', { shop: callbackShop, error: shopifyError, error_description });
          return res.status(400).send(`Shopify authorization failed: ${shopifyError}${error_description ? ' — ' + error_description : ''}`);
        }

        if (!code || !callbackShop || !state) {
          console.warn('[shopify-oauth] callback: missing required params', { hasCode: !!code, hasShop: !!callbackShop, hasState: !!state });
          return res.status(400).send('Missing code, shop, or state parameter');
        }

        console.log('[shopify-oauth] callback: received', { shop: callbackShop });

        let payload: {
          orgId: string;
          shop: string;
          intakeToken?: string;
          aud: string;
          shopifyClientId?: string;
          shopifyClientSecret?: string;
        };
        try {
          payload = jwt.verify(state, this.config.jwtPublicKey, { algorithms: ['ES256'] }) as typeof payload;
        } catch (err: any) {
          console.warn('[shopify-oauth] callback: state JWT verification failed', { shop: callbackShop, error: err.message });
          return res.status(400).send('Invalid or expired state parameter — please start the connection again');
        }

        if (payload.aud !== 'shopify-oauth') {
          console.warn('[shopify-oauth] callback: invalid state audience', { shop: callbackShop, aud: payload.aud });
          return res.status(400).send('Invalid state audience');
        }

        if (callbackShop !== payload.shop) {
          console.warn('[shopify-oauth] callback: shop mismatch', { callbackShop, stateshop: payload.shop, orgId: payload.orgId });
          return res.status(400).send('Shop mismatch — authorization was not for this store');
        }

        // Verify Shopify's HMAC signature on the callback query params.
        // Resolves: custom app secret from state JWT → platform env var.
        // Hard-fail if neither is available — never accept an HMAC computed with an empty key.
        const resolvedClientSecret = payload.shopifyClientSecret ?? process.env.SHOPIFY_APP_CLIENT_SECRET;
        if (!resolvedClientSecret) {
          console.warn('[shopify-oauth] callback: no client secret available for HMAC verification', { shop: callbackShop, orgId: payload.orgId });
          return res.status(400).send('Shopify app not configured — missing client secret');
        }
        if (!verifyShopifyCallbackHmac(queryStrings, resolvedClientSecret)) {
          console.warn('[shopify-oauth] callback: Shopify HMAC verification failed', { shop: callbackShop, orgId: payload.orgId });
          return res.status(400).send('Invalid Shopify HMAC — authorization request may have been tampered with');
        }

        const appMode = payload.shopifyClientId ? 'custom' : 'platform';
        console.log('[shopify-oauth] callback: state verified, exchanging code', { shop: callbackShop, orgId: payload.orgId, appMode });

        const accessToken = await exchangeCodeForToken(
          callbackShop, code, payload.shopifyClientId, payload.shopifyClientSecret
        );

        console.log('[shopify-oauth] callback: token exchanged, storing connection', { shop: callbackShop, orgId: payload.orgId });

        await storeShopifyConnection(
          payload.orgId, callbackShop, accessToken,
          this.config.db, this.config.credentialManager,
          payload.shopifyClientId, payload.shopifyClientSecret
        );

        // Register the app/uninstalled lifecycle webhook (fire-and-forget).
        // Required so Shopify can notify us when a merchant removes the app.
        const webhookBase = process.env.WEBHOOK_BASE_URL?.replace(/\/$/, '') ?? '';
        if (webhookBase) {
          registerAppUninstalledWebhook(callbackShop, accessToken, `${webhookBase}/v1/webhooks/shopify/app-uninstalled`)
            .catch(err => console.warn('[shopify-oauth] callback: failed to register app/uninstalled webhook', { shop: callbackShop, error: err.message }));
        }

        const redirectDest = payload.intakeToken ? 'intake' : 'settings';
        console.log('[shopify-oauth] callback: connection stored, redirecting', { shop: callbackShop, orgId: payload.orgId, redirectDest });

        if (payload.intakeToken) {
          return res.redirect(`${frontendUrl}/onboard/${payload.intakeToken}?shopify=connected`);
        }
        return res.redirect(`${frontendUrl}/settings?shopify=connected`);
      } catch (error: any) {
        console.error('[shopify-oauth] callback: unhandled error', { error: error.message, stack: error.stack });
        return res.redirect(`${frontendUrl}/settings?shopify=error&message=${encodeURIComponent(error.message)}`);
      }
    });

    // -------------------------------------------------------------------------
    // Static web frontend (SPA) — served only when the public/ dir exists
    // -------------------------------------------------------------------------
    const publicDir = path.join(process.cwd(), 'public');
    if (fs.existsSync(publicDir)) {
      this.app.use(express.static(publicDir));
      // SPA fallback: any non-API path returns index.html
      this.app.get(/^(?!\/v1|\/internal|\/health|\/ws).*/, (_req, res) => {
        res.sendFile(path.join(publicDir, 'index.html'));
      });
    }
  }

  private setupWebSocket(): void {
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', async (ws: WebSocket, req) => {
      try {
        const token = this.extractToken(req);
        if (!token) {
          ws.close(1008, 'Unauthorized');
          return;
        }

        const decoded = jwt.verify(token, this.config.jwtPublicKey, { algorithms: ['ES256'] }) as any;

        if (decoded.type === 'agent') {
          // Handle agent connection (future implementation)
          ws.close(1011, 'Agent connections not yet supported');
        } else {
          // Handle client streaming connection
          await this.handleClientConnection(ws, decoded);
        }
      } catch (error) {
        console.error('WebSocket connection error:', error);
        ws.close(1011, 'Internal error');
      }
    });
  }

  private extractToken(req: any): string | null {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (token) return token;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return null;
  }

  private async handleClientConnection(ws: WebSocket, userInfo: any): Promise<void> {
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'complete') {
          const { input, options } = message.data;

          // Check if streaming is requested
          if (options?.stream === true) {
            // Use streaming orchestrator method
            try {
              for await (const chunk of this.orchestrator.processStreamingRequest(
                userInfo.id,
                input,
                options,
              )) {
                ws.send(JSON.stringify({
                  type: 'stream',
                  data: chunk,
                }));
              }

              // Send stream end signal
              ws.send(JSON.stringify({
                type: 'stream_end',
              }));
            } catch (streamError: any) {
              ws.send(JSON.stringify({
                type: 'error',
                error: streamError.message,
              }));
            }
          } else {
            // Non-streaming request
            const response = await this.orchestrator.processRequest(
              userInfo.id,
              input,
              options,
            );

            ws.send(JSON.stringify({
              type: 'complete',
              data: response,
            }));
          }
        }
      } catch (error: any) {
        ws.send(JSON.stringify({
          type: 'error',
          error: error.message,
        }));
      }
    });

    ws.on('close', () => {
      console.log(`Client ${userInfo.id} disconnected`);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, () => {
        console.log(`API Gateway listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss?.close();
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}


