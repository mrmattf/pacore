import { LLMConfig, Message, CompletionOptions, CompletionResponse } from './llm-provider';

/**
 * On-premise agent types
 */

export interface AgentConfig {
  agentId: string;
  agentToken: string;
  cloudUrl: string;
  localLLMs?: {
    ollama?: OllamaConfig;
    lmstudio?: LMStudioConfig;
  };
  enabledTools?: string[];
  fileAccess?: {
    enabled: boolean;
    allowedPaths?: string[];
    deniedPaths?: string[];
  };
}

export interface OllamaConfig {
  baseUrl: string;
  defaultModel: string;
  models?: string[];
}

export interface LMStudioConfig {
  baseUrl: string;
  defaultModel: string;
  models?: string[];
}

export interface AgentMessage {
  type: 'llm_request' | 'llm_response' | 'llm_stream' | 'llm_stream_end' |
        'tool_request' | 'tool_response' | 'file_request' | 'file_response' |
        'health_check' | 'health_response' | 'capabilities' | 'error';
  requestId?: string;
  data?: any;
  error?: string;
}

export interface AgentCapabilities {
  providers: string[];
  tools: string[];
  fileAccess: boolean;
  version?: string;
}

export interface AgentLLMRequest {
  providerId: string;
  messages: Message[];
  options?: CompletionOptions;
  requestId: string;
}

export interface AgentLLMResponse {
  requestId: string;
  data: CompletionResponse;
}

export interface AgentStatus {
  connected: boolean;
  lastSeen?: Date;
  capabilities?: AgentCapabilities;
}
