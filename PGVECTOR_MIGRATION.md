# pgvector Migration Summary

PA Core now uses **pgvector** by default instead of Pinecone for vector storage. This eliminates the need for an external vector database service and simplifies setup for POCs and development.

## What Changed

### 1. Database Schema
- **Added pgvector extension** to PostgreSQL
- **New table**: `conversation_embeddings` stores vector embeddings with HNSW index for fast similarity search
- Supports 1536-dimensional vectors (OpenAI embedding size)

### 2. New PgVectorStore Implementation
- Located at: `packages/cloud/src/memory/pgvector-store.ts`
- Implements the same interface as VectorMemoryStore
- Uses PostgreSQL for both structured data and vector search
- Cosine similarity search with HNSW indexing

### 3. Flexible Vector Store Selection
- Environment variable `VECTOR_STORE` controls which implementation to use
- Default: `pgvector` (no external dependencies)
- Optional: `pinecone` (requires API key)

### 4. Docker Configuration
- Updated PostgreSQL image to `pgvector/pgvector:pg15`
- Includes pgvector extension out of the box
- Added `VECTOR_STORE` environment variable to API service

### 5. Documentation Updates
- Removed Pinecone as a requirement
- Added instructions for pgvector (default)
- Kept Pinecone as an optional alternative

## Benefits

✅ **Simpler Setup**: No external services needed
✅ **Cost Savings**: Completely free
✅ **Faster Development**: One database instead of two services
✅ **ACID Transactions**: Update conversation + vectors together
✅ **Still Scalable**: Can switch to Pinecone later if needed

## How to Use

### Default (pgvector)

No configuration needed! Just set your JWT secret:

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET
```

Then start with Docker:

```bash
docker-compose up -d
```

### Optional: Use Pinecone Instead

If you prefer Pinecone for production:

1. Edit `.env`:
```bash
VECTOR_STORE=pinecone
PINECONE_API_KEY=your-api-key
PINECONE_INDEX_NAME=pacore-conversations
```

2. Create a Pinecone index:
   - Dimensions: 1536
   - Metric: cosine
   - Name: pacore-conversations

3. Start services:
```bash
docker-compose up -d
```

## Migration Path

### From Pinecone to pgvector

1. Stop your services
2. Update `.env`: `VECTOR_STORE=pgvector`
3. Run database migrations (they'll create the pgvector tables)
4. Restart services

Note: Existing Pinecone data won't be automatically migrated. For a fresh start, just delete old conversations and rebuild the index.

### From pgvector to Pinecone

1. Create Pinecone account and index
2. Update `.env`: `VECTOR_STORE=pinecone` and add API keys
3. Restart services

## Technical Details

### Vector Search Performance

- **pgvector**: 50-200ms query time for ~10K conversations (POC scale)
- **Pinecone**: 20-50ms query time at any scale

For most POCs and small-scale deployments, pgvector is more than sufficient.

### Embedding Generation

Currently, both implementations use placeholder embeddings (TODO in code). To use real embeddings:

1. Add OpenAI embeddings API call
2. Or use a local embedding model (sentence-transformers)
3. Update `generateEmbeddings()` method in both vector stores

Example with OpenAI:

```typescript
private async generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-ada-002',
      input: texts,
    }),
  });

  const data = await response.json();
  return data.data.map(item => item.embedding);
}
```

## Files Modified

- `packages/cloud/migrations/001_initial_schema.sql` - Added pgvector extension and embeddings table
- `packages/cloud/src/memory/pgvector-store.ts` - New pgvector implementation
- `packages/cloud/src/memory/memory-manager.ts` - Support both vector stores
- `packages/cloud/src/memory/index.ts` - Export PgVectorStore
- `packages/cloud/src/index.ts` - Vector store selection logic
- `.env.example` - Added VECTOR_STORE configuration
- `packages/cloud/.env.example` - Added VECTOR_STORE configuration
- `docker-compose.yml` - Updated to pgvector/pgvector image
- `README.md` - Updated prerequisites and setup
- `GETTING_STARTED.md` - Simplified setup instructions

## Questions?

- **Q: Can I switch between pgvector and Pinecone?**
  A: Yes! Just change the `VECTOR_STORE` env var and restart.

- **Q: Will my existing data work?**
  A: Each vector store is independent. Switching will start fresh.

- **Q: Which should I use for production?**
  A: Start with pgvector. Migrate to Pinecone if you need better performance at scale (100K+ users).

- **Q: Do I need to do anything special for pgvector?**
  A: Nope! It's the default and works out of the box with Docker.
