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
import { ShopifyClient } from '../clients/shopify';
import { GorgiasClient } from '../clients/gorgias';
import { logger } from '../logger';

export class MCPServer {
  private tools: MCPTool[];
  private shopifyExecutor: ShopifyToolExecutor;
  private gorgiasExecutor: GorgiasToolExecutor | DryRunGorgiasToolExecutor;
  private gorgiasEnabled: boolean;

  constructor(shopifyClient: ShopifyClient, gorgiasClient: GorgiasClient | null, gorgiasEnabled: boolean = false) {
    this.tools = [...shopifyTools, ...gorgiasTools];
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

      try {
        const response = await this.handleRequest(request);
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

      const result = await this.callTool(toolName, args);
      res.json(result);
    });

    return router;
  }

  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
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

      case 'tools/call':
        const { name, arguments: args } = params as { name: string; arguments: Record<string, unknown> };
        const result = await this.callTool(name, args || {});

        if (result.success) {
          return this.successResponse(id, { content: [{ type: 'text', text: JSON.stringify(result.data) }] });
        } else {
          return this.errorResponse(id, -32000, result.error || 'Tool execution failed');
        }

      default:
        return this.errorResponse(id, -32601, `Method not found: ${method}`);
    }
  }

  getCapabilities(): MCPCapabilities {
    return { tools: this.tools };
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    logger.info('mcp.tool.call', { tool: toolName, args });

    let result: MCPToolResult;

    if (toolName.startsWith('shopify.')) {
      result = await this.shopifyExecutor.execute(toolName, args);
    } else if (toolName.startsWith('gorgias.')) {
      result = await this.gorgiasExecutor.execute(toolName, args);
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
