# Product Strategy

## Overview

PA Core is a platform for building and deploying AI-powered **solutions** for customers. Solutions are customer-facing products (like "Backorder Detection" or "Support Triage") that hide the underlying workflow and agent complexity.

## Solution Development Lifecycle

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   PHASE 1    │    │   PHASE 2    │    │   PHASE 3    │    │   PHASE 4    │
│  Standalone  │───►│  AI Agent    │───►│  Workflow    │───►│  Solution    │
│     MVP      │    │    Layer     │    │  Conversion  │    │  Packaging   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### Phase 1: Standalone MVP

**Goal**: Validate the concept works

- Build as standalone package (e.g., `packages/shopify-backorder`)
- Expose MCP tools for external integrations
- Deploy independently (Railway, Docker)
- Test with real customer data
- No pacore platform dependency

**Exit Criteria**:
- Customer validates the value proposition
- MCP tools are stable and documented
- Core logic is proven

### Phase 2: AI Agent Layer

**Goal**: Add intelligent decision-making

- Integrate AI agent runtime
- Agent uses existing MCP tools
- Handle edge cases that deterministic logic can't
- Agent observability (decisions, reasoning, token usage)

**Exit Criteria**:
- Agent handles 10%+ of cases that would fail with pure logic
- Customer approves agent behavior
- Cost per decision is acceptable

### Phase 3: Workflow Conversion

**Goal**: Convert to pacore workflow for manageability

- Define workflow DAG that replicates MVP logic
- Register as workflow in pacore
- Expose via Workflow MCP server (agents can call `workflow.execute`)
- Retain AI agent for complex decisions

**Exit Criteria**:
- Same functionality as MVP, but as workflow
- Workflow is editable via visual builder
- Agent can orchestrate workflow via MCP

### Phase 4: Solution Packaging

**Goal**: Multi-tenant, customer-configurable product

- Abstract integrations (Shopify → "Order Source", Gorgias → "Notification System")
- Customer configuration UI
- Multi-tenant deployment
- Usage tracking and billing

**Exit Criteria**:
- Multiple customers can use the same solution
- Each customer has isolated configuration
- Customer can swap integrations (e.g., Zendesk instead of Gorgias)

---

## Architecture Layers

### 1. Customer Solutions (Top)

What customers see and buy. Examples:
- "Backorder Detection" - Detect inventory issues, notify customers
- "Order Routing" - Route orders to appropriate fulfillment centers
- "Support Triage" - Classify and route support tickets

Customers don't know about workflows, agents, or MCP. They see a product.

### 2. Intelligence Layer

Two execution modes, both consuming MCP tools:

| Mode | Use Case | Characteristics |
|------|----------|-----------------|
| **AI Agents** | Complex decisions, edge cases | Reasoning, non-deterministic, expensive |
| **Workflows** | Bulk processing, scheduled tasks | Deterministic, auditable, cheap |

**Hybrid Pattern** (recommended):
```
Event → Agent reasons → Calls workflow.execute → Workflow runs → Agent handles exceptions
```

### 3. MCP Tool Layer

Universal interface consumed by both agents and workflows:

**Workflow MCP Server** (internal):
- `workflow.list` - Get available workflows
- `workflow.get` - Get workflow definition
- `workflow.execute` - Run workflow with inputs
- `workflow.status` - Check execution status

**Integration MCP Servers** (external):
- `shopify.get_order`, `shopify.check_inventory`
- `gorgias.create_ticket`, `gorgias.add_message`
- `gmail.send`, `slack.notify`, etc.

### 4. Execution Layer

**Cloud Runtime**:
- API gateway
- Workflow engine
- MCP registry
- Credential vault
- Multi-tenant isolation

**Edge Agent** (optional):
- Local LLM (Ollama)
- Desktop access (files, browser)
- Local MCP servers
- Privacy-sensitive execution

### 5. Integration Adapters (Bottom)

Swappable connectors to customer systems:

| Category | Options |
|----------|---------|
| Order Source | Shopify, WooCommerce, Magento, BigCommerce |
| Support System | Gorgias, Zendesk, Freshdesk, Intercom |
| Notification | Gmail, SendGrid, Twilio, Slack |
| CRM | Salesforce, HubSpot, Pipedrive |

---

## MCP as Universal Interface

The key architectural insight: **MCP tools are consumed by both agents AND workflows**.

```
                    ┌─────────────┐
                    │  AI Agent   │
                    └──────┬──────┘
                           │ calls
                           ▼
              ┌────────────────────────┐
              │      MCP TOOLS         │
              │  - workflow.execute    │
              │  - shopify.get_order   │
              │  - gorgias.create      │
              └────────────────────────┘
                           ▲
                           │ calls
                    ┌──────┴──────┐
                    │  Workflow   │
                    └─────────────┘
```

Benefits:
- Adding a new integration benefits both agents AND workflows
- Agents can orchestrate workflows via `workflow.execute`
- Consistent interface, reusable across solutions
- Test tools once, use everywhere

---

## Execution Patterns

### Pattern A: Agent-Driven
Best for: Complex decisions, personalization, edge cases

```
Event → Agent → Calls MCP tools directly → Decides → Acts
```

### Pattern B: Workflow-Driven
Best for: High volume, simple logic, scheduled tasks

```
Trigger → Workflow → Sequential MCP calls → Logs result
```

### Pattern C: Hybrid (Recommended)
Best for: Most production solutions

```
Event → Agent (quick assessment)
      → Calls workflow.execute for standard path
      → Workflow handles 90% of cases
      → Agent handles exceptions/escalations
```

### Pattern D: Edge Execution
Best for: Privacy, local access, offline capability

```
Event → Cloud routes to edge
      → Edge agent runs locally
      → Calls local MCP tools
      → Syncs result to cloud
```

---

## Multi-Tenancy Model

Each customer gets:
- Isolated workflow configurations
- Own MCP server credentials
- Custom templates and rules
- Usage tracking

Shared across customers:
- Workflow definitions (versioned)
- Agent prompts (versioned)
- MCP tool implementations
- Platform infrastructure

---

## Example: Shopify Backorder Solution

**Phase 1** (Current): `packages/shopify-backorder`
- Standalone Express service
- MCP tools: `shopify.get_order`, `shopify.check_inventory`, `gorgias.create_ticket`
- Deploys to Railway

**Phase 2** (Next):
- Add Claude agent for intelligent decisions
- Agent decides: urgency, customer history, special handling
- Still uses same MCP tools

**Phase 3**:
- Convert logic to pacore workflow
- Expose via `workflow.execute`
- Agent orchestrates workflow + handles exceptions

**Phase 4**:
- "Backorder Detection" solution product
- Customer config: connect their Shopify, choose notification system
- Multi-tenant deployment on pacore platform

---

## AI Agent Guidelines

When updating this documentation:
- Update when adding new solutions or changing architecture
- Don't duplicate content from other docs - link instead
- Keep examples concrete (use shopify-backorder as reference)
