# Getting Started with PA Core

This guide will help you get PA Core up and running quickly.

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18 or higher ([download](https://nodejs.org/))
- **pnpm** 8 or higher (install with `npm install -g pnpm` or `corepack enable`)
- **Docker** and **Docker Compose** ([download](https://www.docker.com/))

## Installation

### Step 1: Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd pacore

# Install pnpm if you haven't already
npm install -g pnpm
# OR enable corepack (built into Node.js 16+)
corepack enable

# Install all dependencies
pnpm install

# Build all packages
pnpm run build
```

This will install dependencies for all packages in the monorepo and build them.

### Step 2: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your favorite editor
nano .env
```

Update these critical values in `.env`:

```bash
# Required: Strong secret for JWT tokens (generate a random string)
JWT_SECRET=your-very-secure-secret-key-minimum-32-characters

# Vector Storage (defaults to pgvector - no setup needed!)
VECTOR_STORE=pgvector

# Optional: Change database password
DB_PASSWORD=your-secure-password

# Optional: Use Pinecone instead of pgvector
# Uncomment and set these if you want to use Pinecone:
# VECTOR_STORE=pinecone
# PINECONE_API_KEY=your-actual-pinecone-api-key-here
# PINECONE_INDEX_NAME=pacore-conversations
```

**Note:** By default, PA Core uses **pgvector** for vector storage, which runs inside PostgreSQL - no external services needed! This makes setup much simpler for POCs and development.

## Running PA Core

You have two options: Docker (recommended) or local development.

### Option A: Using Docker (Recommended)

This is the easiest way to get started. Docker Compose will start all services:

```bash
# Start all core services (API, PostgreSQL, Redis)
docker-compose up -d

# View logs
docker-compose logs -f api

# Check status
docker-compose ps
```

The API will be available at `http://localhost:3000`.

#### With Local LLM (Ollama)

If you want to run LLMs locally:

```bash
# Start with Ollama
docker-compose --profile with-ollama up -d

# Pull a model (after Ollama starts)
docker exec pacore-ollama ollama pull llama2

# Check available models
docker exec pacore-ollama ollama list
```

### Option B: Local Development

For development without Docker:

```bash
# Terminal 1: Start databases with Docker
docker-compose up postgres redis

# Terminal 2: Start the cloud service
pnpm run dev --filter=@pacore/cloud

# Terminal 3 (optional): Start the agent
pnpm run dev --filter=@pacore/agent
```

## First API Request

### 1. Get an API Token

For now, you'll need to manually create a JWT token. In production, you'd have a user signup/login flow.

Create a simple script `generate-token.js`:

```javascript
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  { id: 'user-123', email: 'test@example.com' },
  process.env.JWT_SECRET || 'your-secret-from-env',
  { expiresIn: '30d' }
);

console.log('Your API Token:');
console.log(token);
```

Run it:

```bash
node generate-token.js
```

Save the output token for the next steps.

### 2. Configure an LLM Provider

First, configure your preferred LLM provider with your API key:

```bash
curl -X POST http://localhost:3000/v1/providers/anthropic/configure \
  -H "Authorization: Bearer YOUR_TOKEN_FROM_ABOVE" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk-ant-your-anthropic-api-key",
    "model": "claude-3-5-sonnet-20241022"
  }'
```

Or for OpenAI:

```bash
curl -X POST http://localhost:3000/v1/providers/openai/configure \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk-your-openai-api-key",
    "model": "gpt-4-turbo-preview"
  }'
```

### 3. Send Your First Message

```bash
curl -X POST http://localhost:3000/v1/complete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello! What can you help me with?"}
    ]
  }'
```

You should get a response like:

```json
{
  "response": "Hello! I'm an AI assistant...",
  "provider": "anthropic",
  "usage": {
    "promptTokens": 15,
    "completionTokens": 50,
    "totalTokens": 65
  },
  "contextUsed": []
}
```

### 4. Send a Follow-up (with Memory)

```bash
curl -X POST http://localhost:3000/v1/complete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What did we just talk about?"}
    ]
  }'
```

PA Core will automatically find relevant context from your previous conversation!

## Using the SDK

For application integration, use the SDK:

```bash
pnpm add @pacore/sdk
# or if installing in a non-workspace project
npm install @pacore/sdk
```

Example usage:

```typescript
import { PACoreClient } from '@pacore/sdk';

// Initialize
const client = new PACoreClient({
  apiKey: 'YOUR_API_TOKEN',
  baseUrl: 'http://localhost:3000'
});

// Configure provider (one-time setup per user)
await client.configureProvider('anthropic', {
  apiKey: 'sk-ant-...'
});

// Send messages
const response = await client.complete([
  { role: 'user', content: 'Hello!' }
]);

console.log(response.response);

// Search memory
const context = await client.searchMemory('what we discussed about...');
console.log(context);

// Stream responses
for await (const chunk of client.streamComplete([
  { role: 'user', content: 'Tell me a story' }
])) {
  process.stdout.write(chunk.content || '');
}
```

## Setting Up On-Premise Agent

If you need to run LLMs behind a firewall:

### 1. Install Ollama

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows - download from ollama.ai
```

Start Ollama and pull a model:

```bash
ollama serve  # Start the Ollama server
ollama pull llama2  # Download a model
```

### 2. Configure and Start Agent

```bash
# Install agent CLI
pnpm install -g @pacore/agent

# Initialize configuration
pacore-agent init \
  --token "your-agent-token" \
  --cloud-url "http://localhost:3000" \
  --ollama-url "http://localhost:11434"

# Start the agent
pacore-agent start
```

### 3. Use Local LLM

```bash
curl -X POST http://localhost:3000/v1/complete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "options": {
      "providerId": "ollama",
      "model": "llama2"
    }
  }'
```

## Common Tasks

### List Available Providers

```bash
curl http://localhost:3000/v1/providers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### View Conversation History

```bash
curl http://localhost:3000/v1/conversations \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Delete a Conversation

```bash
curl -X DELETE http://localhost:3000/v1/conversations/CONVERSATION_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Health Check

```bash
curl http://localhost:3000/health
```

## Troubleshooting

### Port Already in Use

If port 3000 is already in use:

```bash
# Edit .env
PORT=3001

# Or use docker-compose override
docker-compose -f docker-compose.yml up
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Pinecone Connection Issues

- Verify your API key is correct
- Check index name matches
- Ensure index dimensions are 1536
- Check Pinecone dashboard for quota limits

### "Provider not configured" Error

You need to configure the provider first:

```bash
curl -X POST http://localhost:3000/v1/providers/anthropic/configure \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "sk-ant-..."}'
```

## Next Steps

Now that you have PA Core running:

1. **Explore the API** - Try different providers and options
2. **Build an Application** - Use the SDK to integrate into your app
3. **Set Up Memory** - Test the conversation memory features
4. **Deploy to Production** - See deployment docs for cloud hosting
5. **Customize Providers** - Add custom LLM endpoints

## Additional Resources

- [Architecture Documentation](./ARCHITECTURE.md)
- [API Reference](./docs/api-reference.md) (coming soon)
- [Deployment Guide](./docs/deployment.md) (coming soon)
- [Contributing Guide](./CONTRIBUTING.md) (coming soon)

## Getting Help

- **Issues**: Open an issue on GitHub
- **Discussions**: Join our community forum
- **Email**: [support email]

Enjoy using PA Core! 🚀
