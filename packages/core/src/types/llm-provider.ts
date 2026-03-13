/**
 * Core types for LLM providers
 */

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Agent / tool-calling types
// ---------------------------------------------------------------------------

/** A tool definition passed to the LLM so it can decide to call it. */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * A single turn in an agentic tool-calling conversation.
 * Supports plain-text messages, assistant tool use, and tool result returns.
 * Named ToolCallMessage to distinguish from AgentMessage in agent.ts (edge agent protocol).
 */
export type ToolCallMessage =
  | { role: 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string; toolUses: AgentToolUse[] }
  | { role: 'user'; toolResults: AgentToolResult[] };

export interface AgentToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AgentToolResult {
  toolUseId: string;
  content: string;
}

export interface AgentCompletionResponse {
  /** Text content of the response (may be empty if stopReason is 'tool_use'). */
  textContent: string;
  /** Tool calls the LLM wants to make (empty if stopReason is 'end_turn'). */
  toolUses: AgentToolUse[];
  stopReason: 'end_turn' | 'tool_use';
  usage?: { promptTokens: number; completionTokens: number };
}

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
  model?: string;
  stopSequences?: string[];
}

export interface CompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens?: number;
  };
  metadata?: Record<string, any>;
}

export interface StreamChunk {
  content?: string;
  type: 'content' | 'metadata' | 'error';
  metadata?: Record<string, any>;
}

export interface LLMConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  customHeaders?: Record<string, string>;
  maxTokens?: number;
  temperature?: number;
  [key: string]: any; // Allow for provider-specific config
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export type ProviderType = 'cloud' | 'on-premise' | 'custom';

/**
 * Base interface that all LLM providers must implement
 */
export interface LLMProvider {
  /** Unique identifier for this provider instance (e.g., "anthropic-prod", "ollama-local") */
  id: string;

  /** Human-readable name */
  name: string;

  /** Base provider type (e.g., "anthropic", "openai", "ollama") */
  providerType: string;

  /** Type of provider (cloud, on-premise, custom) */
  type: ProviderType;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: LLMConfig): Promise<void>;

  /**
   * Complete a chat conversation
   */
  complete(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResponse>;

  /**
   * Stream a chat conversation
   */
  streamComplete(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncIterableIterator<StreamChunk>;

  /**
   * Validate provider configuration
   */
  validateConfig(config: LLMConfig): ValidationResult;

  /**
   * Check if provider is healthy
   */
  healthCheck?(): Promise<boolean>;

  /**
   * Run one turn of an agentic conversation with tool support.
   * Optional — providers that don't support tool calling may omit this.
   * Returns tool use requests when the LLM wants to call a tool, or a final text response.
   */
  completeWithTools?(
    messages: ToolCallMessage[],
    tools: AgentTool[],
    options?: CompletionOptions
  ): Promise<AgentCompletionResponse>;
}
