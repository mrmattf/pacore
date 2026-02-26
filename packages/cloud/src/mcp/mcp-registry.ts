import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import { MCPServer, MCPCapabilities, MCPConnectionConfig } from '@pacore/core';
import { MCPClient } from './mcp-client';
import { CredentialScope } from './credential-manager';

export interface RegisterMCPServerRequest {
  scope: CredentialScope;          // user or org
  name: string;
  serverType: 'cloud' | 'edge' | 'platform';
  protocol: 'http' | 'websocket' | 'stdio';
  connectionConfig: MCPConnectionConfig;
  categories?: string[];
  credentials?: Record<string, unknown>;
}

export class MCPRegistry {
  constructor(private db: Pool) {}

  async initialize(): Promise<void> {
    // Tables are created by schema.sql — nothing to do at runtime
  }

  async registerServer(request: RegisterMCPServerRequest): Promise<MCPServer> {
    const id = nanoid();
    const userId = request.scope.type === 'user' ? request.scope.userId : null;
    const orgId  = request.scope.type === 'org'  ? request.scope.orgId  : null;

    const server: MCPServer = {
      id,
      userId,
      orgId,
      name: request.name,
      serverType: request.serverType,
      protocol: request.protocol,
      connectionConfig: request.connectionConfig,
      categories: request.categories ?? [],
      createdAt: new Date(),
    };

    // Test connection for cloud servers
    if (server.serverType === 'cloud') {
      const client = new MCPClient(server, request.credentials);
      const connected = await client.testConnection();
      if (!connected) throw new Error('Failed to connect to MCP server');

      try {
        server.capabilities = await client.listCapabilities();
      } catch {
        // Capabilities are optional — continue without them
      }
    }

    await this.db.query(
      `INSERT INTO mcp_servers
         (id, user_id, org_id, name, server_type, protocol, connection_config, capabilities, categories)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        server.id,
        server.userId,
        server.orgId,
        server.name,
        server.serverType,
        server.protocol,
        JSON.stringify(server.connectionConfig),
        JSON.stringify(server.capabilities ?? null),
        server.categories,
      ]
    );

    return server;
  }

  async getServer(serverId: string): Promise<MCPServer | null> {
    const result = await this.db.query(
      'SELECT * FROM mcp_servers WHERE id = $1',
      [serverId]
    );
    return result.rows[0] ? this.rowToServer(result.rows[0]) : null;
  }

  /** List servers visible to a user: their personal servers + org-shared servers from orgs they belong to */
  async listServersForUser(userId: string, category?: string): Promise<MCPServer[]> {
    let query = `
      SELECT DISTINCT s.*
      FROM mcp_servers s
      LEFT JOIN org_members om ON om.org_id = s.org_id AND om.user_id = $1
      WHERE (s.user_id = $1 OR om.user_id IS NOT NULL)
    `;
    const params: unknown[] = [userId];

    if (category) {
      query += ' AND $2 = ANY(s.categories)';
      params.push(category);
    }
    query += ' ORDER BY s.created_at DESC';

    const result = await this.db.query(query, params);
    return result.rows.map(this.rowToServer);
  }

  async listUserServers(userId: string, category?: string): Promise<MCPServer[]> {
    let query = 'SELECT * FROM mcp_servers WHERE user_id = $1';
    const params: unknown[] = [userId];
    if (category) { query += ' AND $2 = ANY(categories)'; params.push(category); }
    query += ' ORDER BY created_at DESC';
    const result = await this.db.query(query, params);
    return result.rows.map(this.rowToServer);
  }

  async listOrgServers(orgId: string, category?: string): Promise<MCPServer[]> {
    let query = 'SELECT * FROM mcp_servers WHERE org_id = $1';
    const params: unknown[] = [orgId];
    if (category) { query += ' AND $2 = ANY(categories)'; params.push(category); }
    query += ' ORDER BY created_at DESC';
    const result = await this.db.query(query, params);
    return result.rows.map(this.rowToServer);
  }

  async deleteServer(serverId: string): Promise<void> {
    await this.db.query('DELETE FROM mcp_servers WHERE id = $1', [serverId]);
  }

  async testServerConnection(serverId: string): Promise<boolean> {
    const server = await this.getServer(serverId);
    if (!server) throw new Error('Server not found');
    const client = new MCPClient(server);
    return client.testConnection();
  }

  async updateCapabilities(serverId: string, capabilities: MCPCapabilities): Promise<void> {
    await this.db.query(
      'UPDATE mcp_servers SET capabilities = $2 WHERE id = $1',
      [serverId, JSON.stringify(capabilities)]
    );
  }

  private rowToServer(row: Record<string, unknown>): MCPServer {
    return {
      id: row.id as string,
      userId: (row.user_id as string | null) ?? null,
      orgId: (row.org_id as string | null) ?? null,
      name: row.name as string,
      serverType: row.server_type as MCPServer['serverType'],
      protocol: row.protocol as MCPServer['protocol'],
      connectionConfig: row.connection_config as MCPConnectionConfig,
      capabilities: row.capabilities as MCPCapabilities | undefined,
      categories: (row.categories as string[]) ?? [],
      createdAt: new Date(row.created_at as string),
    };
  }
}
