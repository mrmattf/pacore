import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import {
  MCPTool,
  MCPToolResult,
  MCPCapabilities,
  JSONRPCRequest,
  JSONRPCResponse,
} from './types';
import { shopifyTools, ShopifyToolExecutor } from './tools/shopify-tools';
import { gorgiasTools, GorgiasToolExecutor, DryRunGorgiasToolExecutor } from './tools/gorgias-tools';
import { configTools, ConfigToolExecutor } from './tools/config-tools';
import { ShopifyClient } from '../clients/shopify';
import { ShopifyTokenManager } from '../clients/shopify-token-manager';
import { GorgiasClient } from '../clients/gorgias';
import { Config } from '../config';
import { logger } from '../logger';

interface PerRequestExecutors {
  shopify: ShopifyToolExecutor;
  gorgias: GorgiasToolExecutor | DryRunGorgiasToolExecutor;
}

export class MCPServer {
  private tools: MCPTool[];
  private shopifyExecutor: ShopifyToolExecutor;
  private gorgiasExecutor: GorgiasToolExecutor | DryRunGorgiasToolExecutor;
  private configExecutor: ConfigToolExecutor;
  private gorgiasEnabled: boolean;
  private sessions = new Map<string, Response>();

  constructor(shopifyClient: ShopifyClient, gorgiasClient: GorgiasClient | null, gorgiasEnabled: boolean = false) {
    this.tools = [...shopifyTools, ...gorgiasTools, ...configTools];
    this.configExecutor = new ConfigToolExecutor();
    this.shopifyExecutor = new ShopifyToolExecutor(shopifyClient);
    this.gorgiasEnabled = gorgiasEnabled;

    if (gorgiasEnabled && gorgiasClient) {
      this.gorgiasExecutor = new GorgiasToolExecutor(gorgiasClient);
      logger.info('mcp.gorgias.enabled', { mode: 'live' });
    } else {
      this.gorgiasExecutor = new DryRunGorgiasToolExecutor();
      logger.info('mcp.gorgias.enabled', { mode: 'dry-run' });
    }
  }

