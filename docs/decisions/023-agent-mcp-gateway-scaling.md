# ADR-023: Agent MCP Gateway — Scaling, Session Architecture, and Value-Add Positioning

**Date:** 2026-03-20
**Status:** Proposed
**Affects:** `packages/cloud/src/mcp/mcp-gateway.ts`, `packages/cloud/src/integrations/adapter-registry.ts`, `packages/core/src/types/`

---

## Context

### The MCP Ecosystem is Maturing

ADR-001 established MCP as Clarissi's integration protocol. As of 2026, the prediction in that ADR is materializing: native MCP servers are emerging for major SaaS platforms. Shopify, Gorgias, Salesforce, and others are publishing or planning native MCP endpoints. Simultaneously, autonomous agents (Claude Desktop, Cursor, and forthcoming A2A frameworks) are gaining the ability to discover and connect to MCP servers dynamically.

This creates a routing decision agents will face:

> "I need Shopify data. I can connect directly to Shopify's MCP server. Why would I go through Clarissi?"

This ADR formalizes Clarissi's answer to that question at the architecture level — and identifies the infrastructure gaps that must be closed before agent-driven traffic becomes a core revenue path.

### The Two Traffic Patterns Are Architecturally Distinct

**Pattern 1 — Webhook-triggered skill execution (existing, ADR-010):**
- Async: webhook arrives → enqueue → worker → SkillDispatcher
- Bounded: deterministic skill chain, static OpsProfile
- Bursty but short-lived: no persistent connection required
- Already handled by BullMQ queue design (ADR-010)

**Pattern 2 — Agent-driven MCP sessions (new):**
- Synchronous/streaming: SSE connection held for duration of agent reasoning
- Unbounded: agent may call 20–100 tools in a session (Assessment, agentic exploration)
- Long-lived: session persists while agent is active (minutes to hours)
- **Not handled by the current architecture**

Merging these into a single execution path would be wrong: queuing agent tool calls would introduce unacceptable latency for interactive sessions. They require separate infrastructure.

### Current Infrastructure Gaps

1. **In-memory SSE sessions**: `MCPGateway.sseSessions` is a `Map<string, SSESession>`. At 10 concurrent operators: fine. At 100+ concurrent agent sessions: memory bloat, no horizontal scaling, session loss on pod restart.

2. **No multi-tenant rate limiting**: A single agent in an aggressive analysis loop can exhaust downstream API rate limits (Shopify: 40 req/s bucket, Gorgias: variable). One customer's agent can degrade another customer's real-time skill executions.

3. **Pricing model gap**: ADR-011 prices per-operation on deterministic skill chains. An agent Assessment session may call 100 MCP tools — there is no billing model for unbounded agentic workloads consistent with the existing per-op model.

4. **No MCP discoverability**: The agent ecosystem expects `/.well-known/` metadata for server discovery (analogous to OAuth metadata). Clarissi's MCPGateway has no such endpoint.

---

## Decision

### 1. Agent Session Architecture — Redis Pub/Sub (not in-memory Map)

Replace the in-memory `sseSessions` Map with a Redis-backed session model:

```
Agent connects → GET /v1/mcp/sse
                → session token generated
                → session state stored in Redis (TTL: 4h)
                → Express pod subscribes to Redis channel for this sessionId

Agent sends tool call → POST /v1/mcp/message?sessionId=xxx
                      → any Express pod can receive the POST
                      → publishes result to Redis channel for sessionId
                      → subscribing pod streams result to SSE connection
```

This makes the SSE connection stateless at the application level — any pod can receive incoming messages and fan-out via Redis, while the SSE stream remains open on the originating pod.

**Session state stored in Redis:**
```typescript
interface AgentSession {
  userId: string;
  orgId: string;
  createdAt: number;
  lastActivityAt: number;
  toolCallCount: number;  // for billing
}
```

**Note:** This change is a prerequisite for horizontal scaling. Until agent volume justifies multi-pod deployments, the in-memory Map is acceptable. This ADR formalizes the migration path when that threshold is reached.

