# PA Core - AI Orchestrator

A unified AI integration platform with persistent conversation memory that enables seamless access to multiple AI tools (Claude, OpenAI, custom endpoints) with both cloud and on-premise deployment options.

## Features

### Core AI Capabilities
- **Multi-LLM Support**: Integrate Claude, OpenAI, custom endpoints, and local models (Ollama)
- **Persistent Memory**: Vector-based semantic search across all conversations
- **Streaming Support**: Real-time streaming responses for all providers
- **Smart Routing**: Intelligent provider selection based on query type and user preferences

### Workflow Automation (NEW)
- **AI-Driven Workflow Generation**: Automatically detect workflow intent from conversations
- **MCP Integration**: Connect to Model Context Protocol servers for data access
- **Visual Workflow Builder**: DAG-based workflows with multiple node types
- **Automatic Execution**: Build and run workflows from natural language
- **Workflow Refinement**: AI-powered workflow optimization based on feedback

### Architecture
- **Hybrid Deployment**: Cloud-based with optional on-premise agent for firewall environments
- **Flexible Configuration**: Users can bring their own LLM API keys or use provided services
- **Client SDK**: Easy-to-use TypeScript/JavaScript SDK
- **Docker Support**: Complete containerized deployment

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Cloud Infrastructure                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │   API    │  │  Memory  │  │  Vector  │  │Workflow │ │
│  │ Gateway  │  │ Manager  │  │   Store  │  │ Engine  │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │        LLM Adapter Layer                          │   │
│  │  [Claude] [OpenAI] [Custom] [Ollama]             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │        MCP Integration Layer                      │   │
│  │  Connect to external data sources & tools         │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
                      │
            WebSocket Connection
                      │
┌──────────────────────────────────────────────────────────┐
│          On-Premise Agent (Optional)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Local LLM│  │   File   │  │   Tools  │              │
│  │ (Ollama) │  │  Access  │  │          │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└──────────────────────────────────────────────────────────┘
```

## Project Structure

```
pacore/
├── packages/
│   ├── core/              # Core types and LLM registry
│   ├── adapters/          # LLM provider implementations
│   ├── cloud/             # Cloud orchestration service
│   ├── agent/             # On-premise agent
│   └── sdk/               # Client SDK
├── docker-compose.yml     # Docker orchestration
└── README.md
```

## Quick Start

### 1. Prerequisites

- Node.js 18+
- pnpm 8+ (install with `npm install -g pnpm` or `corepack enable`)
- Docker & Docker Compose (for containerized deployment)
- PostgreSQL with pgvector (included in Docker setup)
- Optional: Pinecone account (if you prefer Pinecone over pgvector)

### 2. Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd pacore

# Install pnpm if you haven't already
npm install -g pnpm

# Install dependencies
pnpm install

# Build all packages
pnpm run build
```

### 3. Configuration

```bash
# Copy environment example
cp .env.example .env

# Edit .env with your settings
# - Set JWT secret (required)
# - VECTOR_STORE defaults to 'pgvector' (no external dependencies!)
# - Optional: Set to 'pinecone' and add Pinecone API key if you prefer
```

### 4. Start with Docker

```bash
# Start core services (API, PostgreSQL, Redis)
docker-compose up -d

# Start with Ollama for local LLM
docker-compose --profile with-ollama up -d

# Start with on-premise agent
docker-compose --profile with-agent up -d
```

### 5. Start Development Mode (without Docker)

```bash
# Terminal 1: Start PostgreSQL and Redis
docker-compose up postgres redis

# Terminal 2: Start cloud service
pnpm run dev --filter=@pacore/cloud

# Terminal 3 (optional): Start agent
pnpm run dev --filter=@pacore/agent
```

## Usage

### Basic AI Conversations

