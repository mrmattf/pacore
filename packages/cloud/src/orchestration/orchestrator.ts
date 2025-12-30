import { nanoid } from 'nanoid';
import { LLMProviderRegistry, Message, CompletionOptions, CompletionResponse, StreamChunk } from '@pacore/core';
import { MemoryManager } from '../memory';
import { ConversationClassifier } from '../services/conversation-classifier';
import { WorkflowBuilder, WorkflowManager, WorkflowExecutor } from '../workflow';

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
  autoTag?: boolean; // Auto-generate tags and title (default: true)
  autoClassify?: boolean; // Auto-classify conversation category (default: true)
  detectWorkflowIntent?: boolean; // Detect and offer workflow generation (default: true)
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
  conversationId?: string;
  suggestedCategory?: string;
  workflowIntent?: {
    detected: boolean;
    intentType?: 'create' | 'execute';
    confidence: number;
    description: string;
    workflowId?: string;
    workflowName?: string;
    workflowDescription?: string;
    nodeCount?: number;
    executionId?: string;
  };
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
 * Main orchestrator that coordinates LLM requests, memory, routing, and workflows
 */
export class Orchestrator {
  public registry: LLMProviderRegistry;
  public memory: MemoryManager;
  private getUserSettings: (userId: string) => Promise<UserSettings>;
  private classifier?: ConversationClassifier;
  private workflowBuilder?: WorkflowBuilder;
  private workflowManager?: WorkflowManager;
  private workflowExecutor?: WorkflowExecutor;

