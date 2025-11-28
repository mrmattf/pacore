import fetch from 'node-fetch';
import WebSocket from 'ws';
import { Message, CompletionOptions, LLMConfig, MemorySearchOptions } from '@pacore/core';

export interface ClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface CompleteRequest {
  messages: Message[];
  options?: CompletionOptions;
}

export interface CompleteResponse {
  response: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens?: number;
  };
  contextUsed?: string[];
}

export interface StreamChunk {
  content?: string;
  type: 'content' | 'metadata' | 'error';
  metadata?: Record<string, any>;
}

/**
 * Client SDK for PA Core AI Orchestrator
 */
export class PACoreClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.pacore.io';
  }

  /**
   * Complete a chat conversation
   */
  async complete(
    messages: Message[],
    options?: CompletionOptions
  ): Promise<CompleteResponse> {
    const response = await fetch(`${this.baseUrl}/v1/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages, options }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`API error: ${error.error || response.statusText}`);
    }

    return response.json() as Promise<CompleteResponse>;
  }

  /**
   * Stream a chat conversation
   */
  async *streamComplete(
    messages: Message[],
    options?: CompletionOptions
  ): AsyncIterableIterator<StreamChunk> {
    const wsUrl = `${this.baseUrl.replace('http', 'ws')}/ws?token=${this.apiKey}`;
    const ws = new WebSocket(wsUrl);

    const queue: StreamChunk[] = [];
    let done = false;
    let error: Error | null = null;

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'complete',
        data: { input: messages[messages.length - 1].content, options },
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === 'error') {
        error = new Error(message.error);
        done = true;
      } else if (message.type === 'complete') {
        // Non-streaming response
        queue.push({
          content: message.data.response,
          type: 'content',
        });
        done = true;
      } else if (message.type === 'stream') {
        queue.push(message.data);
      } else if (message.type === 'stream_end') {
        done = true;
      }
    });

    ws.on('error', (err) => {
      error = err;
      done = true;
    });

    ws.on('close', () => {
      done = true;
    });

    // Yield chunks as they arrive
    while (!done || queue.length > 0) {
      if (error) {
        throw error;
      }

      if (queue.length > 0) {
        yield queue.shift()!;
      } else {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    ws.close();
  }

  /**
   * Configure an LLM provider
   */
  async configureProvider(
    providerId: string,
    config: LLMConfig
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/v1/providers/${providerId}/configure`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      }
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(`Configuration error: ${error.error || response.statusText}`);
    }
  }

  /**
   * List available providers
   */
  async listProviders(): Promise<{
    configured: string[];
    available: Array<{ id: string; name: string; type: string }>;
  }> {
    const response = await fetch(`${this.baseUrl}/v1/providers`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`List providers error: ${response.statusText}`);
    }

    return response.json() as Promise<any>;
  }

  /**
   * Search conversation memory
   */
  async searchMemory(
    query: string,
    options?: MemorySearchOptions
  ): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/v1/memory/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, options }),
    });

    if (!response.ok) {
      throw new Error(`Memory search error: ${response.statusText}`);
    }

    return response.json() as Promise<any[]>;
  }

  /**
   * Get conversation history
   */
  async getConversations(
    limit?: number,
    offset?: number
  ): Promise<any[]> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());

    const response = await fetch(
      `${this.baseUrl}/v1/conversations?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Get conversations error: ${response.statusText}`);
    }

    return response.json() as Promise<any[]>;
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/v1/conversations/${conversationId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Delete conversation error: ${response.statusText}`);
    }
  }
}

// Export types from core for convenience
export * from '@pacore/core';
