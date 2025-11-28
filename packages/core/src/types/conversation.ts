import { Message } from './llm-provider';

/**
 * Conversation and memory types
 */

export interface Conversation {
  id: string;
  userId: string;
  messages: Message[];
  timestamp: Date;
  metadata: ConversationMetadata;
}

export interface ConversationMetadata {
  provider: string;
  model?: string;
  context?: string[];
  tags?: string[];
  title?: string;
  [key: string]: any;
}

export interface ContextResult {
  id: string;
  conversationId: string;
  content: string;
  relevanceScore: number;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface MemorySearchOptions {
  limit?: number;
  minRelevance?: number;
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  providers?: string[];
  tags?: string[];
}
