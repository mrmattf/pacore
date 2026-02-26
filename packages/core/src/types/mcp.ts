/**
 * MCP (Model Context Protocol) Types
 * Basic types for demo - not production-ready
 */

export type MCPServerType = 'cloud' | 'edge' | 'platform';
export type MCPProtocol = 'stdio' | 'http' | 'websocket';

export interface MCPServer {
  id: string;
  userId: string | null;   // null for org-scoped or platform servers
  orgId?: string | null;   // set for org-scoped servers
  name: string;
  serverType: MCPServerType;
  protocol: MCPProtocol;
  connectionConfig: MCPConnectionConfig;
  capabilities?: MCPCapabilities;
  categories?: string[];
  createdAt: Date;
}

export interface MCPConnectionConfig {
  // For HTTP/WebSocket
  url?: string;
  headers?: Record<string, string>;

  // For stdio (edge agent)
  command?: string;
  args?: string[];
  env?: Record<string, string>;

  // Simple auth for demo (NOT encrypted yet)
  apiKey?: string;
}

export interface MCPCapabilities {
  tools: MCPTool[];
  resources?: MCPResource[];
  version?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  [key: string]: any;
}

export interface MCPRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, any>;
}

export interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPToolCall {
  serverId: string;
  toolName: string;
  parameters: Record<string, any>;
}

export interface MCPToolResult {
  success: boolean;
  data?: any;
  error?: string;
}
