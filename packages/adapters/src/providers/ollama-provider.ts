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
 * Ollama provider for on-premise LLMs
 */
export class OllamaProvider implements LLMProvider {
  id = 'ollama';
  name = 'Ollama';
  providerType = 'ollama';
  type: 'on-premise' = 'on-premise';

  private config?: LLMConfig;

  async initialize(config: LLMConfig): Promise<void> {
    this.config = config;
  }

  async complete(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResponse> {
    if (!this.config?.endpoint) {
      throw new Error('Ollama endpoint not configured');
    }

    const url = `${this.config.endpoint}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options?.model || this.config.model || 'llama2',
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: false,
        options: {
          temperature: options?.temperature ?? this.config.temperature ?? 0.7,
          top_p: options?.topP,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json() as any;

    return {
      content: data.message?.content || '',
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      metadata: {
        model: data.model,
        totalDuration: data.total_duration,
        loadDuration: data.load_duration,
      },
    };
  }

  async *streamComplete(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncIterableIterator<StreamChunk> {
    if (!this.config?.endpoint) {
      throw new Error('Ollama endpoint not configured');
    }

    const url = `${this.config.endpoint}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options?.model || this.config.model || 'llama2',
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        options: {
          temperature: options?.temperature ?? this.config.temperature ?? 0.7,
          top_p: options?.topP,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
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
        try {
          const data = JSON.parse(line);

          if (data.message?.content) {
            yield {
              content: data.message.content,
              type: 'content',
            };
          }

          if (data.done) {
            yield {
              type: 'metadata',
              metadata: {
                totalDuration: data.total_duration,
                loadDuration: data.load_duration,
                promptEvalCount: data.prompt_eval_count,
                evalCount: data.eval_count,
              },
            };
          }
        } catch (e) {
          console.error('Error parsing Ollama stream chunk:', e);
        }
      }
    }
  }

  validateConfig(config: LLMConfig): ValidationResult {
    if (!config.endpoint) {
      return { valid: false, error: 'Ollama endpoint URL is required' };
    }

    try {
      new URL(config.endpoint);
    } catch {
      return { valid: false, error: 'Invalid endpoint URL' };
    }

    return { valid: true };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.config?.endpoint) return false;

    try {
      const response = await fetch(`${this.config.endpoint}/api/tags`);
      return response.ok;
    } catch (error) {
      console.error('Ollama health check failed:', error);
      return false;
    }
  }

  /**
   * List available models from Ollama
   */
  async listModels(): Promise<string[]> {
    if (!this.config?.endpoint) {
      throw new Error('Ollama endpoint not configured');
    }

    const response = await fetch(`${this.config.endpoint}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.models?.map((m: any) => m.name) || [];
  }
}
