# PA Core Quick Start Guide

Your AI orchestrator is now running! 🎉

## What's Running

- **PostgreSQL** (pgvector): `localhost:5432` - Database with vector search
- **Redis**: `localhost:6379` - Caching and sessions
- **API Gateway**: `localhost:3000` - REST API with authentication

## Quick Test

Run the test script to verify everything works:

```bash
node test-api.js
```

This will:
- ✅ Create a test user
- ✅ Login and get a JWT token
- ✅ Test all major endpoints

## API Endpoints

### Authentication (No token required)

**Register a new user:**
```bash
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"SecurePass123!","name":"Your Name"}'
```

**Login:**
```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"SecurePass123!"}'
```

Response includes a `token` - use this for all other requests!

### Protected Endpoints (Require Authorization header)

**Get current user:**
```bash
curl http://localhost:3000/v1/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**List available LLM providers:**
```bash
curl http://localhost:3000/v1/providers \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Get conversations:**
```bash
curl http://localhost:3000/v1/conversations \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Configure a provider (example with Anthropic):**
```bash
curl -X POST http://localhost:3000/v1/providers/anthropic/configure \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"your-anthropic-api-key"}'
```

**Send a message to an LLM:**
```bash
curl -X POST http://localhost:3000/v1/complete \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "options": {
      "provider": "anthropic"
    }
  }'
```

**Search conversation history:**
```bash
curl -X POST http://localhost:3000/v1/memory/search \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"query":"your search query"}'
```

## Docker Commands

**View logs:**
```bash
docker-compose logs -f api
```

**Restart services:**
```bash
docker-compose restart
```

**Stop all services:**
```bash
docker-compose down
```

**Stop and remove all data:**
```bash
docker-compose down -v
```

**Rebuild after code changes:**
```bash
pnpm run build
docker-compose build api
docker-compose up -d --force-recreate api
```

## Development Workflow

### Option 1: Full Docker (Current)
Everything runs in Docker containers.

### Option 2: Local API Development
Run database services in Docker, API locally:

```bash
# Stop API container
docker-compose stop api

# Run API locally with hot reload
cd packages/cloud
pnpm run dev
```

This is faster for development as you get instant hot-reload.

## Environment Variables

Edit `.env` file to configure:

```bash
# Database (already configured)
DATABASE_URL=postgresql://pacore:pacore123@localhost:5432/pacore

# Your secure JWT secret (already set)
JWT_SECRET=...

# Add LLM API keys (optional)
ANTHROPIC_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here

# CORS origins (for frontend)
CORS_ORIGINS=http://localhost:3001,http://localhost:3000
```

## Next Steps

1. **Add LLM API Keys**: Update `.env` with your Anthropic or OpenAI keys
2. **Test LLM Integration**: Use the `/v1/complete` endpoint to chat
3. **Build a Frontend**: Use the SDK (`@pacore/sdk`) to create a UI
4. **Implement Real Embeddings**: Update `packages/cloud/src/memory/pgvector-store.ts` line 82
5. **Enable On-Premise Agent**: Run `docker-compose --profile with-agent up -d`

## Need Help?

- Check logs: `docker-compose logs api`
- Test health: `curl http://localhost:3000/health`
- Run tests: `node test-api.js`
- View this guide: `cat QUICK_START.md`

## Architecture

- **Core**: Type definitions and LLM provider registry
- **Adapters**: Implementations for Anthropic, OpenAI, Ollama, custom endpoints
- **Cloud**: API Gateway, memory manager, orchestrator
- **SDK**: Client library for building applications
- **Agent**: On-premise agent for running behind firewalls (optional)

Your conversation history is automatically stored in PostgreSQL with pgvector for semantic search!