```typescript
import { PACoreClient } from '@pacore/sdk';

// Initialize client
const client = new PACoreClient({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:3000'
});

// Configure your own LLM provider
await client.configureProvider('anthropic', {
  apiKey: 'your-anthropic-api-key',
});

// Send a message
const response = await client.complete([
  { role: 'user', content: 'Hello, how are you?' }
]);

console.log(response.response);

// Workflow intent is automatically detected
if (response.workflowIntent?.detected) {
  console.log('Workflow opportunity:', response.workflowIntent.description);
  console.log('Confidence:', response.workflowIntent.confidence);
}

// Search conversation history
const context = await client.searchMemory('previous discussion about...');

// Stream responses
for await (const chunk of client.streamComplete([
  { role: 'user', content: 'Tell me a story' }
])) {
  process.stdout.write(chunk.content || '');
}
```

### Workflow Automation

```typescript
// 1. Register an MCP server (data source)
const mcpServer = await fetch('http://localhost:3000/v1/mcp/servers', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Legal Database',
    serverType: 'cloud',
    protocol: 'http',
    connectionConfig: {
      url: 'https://api.legal-db.com',
      apiKey: 'your-mcp-api-key'
    },
    categories: ['legal', 'work']
  })
});

// 2. AI automatically builds workflow from natural language
const workflow = await fetch('http://localhost:3000/v1/workflows/build', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: 'Fetch recent legal cases from last week and email me a summary',
    category: 'legal',
    execute: false  // Build without executing
  })
});

console.log('Generated workflow:', workflow.workflow);
// Workflow includes:
// - mcp_fetch node: Get data from Legal Database
// - transform node: Summarize using LLM
// - action node: Send email

// 3. Execute the workflow
const execution = await fetch(`http://localhost:3000/v1/workflows/${workflow.workflow.id}/execute`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` }
});

console.log('Execution status:', execution.status);
console.log('Result:', execution.result);

// 4. Refine workflow based on feedback
const refined = await fetch(`http://localhost:3000/v1/workflows/${workflow.workflow.id}/refine`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    feedback: 'Only include cases with high priority'
  })
});
```

### On-Premise Agent

```bash
# Install agent CLI globally
pnpm install -g @pacore/agent

# Initialize agent configuration
pacore-agent init --token YOUR_AGENT_TOKEN --cloud-url https://api.pacore.io

# Start agent
pacore-agent start

# Check status
pacore-agent status
```

## API Endpoints

### Authentication
All requests require a Bearer token in the Authorization header:
```
Authorization: Bearer YOUR_API_KEY
```

### Endpoints

#### Core AI Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/complete` | Complete a conversation (auto-detects workflow intent) |
| POST | `/v1/providers/:id/configure` | Configure LLM provider |
| GET | `/v1/providers` | List available providers |
| POST | `/v1/memory/search` | Search conversation history |
| GET | `/v1/conversations` | Get conversation history |
| DELETE | `/v1/conversations/:id` | Delete a conversation |

#### MCP (Model Context Protocol) Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/mcp/servers` | Register an MCP server |
| GET | `/v1/mcp/servers` | List user's MCP servers |
| GET | `/v1/mcp/servers/:id` | Get MCP server details |
| PUT | `/v1/mcp/servers/:id` | Update MCP server |
| DELETE | `/v1/mcp/servers/:id` | Delete MCP server |
| POST | `/v1/mcp/servers/:id/test` | Test MCP connection |
| GET | `/v1/mcp/servers/:id/capabilities` | Get server capabilities |

#### Workflow Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/workflows` | Create a workflow |
| GET | `/v1/workflows` | List user's workflows |
| GET | `/v1/workflows/:id` | Get workflow details |
| PUT | `/v1/workflows/:id` | Update workflow |
| DELETE | `/v1/workflows/:id` | Delete workflow |
| POST | `/v1/workflows/:id/execute` | Execute a workflow |
| GET | `/v1/workflows/:id/executions` | List workflow executions |
| POST | `/v1/workflows/:id/refine` | Refine workflow with AI |

#### AI Workflow Builder Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/workflows/detect-intent` | Detect workflow intent from text |
| POST | `/v1/workflows/suggest` | Suggest similar workflows |
| POST | `/v1/workflows/build` | Build workflow from natural language |
| GET | `/v1/executions` | List all executions |
| GET | `/v1/executions/:id` | Get execution details |

