import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

export interface MCPServer {
  id: string;
  userId: string;
  name: string;
  serverType: 'cloud' | 'edge';
  protocol: 'http' | 'websocket' | 'stdio';
  connectionConfig: {
    url: string;
    headers?: Record<string, string>;
  };
  capabilities?: {
    tools?: Array<{
      name: string;
      description?: string;
      inputSchema?: any;
    }>;
  };
  categories: string[];
  createdAt: string;
  hasCredentials?: boolean;
}

export interface MCPCredentials {
  apiKey?: string;
  username?: string;
  password?: string;
  customHeaders?: Record<string, string>;
}

export interface RegisterServerRequest {
  name: string;
  serverType: 'cloud' | 'edge';
  protocol: 'http' | 'websocket' | 'stdio';
  connectionConfig: {
    url: string;
    headers?: Record<string, string>;
  };
  categories?: string[];
  credentials?: MCPCredentials;
}

export function useMCPServers() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(false);
  const token = useAuthStore((state) => state.token);

  const fetchServers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch('/v1/mcp/servers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      // Fetch credential status for each server
      const serversWithCredStatus = await Promise.all(
        data.map(async (server: MCPServer) => {
          try {
            const credResponse = await fetch(
              `/v1/mcp/servers/${server.id}/credentials/status`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            const credData = await credResponse.json();
            return {
              ...server,
              hasCredentials: credData.hasCredentials,
            };
          } catch {
            return { ...server, hasCredentials: false };
          }
        })
      );

      setServers(serversWithCredStatus);
    } catch (error) {
      console.error('Failed to fetch MCP servers:', error);
      setServers([]);
    } finally {
      setLoading(false);
    }
  };

  const registerServer = async (request: RegisterServerRequest): Promise<MCPServer> => {
    if (!token) throw new Error('Not authenticated');

    try {
      // 1. Register the server
      const { credentials, ...serverData } = request;
      const response = await fetch('/v1/mcp/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(serverData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to register server');
      }

      const server = await response.json();

      // 2. Store credentials if provided
      if (credentials && Object.keys(credentials).length > 0) {
        await fetch(`/v1/mcp/servers/${server.id}/credentials`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(credentials),
        });
      }

      await fetchServers(); // Refresh list
      return server;
    } catch (error) {
      console.error('Failed to register server:', error);
      throw error;
    }
  };

  const deleteServer = async (serverId: string) => {
    if (!token) return;
    try {
      await fetch(`/v1/mcp/servers/${serverId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchServers(); // Refresh list
    } catch (error) {
      console.error('Failed to delete server:', error);
      throw error;
    }
  };

  const testConnection = async (serverId: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const response = await fetch(`/v1/mcp/servers/${serverId}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      return data.connected === true;
    } catch (error) {
      console.error('Failed to test connection:', error);
      return false;
    }
  };

  const fetchServerTools = async (serverId: string) => {
    if (!token) return [];
    try {
      const response = await fetch(`/v1/mcp/servers/${serverId}/tools`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      return data.tools || [];
    } catch (error) {
      console.error('Failed to fetch server tools:', error);
      return [];
    }
  };

  const storeCredentials = async (
    serverId: string,
    credentials: MCPCredentials
  ): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    try {
      await fetch(`/v1/mcp/servers/${serverId}/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(credentials),
      });
      await fetchServers(); // Refresh to update credential status
    } catch (error) {
      console.error('Failed to store credentials:', error);
      throw error;
    }
  };

  const deleteCredentials = async (serverId: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    try {
      await fetch(`/v1/mcp/servers/${serverId}/credentials`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchServers(); // Refresh to update credential status
    } catch (error) {
      console.error('Failed to delete credentials:', error);
      throw error;
    }
  };

  useEffect(() => {
    if (token) {
      fetchServers();
    }
  }, [token]);

  return {
    servers,
    loading,
    registerServer,
    deleteServer,
    testConnection,
    fetchServerTools,
    storeCredentials,
    deleteCredentials,
    refresh: fetchServers,
  };
}