  constructor(
    registry: LLMProviderRegistry,
    memory: MemoryManager,
    getUserSettings: (userId: string) => Promise<UserSettings>,
    workflowBuilder?: WorkflowBuilder,
    workflowManager?: WorkflowManager,
    workflowExecutor?: WorkflowExecutor,
  ) {
    this.registry = registry;
    this.memory = memory;
    this.getUserSettings = getUserSettings;
    this.workflowBuilder = workflowBuilder;
    this.workflowManager = workflowManager;
    this.workflowExecutor = workflowExecutor;
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

    // 3. Check for workflow intent FIRST (before LLM call)
    let workflowIntentResult;
    let shouldSkipLLM = false;

    console.log('[Orchestrator] Checking workflow intent detection...', {
      detectWorkflowIntent: options.detectWorkflowIntent,
      hasWorkflowBuilder: !!this.workflowBuilder,
      hasWorkflowManager: !!this.workflowManager,
      hasWorkflowExecutor: !!this.workflowExecutor,
    });

    if (
      options.detectWorkflowIntent !== false &&
      this.workflowBuilder &&
      this.workflowManager &&
      this.workflowExecutor
    ) {
      try {
        console.log('[Orchestrator] Detecting intent for user:', userId, 'input:', input);
        const intent = await this.workflowBuilder.detectIntent(userId, input);
        console.log('[Orchestrator] Intent detection result:', JSON.stringify(intent, null, 2));

        if (intent.detected && intent.confidence > 0.7) {
          // High confidence workflow intent detected
          if (intent.intentType === 'execute' && intent.workflowId) {
            // User wants to execute an existing workflow - ask for confirmation first
            shouldSkipLLM = true;
            try {
              const workflow = await this.workflowManager.getWorkflow(intent.workflowId);
              if (workflow && workflow.userId === userId) {
                // Return workflow details for confirmation, DON'T execute yet
                workflowIntentResult = {
                  detected: true,
                  intentType: 'execute' as const,
                  confidence: intent.confidence,
                  description: intent.description || 'Ready to execute workflow',
                  workflowId: intent.workflowId,
                  workflowName: workflow.name,
                  workflowDescription: workflow.description,
                  nodeCount: workflow.nodes?.length || 0,
                  // No executionId - workflow not executed yet, waiting for confirmation
                };
              }
            } catch (error: any) {
              console.error('Workflow retrieval error:', error);
              workflowIntentResult = {
                detected: true,
                intentType: 'execute' as const,
                confidence: intent.confidence,
                description: `Failed to retrieve workflow: ${error.message}`,
                workflowId: intent.workflowId,
              };
            }
          } else if (intent.intentType === 'create') {
            // User wants to create a new workflow - skip LLM, show creation dialog
            shouldSkipLLM = true;
            workflowIntentResult = {
              detected: true,
              intentType: 'create' as const,
              confidence: intent.confidence,
              description: intent.description || 'Workflow creation opportunity detected',
            };
          } else {
            // Generic workflow intent
            workflowIntentResult = {
              detected: true,
              confidence: intent.confidence,
              description: intent.description || 'Workflow automation opportunity detected',
            };
          }
        }
      } catch (error) {
        console.error('Workflow intent detection error:', error);
        // Continue without workflow detection if it fails
      }
    }

    // 4. Determine routing strategy
    const routing = await this.determineRouting(userId, input, options);

    // 5. Prepare messages with context
    const messages = this.prepareMessages(input, context, routing);

    // 6. Get provider (needed for both workflow execution and normal LLM calls)
    const provider = await this.registry.getLLMForUser(userId, routing.providerId);

    // 7. Execute request based on routing (skip if workflow was executed)
    let response: CompletionResponse;

    if (shouldSkipLLM && workflowIntentResult) {
      // Workflow execution pending confirmation - return empty response
      // The workflow details are in workflowIntentResult, no need for LLM response
      response = {
        content: '',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    } else {
      // Normal LLM call
      response = await provider.complete(messages, options);
    }

    // 6. Store conversation in memory
    let savedConversationId: string | undefined;
    let suggestedCategory: string | undefined;

    if (options.saveToMemory !== false) {
      const conversationId = nanoid();
      savedConversationId = conversationId;
      const conversationMessages: Message[] = [
        ...messages,
        { role: 'assistant' as const, content: response.content },
      ];

      // Auto-tag and classify if enabled (default: true)
      const metadata: any = {
        provider: routing.providerId,
        context: context.map(c => c.id),
      };

      if (options.autoTag !== false || options.autoClassify !== false) {
        try {
          // Initialize classifier if not already done
          if (!this.classifier) {
            this.classifier = new ConversationClassifier(provider);
          }

          if (options.autoClassify !== false) {
            // Get user's categories for classification
            const userCategories = await this.memory.getUserCategories(userId);

            // Full classification (tags + title + category)
            const classification = await this.classifier.classifyConversation(
              conversationMessages,
              userCategories
            );
            metadata.tags = classification.tags;
            metadata.title = classification.title;
            metadata.category = classification.category;
            metadata.autoClassified = true;
            metadata.classificationConfidence = classification.confidence;

            // If a category suggestion exists, include it in metadata
            if (classification.suggestedCategory) {
              metadata.suggestedCategory = classification.suggestedCategory;
              suggestedCategory = classification.suggestedCategory;
            }
          } else if (options.autoTag !== false) {
            // Just tags
            const tags = await this.classifier.generateTags(conversationMessages);
            metadata.tags = tags;
            metadata.autoTagged = true;
          }
        } catch (error) {
          console.error('Auto-tagging error:', error);
          // Continue without tags if classification fails
        }
      }

      await this.memory.storeConversation(userId, {
        id: conversationId,
        userId,
        messages: conversationMessages,
        timestamp: new Date(),
        metadata,
      });
    }

    const result: OrchestrationResponse = {
      response: response.content,
      provider: routing.providerId,
      usage: response.usage,
      contextUsed: context.map(c => c.id),
    };

    if (savedConversationId) {
      result.conversationId = savedConversationId;
    }

    if (suggestedCategory) {
      result.suggestedCategory = suggestedCategory;
    }

    if (workflowIntentResult) {
      result.workflowIntent = workflowIntentResult;
    }

    return result;
  }

  async *processStreamingRequest(
    userId: string,
    input: string,
    options: RequestOptions = {},
  ): AsyncIterableIterator<StreamChunk> {
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

    // 5. Get provider and stream response
    const provider = await this.registry.getLLMForUser(userId, routing.providerId);

    // Collect all chunks for storage
    const allMessages = [...messages];
    let fullResponse = '';

    // 6. Stream chunks from provider
    for await (const chunk of provider.streamComplete(messages, options)) {
      if (chunk.type === 'content' && chunk.content) {
        fullResponse += chunk.content;
      }
      yield chunk;
    }

    // 7. Store conversation in memory after streaming completes
    if (options.saveToMemory !== false) {
      const conversationId = nanoid();
      const conversationMessages: Message[] = [
        ...allMessages,
        { role: 'assistant' as const, content: fullResponse },
      ];

      // Auto-tag and classify if enabled (default: true)
      const metadata: any = {
        provider: routing.providerId,
        context: context.map(c => c.id),
        streaming: true,
      };

      if (options.autoTag !== false || options.autoClassify !== false) {
        try {
          // Initialize classifier if not already done
          if (!this.classifier) {
            this.classifier = new ConversationClassifier(provider);
          }

          if (options.autoClassify !== false) {
            // Get user's categories for classification
            const userCategories = await this.memory.getUserCategories(userId);

            // Full classification (tags + title + category)
            const classification = await this.classifier.classifyConversation(
              conversationMessages,
              userCategories
            );
            metadata.tags = classification.tags;
            metadata.title = classification.title;
            metadata.category = classification.category;
            metadata.autoClassified = true;
            metadata.classificationConfidence = classification.confidence;

            // If a category suggestion exists, include it in metadata
            if (classification.suggestedCategory) {
              metadata.suggestedCategory = classification.suggestedCategory;
            }
          } else if (options.autoTag !== false) {
            // Just tags
            const tags = await this.classifier.generateTags(conversationMessages);
            metadata.tags = tags;
            metadata.autoTagged = true;
          }
        } catch (error) {
          console.error('Auto-tagging error:', error);
          // Continue without tags if classification fails
        }
      }

      await this.memory.storeConversation(userId, {
        id: conversationId,
        userId,
        messages: conversationMessages,
        timestamp: new Date(),
        metadata,
      });
    }
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
