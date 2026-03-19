import { Router, Request, Response } from 'express';
import type { MCPRegistry } from '../mcp/mcp-registry';
import type { CredentialManager, CredentialScope } from '../mcp/credential-manager';
import type { OrgManager } from '../organizations/org-manager';
import { MCPClient } from '../mcp';
import type { MCPServer } from '@pacore/core';

interface AuthenticatedRequest extends Request {
  user?: { id: string; [key: string]: any };
}

async function hasServerAccess(server: MCPServer, userId: string, orgManager: OrgManager): Promise<boolean> {
  if (server.userId === userId) return true;
  if (server.orgId) {
    const role = await orgManager.getMemberRole(server.orgId, userId);
    return role !== null;
  }
  return false;
}

function serverScope(server: MCPServer): CredentialScope {
  return { type: 'org', orgId: server.orgId! };
}

export function createMcpServerRoutes(
  mcpRegistry: MCPRegistry,
  credentialManager: CredentialManager,
  orgManager: OrgManager,
): Router {
  const router = Router();

  // Register a new personal MCP server
  router.post('/v1/mcp/servers', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, serverType, protocol, connectionConfig, categories, credentials, orgId } = req.body;

      if (!name || !serverType || !protocol || !connectionConfig || !orgId) {
        return res.status(400).json({
          error: 'Missing required fields: name, serverType, protocol, connectionConfig, orgId'
        });
      }

      const scope: CredentialScope = { type: 'org', orgId };
      const server = await mcpRegistry.registerServer({ scope, name, serverType, protocol, connectionConfig, categories });

      if (credentials && Object.keys(credentials).length > 0) {
        await credentialManager.storeCredentials(scope, server.id, credentials);
      }

      res.json(server);
    } catch (error: any) {
      console.error('Register MCP server error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // List user's MCP servers
  router.get('/v1/mcp/servers', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const category = req.query.category as string | undefined;
      const servers = await mcpRegistry.listServersForUser(userId, category);
      res.json(servers);
    } catch (error: any) {
      console.error('List MCP servers error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get MCP server details
  router.get('/v1/mcp/servers/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const server = await mcpRegistry.getServer(id);
      if (!server) return res.status(404).json({ error: 'MCP server not found' });
      if (!await hasServerAccess(server, req.user!.id, orgManager)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      res.json(server);
    } catch (error: any) {
      console.error('Get MCP server error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete MCP server
  router.delete('/v1/mcp/servers/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const server = await mcpRegistry.getServer(id);
      if (!server) return res.status(404).json({ error: 'MCP server not found' });

      if (server.userId && server.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (server.orgId) {
        await orgManager.assertAdmin(server.orgId, userId);
      }

      await mcpRegistry.deleteServer(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete MCP server error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test MCP server connection
  router.post('/v1/mcp/servers/:id/test', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const server = await mcpRegistry.getServer(id);
      if (!server) return res.status(404).json({ error: 'MCP server not found' });
      if (!await hasServerAccess(server, req.user!.id, orgManager)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const isConnected = await mcpRegistry.testServerConnection(id);
      res.json({ connected: isConnected });
    } catch (error: any) {
      console.error('Test MCP connection error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // List MCP server tools
  router.get('/v1/mcp/servers/:id/tools', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const server = await mcpRegistry.getServer(id);
      if (!server) return res.status(404).json({ error: 'MCP server not found' });
      if (!await hasServerAccess(server, req.user!.id, orgManager)) {
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
  router.post('/v1/mcp/servers/:id/call', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { toolName, parameters } = req.body;
      if (!toolName) return res.status(400).json({ error: 'toolName is required' });

      const server = await mcpRegistry.getServer(id);
      if (!server) return res.status(404).json({ error: 'MCP server not found' });
      if (!await hasServerAccess(server, req.user!.id, orgManager)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const client = new MCPClient(server);
      const result = await client.callTool({ serverId: id, toolName, parameters: parameters || {} });
      res.json(result);
    } catch (error: any) {
      console.error('Call MCP tool error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Store credentials for MCP server
  router.post('/v1/mcp/servers/:id/credentials', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const credentials = req.body;

      const server = await mcpRegistry.getServer(id);
      if (!server) return res.status(404).json({ error: 'MCP server not found' });
      if (!await hasServerAccess(server, userId, orgManager)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await credentialManager.storeCredentials(serverScope(server), id, credentials);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Store credentials error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Check if credentials exist for MCP server
  router.get('/v1/mcp/servers/:id/credentials/status', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const server = await mcpRegistry.getServer(id);
      if (!server) return res.status(404).json({ error: 'MCP server not found' });
      if (!await hasServerAccess(server, userId, orgManager)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const hasCredentials = await credentialManager.hasCredentials(serverScope(server), id);
      res.json({ hasCredentials });
    } catch (error: any) {
      console.error('Check credentials error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete credentials for MCP server
  router.delete('/v1/mcp/servers/:id/credentials', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const server = await mcpRegistry.getServer(id);
      if (!server) return res.status(404).json({ error: 'MCP server not found' });
      if (!await hasServerAccess(server, userId, orgManager)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await credentialManager.deleteCredentials(serverScope(server), id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete credentials error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
