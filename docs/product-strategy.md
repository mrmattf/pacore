# Product Strategy

## Vision

**PA Core is a Personal Assistants platform** - AI-powered assistants that help users automate tasks, manage business operations, and integrate with their tools.

### Core Capabilities

- **Multi-provider AI**: Claude, OpenAI, Azure, Ollama (BYOK - Bring Your Own Keys)
- **MCP Tools**: Universal integration interface for any service
- **Tool Chains**: Deterministic execution for repeatable operations
- **Skills**: Portable, reusable capability definitions
- **Edge Execution**: Local LLMs for privacy, desktop access

### What We're NOT Building

- A general-purpose chatbot
- A visual workflow builder (like Zapier/n8n)
- A single-provider solution

---

## Go-to-Market Strategy

### Track 1: Customer Engagements (Consulting)

Build standalone solutions for customers to validate concepts and fund development:

| Aspect | Description |
|--------|-------------|
| **Ownership** | Customer owns the specific solution per licensing agreement |
| **We Gain** | Infrastructure know-how, integration patterns, architecture validation |
| **Example** | Yota Xpedition Backorder Detection (standalone app) |

**Key Principle**: Customer engagements are separate from the platform. We don't embed customer-owned code into PA Core. Instead, we:
1. Build the solution they need
2. Learn patterns and techniques
3. Re-implement similar capabilities in the platform (clean-room)

### Track 2: Platform Building (Product)

Build PA Core using know-how from customer engagements:

| Aspect | Description |
|--------|-------------|
| **We Own** | Platform, reusable modules, solution templates |
| **Customer Owns** | Configuration, data, business rules |
| **Revenue** | Per-event, subscription tiers, or outcome-based |

