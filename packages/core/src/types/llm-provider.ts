/**
 * Core types for LLM providers
 */

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
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
  /** Unique identifier for this provider */
  id: string;

  /** Human-readable name */
  name: string;

  /** Type of provider */
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
}
