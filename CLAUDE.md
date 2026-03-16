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
- Decision that future contributors would otherwise re-debate
- Trade-off with a clear rejected alternative worth preserving
- Checklist: does this touch ≥2 packages AND encode a non-obvious design choice? → write ADR
- ADRs live in `docs/decisions/`, numbered sequentially; update `docs/decisions/README.md`

**On feature completion (before committing):**
1. Update `docs/SESSION_LOG.md` — 1-2 sentences max
2. Update "Current Feature State" checklist below
3. Update `docs/solutions/README.md` if a new skill type was added
4. Ask: does this touch ≥2 packages with a non-obvious design choice? → Write ADR
5. Move any planning docs (`docs/*.md` used as plans) to `docs/archive/`

**Prompts the user can say:**
- "Update session log" → Add current work to SESSION_LOG.md
- "Clean up docs" → Remove stale entries, consolidate
- "Skip docs" → Don't update any documentation this session
- "Write ADR" → Create a new ADR for the current architectural decision
- `/update-docs` → Run the feature completion checklist above

## Project Overview

PA Core is a Personal Assistants platform — AI-powered assistants that automate tasks, manage business operations, and integrate with tools. Architecture is agent-first: agents decide WHEN to act, tool chains execute HOW (deterministic). No workflow engine — skills + tool chains replace it.

**Key concepts:** Skills (portable capability definitions), BYOK multi-provider LLM, Edge Agent (local execution), Orchestrator business model (we own platform + templates; customers own config + data).

See: [Product Strategy](docs/product-strategy.md) · [AI Agents](docs/ai-agents.md) · [Solutions](docs/solutions/README.md) · [ADRs](docs/decisions/README.md)

## Architecture

```
packages/web          React frontend (Vite + TypeScript)
packages/cloud        Express backend + WebSocket
packages/core         Shared types and utilities
packages/agent        On-premise edge agent
packages/shopify-backorder  (deprecated/archived — Yota migrated to Clarissi skill)
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
- [x] Assessment infrastructure: `pacore__list_skill_templates`, `pacore__list_connections`, `pacore__get_execution_log` MCP tools for operator-driven Skills Assessment workflow
- [x] Frontend org context switching: personal/org context selector, role resolution, admin member management panel
- [x] Operator Platform: `is_operator` identity, operator-customer relationships, credential intake with one-time tokens (SHA-256 hash), management mode lifecycle (concierge/self-managed), operator dashboard + customer detail views, public onboarding form with Cloudflare Turnstile, atomic credential submission

### In Progress
- [ ] Edge agent for local desktop integration

### Planned
- [ ] Audit events table for SOC 2 Type II operator action logging
- [ ] Builder Agent / BYOM skill creation — operator-only tooling for discovering and drafting new skills; customer-facing self-service deferred until tooling and onboarding mature (see ADR-005)
- [ ] Agent layer for Tier 2 skills (LLM-driven decision-making on top of tool chains)
- [ ] Chat channel integrations (WhatsApp, Telegram, Slack)
- [ ] Public signup for self-serve customer acquisition

## Key Files

### Backend (`packages/cloud`) — see also [packages/cloud/CLAUDE.md](packages/cloud/CLAUDE.md)
- `src/api/gateway.ts` - All REST endpoints and webhook entry points
- `src/skills/skill-dispatcher.ts` - Routes webhook events to skill tool chains
- `src/skills/skill-template-registry.ts` - Skill catalog and template registry
- `src/integrations/adapter-registry.ts` - Central dispatch for all integration adapters (with retry)
- `src/skills/execute-escalation.ts` - Shared escalation action handler
- `src/utils/retry.ts` - Exponential backoff retry utility
- `src/mcp/credential-manager.ts` - Encrypted credential storage

### Frontend (`packages/web`) — see also [packages/web/CLAUDE.md](packages/web/CLAUDE.md)
- `src/pages/SkillsPage.tsx` - Browse and activate skills
- `src/pages/SkillConfigPage.tsx` - Configure slot connections + field overrides
- `src/pages/TemplatePickerPage.tsx` - Template picker for a skill type
- `src/pages/BillingPage.tsx` - Usage and execution history

### Shared (`packages/core`)
- `src/types/policy.ts` - ECA action types (invoke, skip, escalate + targetSlot)
- `src/types/skill-template.ts` - SkillTemplate, SkillSlot, EditableField interfaces
- `src/types/skill.ts` - UserSkill, SkillDefinition

### Deprecated / Archived
- **packages/shopify-backorder/** - Archived customer deliverable; Yota migrated to the Clarissi backorder-notification skill

## Database Schema

See actual migration files in `packages/cloud/db/` for current schema (the schema below may be outdated — verify against DB before relying on it). Migration files are sequential numbered SQL files applied automatically on deployment — see `packages/cloud/CLAUDE.md` for the naming convention.

## API Endpoints

See [API.md](API.md) for full endpoint reference and design conventions.

## Development Commands

```bash
# Start infrastructure
docker-compose up postgres redis

# Start backend (from packages/cloud)
npm run dev

# Start frontend (from packages/web)
npm run dev

# Build all packages (from root)
npm run build

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

## Testing

```bash
npm test                          # Run all tests
cd packages/cloud && npm test     # Test specific package
```

## Troubleshooting

### MCP tool execution fails
- Verify server is running and accessible
- Check credentials are configured
- Look at `[MCPClient]` logs for protocol errors
