# ADR-005: Domain-Specialized Builder Agent for E-Commerce Operations

## Status
Proposed

## Context

### Market Analysis (February 2026)

The AI agent landscape has rapidly commoditized:

| Capability | Status | Leaders |
|------------|--------|---------|
| MCP Protocol | Standard | AAIF (Anthropic, OpenAI, Block) |
| Agent frameworks | Commoditized | LangChain, Claude SDK, ADK, AutoGen |
| General coding agents | Red ocean | Devin, Claude Code, Codex, Cursor |
| Meta-agents / skill generation | Emerging | OpenClaw (145K stars), Emergent |
| OpenAPI code generation | Mature | OpenAPI Generator, Stainless |

Building a general-purpose "builder agent" would compete in red ocean territory.

### Blue Ocean Opportunity

PA Core's differentiation lies in the **intersection** of:

1. **AI-Gated Determinism**: Agent decides WHEN, tool chains execute HOW
2. **Domain Specialization**: E-commerce operations (not general software)
3. **Orchestrator Business Model**: Platform IP + customer configuration ownership
4. **Outcome-Based Pricing Potential**: Align revenue with customer value

**Competitors are horizontal; PA Core is vertical.**

| Horizontal Agents | PA Core |
|-------------------|---------|
| Build ANY software | Build e-commerce operations solutions |
| Compete with Devin | Compete with vertical SaaS (Gorgias, Shipstation) |
| Developer tool | Business operations platform |
| Per-seat pricing | Outcome-based pricing potential |

## Decision

Build a **Domain-Specialized Builder Agent** focused on e-commerce operations, with planned expansion to adjacent business operations verticals.

### Strategic Positioning

```
┌─────────────────────────────────────────────────────────────────┐
│  LEVERAGE (Commoditized)              │  BUILD (Unique)         │
├───────────────────────────────────────┼─────────────────────────┤
│  MCP Protocol (AAIF standard)         │  E-commerce domain      │
│  Agent runtime (Claude SDK)           │    knowledge encoding   │
│  OpenAPI discovery                    │  Vertical tool chains   │
│  AGENTS.md conventions                │  Multi-tenant Skills    │
│  A2A communication                    │  Outcome metrics        │
└───────────────────────────────────────┴─────────────────────────┘
```

### Beachhead: E-Commerce Operations

Initial domain focus with expansion path:

```
Phase 1 (Beachhead)           Phase 2 (Expansion)
─────────────────────         ──────────────────────
E-commerce Operations    ───► Business Operations
├── Order management          ├── Customer support
├── Inventory/backorders      ├── Finance/billing
├── Fulfillment/shipping      ├── HR/recruiting
├── Customer notifications    ├── IT operations
└── Returns/refunds           └── [Customer-driven]
```

### Entry Points

| Entry Type | Description | Outcome |
|------------|-------------|---------|
| **Platform** | Customer discovers PA Core, selects pre-built Skills | Subscription + per-event |
| **Customer Engagement** | We build custom solution for specific customer | Solution becomes reusable template for platform |

This dual-track approach (from [Product Strategy](../product-strategy.md)) ensures:
- Customer engagements fund development and validate concepts
- Learnings are re-implemented as platform Skills
- IP remains with PA Core; customer owns configuration/data

### Builder Agent Scope

**NOT building** (red ocean):
- General code generation (Devin does this)
- Arbitrary MCP tool scaffolding (OpenAPI Generator does this)
- Universal agent orchestration (LangChain does this)