  getRouter(): Router {
    const router = Router();

    // JSON-RPC endpoint
    router.post('/', async (req: Request, res: Response) => {
      const request = req.body as JSONRPCRequest;
      const perRequest = this.buildPerRequestExecutors(req);

      try {
        const response = await this.handleRequest(request, perRequest ?? undefined);
        res.json(response);
      } catch (error) {
        res.json(this.errorResponse(request.id, -32603, (error as Error).message));
      }
    });

    // REST-style endpoints for convenience
    router.get('/tools', (_req: Request, res: Response) => {
      res.json(this.getCapabilities());
    });

    router.post('/tools/:toolName/call', async (req: Request, res: Response) => {
      const { toolName } = req.params;
      const args = req.body;
      const perRequest = this.buildPerRequestExecutors(req);

      const result = await this.callTool(toolName, args, perRequest ?? undefined);
      res.json(result);
    });

    // ── SSE transport (for Claude Desktop and MCP-compatible AI clients) ──────
    //
    // Connection flow:
    //   1. Client opens GET /mcp/sse  → receives SSE stream with endpoint URL
    //   2. Client POSTs JSON-RPC to   → POST /mcp/message?sessionId=<id>
    //   3. Server responds via SSE    → event: message / data: <json-rpc-response>
    //
    // Claude Desktop config (claude_desktop_config.json):
    //   { "mcpServers": { "yota-backorder": {
    //       "url": "https://<railway-domain>/mcp/sse",
    //       "headers": { "Authorization": "Bearer <API_SECRET>" }
    //   }}}

    router.get('/sse', (req: Request, res: Response) => {
      const sessionId = crypto.randomUUID();

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Keepalive comment every 30 s — prevents Railway/proxy idle timeout
      const keepalive = setInterval(() => res.write(': keepalive\n\n'), 30_000);

      // Tell the client where to POST JSON-RPC messages
      res.write(`event: endpoint\ndata: /mcp/message?sessionId=${sessionId}\n\n`);

      this.sessions.set(sessionId, res);
      logger.info('mcp.sse.connected', { sessionId, activeSessions: this.sessions.size });

      req.on('close', () => {
        clearInterval(keepalive);
        this.sessions.delete(sessionId);
        logger.info('mcp.sse.disconnected', { sessionId, activeSessions: this.sessions.size });
      });
    });

    router.post('/message', async (req: Request, res: Response) => {
      const sessionId = req.query['sessionId'] as string;
      const sseRes = this.sessions.get(sessionId);

      if (!sseRes) {
        res.status(404).json({ error: 'Session not found or expired' });
        return;
      }

      const request = req.body as JSONRPCRequest;

      // Notifications (e.g. notifications/initialized) are fire-and-forget
      if (typeof request.method === 'string' && request.method.startsWith('notifications/')) {
        res.status(202).send();
        return;
      }

      try {
        const perRequest = this.buildPerRequestExecutors(req);
        const response = await this.handleRequest(request, perRequest ?? undefined);
        sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
      } catch (error) {
        const errResponse: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32603, message: (error as Error).message },
        };
        sseRes.write(`event: message\ndata: ${JSON.stringify(errResponse)}\n\n`);
      }

      res.status(202).send();
    });

    return router;
  }

  /**
   * Build per-request Shopify/Gorgias executors from credential headers injected by PA Core cloud.
   * Returns null if the required Shopify headers are absent (falls back to static executors).
   *
   * Expected headers (set via MCPClient.customHeaders):
   *   X-Shopify-Domain       — e.g. my-store.myshopify.com
   *   X-Shopify-Client-Id    — Shopify OAuth client ID
   *   X-Shopify-Client-Secret — Shopify OAuth client secret
   *   X-Gorgias-Domain       — e.g. mystore.gorgias.com (optional)
   *   X-Gorgias-Api-Key      — Gorgias REST API key (optional)
   *   X-Gorgias-Email        — Gorgias account email used for Basic Auth (optional)
   *   X-Gorgias-From-Email   — sender email for tickets (optional)
   */
  private buildPerRequestExecutors(req: Request): PerRequestExecutors | null {
    const shopifyDomain = req.headers['x-shopify-domain'] as string | undefined;
    const shopifyClientId = req.headers['x-shopify-client-id'] as string | undefined;
    const shopifyClientSecret = req.headers['x-shopify-client-secret'] as string | undefined;

    if (!shopifyDomain || !shopifyClientId || !shopifyClientSecret) {
      return null;
    }

    const shopifyConfig = {
      shopifyStoreDomain: shopifyDomain,
      shopifyClientId,
      shopifyClientSecret,
    } as unknown as Config;

    const tokenManager = new ShopifyTokenManager(shopifyConfig);
    const shopifyClient = new ShopifyClient(shopifyConfig, tokenManager);
    const shopify = new ShopifyToolExecutor(shopifyClient);

    const gorgiasDomain = req.headers['x-gorgias-domain'] as string | undefined;
    const gorgiasApiKey = req.headers['x-gorgias-api-key'] as string | undefined;
    const gorgiasEmail = req.headers['x-gorgias-email'] as string | undefined;
    const gorgiasFromEmail = req.headers['x-gorgias-from-email'] as string | undefined;

    let gorgias: GorgiasToolExecutor | DryRunGorgiasToolExecutor;
    if (gorgiasDomain && gorgiasApiKey && gorgiasEmail) {
      const gorgiasConfig = {
        gorgiasDomain,
        gorgiasApiKey,
        gorgiasApiEmail: gorgiasEmail,
        gorgiasFromEmail,
      } as unknown as Config;
      const gorgiasClient = new GorgiasClient(gorgiasConfig);
      gorgias = new GorgiasToolExecutor(gorgiasClient);
      logger.info('mcp.per_request.credentials', { shopifyDomain, gorgiasEnabled: true });
    } else {
      gorgias = new DryRunGorgiasToolExecutor();
      logger.info('mcp.per_request.credentials', { shopifyDomain, gorgiasEnabled: false });
    }

    return { shopify, gorgias };
  }

  async handleRequest(request: JSONRPCRequest, executors?: PerRequestExecutors): Promise<JSONRPCResponse> {
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        return this.successResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'shopify-backorder-mcp',
            version: '1.0.0',
          },
        });

      case 'tools/list':
        return this.successResponse(id, { tools: this.tools });

      case 'tools/call': {
        const { name, arguments: args } = params as { name: string; arguments: Record<string, unknown> };
        const result = await this.callTool(name, args || {}, executors);

        if (result.success) {
          return this.successResponse(id, { content: [{ type: 'text', text: JSON.stringify(result.data) }] });
        } else {
          return this.errorResponse(id, -32000, result.error || 'Tool execution failed');
        }
      }

      default:
        return this.errorResponse(id, -32601, `Method not found: ${method}`);
    }
  }

  getCapabilities(): MCPCapabilities {
    return { tools: this.tools };
  }

  async callTool(toolName: string, args: Record<string, unknown>, executors?: PerRequestExecutors): Promise<MCPToolResult> {
    logger.info('mcp.tool.call', { tool: toolName, args });

    const shopifyExec = executors?.shopify ?? this.shopifyExecutor;
    const gorgiasExec = executors?.gorgias ?? this.gorgiasExecutor;

    let result: MCPToolResult;

    if (toolName.startsWith('shopify.')) {
      result = await shopifyExec.execute(toolName, args);
    } else if (toolName.startsWith('gorgias.')) {
      result = await gorgiasExec.execute(toolName, args);
    } else if (toolName.startsWith('config.')) {
      result = await this.configExecutor.execute(toolName, args);
    } else {
      result = { success: false, error: `Unknown tool: ${toolName}` };
    }

    logger.info('mcp.tool.result', {
      tool: toolName,
      success: result.success,
      error: result.error
    });

    return result;
  }

  private successResponse(id: number | string, result: unknown): JSONRPCResponse {
    return { jsonrpc: '2.0', id, result };
  }

  private errorResponse(id: number | string, code: number, message: string): JSONRPCResponse {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }
}
