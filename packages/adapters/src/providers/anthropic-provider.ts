import Anthropic from '@anthropic-ai/sdk';
import {
  LLMProvider,
  LLMConfig,
  Message,
  CompletionOptions,
  CompletionResponse,
  StreamChunk,
  ValidationResult,
} from '@pacore/core';

/**
 * Anthropic Claude provider implementation
 */
export class AnthropicProvider implements LLMProvider {
  id = 'anthropic';
  name = 'Anthropic Claude';
  type: 'cloud' = 'cloud';

  private client?: Anthropic;
  private config?: LLMConfig;

  async initialize(config: LLMConfig): Promise<void> {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.endpoint,
    });
  }

  async complete(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResponse> {
    if (!this.client) {
      throw new Error('Provider not initialized');
    }

    const response = await this.client.messages.create({
      model: options?.model || this.config?.model || 'claude-3-5-sonnet-20241022',
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      max_tokens: options?.maxTokens || this.config?.maxTokens || 4000,
      temperature: options?.temperature ?? this.config?.temperature ?? 0.7,
      top_p: options?.topP,
      stop_sequences: options?.stopSequences,
    });

    return {
      content: response.content[0].type === 'text' ? response.content[0].text : '',
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      metadata: {
        model: response.model,
        stopReason: response.stop_reason,
      },
    };
  }

  async *streamComplete(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncIterableIterator<StreamChunk> {
    if (!this.client) {
      throw new Error('Provider not initialized');
    }

    const stream = await this.client.messages.create({
      model: options?.model || this.config?.model || 'claude-3-5-sonnet-20241022',
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      max_tokens: options?.maxTokens || this.config?.maxTokens || 4000,
      temperature: options?.temperature ?? this.config?.temperature ?? 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        if (chunk.delta.type === 'text_delta') {
          yield {
            content: chunk.delta.text,
            type: 'content',
          };
        }
      } else if (chunk.type === 'message_start') {
        yield {
          type: 'metadata',
          metadata: {
            model: chunk.message.model,
          },
        };
      } else if (chunk.type === 'message_delta') {
        yield {
          type: 'metadata',
          metadata: {
            stopReason: chunk.delta.stop_reason,
            usage: chunk.usage,
          },
        };
      }
    }
  }

  validateConfig(config: LLMConfig): ValidationResult {
    if (!config.apiKey) {
      return { valid: false, error: 'API key is required' };
    }
    return { valid: true };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.client) return false;

    try {
      // Simple health check with minimal token usage
      await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });
      return true;
    } catch (error) {
      console.error('Anthropic health check failed:', error);
      return false;
    }
  }
}
