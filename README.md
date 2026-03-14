# PA Core - AI Orchestration Platform

A personal AI assistant platform that orchestrates multiple LLM providers, MCP servers, and automated skills. Designed for both individual users and enterprise deployment.

## Documentation

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](CLAUDE.md) | Project overview for AI assistants (Claude Code) |
| [API.md](API.md) | Complete API reference and design conventions |
| [docs/SESSION_LOG.md](docs/SESSION_LOG.md) | Development session tracking |
| [docs/product-strategy.md](docs/product-strategy.md) | Vision, architecture, business model |
| [docs/decisions/](docs/decisions/) | Architecture Decision Records |
| [docs/solutions/README.md](docs/solutions/README.md) | Active skills and solution index |

## Features

### Skills Platform
- **4 Production Skill Types**: backorder-notification, low-stock-impact, high-risk-order-response, delivery-exception-alert
- **Webhook-Driven**: Shopify webhooks trigger deterministic tool chains
- **Multi-Adapter Output**: Gorgias, Zendesk, Re:amaze, Slack — one skill, many outputs
- **Template Customization**: Per-skill editable message fields with template variable chips
- **Escalation Routing**: Optional escalation slot for high-priority events
- **Execution History**: Per-skill execution log with idempotency deduplication

### Core AI Capabilities
- **Multi-LLM Support**: Claude, OpenAI, Ollama (local models), custom endpoints
- **MCP Integration**: Connect to Model Context Protocol servers for tool access
- **Streaming Support**: Real-time streaming responses for all providers
- **Agent-First Architecture**: Agents decide when to act; tool chains handle deterministic execution

### Platform
- **Hybrid Deployment**: Cloud-based with optional on-premise Edge Agent
- **BYOK**: Users bring their own LLM API keys or use provided services
- **Credential Manager**: Encrypted per-integration credential storage
- **Client SDK**: TypeScript/JavaScript SDK for programmatic access

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Cloud Infrastructure                         │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │   API    │  │    Skill     │  │  Adapter Registry  │  │
│  │ Gateway  │  │  Dispatcher  │  │  (Gorgias/Zendesk) │  │
│  └──────────┘  └──────────────┘  └────────────────────┘  │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │        LLM Adapter Layer                          │    │
│  │  [Claude] [OpenAI] [Custom] [Ollama]             │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │        MCP Integration Layer                      │    │
│  │  Connect to external data sources & tools         │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
                      │
            WebSocket Connection
                      │
┌──────────────────────────────────────────────────────────┐
│          On-Premise Edge Agent (Planned)                  │
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
│   ├── core/              # Shared types and LLM registry
│   ├── cloud/             # Express backend + skills platform
│   ├── web/               # React frontend (Vite + TailwindCSS)
│   ├── agent/             # On-premise edge agent (in progress)
│   ├── adapters/          # LLM provider implementations
│   ├── sdk/               # Client SDK
│   └── shopify-backorder/ # Customer deliverable (Yota) — standalone Railway deploy
├── docker-compose.yml
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+ (`npm install -g pnpm` or `corepack enable`)
- Docker & Docker Compose
- PostgreSQL (included in Docker setup)

### Installation

```bash
git clone <your-repo-url>
cd pacore
pnpm install
pnpm run build
```

### Configuration

```bash
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET, and at least one LLM provider key
```

### Start with Docker

```bash
# Start core services (API + PostgreSQL)
docker-compose up -d

# With Ollama for local LLM
docker-compose --profile with-ollama up -d
```

### Development Mode

```bash
# Terminal 1: Infrastructure
docker-compose up postgres redis

# Terminal 2: Backend
pnpm run dev --filter=@pacore/cloud

# Terminal 3: Frontend
pnpm run dev --filter=@pacore/web
```

## API Overview

See [API.md](API.md) for the full reference and design conventions.

Key endpoint groups:
- `POST /v1/auth/...` — Authentication
- `POST /v1/chat` / `WS /ws` — AI chat
- `GET|POST /v1/skill-types` — Skill catalog
- `GET|POST|PUT /v1/me/skills` — User skill management
- `POST /v1/triggers/webhook/:token` — Inbound webhook entry point
- `GET|POST /v1/mcp/servers` — MCP server management

## Supported LLM Providers

- **Anthropic Claude** — Sonnet, Opus, Haiku
- **OpenAI** — GPT-4 and variants
- **Ollama** — Local LLM execution (Llama, Mistral, etc.)
- **Custom Endpoint** — Any OpenAI-compatible API

## Security

1. All user credentials are encrypted at rest (AES-256-GCM)
2. JWT tokens — use strong secrets in production
3. Webhook tokens are per-skill and single-purpose
4. Configure CORS allowed origins for production

## Roadmap

### Completed
- [x] Multi-provider LLM orchestration
- [x] Skills platform with 4 production skill types
- [x] Integration adapters: Shopify, Gorgias, Zendesk, Re:amaze, Slack, AfterShip
- [x] MCP server registration and tool execution
- [x] Platform reliability: retry, deduplication, escalation routing
- [x] Skill template customization and execution history

### In Progress
- [ ] Edge Agent for local desktop integration

### Planned
- [ ] Agent layer (Tier 2) — LLM-driven decision-making on top of tool chains
- [ ] Chat channel integrations (WhatsApp, Slack)
- [ ] Multi-tenant enterprise features

## License

[Your License Here]
