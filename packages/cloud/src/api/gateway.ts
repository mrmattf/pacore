import express, { Request, Response, NextFunction } from 'express';
import { createServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { Orchestrator } from '../orchestration';
import { createAuthRoutes } from './auth-routes';

export interface GatewayConfig {
  port: number;
  jwtSecret: string;
  corsOrigins?: string[];
  db: Pool;
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
    // Skip auth for health check and auth routes
    if (req.path === '/health' || req.path.startsWith('/v1/auth/')) {
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

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Auth routes
    const authRoutes = createAuthRoutes({
      jwtSecret: this.config.jwtSecret,
      db: this.config.db,
    });
    this.app.use('/v1/auth', authRoutes);

    // Complete endpoint with SSE streaming support
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
