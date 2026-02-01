# ADR-006: Workflow MCP Server

## Status
Proposed (for Phase 3)

## Context

As we evolve from standalone MVP (Phase 1) to AI agent integration (Phase 2) to workflow conversion (Phase 3), we need a way for AI agents to orchestrate pacore workflows.

Currently:
- Agent calls integration MCP tools directly (shopify.*, gorgias.*)
- Agent implements all decision logic
- No reuse of battle-tested workflow logic

We want agents to be able to delegate deterministic processing to workflows while handling intelligence and exceptions themselves.

## Decision

Expose pacore workflows as MCP tools via a **Workflow MCP Server**:

### Available Tools

```typescript
// List available workflows
workflow.list({ category?: string, limit?: number })

// Get workflow definition
workflow.get({ id: string })

// Execute workflow with inputs
workflow.execute({ id: string, inputs: Record<string, any>, async?: boolean })

// Check execution status (for async)
workflow.status({ executionId: string })
```

### Usage Pattern

```
Agent thinks: "I need to check this order for backorders"
Agent calls: workflow.execute({ id: "backorder-detection", inputs: { orderId: 123 } })
Workflow runs: Deterministic DAG (get_order → check_inventory → create_ticket)
Agent receives: Execution result
Agent decides: Handle exceptions or report success
```

### Implementation

The Workflow MCP Server wraps existing pacore workflow APIs:
- `workflow.list` → `GET /v1/workflows`
- `workflow.get` → `GET /v1/workflows/:id`
- `workflow.execute` → `POST /v1/workflows/:id/execute`
- `workflow.status` → Execution tracking (existing)

## Consequences

### Positive

- **Reuse**: Agents leverage tested workflows instead of reimplementing logic
- **Auditability**: Workflow executions are logged and trackable
- **Separation of concerns**: Agent = intelligence, Workflow = execution
- **Consistency**: Same workflow definition used by agents and direct triggers
- **Efficiency**: Workflows can be optimized independently of agent logic

### Negative

- **Additional layer**: Adds latency for agent → MCP → workflow → MCP tools
- **Coupling**: Agent behavior depends on workflow availability
- **Complexity**: Two execution paths to maintain (agent-direct vs agent-workflow)

### Mitigation

- Cache workflow definitions to reduce lookup latency
- Implement fallback if workflow unavailable (agent can call tools directly)
- Clear documentation on when to use each pattern

## Related

- [ADR-002: MCP Tool Design Pattern](./002-mcp-tool-design.md)
- [Workflow MCP Documentation](../../../docs/workflow-mcp.md)
- [AI Agents Documentation](../../../docs/ai-agents.md)
