import fetch from 'node-fetch';
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
 * Custom endpoint provider for any OpenAI-compatible API
 */
export class CustomEndpointProvider implements LLMProvider {
  id = 'custom-endpoint';
  name = 'Custom LLM Endpoint';
  providerType = 'custom';
  type: 'custom' = 'custom';

  private config?: LLMConfig;

  async initialize(config: LLMConfig): Promise<void> {
    this.config = config;
  }

  async complete(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResponse> {
    if (!this.config?.endpoint) {
      throw new Error('Endpoint not configured');
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.customHeaders,
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify({
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        model: options?.model || this.config.model,
        max_tokens: options?.maxTokens || this.config.maxTokens,
        temperature: options?.temperature ?? this.config.temperature,
        top_p: options?.topP,
        stop: options?.stopSequences,
      }),
    });

    if (!response.ok) {
      throw new Error(`Custom endpoint error: ${response.statusText}`);
    }

    const data = await response.json() as any;

    // Try to extract content from various response formats
    let content = '';
    if (data.content) {
      content = data.content;
    } else if (data.choices?.[0]?.message?.content) {
      content = data.choices[0].message.content;
    } else if (data.response) {
      content = data.response;
    }

    return {
      content,
      usage: data.usage || {
        promptTokens: 0,
        completionTokens: 0,
      },
      metadata: {
        model: data.model,
        ...data.metadata,
      },
    };
  }

  async *streamComplete(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncIterableIterator<StreamChunk> {
    if (!this.config?.endpoint) {
      throw new Error('Endpoint not configured');
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.customHeaders,
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify({
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        model: options?.model || this.config.model,
        max_tokens: options?.maxTokens || this.config.maxTokens,
        temperature: options?.temperature ?? this.config.temperature,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Custom endpoint error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body;
    const decoder = new TextDecoder();

    for await (const chunk of reader as any) {
      const text = decoder.decode(chunk);
      const lines = text.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content ||
                          parsed.delta?.content ||
                          parsed.content;

            if (content) {
              yield {
                content,
                type: 'content',
              };
            }
          } catch (e) {
            console.error('Error parsing stream chunk:', e);
          }
        }
      }
    }
  }

  validateConfig(config: LLMConfig): ValidationResult {
    if (!config.endpoint) {
      return { valid: false, error: 'Endpoint URL is required' };
    }

    try {
      new URL(config.endpoint);
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid endpoint URL' };
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.config?.endpoint) return false;

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.customHeaders,
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Custom endpoint health check failed:', error);
      return false;
    }
  }
}
