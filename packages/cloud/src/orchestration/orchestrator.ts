import { nanoid } from 'nanoid';
import { LLMProviderRegistry, Message, CompletionOptions, CompletionResponse } from '@pacore/core';
import { MemoryManager } from '../memory';

export interface ContextSearchConfig {
  enabled?: boolean;
  limit?: number;
  minRelevance?: number;
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  providers?: string[];
  tags?: string[];
}

export interface RequestOptions extends CompletionOptions {
  providerId?: string;
  agentId?: string;
  saveToMemory?: boolean;
  contextSearch?: boolean | ContextSearchConfig;
}

export interface OrchestrationResponse {
  response: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens?: number;
  };
  contextUsed?: string[];
}

export interface RoutingDecision {
  type: 'cloud' | 'local' | 'specified';
  providerId: string;
  agentId?: string;
}

export interface UserSettings {
  requireOnPremise?: boolean;
  defaultProvider?: string;
  defaultLocalProvider?: string;
  dataResidency?: 'cloud' | 'on-premise' | 'hybrid';
}

/**
 * Main orchestrator that coordinates LLM requests, memory, and routing
 */
export class Orchestrator {
  public registry: LLMProviderRegistry;
  public memory: MemoryManager;
  private getUserSettings: (userId: string) => Promise<UserSettings>;

  constructor(
    registry: LLMProviderRegistry,
    memory: MemoryManager,
    getUserSettings: (userId: string) => Promise<UserSettings>,
  ) {
    this.registry = registry;
    this.memory = memory;
    this.getUserSettings = getUserSettings;
  }

  async processRequest(
    userId: string,
    input: string,
    options: RequestOptions = {},
  ): Promise<OrchestrationResponse> {
    // 1. Determine context search configuration
    let contextConfig: ContextSearchConfig;
    if (typeof options.contextSearch === 'object') {
      contextConfig = options.contextSearch;
    } else if (options.contextSearch === false) {
      contextConfig = { enabled: false };
    } else {
      contextConfig = { enabled: true };
    }

    // 2. Retrieve relevant context from memory
    let context: any[] = [];
    if (contextConfig.enabled !== false) {
      context = await this.memory.searchContext(userId, input, {
        limit: contextConfig.limit ?? 5,
        minRelevance: contextConfig.minRelevance ?? 0.7,
        dateRange: contextConfig.dateRange,
        providers: contextConfig.providers,
        tags: contextConfig.tags,
      });
    }

    // 3. Determine routing strategy
    const routing = await this.determineRouting(userId, input, options);

    // 4. Prepare messages with context
    const messages = this.prepareMessages(input, context, routing);

    // 5. Execute request based on routing
    let response: CompletionResponse;

    // For now, always use cloud provider (agent support will be added separately)
    const provider = await this.registry.getLLMForUser(userId, routing.providerId);
    response = await provider.complete(messages, options);

    // 6. Store conversation in memory
    if (options.saveToMemory !== false) {
      const conversationId = nanoid();
      await this.memory.storeConversation(userId, {
        id: conversationId,
        userId,
        messages: [
          ...messages,
          { role: 'assistant', content: response.content },
        ],
        timestamp: new Date(),
        metadata: {
          provider: routing.providerId,
          context: context.map(c => c.id),
        },
      });
    }

    return {
      response: response.content,
      provider: routing.providerId,
      usage: response.usage,
      contextUsed: context.map(c => c.id),
    };
  }

  private async determineRouting(
    userId: string,
    input: string,
    options: RequestOptions,
  ): Promise<RoutingDecision> {
    // Check if user specified a provider
    if (options.providerId) {
      return {
        type: 'specified',
        providerId: options.providerId,
        agentId: options.agentId,
      };
    }

    // Check for data residency requirements
    const userSettings = await this.getUserSettings(userId);
    if (userSettings.requireOnPremise) {
      return {
        type: 'local',
        providerId: userSettings.defaultLocalProvider || 'ollama',
        // agentId would be determined by agent manager
      };
    }

    // Intelligent routing based on query type
    if (this.isCodeQuery(input)) {
      return { type: 'cloud', providerId: 'anthropic' };
    } else if (this.isAnalyticalQuery(input)) {
      return { type: 'cloud', providerId: 'anthropic' };
    }

    // Default to user's preferred provider
    return {
      type: 'cloud',
      providerId: userSettings.defaultProvider || 'anthropic',
    };
  }

  private prepareMessages(
    input: string,
    context: any[],
    routing: RoutingDecision,
  ): Message[] {
    const messages: Message[] = [];

    // Add context if available
    if (context.length > 0) {
      const contextText = context
        .map(c => `[${new Date(c.timestamp).toLocaleDateString()}] ${c.content}`)
        .join('\n\n');

      messages.push({
        role: 'system',
        content: `You have access to the following relevant context from previous conversations:\n\n${contextText}\n\nUse this context to provide more personalized and contextual responses.`,
      });
    }

    // Add user input
    messages.push({
      role: 'user',
      content: input,
    });

    return messages;
  }

  private isCodeQuery(input: string): boolean {
    const codeKeywords = [
      'code', 'function', 'class', 'bug', 'error', 'debug',
      'implement', 'refactor', 'algorithm', 'syntax', 'programming',
    ];
    const lowerInput = input.toLowerCase();
    return codeKeywords.some(keyword => lowerInput.includes(keyword));
  }

  private isAnalyticalQuery(input: string): boolean {
    const analyticalKeywords = [
      'analyze', 'explain', 'compare', 'evaluate', 'assess',
      'summarize', 'review', 'discuss', 'consider',
    ];
    const lowerInput = input.toLowerCase();
    return analyticalKeywords.some(keyword => lowerInput.includes(keyword));
  }
}
