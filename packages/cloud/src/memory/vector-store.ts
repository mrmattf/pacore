import { Pinecone } from '@pinecone-database/pinecone';
import { Conversation, ContextResult } from '@pacore/core';

export interface VectorStoreConfig {
  pineconeApiKey: string;
  pineconeIndexName: string;
  embeddingModel?: string;
}

/**
 * Vector-based memory storage using Pinecone
 */
export class VectorMemoryStore {
  private pinecone: Pinecone;
  private indexName: string;

  constructor(config: VectorStoreConfig) {
    this.pinecone = new Pinecone({
      apiKey: config.pineconeApiKey,
    });
    this.indexName = config.pineconeIndexName;
  }

  async storeConversation(
    userId: string,
    conversation: Conversation
  ): Promise<void> {
    const index = this.pinecone.index(this.indexName);

    // Generate embeddings for each message
    const embeddings = await this.generateEmbeddings(
      conversation.messages.map(m => m.content)
    );

    // Prepare vectors with metadata
    const vectors = conversation.messages.map((msg, i) => ({
      id: `${conversation.id}-${i}`,
      values: embeddings[i],
      metadata: {
        userId,
        conversationId: conversation.id,
        messageIndex: i,
        role: msg.role,
        timestamp: conversation.timestamp.toISOString(),
        provider: conversation.metadata.provider,
        content: this.truncateContent(msg.content, 1000),
        tags: conversation.metadata.tags || [],
      },
    }));

    // Upsert to Pinecone
    await index.upsert(vectors);
  }

  async searchContext(
    userId: string,
    query: string,
    limit: number = 5
  ): Promise<ContextResult[]> {
    const index = this.pinecone.index(this.indexName);

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Search similar vectors
    const results = await index.query({
      vector: queryEmbedding,
      topK: limit * 2, // Get more results to filter and group
      includeMetadata: true,
      filter: { userId },
    });

    // Convert to ContextResult and group by conversation
    return this.groupAndRankResults(results.matches || []);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const index = this.pinecone.index(this.indexName);

    // Delete all vectors for this conversation
    await index.deleteMany({
      filter: { conversationId },
    });
  }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // TODO: Implement actual embedding generation
    // For now, return placeholder embeddings
    // In production, use OpenAI embeddings or similar
    return texts.map(() => Array(1536).fill(0).map(() => Math.random()));
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // TODO: Implement actual embedding generation
    return Array(1536).fill(0).map(() => Math.random());
  }

  private groupAndRankResults(matches: any[]): ContextResult[] {
    const grouped = new Map<string, any[]>();

    // Group by conversation
    for (const match of matches) {
      const convId = match.metadata?.conversationId;
      if (!convId) continue;

      if (!grouped.has(convId)) {
        grouped.set(convId, []);
      }
      grouped.get(convId)!.push(match);
    }

    // Take best match from each conversation and sort
    const results: ContextResult[] = [];
    for (const [convId, convMatches] of grouped) {
      const bestMatch = convMatches.sort((a, b) => b.score - a.score)[0];

      results.push({
        id: bestMatch.id,
        conversationId: convId,
        content: bestMatch.metadata?.content || '',
        relevanceScore: bestMatch.score || 0,
        timestamp: new Date(bestMatch.metadata?.timestamp),
        metadata: bestMatch.metadata || {},
      });
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  }
}
