import { Pool } from 'pg';
import { Conversation, ContextResult } from '@pacore/core';

export interface PgVectorStoreConfig {
  pool: Pool;
}

/**
 * Vector-based memory storage using PostgreSQL pgvector extension
 */
export class PgVectorStore {
  private pool: Pool;

  constructor(config: PgVectorStoreConfig) {
    this.pool = config.pool;
  }

  async storeConversation(
    userId: string,
    conversation: Conversation
  ): Promise<void> {
    // Generate embeddings for each message
    const embeddings = await this.generateEmbeddings(
      conversation.messages.map(m => m.content)
    );

    // Insert embeddings into the database
    for (let i = 0; i < conversation.messages.length; i++) {
      const msg = conversation.messages[i];
      const embedding = embeddings[i];

      await this.pool.query(
        `INSERT INTO conversation_embeddings
         (conversation_id, user_id, message_index, role, content, embedding, timestamp, provider, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (conversation_id, message_index)
         DO UPDATE SET
           content = $5,
           embedding = $6,
           timestamp = $7`,
        [
          conversation.id,
          userId,
          i,
          msg.role,
          this.truncateContent(msg.content, 5000),
          JSON.stringify(embedding), // pgvector accepts array as JSON
          conversation.timestamp,
          conversation.metadata.provider,
          conversation.metadata.tags || [],
        ]
      );
    }
  }

  async searchContext(
    userId: string,
    query: string,
    limit: number = 5
  ): Promise<ContextResult[]> {
    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Search using cosine similarity
    const result = await this.pool.query(
      `SELECT
         id,
         conversation_id,
         content,
         1 - (embedding <=> $1::vector) as relevance_score,
         timestamp,
         provider,
         tags,
         role
       FROM conversation_embeddings
       WHERE user_id = $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [JSON.stringify(queryEmbedding), userId, limit * 2] // Get more for grouping
    );

    // Group by conversation and return best results
    return this.groupAndRankResults(result.rows);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM conversation_embeddings WHERE conversation_id = $1',
      [conversationId]
    );
  }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // TODO: Implement actual embedding generation using OpenAI or similar
    // For now, return placeholder embeddings (random vectors)
    // In production, you would call OpenAI's embedding API or use a local model
    return texts.map(() => Array(1536).fill(0).map(() => Math.random()));
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // TODO: Implement actual embedding generation
    // This should use the same embedding model as generateEmbeddings
    return Array(1536).fill(0).map(() => Math.random());
  }

  private groupAndRankResults(rows: any[]): ContextResult[] {
    const grouped = new Map<string, any[]>();

    // Group by conversation
    for (const row of rows) {
      const convId = row.conversation_id;
      if (!grouped.has(convId)) {
        grouped.set(convId, []);
      }
      grouped.get(convId)!.push(row);
    }

    // Take best match from each conversation
    const results: ContextResult[] = [];
    for (const [convId, convRows] of grouped) {
      const bestMatch = convRows.sort((a, b) => b.relevance_score - a.relevance_score)[0];

      results.push({
        id: bestMatch.id.toString(),
        conversationId: convId,
        content: bestMatch.content,
        relevanceScore: bestMatch.relevance_score,
        timestamp: new Date(bestMatch.timestamp),
        metadata: {
          provider: bestMatch.provider,
          tags: bestMatch.tags,
          role: bestMatch.role,
        },
      });
    }

    // Sort by relevance and return top results
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  }
}