**Building** (blue ocean):
- E-commerce integration patterns (Shopify, WooCommerce, BigCommerce)
- Support system patterns (Gorgias, Zendesk, Freshdesk)
- Fulfillment patterns (ShipStation, ShipBob, 3PL APIs)
- Domain-specific chain templates (backorder, refund, routing, inventory)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  BUILDER AGENT (Domain-Specialized)                              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  DOMAIN KNOWLEDGE LAYER                                   │   │
│  │  - E-commerce event patterns (order_created, etc.)       │   │
│  │  - Integration schemas (Shopify, Gorgias, etc.)          │   │
│  │  - Industry SLAs and benchmarks                          │   │
│  │  - Best-practice chain templates                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  GENERATION LAYER (Leverages Commoditized Tools)         │   │
│  │  - OpenAPI Generator (for MCP tool scaffolding)          │   │
│  │  - Claude SDK (for agent reasoning)                      │   │
│  │  - AGENTS.md (for generated package instructions)        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  OUTPUT: Multi-Tenant Solutions                           │   │
│  │  - MCP tools (domain-specific)                           │   │
│  │  - Tool chains (deterministic execution)                 │   │
│  │  - Skills (configurable, portable)                       │   │
│  │  - Outcome metrics (measurable value)                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Domain Knowledge Encoding

The Builder Agent's moat is **encoded domain expertise**, not code generation ability:

#### 1. Pattern Library (From Customer Executions)
```yaml
# Learned from real customer usage
patterns:
  backorder_detection:
    triggers: [order_created, inventory_updated]
    common_flows:
      - check_inventory → filter_backordered → create_ticket
      - check_inventory → tag_order → notify_customer
    success_rate: 94%
    avg_resolution_time: 2.3_hours

  order_routing:
    triggers: [order_created]
    common_flows:
      - get_inventory_by_warehouse → calculate_shipping → assign_fulfillment
    decision_factors: [proximity, stock_level, shipping_cost]
```

#### 2. Industry Benchmarks
```yaml
# E-commerce operations benchmarks
benchmarks:
  backorder_notification:
    target_time: 30_minutes
    industry_avg: 4_hours
    top_performers: 15_minutes

  refund_processing:
    target_time: 24_hours
    industry_avg: 72_hours
    customer_satisfaction_impact: 23%_improvement
```

#### 3. Integration Schemas
```yaml
# Pre-encoded knowledge of e-commerce integrations
integrations:
  shopify:
    events: [orders/create, orders/updated, inventory_levels/update]
    common_fields: [order_id, line_items, customer, fulfillment_status]
    rate_limits: { rest: 2/second, graphql: 50_points/second }

  gorgias:
    actions: [create_ticket, add_message, update_ticket]
    required_fields: [customer_email, subject, body]
    via_types: [email, chat, phone, social]
```

### Builder Agent Meta-Tools

Tools focused on domain-specific generation:

#### 1. E-Commerce Integration Discovery
```typescript
// platform.discover_ecommerce_integration
{
  name: "discover_ecommerce_integration",
  parameters: {
    platform: "shopify" | "woocommerce" | "bigcommerce",
    capabilities: ["orders", "inventory", "customers", "fulfillment"]
  },
  output: {
    mcp_tools: [...],           // Generated tool definitions
    webhook_events: [...],      // Available triggers
    common_patterns: [...],     // From pattern library
    recommended_chains: [...]   // Based on capabilities
  }
}
```

#### 2. Domain Chain Generation
```typescript
// platform.generate_ecommerce_chain
{
  name: "generate_ecommerce_chain",
  parameters: {
    pattern: "backorder_detection" | "order_routing" | "refund_processing",
    order_source: "shopify",
    notification_system: "gorgias",
    customizations: {
      priority_rules: [...],
      notification_template: "..."
    }
  },
  output: {
    chain_file: "src/chains/backorder-chain.ts",
    test_file: "src/chains/backorder-chain.test.ts",
    outcome_metrics: ["backorders_detected", "notification_time_ms"]
  }
}
```

#### 3. Skill Packaging
```typescript
// platform.package_skill
{
  name: "package_skill",
  parameters: {
    name: "backorder-detection",
    chain: "backorder-chain",
    integrations: {
      order_source: { type: "ecommerce", supported: ["shopify", "woocommerce"] },
      notification: { type: "ticketing", supported: ["gorgias", "zendesk"] }
    },
    configuration_schema: {
      notification_priority: { type: "enum", values: ["low", "medium", "high"] },
      auto_tag_orders: { type: "boolean", default: true }
    },
    outcome_metrics: {
      revenue_recovered: { type: "currency", calculation: "..." },
      notification_time: { type: "duration", target: "30m" }
    }
  }
}
```

