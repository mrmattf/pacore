import OpenAI from 'openai';
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
 * OpenAI provider implementation
 */
export class OpenAIProvider implements LLMProvider {
  id = 'openai';
  name = 'OpenAI';
  type: 'cloud' = 'cloud';

  private client?: OpenAI;
  private config?: LLMConfig;

  async initialize(config: LLMConfig): Promise<void> {
    this.config = config;
    this.client = new OpenAI({
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

    const response = await this.client.chat.completions.create({
      model: options?.model || this.config?.model || 'gpt-4-turbo-preview',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: options?.maxTokens || this.config?.maxTokens,
      temperature: options?.temperature ?? this.config?.temperature ?? 0.7,
      top_p: options?.topP,
      stop: options?.stopSequences,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      metadata: {
        model: response.model,
        finishReason: response.choices[0]?.finish_reason,
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

    const stream = await this.client.chat.completions.create({
      model: options?.model || this.config?.model || 'gpt-4-turbo-preview',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: options?.maxTokens || this.config?.maxTokens,
      temperature: options?.temperature ?? this.config?.temperature ?? 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield {
          content: delta.content,
          type: 'content',
        };
      }

      if (chunk.choices[0]?.finish_reason) {
        yield {
          type: 'metadata',
          metadata: {
            finishReason: chunk.choices[0].finish_reason,
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
      await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      });
      return true;
    } catch (error) {
      console.error('OpenAI health check failed:', error);
      return false;
    }
  }
}
