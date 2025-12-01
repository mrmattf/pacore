import fetch from 'node-fetch';
import {
  MCPServer,
  MCPRequest,
  MCPResponse,
  MCPCapabilities,
  MCPToolCall,
  MCPToolResult,
} from '@pacore/core';

/**
 * Basic MCP Client for demo
 * Supports HTTP only - no encryption, no stdio yet
 */
export class MCPClient {
  constructor(private server: MCPServer) {}

  /**
   * List capabilities (tools and resources) from MCP server
   */
  async listCapabilities(): Promise<MCPCapabilities> {
    if (this.server.protocol === 'http') {
      return this.httpRequest({
        method: 'tools/list',
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
      ...headers,
    };

    if (apiKey) {
      requestHeaders['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

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
