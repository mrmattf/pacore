# ADR-007: Agent-Workflow Orchestration Pattern

## Status
Proposed (for Phase 2-3)

## Context

With both AI agents and workflows available, we need to decide how they work together. Options:

**Option A: Agent-Only**
- Agent handles all logic
- Agent calls MCP tools directly
- No workflow involvement

**Option B: Workflow-Only**
- Workflows handle all processing
- No AI reasoning
- Deterministic path only

**Option C: Hybrid (Agent orchestrates Workflow)**
- Agent makes intelligent decisions
- Agent delegates to workflow for deterministic processing
- Agent handles exceptions

## Decision

Use **Option C: Hybrid Pattern** where agents orchestrate workflows.

### Execution Flow

```
Event arrives
    │
    ▼
┌─────────────────────────────────────────┐
│  AI AGENT                               │
│  1. Assess event (gather context)       │
│  2. Decide: standard or special case?   │
│  3. Standard → workflow.execute()       │
│  4. Special → handle directly           │
│  5. Exception → escalate                │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┴────────────┐
    ▼                         ▼
┌───────────┐           ┌───────────┐
│ WORKFLOW  │           │  DIRECT   │
│ (90%)     │           │  (10%)    │
│ Standard  │           │  VIP/Edge │
│ path      │           │  cases    │
└───────────┘           └───────────┘
```

### Decision Criteria

| Scenario | Handler | Reason |
|----------|---------|--------|
| Standard order, normal customer | Workflow | Deterministic, cheap |
| VIP customer | Agent (direct) | Personalization needed |
| High-value order | Agent (direct) | Extra validation |
| Unusual item combination | Agent (direct) | Edge case logic |
| Workflow fails | Agent (escalate) | Human intervention |

### Implementation

```typescript
// Agent system prompt excerpt
You have access to workflows via workflow.execute().
For standard cases, delegate to the backorder-detection workflow.
Only handle directly if:
- Customer is VIP tier
- Order value > $1000
- Special product categories involved
If workflow fails, escalate to human.
```

### Metrics

Track hybrid execution effectiveness:
- % handled by workflow (target: 90%)
- % handled directly by agent (target: 10%)
- % escalated (target: <1%)
- Cost per event (workflow cheaper than agent)

## Consequences

### Positive

- **Cost efficient**: Workflows handle bulk (cheaper than agent calls)
- **Intelligent**: Agent handles edge cases that workflows can't
- **Maintainable**: Workflow logic editable via UI
- **Observable**: Clear separation of what agent vs workflow decided
- **Fallback**: Agent can work without workflow if needed

### Negative

- **Complexity**: Two systems to maintain and monitor
- **Latency**: Agent → workflow adds round trip
- **Decision boundary**: Must clearly define when to use which

### Mitigation

- Clear documentation on decision boundaries
- Monitoring dashboard shows agent vs workflow distribution
- Regular review of "direct" cases to see if workflow can handle them

## Related

- [ADR-006: Workflow MCP Server](./006-workflow-mcp-server.md)
- [Product Strategy](../../../docs/product-strategy.md)
- [AI Agents Documentation](../../../docs/ai-agents.md)
