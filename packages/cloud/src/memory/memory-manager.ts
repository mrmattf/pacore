import { Pool } from 'pg';
import { Conversation, ContextResult, MemorySearchOptions } from '@pacore/core';
import { VectorMemoryStore } from './vector-store';
import { PgVectorStore } from './pgvector-store';

export interface MemoryManagerConfig {
  postgresUrl: string;
  vectorStore: VectorMemoryStore | PgVectorStore;
}

/**
 * Manages conversation history with both structured and vector storage
 */
export class MemoryManager {
  private db: Pool;
  private vectorStore: VectorMemoryStore | PgVectorStore;

  constructor(config: MemoryManagerConfig) {
    this.db = new Pool({
      connectionString: config.postgresUrl,
    });
    this.vectorStore = config.vectorStore;
  }

  async initialize(): Promise<void> {
    // Create tables if they don't exist
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        messages JSONB NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        metadata JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);

      CREATE TABLE IF NOT EXISTS user_categories (
        user_id VARCHAR(255) NOT NULL,
        category VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, category)
      );

      CREATE INDEX IF NOT EXISTS idx_user_categories_user_id ON user_categories(user_id);
    `);
  }

  async storeConversation(
    userId: string,
    conversation: Conversation
  ): Promise<void> {
    // Store in PostgreSQL
    await this.db.query(
      `INSERT INTO conversations (id, user_id, messages, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET messages = $3, timestamp = $4, metadata = $5, updated_at = NOW()`,
      [
        conversation.id,
        userId,
        JSON.stringify(conversation.messages),
        conversation.timestamp,
        JSON.stringify(conversation.metadata),
      ]
    );

    // Store in vector database
    await this.vectorStore.storeConversation(userId, conversation);
  }

  async searchContext(
    userId: string,
    query: string,
    options: MemorySearchOptions = {}
  ): Promise<ContextResult[]> {
    // Search using vector similarity (fetch more initially for better filtering)
    const fetchLimit = Math.max((options.limit || 5) * 3, 15);
    const results = await this.vectorStore.searchContext(
      userId,
      query,
      fetchLimit
    );

    // Filter by additional criteria
    let filtered = results;

    if (options.dateRange) {
      filtered = filtered.filter(r => {
        const ts = r.timestamp;
        if (options.dateRange!.from && ts < options.dateRange!.from) return false;
        if (options.dateRange!.to && ts > options.dateRange!.to) return false;
        return true;
      });
    }

    if (options.providers && options.providers.length > 0) {
      filtered = filtered.filter(r =>
        options.providers!.includes(r.metadata.provider)
      );
    }

    if (options.tags && options.tags.length > 0) {
      filtered = filtered.filter(r => {
        const tags = r.metadata.tags || [];
        return options.tags!.some(tag => tags.includes(tag));
      });
    }

    // Apply advanced scoring
    const scored = filtered.map(r => {
      let finalScore = r.relevanceScore;
      const ageInMs = Date.now() - r.timestamp.getTime();
      const ageInDays = ageInMs / (1000 * 60 * 60 * 24);

      // Apply time decay if enabled
      if (options.timeDecay !== false) { // Default to true
        const halfLife = options.decayHalfLife || 7; // Default 7 days
        const decayFactor = Math.pow(0.5, ageInDays / halfLife);
        finalScore *= decayFactor;
      }

      // Boost recent conversations (last 24 hours)
      if (options.boostRecent !== false && ageInDays < 1) {
        const recentBoost = 1 + (1 - ageInDays) * 0.3; // Up to 30% boost
        finalScore *= recentBoost;
      }

      // Hybrid scoring considers both relevance and recency
      if (options.sortBy === 'hybrid') {
        const recencyScore = 1 / (1 + ageInDays); // Decay with age
        finalScore = 0.7 * finalScore + 0.3 * recencyScore;
      }

      return { ...r, relevanceScore: finalScore };
    });

    // Sort based on strategy
    let sorted = scored;
    if (options.sortBy === 'recency') {
      sorted = scored.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } else {
      // Default to relevance or hybrid
      sorted = scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    // Apply minimum relevance filter after scoring
    if (options.minRelevance) {
      sorted = sorted.filter(r => r.relevanceScore >= options.minRelevance!);
    }

    return sorted.slice(0, options.limit || 5);
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const result = await this.db.query(
      'SELECT * FROM conversations WHERE id = $1',
      [conversationId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      messages: row.messages,
      timestamp: row.timestamp,
      metadata: row.metadata,
    };
  }

  async getUserConversations(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Conversation[]> {
    const result = await this.db.query(
      `SELECT * FROM conversations
       WHERE user_id = $1
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      messages: row.messages,
      timestamp: row.timestamp,
      metadata: row.metadata,
    }));
  }

  async deleteConversation(conversationId: string): Promise<void> {
    // Delete from PostgreSQL
    await this.db.query('DELETE FROM conversations WHERE id = $1', [conversationId]);

    // Delete from vector store
    await this.vectorStore.deleteConversation(conversationId);
  }

  async deleteUserConversations(userId: string): Promise<void> {
    // Get all conversation IDs
    const result = await this.db.query(
      'SELECT id FROM conversations WHERE user_id = $1',
      [userId]
    );

    // Delete from PostgreSQL
    await this.db.query('DELETE FROM conversations WHERE user_id = $1', [userId]);

    // Delete from vector store
    for (const row of result.rows) {
      await this.vectorStore.deleteConversation(row.id);
    }
  }

  async updateConversationTags(
    conversationId: string,
    tags: string[]
  ): Promise<void> {
    await this.db.query(
      `UPDATE conversations
       SET metadata = jsonb_set(metadata, '{tags}', $1::jsonb),
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(tags), conversationId]
    );
  }

  async addConversationTags(
    conversationId: string,
    tagsToAdd: string[]
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const existingTags = conversation.metadata.tags || [];
    const uniqueTags = [...new Set([...existingTags, ...tagsToAdd])];

    await this.updateConversationTags(conversationId, uniqueTags);
  }

  async removeConversationTags(
    conversationId: string,
    tagsToRemove: string[]
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const existingTags = conversation.metadata.tags || [];
    const filteredTags = existingTags.filter(tag => !tagsToRemove.includes(tag));

    await this.updateConversationTags(conversationId, filteredTags);
  }

  async getConversationsByTag(
    userId: string,
    tag: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Conversation[]> {
    const result = await this.db.query(
      `SELECT * FROM conversations
       WHERE user_id = $1
       AND metadata->'tags' ? $2
       ORDER BY timestamp DESC
       LIMIT $3 OFFSET $4`,
      [userId, tag, limit, offset]
    );

    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      messages: row.messages,
      timestamp: row.timestamp,
      metadata: row.metadata,
    }));
  }

  async getUserTags(userId: string): Promise<{ tag: string; count: number }[]> {
    const result = await this.db.query(
      `SELECT jsonb_array_elements_text(metadata->'tags') as tag, COUNT(*) as count
       FROM conversations
       WHERE user_id = $1
       GROUP BY tag
       ORDER BY count DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      tag: row.tag,
      count: parseInt(row.count),
    }));
  }

  // Category Management
  async getUserCategories(userId: string): Promise<string[]> {
    const result = await this.db.query(
      'SELECT category FROM user_categories WHERE user_id = $1 ORDER BY created_at ASC',
      [userId]
    );
    return result.rows.map(row => row.category);
  }

  async addUserCategory(
    userId: string,
    category: string,
    description?: string
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO user_categories (user_id, category, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, category) DO UPDATE
       SET description = $3`,
      [userId, category.toLowerCase(), description]
    );
  }

  async removeUserCategory(userId: string, category: string): Promise<void> {
    await this.db.query(
      'DELETE FROM user_categories WHERE user_id = $1 AND category = $2',
      [userId, category.toLowerCase()]
    );
  }

  async getCategoryDescription(
    userId: string,
    category: string
  ): Promise<string | null> {
    const result = await this.db.query(
      'SELECT description FROM user_categories WHERE user_id = $1 AND category = $2',
      [userId, category.toLowerCase()]
    );
    return result.rows.length > 0 ? result.rows[0].description : null;
  }

  async close(): Promise<void> {
    await this.db.end();
  }
}