#### 4. Pattern Learning
```typescript
// platform.learn_patterns
{
  name: "learn_patterns",
  parameters: {
    skill: "backorder-detection",
    time_range: "last_90_days",
    customer_segments: ["all"] | ["enterprise", "smb"]
  },
  output: {
    patterns_discovered: [...],
    benchmark_updates: [...],
    suggested_chain_improvements: [...],
    anomalies: [...]
  }
}
```

### Moat Accumulation Strategy

Three reinforcing moat sources:

```
┌─────────────────────────────────────────────────────────────────┐
│                     MOAT ACCUMULATION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. PATTERN LIBRARY                                              │
│     Customer executions → Pattern detection → Library growth     │
│     More customers = Better patterns = Better solutions          │
│                                                                  │
│  2. INDUSTRY BENCHMARKS                                          │
│     Aggregate performance data across customers                  │
│     "Your backorder notification is 2x slower than top 10%"     │
│     Unique data asset competitors can't replicate               │
│                                                                  │
│  3. BEST-PRACTICE CHAIN TEMPLATES                                │
│     Encode what works into reusable, versioned templates        │
│     Continuously improved from pattern learning                  │
│     Domain expertise crystallized in code                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Differentiation: AI-Gated Determinism

PA Core's execution model vs competitors:

| Approach | Execution | Cost | Auditability | Reliability |
|----------|-----------|------|--------------|-------------|
| Pure Workflow (Zapier) | Deterministic | Low | High | High |
| Pure Agent (Devin) | AI reasoning | High | Low | Variable |
| **PA Core** | **AI gates, chain executes** | **Low (90% chains)** | **High** | **High** |

```
Event → Agent reasons (AI, uses tokens)
      → "This is a standard backorder case"
      → Calls tool chain (deterministic, no tokens)
      → Chain executes: get_order → check_inventory → create_ticket
      → Agent handles exceptions if chain fails (AI, uses tokens)
```

**90% of executions are deterministic chains** — cheap, auditable, reliable.
**10% require agent reasoning** — handles edge cases, exceptions, novel situations.

### Outcome-Based Pricing Potential

Domain specialization enables measurable outcomes:

| Solution | Measurable Outcome | Pricing Model |
|----------|-------------------|---------------|
| Backorder Detection | Revenue recovered from prevented cancellations | % of recovered revenue |
| Order Routing | Shipping cost reduction | % of savings |
| Support Triage | Ticket resolution time improvement | Per-ticket with SLA bonus |

**Why competitors can't do this**: Horizontal platforms can't measure domain-specific outcomes. PA Core, being vertical-specialized, CAN measure and price against outcomes.

## Blue Ocean Expansion Features

Strategic features adapted from competitive analysis (Zoho Zia, OpenClaw, etc.) but differentiated for e-commerce vertical:

### 1. E-Commerce Skills Marketplace

**Inspired by**: Zoho Agent Marketplace (25+ general agents)

**PA Core Differentiation**: Curated, e-commerce-specific marketplace

```
PA Core E-Commerce Skills Marketplace:
├── By Use Case
│   ├── Backorder Detection (Shopify + Gorgias)
│   ├── Returns Automation (Loop + Klaviyo)
│   ├── Subscription Churn Prevention (Recharge + Attentive)
│   └── Wholesale Order Routing (Shopify B2B + ShipBob)
├── By Vertical
│   ├── Fashion & Apparel
│   ├── Health & Supplements
│   ├── DTC Food & Beverage
│   └── B2B Wholesale
└── By Integration
    ├── Shopify-native Skills
    ├── WooCommerce-native Skills
    └── BigCommerce-native Skills