### Example Request

```bash
curl -X POST http://localhost:3000/v1/complete \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "options": {
      "providerId": "anthropic",
      "temperature": 0.7
    }
  }'
```

## Supported LLM Providers

### Cloud Providers
- **Anthropic Claude** - Latest Claude models (Sonnet, Opus, Haiku)
- **OpenAI** - GPT-4, GPT-3.5-turbo and variants
- **Custom Endpoint** - Any OpenAI-compatible API

### On-Premise Providers
- **Ollama** - Local LLM execution (Llama 2, Mistral, etc.)
- **LM Studio** - Coming soon

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://pacore:password@localhost:5432/pacore

# Redis
REDIS_URL=redis://localhost:6379

# Vector Database
PINECONE_API_KEY=your-key
PINECONE_INDEX_NAME=pacore-conversations

# Security
JWT_SECRET=your-secret

# Server
PORT=3000
NODE_ENV=production
```

### User Provider Configuration

Users can configure their own LLM providers:

```typescript
await client.configureProvider('anthropic', {
  apiKey: 'sk-ant-...',
  model: 'claude-3-opus-20240229'
});

await client.configureProvider('openai', {
  apiKey: 'sk-...',
  model: 'gpt-4-turbo-preview'
});

await client.configureProvider('custom-endpoint', {
  endpoint: 'https://my-company-llm.com/v1/chat',
  apiKey: 'custom-key',
  customHeaders: {
    'X-Custom-Header': 'value'
  }
});
```

## Development

### Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run development mode
pnpm run dev

# Run linting
pnpm run lint

# Format code
pnpm run format

# Type checking
pnpm run typecheck

# Clean build artifacts
pnpm run clean
```

### Package Scripts

Each package has its own scripts:

```bash
# Build specific package
pnpm run build --filter=@pacore/core

# Watch mode for development
pnpm run dev --filter=@pacore/cloud

# Run tests (when added)
pnpm run test --filter=@pacore/adapters
```

## Deployment

### Docker Production Deployment

```bash
# Build production images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Environment-specific Deployment

```bash
# Development
NODE_ENV=development docker-compose up

# Staging
NODE_ENV=staging docker-compose -f docker-compose.staging.yml up

# Production
NODE_ENV=production docker-compose -f docker-compose.prod.yml up
```

## Security Considerations

1. **API Keys**: All user API keys are encrypted at rest
2. **JWT Tokens**: Use strong secrets in production
3. **CORS**: Configure allowed origins appropriately
4. **Rate Limiting**: Implement rate limiting for production
5. **On-Premise Agent**: File access is restricted by configuration
6. **Database**: Use SSL connections in production

## Monitoring & Logging

- All requests are logged with timestamps
- Usage tracking for token consumption
- Health check endpoint: `/health`
- WebSocket connection monitoring

## Roadmap

### Completed ✅
- [x] Multi-LLM support (Claude, OpenAI, Ollama, Custom)
- [x] Persistent conversation memory with vector search
- [x] MCP (Model Context Protocol) integration
- [x] AI-driven workflow generation from natural language
- [x] DAG-based workflow execution engine
- [x] Workflow refinement and suggestions
- [x] Auto-classification and tagging
- [x] Streaming support for all providers
- [x] Docker containerization

### In Progress 🚧
- [ ] Workflow scheduling (cron-based recurring workflows)
- [ ] MCP WebSocket and stdio protocol support
- [ ] Credential encryption for MCP servers

### Planned 📋
- [ ] Web UI dashboard with visual workflow builder
- [ ] Multi-tenancy support
- [ ] Advanced analytics and cost tracking
- [ ] More LLM providers (Azure OpenAI, Cohere, etc.)
- [ ] Enhanced security features
- [ ] Rate limiting & quotas
- [ ] Webhook integrations
- [ ] Workflow templates library
- [ ] Parallel workflow execution

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

[Your License Here]

## Support

For issues and questions:
- GitHub Issues: [your-repo]/issues
- Documentation: [your-docs-url]
- Email: [your-support-email]
