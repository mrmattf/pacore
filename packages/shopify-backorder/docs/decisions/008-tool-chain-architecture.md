# ADR-008: Tool Chain Architecture

## Status
Accepted

## Context

PA Core evolved from a workflow-based architecture to an **agent-first architecture**. Key drivers:

1. **AI landscape shift**: Visual workflow builders (Zapier, Make, n8n) are becoming commoditized
2. **Agent-native**: Modern AI agents can reason about when to act without rigid workflow DAGs
3. **Simplicity**: Code-level tool chains are simpler than maintaining a workflow engine
4. **Blue ocean**: Focus on AI-native capabilities (Skills, agents) rather than competing in crowded workflow space

Previously, ADR-006 and ADR-007 proposed using Workflow MCP for agent orchestration. This approach is superseded by tool chains.

## Decision

Use **code-level tool chains** for deterministic execution instead of workflow DAGs.

### Tool Chain Pattern

```typescript
// Tool chain: deterministic sequence of MCP tool calls
async function processBackorder(orderId: string): Promise<BackorderResult> {
  // Step 1: Get order details
  const order = await shopify.getOrder(orderId);

  // Step 2: Check inventory for all line items
  const inventory = await shopify.checkInventory(order.lineItems);

  // Step 3: Filter backordered items
  const backordered = inventory.filter(i => i.available < i.needed);

  // Step 4: Create support ticket if backordered
  if (backordered.length > 0) {
    await gorgias.createTicket({ orderId, items: backordered });
    await email.send({ to: order.customer, template: 'backorder' });
  }

  return { processed: true, backorderedCount: backordered.length };
}
```

### Agent + Tool Chain Pattern

```
Event → Agent reasons → Decides action needed
      → Standard case: call tool chain (deterministic)
      → Edge case: call MCP tools directly with reasoning
      → Unknown: escalate to human
```

**Key principle**: Agent decides WHEN to act, tool chain executes HOW.

### Comparison with Workflow Approach

| Aspect | Workflow MCP (Old) | Tool Chains (New) |
|--------|-------------------|-------------------|
| Definition | Visual DAG | TypeScript code |
| Execution | Workflow engine | Direct function call |
| Editing | UI builder | Code editor |
| Testing | Integration tests | Unit tests |
| Versioning | Workflow versions | Git commits |
| Complexity | Higher (engine + UI) | Lower (just code) |

### Directory Structure

```
src/
├── chains/
│   └── backorder-chain.ts   # Deterministic tool chain
├── handler/
│   └── backorder.ts         # Webhook handler (calls chain)
└── mcp/
    └── tools/               # Individual MCP tools
```

## Consequences

### Positive

- **Simpler architecture**: No workflow engine to maintain
- **Testable**: Unit test tool chains directly
- **Version-controlled**: Tool chains are code, tracked in git
- **Type-safe**: TypeScript ensures correct tool chain composition
- **Flexible**: Easy to add conditional logic, error handling
- **Blue ocean**: Focus on agent intelligence, not workflow editing

### Negative

- **No visual editor**: Non-technical users can't edit chains directly
- **Code changes**: Updating chains requires deployment
- **Less discoverable**: Chains live in code, not a UI

### Mitigation

- Skills format allows non-technical configuration at higher level
- Agent decides WHEN, so chain changes are less frequent
- Clear documentation of chain behavior

## Implementation

1. Create `src/chains/backorder-chain.ts` with deterministic logic
2. Handler calls chain for standard cases
3. Phase 2: Agent wraps handler, decides when to call chain vs direct tools

## Related

- [ADR-006: Workflow MCP Server](./006-workflow-mcp-server.md) (superseded)
- [ADR-007: Agent-Workflow Orchestration](./007-agent-workflow-orchestration.md) (superseded)
- [Product Strategy](../../../docs/product-strategy.md)
