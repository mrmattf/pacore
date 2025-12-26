import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import { MCPServer, MCPConnectionConfig } from '@pacore/core';
import { MCPClient } from './mcp-client';

export interface RegisterMCPServerRequest {
  userId: string;
  name: string;
  serverType: 'cloud' | 'edge';
  protocol: 'http' | 'websocket' | 'stdio';
  connectionConfig: MCPConnectionConfig;
  categories?: string[];
}

/**
 * Basic MCP Registry for demo
 * No encryption yet - stores connection configs as-is
 */
export class MCPRegistry {
  constructor(private db: Pool) {}

  async initialize(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        server_type VARCHAR(50) NOT NULL,
        protocol VARCHAR(50) NOT NULL,
        connection_config JSONB NOT NULL,
        capabilities JSONB,
        categories TEXT[],
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_mcp_servers_user_id ON mcp_servers(user_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_categories ON mcp_servers USING GIN(categories);
    `);
  }

  async registerServer(request: RegisterMCPServerRequest, credentials?: any): Promise<MCPServer> {
    const id = nanoid();

    const server: MCPServer = {
      id,
      userId: request.userId,
      name: request.name,
      serverType: request.serverType,
      protocol: request.protocol,
      connectionConfig: request.connectionConfig,
      categories: request.categories || [],
      createdAt: new Date(),
    };

    // Test connection and get capabilities
    if (server.serverType === 'cloud') {
      const client = new MCPClient(server, credentials); // Pass credentials to MCPClient
      const isConnected = await client.testConnection();

      if (!isConnected) {
        throw new Error('Failed to connect to MCP server');
      }

      try {
        const capabilities = await client.listCapabilities();
        server.capabilities = capabilities;
      } catch (error) {
        console.warn('Could not fetch capabilities:', error);
      }
    }

    await this.db.query(
      `INSERT INTO mcp_servers (id, user_id, name, server_type, protocol, connection_config, capabilities, categories)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        server.id,
        server.userId,
        server.name,
        server.serverType,
        server.protocol,
        JSON.stringify(server.connectionConfig),
        JSON.stringify(server.capabilities),
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

    if (result.rows.length === 0) return null;

    return this.rowToServer(result.rows[0]);
  }

  async listUserServers(userId: string, category?: string): Promise<MCPServer[]> {
    let query = 'SELECT * FROM mcp_servers WHERE user_id = $1';
    const params: any[] = [userId];

    if (category) {
      query += ' AND $2 = ANY(categories)';
      params.push(category);
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.db.query(query, params);

    return result.rows.map(this.rowToServer);
  }

  async deleteServer(serverId: string): Promise<void> {
    await this.db.query('DELETE FROM mcp_servers WHERE id = $1', [serverId]);
  }

  async testServerConnection(serverId: string): Promise<boolean> {
    const server = await this.getServer(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const client = new MCPClient(server);
    return client.testConnection();
  }

  private rowToServer(row: any): MCPServer {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      serverType: row.server_type,
      protocol: row.protocol,
      connectionConfig: row.connection_config,
      capabilities: row.capabilities,
      categories: row.categories || [],
      createdAt: new Date(row.created_at),
    };
  }
}
