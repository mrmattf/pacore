import express, { Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { Orchestrator } from '../orchestration';
import { createAuthRoutes } from './auth-routes';
import { MCPRegistry, CredentialManager, CredentialScope } from '../mcp';
import { MCPClient } from '../mcp';
import { WorkflowManager, WorkflowExecutor, WorkflowBuilder } from '../workflow';
import { OrgManager } from '../organizations/org-manager';
import { SkillRegistry } from '../skills/skill-registry';
import { SkillDispatcher } from '../skills/skill-dispatcher';
import { WebhookTriggerHandler } from '../triggers/webhook-trigger';
import { BillingManager, PlanLimitError } from '../billing';
import { BillingScope, MCPServer, PlanTier, WebhookVerification } from '@pacore/core';

export interface GatewayConfig {
  port: number;
  jwtSecret: string;
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
  webhookTriggerHandler: WebhookTriggerHandler;
  billingManager?: BillingManager;
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

    this.app.use(express.json());

    // CORS
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (this.config.corsOrigins?.includes(origin || '')) {
        res.setHeader('Access-Control-Allow-Origin', origin || '');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Authentication middleware
    this.app.use(this.authenticateRequest.bind(this));
  }

  private authenticateRequest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): any {
    // Skip auth for health check, auth routes, and webhook triggers
    if (
      req.path === '/health' ||
      req.path.startsWith('/v1/auth/') ||
      req.path.startsWith('/v1/triggers/webhook/')
    ) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);

    try {
      const decoded = jwt.verify(token, this.config.jwtSecret) as any;
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  /**
   * Returns true if the user owns the server personally, or is a member of
   * the org that owns the server.
   */
  private async hasServerAccess(server: MCPServer, userId: string): Promise<boolean> {
    if (server.userId === userId) return true;
    if (server.orgId) {
      const role = await this.config.orgManager.getMemberRole(server.orgId, userId);
      return role !== null;
    }
    return false;
  }

  /**
   * Returns the CredentialScope that matches the server's ownership.
   * Personal servers use user scope; org servers use org scope.
   */
  private serverScope(server: MCPServer, fallbackUserId: string): CredentialScope {
    if (server.orgId) return { type: 'org', orgId: server.orgId };
    return { type: 'user', userId: fallbackUserId };
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
      jwtSecret: this.config.jwtSecret,
      db: this.config.db,
    });
    this.app.use('/v1/auth', authRoutes);

    // -------------------------------------------------------------------------
    // Webhook trigger (unauthenticated — token in path is the identity)
    // -------------------------------------------------------------------------
    this.app.post('/v1/triggers/webhook/:token', async (req: Request, res: Response) => {
      const { token } = req.params;
      const result = await this.config.webhookTriggerHandler.handle(token, req);
      res.status(result.status).send(result.body);
    });

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

    // Memory search
    this.app.post('/v1/memory/search', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { query, options } = req.body;
        const userId = req.user!.id;

        const results = await this.orchestrator.memory.searchContext(
          userId,
          query,
          options,
        );

        res.json(results);
      } catch (error: any) {
        console.error('Memory search error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get conversation history
    this.app.get('/v1/conversations', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;

        const conversations = await this.orchestrator.memory.getUserConversations(
          userId,
          limit,
          offset,
        );

        res.json(conversations);
      } catch (error: any) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete conversation
    this.app.delete('/v1/conversations/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        await this.orchestrator.memory.deleteConversation(id);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Delete conversation error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get conversation by ID
    this.app.get('/v1/conversations/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const conversation = await this.orchestrator.memory.getConversation(id);
        if (!conversation) {
          return res.status(404).json({ error: 'Conversation not found' });
        }
        res.json(conversation);
      } catch (error: any) {
        console.error('Get conversation error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Update conversation tags
    this.app.put('/v1/conversations/:id/tags', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { tags } = req.body;

        if (!Array.isArray(tags)) {
          return res.status(400).json({ error: 'Tags must be an array' });
        }

        await this.orchestrator.memory.updateConversationTags(id, tags);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Update tags error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Add tags to conversation
    this.app.post('/v1/conversations/:id/tags', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { tags } = req.body;

        if (!Array.isArray(tags)) {
          return res.status(400).json({ error: 'Tags must be an array' });
        }

        await this.orchestrator.memory.addConversationTags(id, tags);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Add tags error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Remove tags from conversation
    this.app.delete('/v1/conversations/:id/tags', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { tags } = req.body;

        if (!Array.isArray(tags)) {
          return res.status(400).json({ error: 'Tags must be an array' });
        }

        await this.orchestrator.memory.removeConversationTags(id, tags);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Remove tags error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get conversations by tag
    this.app.get('/v1/conversations/by-tag/:tag', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { tag } = req.params;
        const userId = req.user!.id;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;

        const conversations = await this.orchestrator.memory.getConversationsByTag(
          userId,
          tag,
          limit,
          offset
        );

        res.json(conversations);
      } catch (error: any) {
        console.error('Get conversations by tag error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get user's tags with counts
    this.app.get('/v1/tags', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const tags = await this.orchestrator.memory.getUserTags(userId);
        res.json(tags);
      } catch (error: any) {
        console.error('Get user tags error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Category Management
    // Get user's categories
    this.app.get('/v1/categories', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const categories = await this.orchestrator.memory.getUserCategories(userId);
        res.json(categories);
      } catch (error: any) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Add a new category
    this.app.post('/v1/categories', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const { category, description } = req.body;

        if (!category || typeof category !== 'string') {
          return res.status(400).json({ error: 'Category name is required' });
        }

        await this.orchestrator.memory.addUserCategory(userId, category, description);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Add category error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete a category
    this.app.delete('/v1/categories/:category', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const { category } = req.params;

        await this.orchestrator.memory.removeUserCategory(userId, category);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Accept a category suggestion for a conversation
    this.app.post('/v1/conversations/:id/accept-category', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { category } = req.body;

        if (!category || typeof category !== 'string') {
          return res.status(400).json({ error: 'Category is required' });
        }

        // Add category to user's categories
        await this.orchestrator.memory.addUserCategory(userId, category);

        // Update conversation with the accepted category
        const conversation = await this.orchestrator.memory.getConversation(id);
        if (!conversation) {
          return res.status(404).json({ error: 'Conversation not found' });
        }

        // Update metadata to set category and remove suggestion
        const updatedMetadata = {
          ...conversation.metadata,
          category: category.toLowerCase(),
          suggestedCategory: undefined,
        };

        await this.orchestrator.memory.storeConversation(userId, {
          ...conversation,
          metadata: updatedMetadata,
        });

        res.json({ success: true });
      } catch (error: any) {
        console.error('Accept category error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // -------------------------------------------------------------------------
    // MCP Server Management
    // -------------------------------------------------------------------------

    // Register a new personal MCP server
    this.app.post('/v1/mcp/servers', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const { name, serverType, protocol, connectionConfig, categories, credentials } = req.body;

        if (!name || !serverType || !protocol || !connectionConfig) {
          return res.status(400).json({
            error: 'Missing required fields: name, serverType, protocol, connectionConfig'
          });
        }

        const scope: CredentialScope = { type: 'user', userId };

        const server = await this.config.mcpRegistry.registerServer({
          scope,
          name,
          serverType,
          protocol,
          connectionConfig,
          categories,
        });

        // Store credentials if provided
        if (credentials && Object.keys(credentials).length > 0) {
          await this.config.credentialManager.storeCredentials(scope, server.id, credentials);
        }

        res.json(server);
      } catch (error: any) {
        console.error('Register MCP server error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List user's MCP servers (personal + org-shared from all orgs they belong to)
    this.app.get('/v1/mcp/servers', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const category = req.query.category as string | undefined;

        const servers = await this.config.mcpRegistry.listServersForUser(userId, category);
        res.json(servers);
      } catch (error: any) {
        console.error('List MCP servers error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get MCP server details
    this.app.get('/v1/mcp/servers/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const server = await this.config.mcpRegistry.getServer(id);

        if (!server) {
          return res.status(404).json({ error: 'MCP server not found' });
        }

        if (!await this.hasServerAccess(server, req.user!.id)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        res.json(server);
      } catch (error: any) {
        console.error('Get MCP server error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete MCP server
    this.app.delete('/v1/mcp/servers/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const userId = req.user!.id;
        const server = await this.config.mcpRegistry.getServer(id);

        if (!server) {
          return res.status(404).json({ error: 'MCP server not found' });
        }

        // Only the personal owner or an org admin can delete
        if (server.userId && server.userId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }
        if (server.orgId) {
          await this.config.orgManager.assertAdmin(server.orgId, userId);
        }

        await this.config.mcpRegistry.deleteServer(id);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Delete MCP server error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Test MCP server connection
    this.app.post('/v1/mcp/servers/:id/test', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const server = await this.config.mcpRegistry.getServer(id);

        if (!server) {
          return res.status(404).json({ error: 'MCP server not found' });
        }

        if (!await this.hasServerAccess(server, req.user!.id)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const isConnected = await this.config.mcpRegistry.testServerConnection(id);
        res.json({ connected: isConnected });
      } catch (error: any) {
        console.error('Test MCP connection error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List MCP server tools
    this.app.get('/v1/mcp/servers/:id/tools', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const server = await this.config.mcpRegistry.getServer(id);

        if (!server) {
          return res.status(404).json({ error: 'MCP server not found' });
        }

        if (!await this.hasServerAccess(server, req.user!.id)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const client = new MCPClient(server);
        const capabilities = await client.listCapabilities();
        res.json(capabilities);
      } catch (error: any) {
        console.error('List MCP tools error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Call MCP server tool
    this.app.post('/v1/mcp/servers/:id/call', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const { toolName, parameters } = req.body;

        if (!toolName) {
          return res.status(400).json({ error: 'toolName is required' });
        }

        const server = await this.config.mcpRegistry.getServer(id);

        if (!server) {
          return res.status(404).json({ error: 'MCP server not found' });
        }

        if (!await this.hasServerAccess(server, req.user!.id)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const client = new MCPClient(server);
        const result = await client.callTool({
          serverId: id,
          toolName,
          parameters: parameters || {},
        });

        res.json(result);
      } catch (error: any) {
        console.error('Call MCP tool error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Store credentials for MCP server
    this.app.post('/v1/mcp/servers/:id/credentials', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const userId = req.user!.id;
        const credentials = req.body;

        const server = await this.config.mcpRegistry.getServer(id);
        if (!server) {
          return res.status(404).json({ error: 'MCP server not found' });
        }
        if (!await this.hasServerAccess(server, userId)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        await this.config.credentialManager.storeCredentials(
          this.serverScope(server, userId),
          id,
          credentials
        );

        res.json({ success: true });
      } catch (error: any) {
        console.error('Store credentials error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Check if credentials exist for MCP server
    this.app.get('/v1/mcp/servers/:id/credentials/status', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const userId = req.user!.id;

        const server = await this.config.mcpRegistry.getServer(id);
        if (!server) {
          return res.status(404).json({ error: 'MCP server not found' });
        }
        if (!await this.hasServerAccess(server, userId)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const hasCredentials = await this.config.credentialManager.hasCredentials(
          this.serverScope(server, userId),
          id
        );

        res.json({ hasCredentials });
      } catch (error: any) {
        console.error('Check credentials error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete credentials for MCP server
    this.app.delete('/v1/mcp/servers/:id/credentials', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const userId = req.user!.id;

        const server = await this.config.mcpRegistry.getServer(id);
        if (!server) {
          return res.status(404).json({ error: 'MCP server not found' });
        }
        if (!await this.hasServerAccess(server, userId)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        await this.config.credentialManager.deleteCredentials(
          this.serverScope(server, userId),
          id
        );

        res.json({ success: true });
      } catch (error: any) {
        console.error('Delete credentials error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // -------------------------------------------------------------------------
    // Workflow Management
    // -------------------------------------------------------------------------

    // Create a new workflow
    this.app.post('/v1/workflows', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const { name, description, category, nodes } = req.body;

        if (!name || !nodes) {
          return res.status(400).json({
            error: 'Missing required fields: name, nodes'
          });
        }

        const workflow = await this.config.workflowManager.createWorkflow({
          userId,
          name,
          description,
          category,
          nodes,
        });

        res.json(workflow);
      } catch (error: any) {
        console.error('Create workflow error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List user's workflows
    this.app.get('/v1/workflows', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const category = req.query.category as string | undefined;

        const workflows = await this.config.workflowManager.listUserWorkflows(userId, category);
        res.json(workflows);
      } catch (error: any) {
        console.error('List workflows error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get workflow by ID
    this.app.get('/v1/workflows/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const workflow = await this.config.workflowManager.getWorkflow(id);

        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }

        // Verify user owns this workflow
        if (workflow.userId !== req.user!.id) {
          return res.status(403).json({ error: 'Access denied' });
        }

        res.json(workflow);
      } catch (error: any) {
        console.error('Get workflow error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Update workflow
    this.app.put('/v1/workflows/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const workflow = await this.config.workflowManager.getWorkflow(id);

        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }

        // Verify user owns this workflow
        if (workflow.userId !== req.user!.id) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const updated = await this.config.workflowManager.updateWorkflow(id, req.body);
        res.json(updated);
      } catch (error: any) {
        console.error('Update workflow error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete workflow
    this.app.delete('/v1/workflows/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const workflow = await this.config.workflowManager.getWorkflow(id);

        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }

        // Verify user owns this workflow
        if (workflow.userId !== req.user!.id) {
          return res.status(403).json({ error: 'Access denied' });
        }

        await this.config.workflowManager.deleteWorkflow(id);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Delete workflow error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Execute a workflow
    this.app.post('/v1/workflows/:id/execute', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const userId = req.user!.id;
        const workflow = await this.config.workflowManager.getWorkflow(id);

        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }

        // Verify user owns this workflow
        if (workflow.userId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        // Execute workflow
        const execution = await this.config.workflowExecutor.execute(workflow, userId);

        // Save execution
        await this.config.workflowManager.saveExecution(execution);

        res.json(execution);
      } catch (error: any) {
        console.error('Execute workflow error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get workflow execution
    this.app.get('/v1/executions/:id', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const execution = await this.config.workflowManager.getExecution(id);

        if (!execution) {
          return res.status(404).json({ error: 'Execution not found' });
        }

        // Verify user owns this execution
        if (execution.userId !== req.user!.id) {
          return res.status(403).json({ error: 'Access denied' });
        }

        res.json(execution);
      } catch (error: any) {
        console.error('Get execution error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List workflow executions
    this.app.get('/v1/workflows/:id/executions', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const workflow = await this.config.workflowManager.getWorkflow(id);

        if (!workflow) {
          return res.status(404).json({ error: 'Workflow not found' });
        }

        // Verify user owns this workflow
        if (workflow.userId !== req.user!.id) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const limit = parseInt(req.query.limit as string) || 20;
        const executions = await this.config.workflowManager.listWorkflowExecutions(id, limit);

        res.json(executions);
      } catch (error: any) {
        console.error('List workflow executions error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List user's executions
    this.app.get('/v1/executions', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const limit = parseInt(req.query.limit as string) || 20;

        const executions = await this.config.workflowManager.listUserExecutions(userId, limit);
        res.json(executions);
      } catch (error: any) {
        console.error('List executions error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // AI Workflow Builder
    // Detect workflow intent from user message
    this.app.post('/v1/workflows/detect-intent', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const { message, conversationHistory } = req.body;

        if (!message) {
          return res.status(400).json({ error: 'message is required' });
        }

        const intent = await this.config.workflowBuilder.detectIntent(
          userId,
          message,
          conversationHistory
        );

        res.json(intent);
      } catch (error: any) {
        console.error('Detect intent error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Suggest similar workflows
    this.app.post('/v1/workflows/suggest', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const { message, category } = req.body;

        if (!message) {
          return res.status(400).json({ error: 'message is required' });
        }

        const suggestions = await this.config.workflowBuilder.suggestWorkflows(
          userId,
          message,
          category
        );

        res.json(suggestions);
      } catch (error: any) {
        console.error('Suggest workflows error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Build workflow from natural language
    this.app.post('/v1/workflows/build', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const { message, category, execute } = req.body;

        if (!message) {
          return res.status(400).json({ error: 'message is required' });
        }

        // Build the workflow
        const workflow = await this.config.workflowBuilder.buildWorkflow(
          userId,
          message,
          category
        );

        // Optionally execute immediately
        if (execute) {
          const execution = await this.config.workflowExecutor.execute(workflow, userId);
          await this.config.workflowManager.saveExecution(execution);

          res.json({
            workflow,
            execution,
          });
        } else {
          res.json({ workflow });
        }
      } catch (error: any) {
        console.error('Build workflow error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Build, execute, and optionally save workflow
    this.app.post('/v1/workflows/generate', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const { message, category, save } = req.body;

        if (!message) {
          return res.status(400).json({ error: 'message is required' });
        }

        // Generate workflow
        const { workflow, shouldSave } = await this.config.workflowBuilder.generateAndExecute(
          userId,
          message,
          category
        );

        // Execute workflow
        const execution = await this.config.workflowExecutor.execute(workflow, userId);
        await this.config.workflowManager.saveExecution(execution);

        // Save workflow if requested or suggested
        let savedWorkflow;
        if (save || shouldSave) {
          savedWorkflow = await this.config.workflowManager.createWorkflow(workflow);
        }

        res.json({
          workflow: savedWorkflow || workflow,
          execution,
          saved: !!savedWorkflow,
        });
      } catch (error: any) {
        console.error('Generate workflow error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Refine existing workflow based on feedback
    this.app.post('/v1/workflows/:id/refine', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const userId = req.user!.id;
        const { feedback } = req.body;

        if (!feedback) {
          return res.status(400).json({ error: 'feedback is required' });
        }

        const refinedWorkflow = await this.config.workflowBuilder.refineWorkflow(
          id,
          feedback,
          userId
        );

        // Update the workflow
        const updated = await this.config.workflowManager.updateWorkflow(id, refinedWorkflow);

        res.json(updated);
      } catch (error: any) {
        console.error('Refine workflow error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // -------------------------------------------------------------------------
    // Organization Management
    // -------------------------------------------------------------------------

    // Create org (calling user becomes admin)
    this.app.post('/v1/organizations', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const { name, slug, plan } = req.body;

        if (!name) {
          return res.status(400).json({ error: 'name is required' });
        }

        // Enforce org count limit
        if (this.config.billingManager) {
          try {
            await this.config.billingManager.checkLimit({ type: 'user', userId }, 'orgs');
          } catch (e) {
            if (e instanceof PlanLimitError) return this.planLimitResponse(res, e);
            throw e;
          }
        }

        const resolvedSlug = slug ?? OrgManager.toSlug(name);

        if (!await this.config.orgManager.isSlugAvailable(resolvedSlug)) {
          return res.status(409).json({ error: 'Slug is already taken' });
        }

        const org = await this.config.orgManager.createOrg(userId, name, resolvedSlug, plan);
        res.status(201).json(org);
      } catch (error: any) {
        console.error('Create org error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List orgs the current user belongs to
    this.app.get('/v1/organizations', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;
        const orgs = await this.config.orgManager.listUserOrgs(userId);
        res.json(orgs);
      } catch (error: any) {
        console.error('List orgs error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get org details + members (must be a member)
    this.app.get('/v1/organizations/:orgId', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId } = req.params;
        const userId = req.user!.id;

        await this.config.orgManager.assertMember(orgId, userId);

        const org = await this.config.orgManager.getOrgWithMembers(orgId);
        if (!org) return res.status(404).json({ error: 'Organization not found' });

        res.json(org);
      } catch (error: any) {
        console.error('Get org error:', error);
        res.status(error.message.includes('member') ? 403 : 500).json({ error: error.message });
      }
    });

    // Add / invite a member (admin only)
    this.app.post('/v1/organizations/:orgId/members', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId } = req.params;
        const userId = req.user!.id;
        const { userId: targetUserId, role = 'member' } = req.body;

        if (!targetUserId) {
          return res.status(400).json({ error: 'userId is required' });
        }

        await this.config.orgManager.assertAdmin(orgId, userId);

        // Enforce org member count limit
        if (this.config.billingManager) {
          try {
            await this.config.billingManager.checkLimit({ type: 'org', orgId }, 'orgMembers');
          } catch (e) {
            if (e instanceof PlanLimitError) return this.planLimitResponse(res, e);
            throw e;
          }
        }

        const member = await this.config.orgManager.addMember(orgId, targetUserId, role);
        res.status(201).json(member);
      } catch (error: any) {
        console.error('Add member error:', error);
        res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
      }
    });

    // Update member role (admin only)
    this.app.put('/v1/organizations/:orgId/members/:userId', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId, userId: targetUserId } = req.params;
        const callerId = req.user!.id;
        const { role } = req.body;

        if (!role) {
          return res.status(400).json({ error: 'role is required' });
        }

        await this.config.orgManager.assertAdmin(orgId, callerId);
        const member = await this.config.orgManager.updateMemberRole(orgId, targetUserId, role);
        if (!member) return res.status(404).json({ error: 'Member not found' });

        res.json(member);
      } catch (error: any) {
        console.error('Update member role error:', error);
        res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
      }
    });

    // Remove member (admin only)
    this.app.delete('/v1/organizations/:orgId/members/:userId', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId, userId: targetUserId } = req.params;
        const callerId = req.user!.id;

        await this.config.orgManager.assertAdmin(orgId, callerId);
        await this.config.orgManager.removeMember(orgId, targetUserId);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Remove member error:', error);
        res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
      }
    });

    // List teams (member access)
    this.app.get('/v1/organizations/:orgId/teams', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId } = req.params;
        await this.config.orgManager.assertMember(orgId, req.user!.id);
        const teams = await this.config.orgManager.listTeams(orgId);
        res.json(teams);
      } catch (error: any) {
        console.error('List teams error:', error);
        res.status(error.message.includes('member') ? 403 : 500).json({ error: error.message });
      }
    });

    // Create team (admin only)
    this.app.post('/v1/organizations/:orgId/teams', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId } = req.params;
        const { name } = req.body;

        if (!name) return res.status(400).json({ error: 'name is required' });

        await this.config.orgManager.assertAdmin(orgId, req.user!.id);
        const team = await this.config.orgManager.createTeam(orgId, name);
        res.status(201).json(team);
      } catch (error: any) {
        console.error('Create team error:', error);
        res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
      }
    });

    // Register an org-shared MCP server (admin only)
    this.app.post('/v1/organizations/:orgId/mcp-servers', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId } = req.params;
        const userId = req.user!.id;
        const { name, serverType, protocol, connectionConfig, categories, credentials } = req.body;

        if (!name || !serverType || !protocol || !connectionConfig) {
          return res.status(400).json({
            error: 'Missing required fields: name, serverType, protocol, connectionConfig'
          });
        }

        await this.config.orgManager.assertAdmin(orgId, userId);

        const scope: CredentialScope = { type: 'org', orgId };
        const server = await this.config.mcpRegistry.registerServer({
          scope,
          name,
          serverType,
          protocol,
          connectionConfig,
          categories,
        });

        if (credentials && Object.keys(credentials).length > 0) {
          await this.config.credentialManager.storeCredentials(scope, server.id, credentials);
        }

        res.status(201).json(server);
      } catch (error: any) {
        console.error('Register org MCP server error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List org's MCP servers (member access)
    this.app.get('/v1/organizations/:orgId/mcp-servers', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId } = req.params;
        const category = req.query.category as string | undefined;
        await this.config.orgManager.assertMember(orgId, req.user!.id);
        const servers = await this.config.mcpRegistry.listOrgServers(orgId, category);
        res.json(servers);
      } catch (error: any) {
        console.error('List org MCP servers error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // -------------------------------------------------------------------------
    // Skills Catalog (platform-wide, no auth scope needed beyond login)
    // -------------------------------------------------------------------------

    this.app.get('/v1/skills', async (req: AuthenticatedRequest, res: Response) => {
      try {
        res.json(this.config.skillRegistry.listSkills());
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/v1/skills/:skillId', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const def = this.config.skillRegistry.getSkillDefinition(req.params.skillId);
        if (!def) return res.status(404).json({ error: 'Skill not found' });
        res.json(def);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // -------------------------------------------------------------------------
    // Personal skill activations  (scope: /v1/me/skills)
    // -------------------------------------------------------------------------

    // Activate a skill for the current user
    this.app.post('/v1/me/skills/:skillId/activate', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;

        // Enforce active skill limit
        if (this.config.billingManager) {
          try {
            await this.config.billingManager.checkLimit({ type: 'user', userId }, 'activeSkills');
          } catch (e) {
            if (e instanceof PlanLimitError) return this.planLimitResponse(res, e);
            throw e;
          }
        }

        const userSkill = await this.config.skillRegistry.activateSkill(
          { type: 'user', userId },
          req.params.skillId
        );
        res.status(201).json(userSkill);
      } catch (error: any) {
        console.error('Activate skill error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List my active skills
    this.app.get('/v1/me/skills', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const skills = await this.config.skillRegistry.listUserSkills(req.user!.id);
        res.json(skills);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Configure a personal skill
    this.app.put('/v1/me/skills/:userSkillId/configure', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const updated = await this.config.skillRegistry.configureSkill(
          req.params.userSkillId,
          req.body
        );
        res.json(updated);
      } catch (error: any) {
        console.error('Configure skill error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List triggers for a personal skill
    this.app.get('/v1/me/skills/:userSkillId/triggers', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const triggers = await this.config.skillRegistry.listTriggersForSkill(req.params.userSkillId);
        res.json(triggers);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Create a webhook trigger for a personal skill
    this.app.post('/v1/me/skills/:userSkillId/triggers', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const trigger = await this.config.skillRegistry.createWebhookTrigger(
          req.params.userSkillId,
          req.body.verification
        );
        res.status(201).json(trigger);
      } catch (error: any) {
        console.error('Create trigger error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Update trigger verification config
    this.app.put('/v1/me/skills/:userSkillId/triggers/:triggerId', async (req: AuthenticatedRequest, res: Response) => {
      try {
        await this.config.skillRegistry.updateTriggerVerification(
          req.params.triggerId,
          req.body as WebhookVerification
        );
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Execution history for a personal skill
    this.app.get('/v1/me/skills/:userSkillId/executions', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const executions = await this.config.skillRegistry.listExecutions(req.params.userSkillId, limit);
        res.json(executions);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Deactivate a personal skill
    this.app.delete('/v1/me/skills/:userSkillId', async (req: AuthenticatedRequest, res: Response) => {
      try {
        await this.config.skillRegistry.deleteUserSkill(req.params.userSkillId);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // -------------------------------------------------------------------------
    // Org-level skill activations  (scope: /v1/organizations/:orgId/skills)
    // -------------------------------------------------------------------------

    // Activate a skill for an org (admin only)
    this.app.post('/v1/organizations/:orgId/skills/:skillId/activate', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId, skillId } = req.params;
        await this.config.orgManager.assertAdmin(orgId, req.user!.id);

        // Enforce org's active skill limit
        if (this.config.billingManager) {
          try {
            await this.config.billingManager.checkLimit({ type: 'org', orgId }, 'activeSkills');
          } catch (e) {
            if (e instanceof PlanLimitError) return this.planLimitResponse(res, e);
            throw e;
          }
        }

        const userSkill = await this.config.skillRegistry.activateSkill({ type: 'org', orgId }, skillId);
        res.status(201).json(userSkill);
      } catch (error: any) {
        console.error('Activate org skill error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // List org's active skills (member access)
    this.app.get('/v1/organizations/:orgId/skills', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId } = req.params;
        await this.config.orgManager.assertMember(orgId, req.user!.id);
        const skills = await this.config.skillRegistry.listOrgSkills(orgId);
        res.json(skills);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Configure an org skill (admin only)
    this.app.put('/v1/organizations/:orgId/skills/:userSkillId/configure', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId, userSkillId } = req.params;
        await this.config.orgManager.assertAdmin(orgId, req.user!.id);
        const updated = await this.config.skillRegistry.configureSkill(userSkillId, req.body);
        res.json(updated);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // List triggers for an org skill (member access)
    this.app.get('/v1/organizations/:orgId/skills/:userSkillId/triggers', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId, userSkillId } = req.params;
        await this.config.orgManager.assertMember(orgId, req.user!.id);
        const triggers = await this.config.skillRegistry.listTriggersForSkill(userSkillId);
        res.json(triggers);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Create a webhook trigger for an org skill (admin only)
    this.app.post('/v1/organizations/:orgId/skills/:userSkillId/triggers', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId, userSkillId } = req.params;
        await this.config.orgManager.assertAdmin(orgId, req.user!.id);
        const trigger = await this.config.skillRegistry.createWebhookTrigger(
          userSkillId,
          req.body.verification
        );
        res.status(201).json(trigger);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update trigger verification for an org skill (admin only)
    this.app.put('/v1/organizations/:orgId/skills/:userSkillId/triggers/:triggerId', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId, triggerId } = req.params;
        await this.config.orgManager.assertAdmin(orgId, req.user!.id);
        await this.config.skillRegistry.updateTriggerVerification(triggerId, req.body as WebhookVerification);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Execution history for an org skill (member access)
    this.app.get('/v1/organizations/:orgId/skills/:userSkillId/executions', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId, userSkillId } = req.params;
        await this.config.orgManager.assertMember(orgId, req.user!.id);
        const limit = parseInt(req.query.limit as string) || 50;
        const executions = await this.config.skillRegistry.listExecutions(userSkillId, limit);
        res.json(executions);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Deactivate an org skill (admin only)
    this.app.delete('/v1/organizations/:orgId/skills/:userSkillId', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId, userSkillId } = req.params;
        await this.config.orgManager.assertAdmin(orgId, req.user!.id);
        await this.config.skillRegistry.deleteUserSkill(userSkillId);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // -------------------------------------------------------------------------
    // Skill Pause / Resume  (personal)
    // -------------------------------------------------------------------------

    this.app.put('/v1/me/skills/:userSkillId/pause', async (req: AuthenticatedRequest, res: Response) => {
      try {
        await this.config.skillRegistry.updateSkillStatus(req.params.userSkillId, 'paused');
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/v1/me/skills/:userSkillId/resume', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.user!.id;

        // Check slot availability before resuming
        if (this.config.billingManager) {
          try {
            await this.config.billingManager.checkLimit({ type: 'user', userId }, 'activeSkills');
          } catch (e) {
            if (e instanceof PlanLimitError) return this.planLimitResponse(res, e);
            throw e;
          }
        }

        await this.config.skillRegistry.updateSkillStatus(req.params.userSkillId, 'active');
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // -------------------------------------------------------------------------
    // Skill Pause / Resume  (org — admin only)
    // -------------------------------------------------------------------------

    this.app.put('/v1/organizations/:orgId/skills/:userSkillId/pause', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId, userSkillId } = req.params;
        await this.config.orgManager.assertAdmin(orgId, req.user!.id);
        await this.config.skillRegistry.updateSkillStatus(userSkillId, 'paused');
        res.json({ success: true });
      } catch (error: any) {
        res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
      }
    });

    this.app.put('/v1/organizations/:orgId/skills/:userSkillId/resume', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId, userSkillId } = req.params;
        await this.config.orgManager.assertAdmin(orgId, req.user!.id);

        // Check org slot availability before resuming
        if (this.config.billingManager) {
          try {
            await this.config.billingManager.checkLimit({ type: 'org', orgId }, 'activeSkills');
          } catch (e) {
            if (e instanceof PlanLimitError) return this.planLimitResponse(res, e);
            throw e;
          }
        }

        await this.config.skillRegistry.updateSkillStatus(userSkillId, 'active');
        res.json({ success: true });
      } catch (error: any) {
        res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
      }
    });

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
    // Billing — personal (user scope)
    // -------------------------------------------------------------------------

    this.app.get('/v1/me/billing', async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!this.config.billingManager) return res.json({ plan: 'free', subscription: null, summary: {} });
        const scope: BillingScope = { type: 'user', userId: req.user!.id };
        const [plan, subscription, summary] = await Promise.all([
          this.config.billingManager.getEffectivePlan(scope),
          this.config.billingManager.getSubscription(scope),
          this.config.billingManager.getUsageSummary(scope),
        ]);
        res.json({ plan, subscription, summary });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/v1/me/billing/plan', async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!this.config.billingManager) return res.status(503).json({ error: 'Billing not configured' });
        const { plan } = req.body as { plan: PlanTier };
        if (!plan) return res.status(400).json({ error: 'plan is required' });
        const scope: BillingScope = { type: 'user', userId: req.user!.id };
        const subscription = await this.config.billingManager.updatePlan(scope, plan);
        res.json(subscription);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // -------------------------------------------------------------------------
    // Billing — org scope
    // -------------------------------------------------------------------------

    this.app.get('/v1/organizations/:orgId/billing', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId } = req.params;
        await this.config.orgManager.assertMember(orgId, req.user!.id);
        if (!this.config.billingManager) return res.json({ plan: 'free', subscription: null, summary: {} });
        const scope: BillingScope = { type: 'org', orgId };
        const [plan, subscription, summary] = await Promise.all([
          this.config.billingManager.getEffectivePlan(scope),
          this.config.billingManager.getSubscription(scope),
          this.config.billingManager.getUsageSummary(scope),
        ]);
        res.json({ plan, subscription, summary });
      } catch (error: any) {
        res.status(error.message.includes('member') ? 403 : 500).json({ error: error.message });
      }
    });

    this.app.put('/v1/organizations/:orgId/billing/plan', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { orgId } = req.params;
        await this.config.orgManager.assertAdmin(orgId, req.user!.id);
        if (!this.config.billingManager) return res.status(503).json({ error: 'Billing not configured' });
        const { plan } = req.body as { plan: PlanTier };
        if (!plan) return res.status(400).json({ error: 'plan is required' });
        const scope: BillingScope = { type: 'org', orgId };
        const subscription = await this.config.billingManager.updatePlan(scope, plan);
        res.json(subscription);
      } catch (error: any) {
        res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
      }
    });
  }

  /** Convert a PlanLimitError into a structured HTTP 402 response. */
  private planLimitResponse(res: Response, err: PlanLimitError): Response {
    return res.status(402).json({
      error: err.message,
      limitKey: err.limitKey,
      currentPlan: err.currentPlan,
      limit: err.limit,
      current: err.current,
    });
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

        const decoded = jwt.verify(token, this.config.jwtSecret) as any;

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
