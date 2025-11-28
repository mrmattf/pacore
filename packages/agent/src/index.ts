import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { nanoid } from 'nanoid';
import {
  AgentConfig,
  AgentMessage,
  AgentCapabilities,
  Message,
  CompletionOptions,
  LLMProvider,
} from '@pacore/core';
import { OllamaProvider } from '@pacore/adapters';

/**
 * On-premise agent that connects to the cloud service
 */
export class OnPremiseAgent extends EventEmitter {
  private ws?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private localProviders = new Map<string, LLMProvider>();
  private pendingRequests = new Map<string, (data: any) => void>();
  private config: AgentConfig;
  private isConnected = false;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.registerLocalProviders();
  }

  /**
   * Register local LLM providers
   */
  private registerLocalProviders(): void {
    // Register Ollama if configured
    if (this.config.localLLMs?.ollama) {
      const ollamaProvider = new OllamaProvider();
      ollamaProvider.initialize({
        endpoint: this.config.localLLMs.ollama.baseUrl,
        model: this.config.localLLMs.ollama.defaultModel,
      });
      this.localProviders.set('ollama', ollamaProvider);
    }

    // TODO: Add LM Studio and other providers
  }

  /**
   * Connect to the cloud service
   */
  async connect(): Promise<void> {
    const wsUrl = `${this.config.cloudUrl.replace('http', 'ws')}/agent/connect`;

    console.log(`Connecting to ${wsUrl}...`);

    this.ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Bearer ${this.config.agentToken}`,
        'X-Agent-Id': this.config.agentId,
      },
    });

    this.ws.on('open', () => {
      console.log('Connected to cloud service');
      this.isConnected = true;
      this.emit('connected');
      this.sendCapabilities();
    });

    this.ws.on('message', async (data) => {
      try {
        const message: AgentMessage = JSON.parse(data.toString());
        await this.handleMessage(message);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('Disconnected from cloud service');
      this.isConnected = false;
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    });
  }

  /**
   * Send agent capabilities to cloud
   */
  private sendCapabilities(): void {
    const capabilities: AgentCapabilities = {
      providers: Array.from(this.localProviders.keys()),
      tools: this.config.enabledTools || [],
      fileAccess: this.config.fileAccess?.enabled || false,
      version: '1.0.0',
    };

    this.send({
      type: 'capabilities',
      data: capabilities,
    });
  }

  /**
   * Handle incoming messages from cloud
   */
  private async handleMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'llm_request':
        await this.handleLLMRequest(message);
        break;

      case 'tool_request':
        await this.handleToolRequest(message);
        break;

      case 'file_request':
        await this.handleFileRequest(message);
        break;

      case 'health_check':
        this.send({
          type: 'health_response',
          requestId: message.requestId,
          data: { status: 'ok' },
        });
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * Handle LLM completion request
   */
  private async handleLLMRequest(message: AgentMessage): Promise<void> {
    const { providerId, messages, options, requestId } = message.data;

    const provider = this.localProviders.get(providerId);
    if (!provider) {
      this.send({
        type: 'error',
        requestId,
        error: `Provider ${providerId} not available`,
      });
      return;
    }

    try {
      if (options?.stream) {
        // Handle streaming response
        const stream = provider.streamComplete(messages, options);
        for await (const chunk of stream) {
          this.send({
            type: 'llm_stream',
            requestId,
            data: chunk,
          });
        }
        this.send({
          type: 'llm_stream_end',
          requestId,
        });
      } else {
        // Handle regular response
        const response = await provider.complete(messages, options);
        this.send({
          type: 'llm_response',
          requestId,
          data: response,
        });
      }
    } catch (error: any) {
      this.send({
        type: 'error',
        requestId,
        error: error.message,
      });
    }
  }

  /**
   * Handle tool execution request
   */
  private async handleToolRequest(message: AgentMessage): Promise<void> {
    const { tool, params, requestId } = message.data;

    // TODO: Implement tool execution
    this.send({
      type: 'error',
      requestId,
      error: 'Tool execution not yet implemented',
    });
  }

  /**
   * Handle file access request
   */
  private async handleFileRequest(message: AgentMessage): Promise<void> {
    const { operation, path, requestId } = message.data;

    if (!this.config.fileAccess?.enabled) {
      this.send({
        type: 'error',
        requestId,
        error: 'File access not enabled',
      });
      return;
    }

    // TODO: Implement file access with security checks
    this.send({
      type: 'error',
      requestId,
      error: 'File access not yet implemented',
    });
  }

  /**
   * Send a message to the cloud
   */
  private send(message: AgentMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('Cannot send message: WebSocket not connected');
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, 5000);
  }

  /**
   * Disconnect from cloud
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.isConnected = false;
  }

  /**
   * Check if connected
   */
  isAgentConnected(): boolean {
    return this.isConnected;
  }
}
