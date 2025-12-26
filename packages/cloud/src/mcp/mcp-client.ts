import fetch from 'node-fetch';
import {
  MCPServer,
  MCPRequest,
  MCPResponse,
  MCPCapabilities,
  MCPToolCall,
  MCPToolResult,
} from '@pacore/core';
import { MCPCredentials } from './credential-manager';

/**
 * Basic MCP Client for demo
 * Supports HTTP only - no encryption, no stdio yet
 */
export class MCPClient {
  constructor(
    private server: MCPServer,
    private credentials?: MCPCredentials
  ) {}

  /**
   * List capabilities (tools and resources) from MCP server
   */
  async listCapabilities(): Promise<MCPCapabilities> {
    if (this.server.protocol === 'http') {
      return this.httpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });
    }

    throw new Error(`Protocol ${this.server.protocol} not supported yet`);
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    try {
      if (this.server.protocol === 'http') {
        const result = await this.httpRequest({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolCall.toolName,
            arguments: toolCall.parameters,
          },
        });

        return {
          success: true,
          data: result,
        };
      }

      throw new Error(`Protocol ${this.server.protocol} not supported yet`);
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Test connection to MCP server
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.listCapabilities();
      return true;
    } catch (error) {
      console.error('MCP connection test failed:', error);
      return false;
    }
  }

  /**
   * HTTP request helper
   */
  private async httpRequest(request: MCPRequest): Promise<any> {
    const { url, headers, apiKey } = this.server.connectionConfig;

    if (!url) {
      throw new Error('No URL configured for HTTP server');
    }

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...headers,
    };

    // Inject credentials (takes precedence over connection config)
    if (this.credentials?.apiKey) {
      requestHeaders['Authorization'] = `Bearer ${this.credentials.apiKey}`;
    } else if (apiKey) {
      requestHeaders['Authorization'] = `Bearer ${apiKey}`;
    }

    // Add custom headers from credentials
    if (this.credentials?.customHeaders) {
      Object.assign(requestHeaders, this.credentials.customHeaders);
    }

    // Add username/password as Basic Auth if provided
    if (this.credentials?.username && this.credentials?.password) {
      const basicAuth = Buffer.from(
        `${this.credentials.username}:${this.credentials.password}`
      ).toString('base64');
      requestHeaders['Authorization'] = `Basic ${basicAuth}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // Handle SSE (Server-Sent Events) response
    if (contentType.includes('text/event-stream')) {
      const text = await response.text();

      // Parse SSE format: "event: message\ndata: {...}\n\n"
      const lines = text.split('\n');
      let jsonData = '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          jsonData = line.substring(6); // Remove 'data: ' prefix
          break;
        }
      }

      if (!jsonData) {
        throw new Error('No data found in SSE response');
      }

      const data = JSON.parse(jsonData);

      // Handle JSON-RPC response
      if (data.result !== undefined) {
        if (data.error) {
          throw new Error(`MCP Error: ${data.error.message}`);
        }
        return data.result;
      }

      return data;
    }

    // Handle JSON response
    const data = (await response.json()) as any;

    // Handle standard MCP protocol response
    if (data.result !== undefined) {
      if (data.error) {
        throw new Error(`MCP Error: ${data.error.message}`);
      }
      return data.result;
    }

    // Handle non-MCP responses (for demo/testing with mock endpoints)
    // Return the entire response as-is
    return data;
  }
}