```

**Why competitors can't match**: Zoho is horizontal — their marketplace has HR agents next to sales agents. No curation or domain depth.

### 2. AI Composer (Intent-Based Skill Composition)

**Inspired by**: Zoho Agent Studio (no-code builder)

**PA Core Differentiation**: AI-first, conversational composition instead of drag-and-drop

```
┌─────────────────────────────────────────────────────────────────┐
│  MERCHANT                                                        │
│  "When we get a backorder over $500, escalate to VIP team"      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  AI COMPOSER                                                     │
│  • Understands e-commerce domain                                │
│  • Knows available Skills and integrations                      │
│  • Generates composition from natural language                  │
│  • Asks about edge cases proactively                            │
│  • Simulates before activation                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  SKILL COMPOSITION (Generated)                                   │
│  Deterministic execution via tool chains                        │
└─────────────────────────────────────────────────────────────────┘
```

**Why competitors can't match**: Generic no-code builders require merchants to think in workflows. AI Composer lets merchants describe intent in business language.

See [AI Composer Spec](./specs/ai-composer.md) for detailed design.

### 3. E-Commerce Sub-Vertical Agents

**Inspired by**: Zoho industry agents (healthcare, warehouse)

**PA Core Differentiation**: Deep e-commerce sub-vertical specialization

| Sub-Vertical | Specialized Capabilities |
|--------------|-------------------------|
| **Fashion & Apparel** | Size exchange automation, pre-order handling, returns analysis (fit vs quality) |
| **Health & Supplements** | Subscription renewal prediction, autoship handling, FDA compliance |
| **DTC Food & Beverage** | Perishable inventory alerts, temperature routing, expiration management |
| **B2B Wholesale** | Net terms automation, bulk fulfillment routing, reorder reminders |

**Why competitors can't match**: Zoho is too horizontal to encode these patterns. This requires concentrated e-commerce operational knowledge.

### 4. Agency Partner Program

**Inspired by**: Zoho Partner Program (consultants, ISVs)

**PA Core Differentiation**: E-commerce agency-focused, best-of-breed friendly

```
Agency Partner Program:

Benefits:
├── Build Skills for clients using PA Core
├── List Skills in marketplace (revenue share)
├── White-label PA Core for client projects
└── Access to e-commerce pattern library

Revenue Model:
├── Agency builds Skill → Lists in marketplace
├── Other merchants buy Skill → Agency earns %
└── Outcome-based: Agency shares in client's recovered revenue

