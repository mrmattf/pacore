import 'dotenv/config';
import { LLMProviderRegistry } from '@pacore/core';
import { AnthropicProvider, OpenAIProvider, CustomEndpointProvider } from '@pacore/adapters';
import { VectorMemoryStore, PgVectorStore, MemoryManager } from './memory';
import { Orchestrator, UserSettings } from './orchestration';
import { APIGateway } from './api';
import { Pool } from 'pg';

/**
 * Main entry point for the cloud service
 */
async function main() {
  console.log('Starting PA Core Cloud Service...');

  // Initialize LLM Provider Registry
  const registry = new LLMProviderRegistry();

  // Register default providers
  registry.registerProvider(new AnthropicProvider());
  registry.registerProvider(new OpenAIProvider());
  registry.registerProvider(new CustomEndpointProvider());

  console.log('Registered LLM providers:', registry.getProviders().map(p => p.id));

  // Create shared database pool
  const dbPool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/pacore',
  });

  // Determine which vector store to use
  const vectorStoreType = process.env.VECTOR_STORE || 'pgvector';
  let vectorStore: VectorMemoryStore | PgVectorStore;

  if (vectorStoreType === 'pinecone') {
    console.log('Using Pinecone for vector storage');
    vectorStore = new VectorMemoryStore({
      pineconeApiKey: process.env.PINECONE_API_KEY || '',
      pineconeIndexName: process.env.PINECONE_INDEX_NAME || 'pacore-conversations',
    });
  } else {
    console.log('Using pgvector for vector storage');
    vectorStore = new PgVectorStore({ pool: dbPool });
  }

  // Initialize Memory Manager
  const memoryManager = new MemoryManager({
    postgresUrl: process.env.DATABASE_URL || 'postgresql://localhost/pacore',
    vectorStore,
  });

  await memoryManager.initialize();
  console.log('Memory manager initialized');

  // User settings getter (simplified - would normally come from database)
  const getUserSettings = async (userId: string): Promise<UserSettings> => {
    // TODO: Load from database
    return {
      defaultProvider: 'anthropic',
      dataResidency: 'cloud',
    };
  };

  // Initialize Orchestrator
  const orchestrator = new Orchestrator(
    registry,
    memoryManager,
    getUserSettings,
  );

  // Initialize API Gateway
  const gateway = new APIGateway(orchestrator, {
    port: parseInt(process.env.PORT || '3000'),
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3001'],
    db: dbPool,
  });

  await gateway.start();

  console.log('PA Core Cloud Service is running');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await gateway.stop();
    await memoryManager.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await gateway.stop();
    await memoryManager.close();
    process.exit(0);
  });
}

// Run the service
main().catch((error) => {
  console.error('Failed to start service:', error);
  process.exit(1);
});

export * from './memory';
export * from './orchestration';
export * from './api';
