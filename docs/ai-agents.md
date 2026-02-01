# AI Agents

## Overview

AI agents in pacore provide intelligent decision-making capabilities on top of MCP tools and workflows. Agents can reason about situations, call tools, and handle edge cases that deterministic workflows cannot.

## Agent Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AI AGENT                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  System Prompt (solution-specific instructions)     │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  LLM Provider (Claude, GPT, Ollama)                 │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Tool Calling (MCP tools + Workflow MCP)            │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │      MCP TOOLS         │
              │  - workflow.execute    │
              │  - shopify.get_order   │
              │  - gorgias.create      │
              └────────────────────────┘
```

## Agent + MCP Pattern

Agents interact with external systems and workflows through MCP tools:

```typescript
// Agent receives event
const event = { type: 'order_created', orderId: 123 };

// Agent reasons and calls tools
const order = await callTool('shopify.get_order', { order_id: 123 });
const inventory = await callTool('shopify.check_inventory', { variant_ids: [...] });

// Agent decides based on context
if (hasBackorders(inventory) && isVIPCustomer(order)) {
  // High priority - agent handles directly
  await callTool('gorgias.create_ticket', {
    priority: 'high',
    message: personalizedMessage(order)
  });
} else if (hasBackorders(inventory)) {
  // Standard path - delegate to workflow
  await callTool('workflow.execute', {
    id: 'backorder-notification',
    inputs: { orderId: 123 }
  });
}
```

## Agent Calling Workflow MCP

The key pattern: agents can orchestrate workflows via the Workflow MCP server:

```
Agent: "I need to run the standard backorder check"
       ↓
Agent calls: workflow.execute({ id: "backorder-detection", inputs: { orderId: 123 } })
       ↓
Workflow MCP: Finds and executes the workflow
       ↓
Workflow: Runs deterministic DAG (get order → check inventory → create ticket)
       ↓
Result: Returns to agent
       ↓
Agent: Reasons about result, handles exceptions
```

**Benefits**:
- Workflows handle the predictable 90%
- Agent handles the complex 10%
- Workflows remain auditable and testable
- Agent adds intelligence on top

## When to Use Agent vs Workflow

| Scenario | Use | Why |
|----------|-----|-----|
| High volume, same logic | Workflow | Cheaper, faster, auditable |
| Complex decision needed | Agent | Reasoning required |
| Customer-specific handling | Agent | Personalization |
| Scheduled/batch processing | Workflow | No reasoning needed |
| Edge cases | Agent | Can handle unexpected |
| Strict compliance required | Workflow | Deterministic, auditable |

**Rule of thumb**: Start with workflow, add agent for exceptions.

## Agent Observability

Every agent action should be logged:

```typescript
interface AgentLog {
  sessionId: string;
  timestamp: Date;
  event: 'thinking' | 'tool_call' | 'tool_result' | 'decision';
  content: {
    reasoning?: string;      // What agent is thinking
    toolName?: string;       // Which tool called
    toolArgs?: object;       // Tool arguments
    toolResult?: any;        // Tool response
    decision?: string;       // Final decision made
  };
  tokenUsage?: {
    input: number;
    output: number;
  };
}
```

## Edge Agent

The edge agent enables local execution:

**Capabilities**:
- Local LLM (Ollama) - privacy, no API costs
- Desktop access - file system, browser automation
- Local MCP servers - device-specific integrations
- Offline operation - queue and sync when connected

**Use Cases**:
- Sensitive data that can't leave premise
- High-volume processing (local LLM is free)
- Desktop automation (browser, files)
- Unreliable network environments

**Architecture**:
```
┌─────────────────────┐      WebSocket       ┌─────────────────┐
│   EDGE AGENT        │◄────────────────────►│   CLOUD         │
│   - Ollama LLM      │                      │   - Routing     │
│   - Local MCP       │                      │   - Credentials │
│   - File access     │                      │   - Logging     │
└─────────────────────┘                      └─────────────────┘
```

## Agent Configuration

Agents are configured per-solution:

```typescript
interface AgentConfig {
  // LLM settings
  provider: 'anthropic' | 'openai' | 'ollama';
  model: string;
  temperature: number;

  // System prompt
  systemPrompt: string;

  // Available tools
  mcpServers: string[];  // IDs of MCP servers agent can access

  // Workflow access
  workflows: string[];   // IDs of workflows agent can execute

  // Guardrails
  maxTokens: number;
  maxToolCalls: number;
  timeoutMs: number;
}
```

## Solution Integration

Each solution defines how agents are used:

**Backorder Detection Solution**:
```yaml
agent:
  trigger: order_created webhook
  tools:
    - shopify-mcp (get_order, check_inventory)
    - gorgias-mcp (create_ticket)
    - workflow-mcp (execute backorder-workflow)
  behavior:
    - Assess order for backorder risk
    - For VIP customers: personalized handling
    - For standard: delegate to workflow
    - For edge cases: escalate to human
```

## Implementation Checklist

For adding agent to a solution:

1. **Define agent config** - provider, model, tools
2. **Write system prompt** - solution-specific instructions
3. **Register MCP tools** - what agent can call
4. **Add workflow delegation** - which workflows agent can trigger
5. **Set up observability** - logging, metrics
6. **Define guardrails** - limits, fallbacks
7. **Test edge cases** - ensure agent handles unexpected

## AI Agent Guidelines

When updating this documentation:
- Update when adding new agent patterns
- Don't duplicate MCP tool details - link to [workflow-mcp.md](workflow-mcp.md)
- Keep examples concrete with real tool names