Target Partners:
├── Shopify Plus agencies (top 100)
├── E-commerce consultancies
├── Gorgias implementation partners
└── Fulfillment consultants
```

**Why competitors can't match**: E-commerce agencies want best-of-breed (Shopify, Gorgias, Klaviyo). They don't want to sell Zoho lock-in to clients.

### 5. Embedded Skills

**Inspired by**: Zoho embeds (agents inside Zoho apps)

**PA Core Differentiation**: Embed in ANY e-commerce tool (not just PA Core)

```
Embedded Skill Locations:
├── Shopify Admin (Order detail page widget)
├── Gorgias (Ticket sidebar widget)
├── ShipStation (Order processing widget)
└── Klaviyo (Flow trigger conditions)
```

**Why competitors can't match**: Zoho can't embed into Shopify or Gorgias — they're competitors. PA Core is neutral and embeds anywhere.

### 6. Industry Benchmarks as Product

**Inspired by**: Zoho Analytics

**PA Core Differentiation**: E-commerce operational benchmarks across customers

```
Benchmark Dashboard:
┌─────────────────────────────────────────────────────────────────┐
│  YOUR BACKORDER PERFORMANCE                                      │
│                                                                  │
│  Notification Time:     32 min   ████████░░░░  Top 30%          │
│  Industry Average:      4 hours                                  │
│  Top Performers:        15 min                                   │
│                                                                  │
│  Recovery Rate:         78%      ██████████░░  Top 20%          │
│  Industry Average:      45%                                      │
│                                                                  │
│  RECOMMENDATIONS:                                                │
│  • Enable auto-tagging to reduce notification time by 40%       │
└─────────────────────────────────────────────────────────────────┘
```

**Why competitors can't match**: Horizontal platforms don't have concentrated e-commerce data. PA Core's vertical focus enables unique benchmark aggregation.

### Expansion Feature Priority

| Feature | Effort | Moat Value | Revenue | Phase |
|---------|--------|------------|---------|-------|
| Agency Partner Program | Low | Very High | Very High | **1** |
| Sub-Vertical Agents | Medium | Very High | High | **2** |
| Embedded Skills | Medium | High | Medium | **2** |
| AI Composer | High | High | High | **3** |
| Skills Marketplace | High | Very High | Very High | **3** |
| Industry Benchmarks | Medium | Very High | Medium | **4** |

## Consequences

### Positive

- **Blue ocean positioning**: Not competing with general agents
- **Domain moat**: Knowledge encoding creates defensible advantage
- **Outcome alignment**: Pricing tied to customer value
- **Efficient scaling**: AI + deterministic chains scale without proportional cost
- **Customer trust**: Auditable chains, split IP ownership

### Negative

- **Narrower initial market**: E-commerce only (intentional beachhead)
- **Domain expertise required**: Must deeply understand e-commerce operations
- **Slower horizontal expansion**: Each new vertical requires knowledge encoding

### Mitigation

- Customer engagements provide domain expertise and fund learning
- Pattern learning automates knowledge accumulation over time
- Vertical expansion prioritized by customer demand

## Implementation Phases

### Phase 1: Domain Knowledge Foundation
- Encode Shopify/Gorgias integration patterns
- Build pattern library from shopify-backorder solution
- Create first 3 e-commerce chain templates
- **Exit criteria**: Successfully generate chain for new e-commerce customer using templates

### Phase 2: Builder Agent Core
- Implement `discover_ecommerce_integration` tool
- Implement `generate_ecommerce_chain` tool
- Human-in-the-loop review workflow
- **Exit criteria**: Reduce new integration time from days to hours

### Phase 3: Skill Packaging
- Implement `package_skill` tool
- Multi-tenant deployment infrastructure
- Configuration UI for customers
- **Exit criteria**: 3 Skills deployable to multiple customers

### Phase 4: Pattern Learning
- Implement `learn_patterns` tool
- Benchmark aggregation across customers
- Automated chain improvement suggestions
- **Exit criteria**: System suggests 1+ valid improvement per week

### Phase 5: Vertical Expansion
- Customer-driven expansion to adjacent verticals
- Replicate domain knowledge encoding process
- **Exit criteria**: Second vertical (e.g., customer support) operational

## Success Metrics

| Metric | Current | Phase 1 | Phase 4 |
|--------|---------|---------|---------|
| Time to new e-commerce integration | 2-3 days | 4-8 hours | 1-2 hours |
| Chain templates in library | 1 | 5 | 20+ |
| Pattern library entries | 0 | 10 | 100+ |
| Multi-tenant Skills | 0 | 1 | 5+ |
| Customers on platform | 1 | 3 | 10+ |

## Open Questions

1. **Outcome pricing timing**: When to introduce outcome-based pricing? (After proving value?)
2. **Benchmark privacy**: How to aggregate benchmarks while protecting customer data?
3. **Vertical selection**: After e-commerce, which vertical next? (Customer-driven)
4. **Edge execution**: Which e-commerce operations benefit from local execution?

## Related

- [Product Strategy](../product-strategy.md) - Go-to-market and business model
- [AI Agents](../ai-agents.md) - Agent architecture patterns
- [AI Composer Spec](./specs/ai-composer.md) - Detailed AI Composer design
- [ADR-001: MCP for Integrations](001-mcp-for-integrations.md) - Foundation protocol
- [ADR-008: Tool Chain Architecture](../../packages/shopify-backorder/docs/decisions/008-tool-chain-architecture.md) - Deterministic execution
- [Shopify Backorder Solution](../../packages/shopify-backorder/CLAUDE.md) - Reference implementation

## References

- [AAIF - Agentic AI Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
- [OpenClaw](https://github.com/openclaw/openclaw) - General-purpose agent (competitive reference)
- [Anthropic Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use) - Tool infrastructure to leverage
- [AGENTS.md Specification](https://agents.md/) - Convention for generated packages
