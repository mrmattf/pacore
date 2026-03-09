# PA Core - AI Orchestration Platform

## Documentation Rules

**For AI Assistants - Keep docs lean:**
1. Update `docs/SESSION_LOG.md` only for: new features, bug fixes, architecture changes
2. Keep entries to 1-2 sentences each
3. Delete session entries older than 5 sessions
4. Create ADRs only for decisions affecting multiple systems
5. Skip: minor fixes, debugging steps, research that led nowhere

**When to write an ADR (proactively, during implementation):**
- New pattern that applies across multiple systems (e.g., retry strategy, rendering strategy)
- Decision that future contributors would otherwise re-debate (e.g., why plain-text not HTML)
- Trade-off with a clear rejected alternative worth preserving
- Checklist: does this touch ≥2 packages AND encode a non-obvious design choice? → write ADR
- ADRs live in `docs/decisions/`, numbered sequentially; update the index in `docs/decisions/README.md`

**Prompts the user can say:**
- "Update session log" → Add current work to SESSION_LOG.md
- "Clean up docs" → Remove stale entries, consolidate
- "Skip docs" → Don't update any documentation this session
- "Write ADR" → Create a new ADR for the current architectural decision

## Project Overview

PA Core is a personal AI assistant platform that orchestrates multiple LLM providers, MCP (Model Context Protocol) servers, and automated workflows. It's designed for both individual users and enterprise deployment.

## Product Strategy

**PA Core is a Personal Assistants platform** - AI-powered assistants that help users automate tasks, manage business operations, and integrate with their tools.

### Agent-First Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CUSTOMER TIERS                                                  │
│  ┌────────┐ ┌────────┐ ┌────────────┐ ┌─────────────────────┐   │
│  │ Tier 1 │ │ Tier 2 │ │ Tier 3     │ │ Tier 4              │   │
│  │ Skills │ │ Compose│ │ Custom Code│ │ Full Agent Mode     │   │
│  │ (use)  │ │ (build)│ │ (AI-gen)   │ │ (autonomous)        │   │
│  └────────┘ └────────┘ └────────────┘ └─────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  PLATFORM INFRASTRUCTURE (Tier 0)                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐  │
│  │ Tool Chains │ │ MCP Tools   │ │ Agent       │ │ Validators│  │
│  │(deterministic)│(integrations)│ │ Runtime     │ │           │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  EXECUTION: Cloud Runtime ◄───────────────► Edge Agent          │
├─────────────────────────────────────────────────────────────────┤
│  INTEGRATIONS: Shopify │ Gorgias │ Gmail │ Slack │ ...          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Concepts