### 2. Per-Customer Rate Limiting at MCPGateway

A token-bucket rate limiter is applied at MCPGateway before any adapter invocation:

```
Per-customer limit: 60 tool calls/minute (configurable)
Per-session limit:  20 tool calls/minute (configurable)
Burst allowance:    10 calls above limit (then throttle, not reject)
```

Implementation: Redis-backed counter (`INCR` + `EXPIRE`) checked synchronously before `dispatchToolCall()`. When limit is exceeded, return a structured error that the agent can reason about:

```json
{
  "error": "rate_limited",
  "message": "Tool call rate limit reached. Retry after 15 seconds.",
  "retry_after_seconds": 15
}
```

Rate limits are enforced before adapter invocation — they do not consume downstream API headroom. This protects both inter-customer isolation and third-party API quotas.

### 3. Agent Session Billing — Per-Tool-Call Extension of ADR-011

Agent tool calls are billed as operations, consistent with ADR-011:

| Action | Operations Charged |
|--------|-------------------|
| Each adapter tool call in an agent session | 1 op |
| `pacore__get_integration_topology` (new — see ADR-017) | 1 op |
| `pacore__list_connections`, `pacore__list_skill_templates` | 0 ops (discovery tools, free) |
| `pacore__switch_org`, `pacore__list_accessible_orgs` | 0 ops (session management, free) |
| Webhook-triggered skill execution | Unchanged from ADR-011 |

**Billing context flag:** Every tool call carries a context tag (`webhook_skill` vs `agent_session`) so execution logs can distinguish the two billing paths. Operators can see "ops from skills" and "ops from agent sessions" separately.

This keeps the billing model unified (one "operation" unit) while adding the dimension needed for agent workload visibility.

### 4. Pre-Aggregated Data Views as a Platform Invariant

Agents doing analysis that naively pulls raw data at scale (100 tickets, 30 days of orders) create disproportionate API load and LLM token cost. The platform establishes a **summary tool invariant**: every high-volume data retrieval tool must have a corresponding summary variant.

**Rule:** Any adapter tool that returns a list of records where N > 20 in common usage must also implement a `{tool_name}_summary` variant that returns aggregated statistics instead of raw records.

Examples:
- `gorgias__list_recent_tickets(limit: 100)` → `gorgias__ticket_summary(days_back: 90)` returns category counts, not raw tickets
- `shopify__list_orders(limit: 250)` → `shopify__order_pattern_summary(days_back: 30)` returns volume/pattern stats
- `pacore__get_execution_log()` → summary variant returns skill execution rates, error rates, and trends

Summary tools cost 1 op (same as their raw counterparts). The efficiency benefit accrues to the agent and to Clarissi's downstream API quota.

This pattern is already planned in ADR-017 Phase 2 for the Assessment tools. This ADR formalizes it as a platform-wide invariant for all adapters.

### 5. MCP Server Discoverability

Clarissi's MCPGateway registers itself as a discoverable MCP server in the emerging agent ecosystem:

```
GET /.well-known/mcp-server
→ {
    "name": "Clarissi",
    "description": "Cross-system automation intelligence and skill execution platform",
    "mcp_endpoint": "https://app.clarissi.com/v1/mcp",
    "auth": "oauth2",
    "capabilities": ["tools"],
    "tool_categories": ["skill_execution", "configuration_audit", "cross_system_analysis"]
  }
```

Tool descriptions in `tools/list` responses are written for agent reasoning, not just human reading:

```json
{
  "name": "pacore__get_integration_topology",
  "description": "Returns the connected graph of all customer systems: which events flow between systems, which are covered by active Clarissi skills, and which are uncovered (neither by skills nor native system automations). Use this first in any efficiency analysis — it tells you what to investigate. Only Clarissi can produce this cross-system view."
}
```

Semantic richness in descriptions reduces the agent's need to probe tools experimentally before using them.

---

