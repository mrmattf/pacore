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

    // Complete endpoint
    this.app.post('/v1/complete', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { messages, options } = req.body;
        const userId = req.user!.id;

        // Extract last user message
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'user') {
          return res.status(400).json({ error: 'Invalid messages format' });
        }

        const response = await this.orchestrator.processRequest(
          userId,
          lastMessage.content,
          options,
        );

        res.json(response);
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
          // Stream completion
          const { input, options } = message.data;

          // For streaming, we'd need to modify orchestrator to support streaming
          // For now, send a regular response
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
