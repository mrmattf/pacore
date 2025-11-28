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
    // Search using vector similarity
    const results = await this.vectorStore.searchContext(
      userId,
      query,
      options.limit || 5
    );

    // Filter by additional criteria
    let filtered = results;

    if (options.minRelevance) {
      filtered = filtered.filter(r => r.relevanceScore >= options.minRelevance!);
    }

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

    return filtered.slice(0, options.limit || 5);
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

  async close(): Promise<void> {
    await this.db.end();
  }
}
