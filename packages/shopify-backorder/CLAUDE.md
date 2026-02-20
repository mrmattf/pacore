# Shopify Backorder Service

## AI Agent Guidelines

**Keep documentation lean and current:**
1. **Add new ADRs** when making architectural decisions - don't modify old ones
2. **Update patterns.md** when establishing new code patterns
3. **Update mvp-status.md** when completing features or changing phase
4. **Update work-breakdown.md** when tasks complete or new ones identified

**Avoid context duplication:**
- This file is the entry point - keep it as quick reference only
- Detailed info lives in `/docs/` - link to it, don't repeat it
- Code is the source of truth - comments explain "why", not "what"
- Don't duplicate info already in root [CLAUDE.md](../../CLAUDE.md)

**When to skip documentation:**
- Minor bug fixes that don't change patterns
- Refactoring that doesn't change architecture
- Debugging steps or failed experiments

---

## Overview

This is a standalone microservice that automatically detects backorder conditions on Shopify orders and creates support tickets in Gorgias to notify customers. It exposes MCP (Model Context Protocol) tools for AI agent integration.

## Quick Reference

- **Language**: TypeScript (Node.js 18+)
- **Framework**: Express.js
- **Deployment**: Railway (Docker)
- **Port**: 3002 (configurable via PORT env)
- **Build**: `npm run build` / `npm run dev`

## Architecture

```
src/
├── index.ts           # Express server, routes, middleware
├── config.ts          # Zod-validated configuration
├── logger.ts          # Structured JSON logging + Slack alerts
├── clients/
│   ├── shopify.ts     # Shopify Admin API client
│   └── gorgias.ts     # Gorgias REST API client
├── mcp/
│   ├── server.ts      # MCP server with JSON-RPC + REST endpoints
│   └── tools/
│       ├── shopify-tools.ts  # shopify.get_order, shopify.check_inventory
│       └── gorgias-tools.ts  # gorgias.create_ticket, gorgias.add_message
├── chains/
│   └── backorder-chain.ts   # Deterministic tool chain for backorder processing
└── handler/
    └── backorder.ts   # Webhook handler (calls tool chain)
```

### Tool Chain Pattern

This package uses the **agent-first architecture** from PA Core:
- **Tool chains** provide deterministic execution (code decides HOW)
- **AI agents** (Phase 2) decide WHEN to invoke tool chains
- **MCP tools** are the building blocks called by tool chains

```
Event → Handler → Tool Chain → MCP Tools → Result
                     ↓
           processBackorder()
           ├── shopify.get_order
           ├── shopify.check_inventory
           └── gorgias.create_ticket
```

## Key Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health` | None | Health check, lists MCP tools |
| `POST /webhook/orders/create` | HMAC | Shopify webhook receiver |
| `POST /trigger/:orderId` | API Key | Manual order check |
| `POST /mcp/tools/call` | API Key | MCP tool invocation |
| `GET /mcp/tools/list` | API Key | List available MCP tools |

## Authentication

1. **Shopify Webhooks**: HMAC-SHA256 signature verification via `X-Shopify-Hmac-Sha256` header
2. **API Endpoints**: Bearer token in `Authorization` header, validated against `API_SECRET`

## Documentation

See [docs/](./docs/) for detailed documentation:

- [Architecture](./docs/architecture.md) - System design and data flow
- [Patterns](./docs/patterns.md) - Code patterns and conventions
- [MVP Status](./docs/mvp-status.md) - Current state and goals
- [Work Breakdown](./docs/work-breakdown.md) - Remaining tasks
- [Decisions](./docs/decisions/) - Architecture Decision Records (ADRs)

## Environment Variables

Required:
- `API_SECRET` - API key for protected endpoints (min 16 chars)
- `SHOPIFY_STORE_DOMAIN` - e.g., `store.myshopify.com`
- `SHOPIFY_ACCESS_TOKEN` - Admin API access token
- `GORGIAS_DOMAIN` - e.g., `company.gorgias.com`
- `GORGIAS_API_KEY` - Gorgias API key
- `GORGIAS_API_EMAIL` - Email for Gorgias auth and sender

Optional:
- `PORT` - Server port (default: 3002)
- `SHOPIFY_WEBHOOK_SECRET` - For webhook signature verification
- `SLACK_WEBHOOK_URL` - For alert notifications

## Common Tasks

### Adding a new MCP tool

1. Define tool schema in `src/mcp/tools/<service>-tools.ts`
2. Add tool to the tools array
3. Implement handler in the executor function
4. Tool auto-registers via MCPServer

### Modifying backorder logic

Edit `src/handler/backorder.ts` - this contains the core detection logic that determines when to create tickets.

### Changing email templates

The ticket message is built in `src/handler/backorder.ts` in the `handleBackorderCheck` function.

## Testing Locally

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Test health endpoint
curl http://localhost:3002/health

# Test MCP tool (with API key)
curl -X POST http://localhost:3002/mcp/tools/call \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tool": "shopify.get_order", "arguments": {"order_id": 123}}'
```

## Deployment

This package is standalone (no workspace dependencies) and deploys via Docker:

```bash
docker build -t shopify-backorder .
docker run -p 3002:3002 --env-file .env shopify-backorder
```

For Railway: Push to connected repo, ensure environment variables are set.

## Ownership

**This is a customer engagement solution for Yota Xpedition.**

- **Customer owns**: This specific solution (per licensing agreement)
- **We gain**: Infrastructure know-how, Shopify/Gorgias integration patterns
- **Platform Skill**: A separate "Backorder Detection" Skill will be built into PA Core (clean-room)

See [Product Strategy](../../docs/product-strategy.md) for the distinction between customer engagements and platform solutions.

## Phase Roadmap

### Phase 1: Standalone MVP (Current)
- Express service with MCP tools and tool chains
- Webhook processing + backorder detection
- Deployed independently to Railway
- **Exit**: Customer validates value proposition

### Phase 2: AI Agent Layer
- Add Claude agent for intelligent decisions
- Agent decides WHEN to call tool chains
- Tool chains execute HOW (deterministic)
- Agent reasons about: urgency, customer history, special handling
- **Exit**: Agent handles edge cases that pure logic can't

### Phase 3: Skill Packaging
- "Backorder Detection" as packaged Skill (for PA Core platform)
- Configurable for any Shopify store
- Swappable notification system (Gorgias, Zendesk, email)
- **Exit**: Skill ready for multi-tenant deployment

**Note**: This Yota solution remains standalone. Phase 3 applies to the PA Core platform Skill, built separately using patterns learned here.

See [Product Strategy](../../docs/product-strategy.md) for full lifecycle details.