## Value-Add Positioning: Direct-to-System vs. Through Clarissi

This ADR formalizes the architectural answer to why agents should route through Clarissi rather than connecting directly to individual SaaS MCP servers. This positioning is encoded in the architecture, not just in marketing:

| Direct-to-System | Through Clarissi |
|---|---|
| Agent manages N credential sets, one per system | Single authenticated connection covers all connected systems |
| Agent figures out HOW to automate | `pacore__execute_skill` — proven, audited, deterministic chains across all skill types |
| Each session starts cold | Platform Intelligence flywheel: validation corrections, improvement alerts, recommendations enriched by cross-account execution data |
| Raw data: 20+ tool calls per analysis | Pre-aggregated summary views: single call, fraction of the downstream API load |
| Analysis limited to one system at a time | `pacore__get_integration_topology` — cross-system configuration audit impossible from any individual system |
| No execution audit trail | Every skill execution logged; SOC 2 path (planned) |
| No compounding value | Each skill activated adds to the cross-account pattern corpus (ADR-012 flywheel) |

**The irreducible moat:** Clarissi holds credentials to ALL connected systems simultaneously. Cross-system configuration analysis (ADR-017 Configuration Topology) is architecturally impossible from any individual system's MCP server. An agent connecting through Clarissi has access to a joined view of the customer's entire automation ecosystem — not available anywhere else.

---

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Keep in-memory session Map | Blocks horizontal scaling; acceptable only until agent traffic justifies multi-pod deployment |
| Per-session flat fee billing | Breaks the unified ADR-011 op model; creates confusion between skill ops and session ops |
| Reject/hard-limit when rate exceeded | Agents need to reason about throttling, not crash; structured error with retry_after is agent-friendly |
| Separate agent billing tier (not ops) | Unnecessary complexity; per-tool-call ops are already the right granularity |
| Build a separate MCP endpoint for agents | No reason to diverge; same MCPGateway serves both operators and autonomous agents |

---

## Consequences

### Positive
- Horizontal scaling path is defined before it's urgently needed
- Multi-tenant isolation is enforced — no cross-customer API quota leakage
- Billing model for agent sessions is unified with existing per-op model
- Summary tool invariant reduces downstream API load across all high-volume adapters
- Discoverability positions Clarissi in the emerging agent MCP ecosystem

### Negative
- Redis becomes a hard dependency for SSE session management (already required by ADR-010 for queue)
- Rate limiting adds ~1ms latency per tool call (Redis INCR round-trip)
- Summary tool invariant requires work whenever new high-volume data tools are added to adapters

### Neutral
- No changes to SkillDispatcher, tool chains, or AdapterRegistry — agent path is additive
- Existing Claude Desktop operator workflows are unaffected

---

## Implementation Phases

| Phase | Work | Prerequisite |
|-------|------|-------------|
| 1 | Redis-backed session state (migration from in-memory Map) | Redis already required by ADR-010 |
| 2 | Per-customer rate limiting in MCPGateway | Phase 1 Redis available |
| 3 | Per-tool-call op billing with `agent_session` context tag | Execution log schema updated |
| 4 | Summary tool implementations (gorgias, shopify adapters) | ADR-017 Phase 2 |
| 5 | `/.well-known/mcp-server` discoverability endpoint | Any phase; low risk |

---

## Related

- [ADR-001: MCP for Integrations](001-mcp-for-integrations.md) — foundational protocol decision
- [ADR-010: Durable Webhook Ingestion](010-durable-webhook-ingestion.md) — separate async path for webhook-triggered executions; Redis already required
- [ADR-011: Skill Pricing Model](011-skill-pricing-model.md) — per-op billing model extended here to agent sessions
- [ADR-012: Platform Intelligence Layer](012-platform-intelligence-layer.md) — flywheel value that compounds with agent session data
- [ADR-017: Operator Skill Discovery](017-operator-skill-discovery.md) — Assessment workflow that runs as agent MCP sessions; Configuration Topology (Pass 3) is the highest-value agent output
