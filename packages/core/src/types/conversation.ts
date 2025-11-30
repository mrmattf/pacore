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
  timeDecay?: boolean; // Apply time-based decay to relevance scores
  decayHalfLife?: number; // Days for score to decay by 50% (default: 7)
  boostRecent?: boolean; // Boost conversations from last 24 hours
  sortBy?: 'relevance' | 'recency' | 'hybrid'; // Sorting strategy
}