- **Agent-First**: Agents decide WHEN to act, tool chains execute HOW (deterministic)
- **No Workflow Engine**: We don't build a visual workflow builder - tool chains provide determinism
- **Skills**: Portable, reusable capability definitions (like "Backorder Detection")
- **BYOK**: Multi-provider AI support (Claude, OpenAI, Azure, Ollama)
- **Edge Agent**: Local execution for privacy, desktop access, local LLMs
- **Orchestrator Business Model**: We own platform + solution templates; customers own configuration + data. See [Product Strategy](docs/product-strategy.md#business-model-orchestrator) for IP ownership.

### Solution Development Lifecycle

1. **Standalone MVP** - Validate concept, build tool chains and MCP tools
2. **AI Agent Layer** - Add intelligent decision-making
3. **Skill Packaging** - Multi-tenant deployment, customer configuration

See detailed documentation:
- [Product Strategy](docs/product-strategy.md) - Vision, architecture, business model
- [AI Agents](docs/ai-agents.md) - Agent patterns and MCP integration
- [Solutions Index](docs/solutions/README.md) - Available solutions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         PA CORE CLOUD                            │
├─────────────────────────────────────────────────────────────────┤
│  packages/web          │  React frontend (Vite + TypeScript)    │
│  packages/cloud        │  Express backend + WebSocket           │
│  packages/core         │  Shared types and utilities            │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Orchestrator** | `packages/cloud/src/orchestration/` | Routes messages to LLMs, coordinates agent actions |
| **LLM Registry** | `packages/core/src/llm/` | Multi-provider LLM support (Anthropic, OpenAI, Ollama) |
| **MCP Registry** | `packages/cloud/src/mcp/` | Manages MCP server connections and tool execution |
| **Tool Chains** | `packages/*/src/chains/` | Deterministic execution functions for Skills |
| **API Gateway** | `packages/cloud/src/api/gateway.ts` | REST + WebSocket endpoints |
| **Credential Manager** | `packages/cloud/src/mcp/credential-manager.ts` | Encrypted credential storage |

### Data Flow

```
Skills (primary):
Webhook → API Gateway → SkillDispatcher → Tool Chain → AdapterRegistry → SlotAdapter

Chat (secondary):
User Message → API Gateway → Orchestrator → LLM Provider → Response
```

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, TailwindCSS
- **Backend:** Node.js, Express, WebSocket (ws), PostgreSQL
- **AI:** Anthropic Claude, OpenAI GPT, Ollama (local models)
- **Protocol:** MCP (Model Context Protocol) for tool integration

## Current Feature State

### Completed
- [x] Multi-provider LLM orchestration (Anthropic, OpenAI, Ollama)
- [x] MCP server registration and tool execution
- [x] Credential management with encryption
- [x] Skills platform: 4 skill types (backorder-notification, low-stock-impact, high-risk-order-response, delivery-exception-alert)
- [x] Integration adapters: Shopify, Gorgias, Zendesk, Re:amaze, Slack, AfterShip
- [x] Platform reliability: retry (AdapterRegistry), deduplication (idempotency key), escalation routing
- [x] Skill template customization: editable intro/body/closing/subject, templateVariables chips
- [x] Execution history: API endpoints + per-skill view in BillingPage

### In Progress
- [ ] Edge agent for local desktop integration

### Planned
- [ ] Agent layer for Tier 2 skills (LLM-driven decision-making on top of tool chains)
- [ ] Chat channel integrations (WhatsApp, Telegram, Slack)
- [ ] Voice interface
- [ ] Multi-tenant enterprise features

## Key Files

### Backend (packages/cloud)
- `src/api/gateway.ts` - All REST endpoints and webhook entry points
- `src/skills/skill-dispatcher.ts` - Routes webhook events to skill tool chains
- `src/skills/skill-template-registry.ts` - Skill catalog and template registry
- `src/integrations/adapter-registry.ts` - Central dispatch for all integration adapters (with retry)
- `src/skills/execute-escalation.ts` - Shared escalation action handler
- `src/utils/retry.ts` - Exponential backoff retry utility
- `src/mcp/credential-manager.ts` - Encrypted credential storage
- `src/mcp/mcp-registry.ts` - MCP server management
- `src/orchestration/index.ts` - LLM orchestration (chat/agent mode)

### Frontend (packages/web)
- `src/pages/ChatPage.tsx` - Main chat interface
- `src/pages/SkillsPage.tsx` - Browse and activate skills
- `src/pages/SkillConfigPage.tsx` - Configure slot connections + field overrides
- `src/pages/TemplatePickerPage.tsx` - Template picker for a skill type
- `src/pages/BillingPage.tsx` - Usage and execution history

### Shared (packages/core)
- `src/types/policy.ts` - ECA action types (invoke, skip, escalate + targetSlot)
- `src/types/skill-template.ts` - SkillTemplate, SkillSlot, EditableField interfaces
- `src/types/skill.ts` - UserSkill, SkillDefinition
- `src/llm/` - LLM provider interfaces and registry

### Standalone Services
- **packages/shopify-backorder/** - Customer integration service (has its own [CLAUDE.md](packages/shopify-backorder/CLAUDE.md))
  - Shopify order webhook processing
  - Backorder detection with inventory checks
  - Gorgias ticket creation
  - MCP tools for AI agent integration
  - Deploys independently to Railway

## Database Schema

```sql
-- Identity
users (id, email, password_hash)
organizations (id, name)
org_members (org_id, user_id, role)

-- MCP
mcp_servers (id, user_id, name, server_type, url, capabilities JSONB)
mcp_credentials (user_id, server_id, encrypted_value, iv, auth_tag)

-- Integrations
integration_connections (id, org_id, integration_key, name, encrypted_creds, iv, auth_tag)

-- Skills
user_skills (id, user_id, template_id, status, configuration JSONB)
skill_triggers (id, user_skill_id, type, webhook_token)
skill_executions (id, user_skill_id, status, result JSONB, idempotency_key TEXT)

-- Auth
refresh_tokens (token_hash, user_id, expires_at, idle_expires_at)

-- Legacy
workflows (id, user_id, name, description, category, nodes JSONB)
workflow_executions (id, workflow_id, user_id, status, execution_log JSONB)
```

## API Endpoints

### Chat
- `POST /v1/chat` - Send message, get AI response
- `WS /ws` - Real-time chat via WebSocket

### MCP Servers
- `GET /v1/mcp/servers` - List MCP servers
- `POST /v1/mcp/servers` - Register MCP server
- `GET /v1/mcp/servers/:id/tools` - Get server's tools
- `POST /v1/mcp/servers/:id/execute` - Execute tool

### Skills
- `GET /v1/skill-types` - List available skill types with template counts
- `GET /v1/skill-types/:typeId/templates` - Templates for a skill type
- `GET /v1/me/skills` - User's activated skills
- `POST /v1/me/skills/:typeId/activate` - Activate a skill (creates user_skill record)
- `PUT /v1/me/skills/:id/configure` - Save slot connections + field overrides
- `PUT /v1/me/skills/:id/pause` / `resume` - Pause / resume a skill
- `DELETE /v1/me/skills/:id` - Remove skill
- `GET /v1/me/skills/:id/executions` - Recent execution history

### Integrations & Webhooks
- `GET /v1/integrations/:key/fields` - Credential fields for an integration
- `GET /v1/integrations/:key/connections` - List saved connections
- `POST /v1/integrations/:key/connections` - Save a new connection
- `POST /v1/triggers/webhook/:token` - Inbound webhook entry point (async, returns 200 immediately)

## Development Commands

```bash
# Start infrastructure
docker-compose up postgres redis

# Start backend (from packages/cloud)
npm run dev

# Start frontend (from packages/web)
npm run dev

# Build all packages
npm run build (from root)

# Type check
npm run typecheck
```

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/pacore
JWT_SECRET=your-secret-key

# LLM Providers (at least one)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
OLLAMA_BASE_URL=http://localhost:11434

# Optional
PORT=3001
```

## Architecture Decisions

### Why MCP over custom integrations?
MCP is an emerging standard for AI-tool communication. Using MCP means:
- Reuse existing MCP servers (Gmail, GitHub, etc.)
- Standard protocol for tool schemas
- Community ecosystem of tools

### Why multi-provider LLM support?
- Cost optimization (use cheaper models for simple tasks)
- Redundancy (fallback if one provider is down)
- Privacy (use local Ollama for sensitive data)

## Common Patterns

### Adding a new skill type
1. Add `SkillTemplate` variants in `packages/cloud/src/skills/templates/<skill-type>/index.ts`
2. Create tool chain in `packages/cloud/src/chains/<skill-type>.ts`
3. Register templates in `skill-template-registry.ts`
4. Add dispatch case in `skill-dispatcher.ts`
5. Add `SlotAdapter`(s) in `packages/cloud/src/integrations/<integration>/`

### Adding a new integration adapter
1. Implement `SlotAdapter` interface in `packages/cloud/src/integrations/<key>/`
2. Register in the `AdapterRegistry` setup in `gateway.ts`
3. Add credential fields (`credentialFields`, `setupGuide`) for the Connect UI

### Adding a new MCP server integration
1. Register via API or UI at `/mcp`
2. Server's tools auto-discovered via MCP protocol
3. Tools available to the AI orchestrator for chat/agent interactions

### Adding a new LLM provider
1. Implement `LLMProvider` interface in `packages/core/src/llm/`
2. Register in `LLMProviderRegistry`
3. Add to provider selector UI

## Testing

```bash
# Run tests
npm test

# Test specific package
cd packages/cloud && npm test
```

## Troubleshooting

### MCP tool execution fails
- Verify server is running and accessible
- Check credentials are configured
- Look at `[MCPClient]` logs for protocol errors

## Contact

Project maintained by [Your Name]