See [Business Model: Orchestrator](#business-model-orchestrator) for IP ownership details.

---

## AI-Native Architecture

PA Core is agent-first. We do NOT build a custom workflow engine.

### Tiered Solution Building

| Tier | Name | Description | Who Does What |
|------|------|-------------|---------------|
| **0** | Platform | Tool chains, MCP tools, agent runtime | We build (deterministic) |
| **1** | Pre-built Skills | Use existing capabilities | Customer configures |
| **2** | Composition | Combine Skills + conditions | Customer designs flow |
| **3** | Custom Code | AI generates edge-case logic | AI writes, customer approves |
| **4** | Full Agent Mode | AI continuously adapts | AI reasons + acts autonomously |

### Tool Chains (Deterministic Execution)

Determinism comes from code-level tool chains, not workflow DAGs:

- Tool chains are TypeScript functions we build
- They execute specific sequences of MCP tool calls
- Agent decides WHEN to use them, chain executes HOW
- Powers Tier 1 (Skills) and Tier 2 (Composition)

```typescript
// Example: Deterministic backorder processing
async function processBackorder(orderId: string) {
  const order = await shopify.getOrder(orderId);
  const inventory = await shopify.checkInventory(order.lineItems);
  const backordered = inventory.filter(i => i.available < i.needed);
  if (backordered.length > 0) {
    await gorgias.createTicket({ orderId, items: backordered });
    await email.send({ to: order.customer, template: 'backorder' });
  }
  return { processed: true, backorderedCount: backordered.length };
}
```

### Full Agent Mode (Tier 4)

Agent has access to:
- All Tier 1 Skills (can invoke any)
- Tier 2 Compositions (can trigger configured flows)
- Tier 3 Custom Code (can call customer's functions)
- Raw MCP Tools (for novel situations)

Agent behavior:
- Continuously monitors events
- Decides best approach per situation
- Handles edge cases autonomously
- Learns from feedback
- Escalates when confidence is low

### Skills Format

Skills are portable, declarative capability definitions:

```yaml
name: backorder-detection
description: Detect and notify customers of backorders
tools_required:
  - shopify.get_order
  - shopify.check_inventory
  - gorgias.create_ticket
mode: deterministic  # Uses tool chain, no AI reasoning in execution
```

### Multi-Provider Support (BYOK)

Platform supports multiple AI providers via `LLMProviderRegistry`:
- Anthropic (Claude) - default
- OpenAI (GPT-4, GPT-4o)
- Azure OpenAI - enterprise compliance
- Ollama - local/private execution

Customers can BYOK or use platform-provided models.

---

## Solution Development Lifecycle

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   PHASE 1    │    │   PHASE 2    │    │   PHASE 3    │
│  Standalone  │───►│  AI Agent    │───►│    Skill     │
│     MVP      │    │    Layer     │    │  Packaging   │
└──────────────┘    └──────────────┘    └──────────────┘
```

### Phase 1: Standalone MVP

**Goal**: Validate the concept works

- Build as standalone package or customer engagement
- Create MCP tools for integrations
- Create tool chains for deterministic operations
- Deploy independently (Railway, Docker)
- Test with real customer data

**Exit Criteria**:
- Customer validates the value proposition
- MCP tools and tool chains are stable
- Core logic is proven

### Phase 2: AI Agent Layer

**Goal**: Add intelligent decision-making

- Integrate AI agent runtime
- Agent uses tool chains and MCP tools
- Handle edge cases that deterministic logic can't
- Agent observability (decisions, reasoning, token usage)

**Exit Criteria**:
- Agent handles edge cases effectively
- Customer approves agent behavior
- Cost per decision is acceptable

### Phase 3: Skill Packaging

**Goal**: Multi-tenant, customer-configurable Skill

- Define Skill specification (tools required, instructions)
- Abstract integrations (Shopify → "Order Source", Gorgias → "Notification System")
- Customer configuration UI
- Multi-tenant deployment
- Usage tracking and billing

**Exit Criteria**:
- Multiple customers can use the same Skill
- Each customer has isolated configuration
- Customer can swap integrations (e.g., Zendesk instead of Gorgias)

---

## Architecture Layers

### 1. Customer Solutions (Top)

What customers see and use. Examples:
- "Backorder Detection" - Detect inventory issues, notify customers
- "Order Routing" - Route orders to appropriate fulfillment centers
- "Support Triage" - Classify and route support tickets

Customers interact with Skills and agents. They don't see the underlying infrastructure.

### 2. Intelligence Layer

Agent-first architecture with deterministic tool chains:

| Component | Role | Characteristics |
|-----------|------|-----------------|
| **AI Agents** | Decide WHEN to act | Reasoning, flexible, handles edge cases |
| **Tool Chains** | Execute HOW | Deterministic, auditable, cheap |
| **Skills** | Define WHAT | Portable, configurable, reusable |

**Execution Pattern**:
```
Event → Agent reasons → Calls tool chain → Deterministic execution → Agent handles exceptions
```

### 3. MCP Tool Layer

Universal interface consumed by agents and tool chains:

**Integration MCP Servers**:
- `shopify.get_order`, `shopify.check_inventory`
- `gorgias.create_ticket`, `gorgias.add_message`
- `gmail.send`, `slack.notify`, etc.

**Tool Chains** (code-level):
- `processBackorder()` - Shopify → inventory check → Gorgias ticket
- `routeOrder()` - Order → fulfillment logic → shipping API
- Deterministic functions that call MCP tools in sequence

### 4. Execution Layer

**Cloud Runtime**:
- API gateway
- Agent runtime
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

The key architectural insight: **MCP tools are consumed by both agents AND tool chains**.

```
                    ┌─────────────┐
                    │  AI Agent   │
                    │  (decides)  │
                    └──────┬──────┘
                           │ calls
                           ▼
              ┌────────────────────────┐
              │     TOOL CHAINS        │
              │  (deterministic code)  │
              └────────────┬───────────┘
                           │ calls
                           ▼
              ┌────────────────────────┐
              │      MCP TOOLS         │
              │  - shopify.get_order   │
              │  - gorgias.create      │
              │  - gmail.send          │
              └────────────────────────┘
```

Benefits:
- Agent decides WHEN to act, tool chain executes HOW
- Adding a new MCP tool benefits all tool chains and agents
- Consistent interface, reusable across Skills
- Test tools once, use everywhere

---

## Execution Patterns

### Pattern A: Agent + Tool Chain (Recommended)
Best for: Most production use cases

```
Event → Agent (decides action needed)
      → Calls tool chain (deterministic execution)
      → Tool chain calls MCP tools
      → Agent handles exceptions if needed
```

### Pattern B: Direct Agent
Best for: Novel situations, edge cases, personalization

```
Event → Agent → Calls MCP tools directly → Reasons → Acts
```

### Pattern C: Scheduled Tool Chain
Best for: Bulk processing, scheduled tasks

```
Cron trigger → Tool chain executes → MCP calls → Logs result
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
- Isolated Skill configurations
- Own MCP server credentials
- Custom business rules and thresholds
- Usage tracking

Shared across customers:
- Skill definitions (versioned)
- Tool chain implementations
- MCP tool implementations
- Platform infrastructure

---

## Example: Customer Engagement vs Platform Solution

### Customer Engagement: Yota Backorder Detection

Built as standalone app for Yota Xpedition:
- Customer owns the solution (per licensing agreement)
- Standalone Express service, not on PA Core platform
- We gain: Shopify/Gorgias integration patterns, webhook handling, notification logic

**What Yota gets**: A working backorder detection app they own and can modify.

**What we gain**: Know-how for building similar capabilities in the platform.

### Platform Solution: Backorder Detection Skill

What we build into PA Core (clean-room, using know-how):
- Reusable "Backorder Detection" Skill
- Configurable for any Shopify store
- Swappable notification system (Gorgias, Zendesk, email)
- Multi-tenant deployment

**Key distinction**: The platform Skill is built independently using patterns learned, not by copying Yota's code.

---

## Business Model: Orchestrator

PA Core follows the **Orchestrator** business model (MIT Sloan classification): we own the platform and solution templates, customers own their configuration and data.

### Why Orchestrator?

The Orchestrator model solves a key tension in AI-powered services:
- **Pure SaaS** (one-size-fits-all) doesn't capture the value of custom AI solutions
- **Pure Services** (custom builds per customer) doesn't scale — traditionally requires more engineers per customer
- **Orchestrator** combines both: a reusable platform with customer-specific configuration, where AI agents replace the need for per-customer engineering

AI agents enable the Orchestrator model to scale without proportional headcount growth. Instead of hiring engineers to customize solutions per customer, agents handle customer-specific logic, integrations, and edge cases.

### IP Ownership Model

Clean separation of intellectual property between platform owner and customer:

| Layer | Owner | What It Includes |
|-------|-------|------------------|
| Platform (pacore) | **Us** | Agent runtime, tool chains, MCP framework, UI |
| Reusable modules | **Us** | MCP tool implementations, integration adapters |
| Solution templates | **Us** | "Backorder Detection", "Order Routing" as products |
| Customer configuration | **Customer** | Credentials, thresholds, business rules, templates |
| Customer data | **Customer** | Orders, tickets, customer lists, execution history |

**Key principle**: Customers own their business rules and data. We own the platform and reusable components. A customer's configuration is portable — they could leave with their rules and data. But the platform, solution templates, and reusable modules remain our IP and can be resold to other customers.

### Revenue Model Options

| Model | How It Works | Best For |
|-------|-------------|----------|
| **Per-event** | Charge per order processed, per ticket created, per decision made | High-volume solutions |
| **Tiered subscription** | Bronze/Silver/Gold tiers with event limits and feature gates | Predictable revenue |
| **Outcome-based** | Charge percentage of savings or value generated | High-value solutions |

These models can be combined (e.g., tiered subscription with per-event overage charges).

### Scaling with AI Agents

Traditional service model scaling:
```
More customers → More engineers → Linear cost growth
```

Orchestrator + AI agents scaling:
```
More customers → More agent configurations → Marginal cost growth
                  (same platform, same agents, different configs)
```

Each new customer requires:
1. Configuration (credentials, rules, thresholds) — one-time setup
2. Skill selection and customization — one-time or automated
3. Ongoing: agents handle interactions, tool chains handle bulk processing

No per-customer engineering team required.

---

## AI Agent Guidelines

When updating this documentation:
- Update when adding new solutions or changing architecture
- Don't duplicate content from other docs - link instead
- Keep examples concrete (use shopify-backorder as reference)
