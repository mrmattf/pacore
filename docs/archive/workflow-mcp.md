# Workflow MCP Server

## Overview

The Workflow MCP Server exposes pacore workflows as MCP tools. This allows AI agents to orchestrate workflows just like any other tool, enabling the hybrid pattern where agents handle intelligence and workflows handle deterministic processing.

## Why Workflows as MCP Tools?

```
Traditional:
  Agent → Integration MCP tools (shopify, gorgias, etc.)
  Agent must implement all logic

With Workflow MCP:
  Agent → workflow.execute (runs tested workflow)
  Agent → handles exceptions
  Best of both worlds
```

**Benefits**:
- Agents leverage battle-tested workflows
- Workflows remain deterministic and auditable
- Agent adds intelligence on top
- Reuse workflows across multiple agents/solutions
- Separation of concerns (agent = reasoning, workflow = execution)

## Available Tools

### workflow.list

List available workflows for the current user.

```typescript
// Input
{
  category?: string;  // Filter by category
  limit?: number;     // Max results (default: 50)
}

// Output
{
  workflows: [{
    id: string;
    name: string;
    description: string;
    category: string;
    nodeCount: number;
    createdAt: string;
    updatedAt: string;
  }]
}
```

### workflow.get

Get detailed workflow definition.

```typescript
// Input
{
  id: string;  // Workflow ID
}

// Output
{
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: WorkflowNode[];
  createdAt: string;
  updatedAt: string;
}
```

### workflow.execute

Execute a workflow with inputs.

```typescript
// Input
{
  id: string;                    // Workflow ID
  inputs: Record<string, any>;   // Input data for workflow
  async?: boolean;               // Return immediately (default: false)
}

// Output (sync)
{
  executionId: string;
  status: 'completed' | 'failed';
  result?: any;
  error?: string;
  executionLog: [{
    nodeId: string;
    status: string;
    startedAt: string;
    completedAt: string;
    output?: any;
    error?: string;
  }]
}

// Output (async)
{
  executionId: string;
  status: 'running';
}
```

### workflow.status

Check execution status (for async executions).

```typescript
// Input
{
  executionId: string;
}

// Output
{
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
  progress?: {
    completedNodes: number;
    totalNodes: number;
    currentNode?: string;
  }
}
```

## Usage Patterns

### Pattern 1: Simple Delegation

Agent delegates entire task to workflow:

```typescript
// Agent receives order event
const order = event.data;

// Agent delegates to workflow
const result = await callTool('workflow.execute', {
  id: 'backorder-detection',
  inputs: { orderId: order.id }
});

// Agent reports result
return { success: result.status === 'completed' };
```

### Pattern 2: Conditional Delegation

Agent decides whether to use workflow:

```typescript
// Agent gathers context
const order = await callTool('shopify.get_order', { order_id: orderId });
const customer = await callTool('crm.get_customer', { email: order.email });

// Agent decides
if (customer.tier === 'VIP') {
  // Handle VIP customers directly (personalized)
  await handleVIPOrder(order);
} else {
  // Standard customers go through workflow
  await callTool('workflow.execute', {
    id: 'standard-order-processing',
    inputs: { orderId: order.id }
  });
}
```

### Pattern 3: Workflow + Exception Handling

Agent uses workflow, handles exceptions:

```typescript
// Run workflow
const result = await callTool('workflow.execute', {
  id: 'backorder-detection',
  inputs: { orderId: event.orderId }
});

// Handle exceptions
if (result.status === 'failed') {
  // Log and escalate
  await callTool('slack.notify', {
    channel: 'escalations',
    message: `Workflow failed for order ${event.orderId}: ${result.error}`
  });
} else if (result.result.needsReview) {
  // Agent reviews edge case
  await reviewEdgeCase(result);
}
```

### Pattern 4: Async Execution

For long-running workflows:

```typescript
// Start workflow async
const { executionId } = await callTool('workflow.execute', {
  id: 'bulk-inventory-sync',
  inputs: { skus: skuList },
  async: true
});

// Do other work...

// Check status later
const status = await callTool('workflow.status', { executionId });

if (status.status === 'completed') {
  // Process results
}
```

## Input Mapping

Workflow inputs are passed via the `inputs` parameter:

```typescript
// Workflow expects: { orderId: number, priority: string }
await callTool('workflow.execute', {
  id: 'order-workflow',
  inputs: {
    orderId: 12345,
    priority: 'high'
  }
});
```

Inside the workflow, nodes access inputs via `$input`:
- First node receives `inputs` directly
- Subsequent nodes receive outputs from previous nodes
- Use `$input[0].orderId` syntax for nested access

## Error Handling

The Workflow MCP server returns structured errors:

```typescript
// Workflow not found
{ success: false, error: 'Workflow not found: invalid-id' }

// Validation error
{ success: false, error: 'Missing required input: orderId' }

// Execution error
{
  success: false,
  error: 'Node "check_inventory" failed: Shopify API error',
  executionLog: [...] // Partial execution log
}
```

Agents should handle these gracefully:

```typescript
const result = await callTool('workflow.execute', { ... });

if (!result.success) {
  // Log error
  logger.error('Workflow failed', { error: result.error });

  // Fallback behavior
  await handleWorkflowFailure(result);
}
```

## Security

- Workflows are scoped to user (agents can only execute user's workflows)
- MCP credentials are resolved at execution time
- Execution logs are stored for audit
- Rate limiting prevents abuse

## Implementation Status

| Tool | Status | Notes |
|------|--------|-------|
| workflow.list | Planned | Via existing GET /v1/workflows |
| workflow.get | Planned | Via existing GET /v1/workflows/:id |
| workflow.execute | Planned | Via existing POST /v1/workflows/:id/execute |
| workflow.status | Planned | Via existing execution tracking |

## AI Agent Guidelines

When updating this documentation:
- Update tool schemas when implementation changes
- Keep usage patterns concrete with real examples
- Don't duplicate workflow DAG structure - link to architecture docs
