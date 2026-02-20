# PA Core - AI Orchestration Platform

## Documentation Rules

**For AI Assistants - Keep docs lean:**
1. Update `docs/SESSION_LOG.md` only for: new features, bug fixes, architecture changes
2. Keep entries to 1-2 sentences each
3. Delete session entries older than 5 sessions
4. Create ADRs only for decisions affecting multiple systems
5. Skip: minor fixes, debugging steps, research that led nowhere

**Prompts the user can say:**
- "Update session log" → Add current work to SESSION_LOG.md
- "Clean up docs" → Remove stale entries, consolidate
- "Skip docs" → Don't update any documentation this session

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
User Message → API Gateway → Orchestrator → LLM Provider
                                ↓
                         Workflow Detection
                                ↓
                    MCP Tool Execution (if needed)
                                ↓
                         Response to User
```

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, React Flow (workflow visualization)
- **Backend:** Node.js, Express, WebSocket (ws), PostgreSQL, Redis
- **AI:** Anthropic Claude, OpenAI GPT, Ollama (local models)
- **Protocol:** MCP (Model Context Protocol) for tool integration

## Current Feature State

### Completed
- [x] Multi-provider LLM orchestration (Anthropic, OpenAI, Ollama)
- [x] MCP server registration and tool execution
- [x] Visual workflow builder with React Flow
- [x] Schema-aware input mapping for MCP tools
- [x] Parameter resolution with property path syntax (`$input[0].user.email`)
- [x] Workflow list page with edit/run/delete
- [x] Node connection via drag-and-drop and checkboxes
- [x] Credential management with encryption

### In Progress
- [ ] Scheduled/cron workflow triggers
- [ ] Webhook triggers for workflows
- [ ] Execution history dashboard
- [ ] Edge agent for local desktop integration

### Planned
- [ ] Chat channel integrations (WhatsApp, Telegram, Slack)
- [ ] Voice interface
- [ ] Multi-tenant enterprise features

## Key Files

### Backend (packages/cloud)
- `src/api/gateway.ts` - All REST and WebSocket endpoints
- `src/orchestration/index.ts` - Main orchestration logic
- `src/workflow/workflow-executor.ts` - Executes workflow DAGs
- `src/workflow/workflow-builder.ts` - AI-driven workflow generation
- `src/workflow/workflow-manager.ts` - CRUD operations + validation
- `src/mcp/mcp-registry.ts` - MCP server management
- `src/mcp/mcp-client.ts` - MCP protocol client

### Frontend (packages/web)
- `src/pages/ChatPage.tsx` - Main chat interface
- `src/pages/WorkflowBuilderPage.tsx` - Visual workflow editor
- `src/pages/WorkflowsPage.tsx` - Workflow list/management
- `src/components/WorkflowGraph.tsx` - React Flow wrapper
- `src/components/NodeConfigPanel.tsx` - Node configuration with schema forms
- `src/components/SchemaFormBuilder.tsx` - Auto-generated forms from JSON Schema

### Shared (packages/core)
- `src/types/` - TypeScript interfaces (WorkflowDAG, WorkflowNode, etc.)
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
-- Main tables
workflows (id, user_id, name, description, category, nodes JSONB)
workflow_executions (id, workflow_id, user_id, status, execution_log JSONB)
mcp_servers (id, user_id, name, server_type, url, capabilities JSONB)
credentials (user_id, type, encrypted_value, iv, auth_tag)
users (id, email, password_hash)
```

## API Endpoints

### Chat
- `POST /v1/chat` - Send message, get AI response
- `WS /ws` - Real-time chat via WebSocket

### Workflows
- `GET /v1/workflows` - List user's workflows
- `POST /v1/workflows` - Create workflow
- `GET /v1/workflows/:id` - Get workflow
- `PUT /v1/workflows/:id` - Update workflow
- `DELETE /v1/workflows/:id` - Delete workflow
- `POST /v1/workflows/:id/execute` - Execute workflow
- `POST /v1/workflows/build` - AI-generate workflow from description

### MCP Servers
- `GET /v1/mcp/servers` - List MCP servers
- `POST /v1/mcp/servers` - Register MCP server
- `GET /v1/mcp/servers/:id/tools` - Get server's tools
- `POST /v1/mcp/servers/:id/execute` - Execute tool

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
REDIS_URL=redis://localhost:6379
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

### Why DAG-based workflows?
Directed Acyclic Graphs allow:
- Parallel execution of independent nodes
- Clear data flow visualization
- Validation of dependencies before execution

### Why multi-provider LLM support?
- Cost optimization (use cheaper models for simple tasks)
- Redundancy (fallback if one provider is down)
- Privacy (use local Ollama for sensitive data)

## Common Patterns

### Adding a new workflow node type
1. Add type to `packages/core/src/types/workflow.ts`
2. Add execution logic in `packages/cloud/src/workflow/workflow-executor.ts`
3. Add UI config in `packages/web/src/components/NodeConfigPanel.tsx`

### Adding a new MCP server integration
1. Register via API or UI at `/mcp`
2. Server's tools auto-discovered via MCP protocol
3. Tools available in workflows as `mcp_fetch` nodes

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

### Workflow build timeout
- Check LLM provider response time (Ollama can be slow)
- Reduce tool catalog size if many MCP servers registered
- Check `[WorkflowBuilder]` logs for timing breakdown

### MCP tool execution fails
- Verify server is running and accessible
- Check credentials are configured
- Look at `[MCPClient]` logs for protocol errors

### Node connections not working
- Ensure `fetchServerTools` not in useEffect dependencies (causes infinite loop)
- Check that node IDs match between inputs array and existing nodes

## Contact

Project maintained by [Your Name]