# Solutions Index

Solutions are customer-facing products powered by pacore workflows and AI agents. Customers see a polished product; they don't know about the underlying platform.

## Solution Lifecycle

| Phase | Description | Deliverable |
|-------|-------------|-------------|
| 1. Standalone MVP | Validate concept | Working package in `packages/` |
| 2. AI Agent | Add intelligence | Agent-enabled version |
| 3. Workflow | Convert to pacore | Manageable workflow |
| 4. Solution | Multi-tenant product | Customer-configurable |

See [Product Strategy](../product-strategy.md) for full details.

## Platform Skills (PA Core native)

These skill types ship as part of the PA Core platform. Users activate them via the Skills UI — no deployment required.

| Skill Type | Description | Integrations | Status |
|------------|-------------|--------------|--------|
| `backorder-notification` | Notify customers when ordered items are out of stock | Shopify → Gorgias / Zendesk / Re:amaze | Active |
| `low-stock-impact` | When inventory drops to zero, notify affected open-order customers | Shopify → Gorgias / Zendesk / Re:amaze | Active |
| `high-risk-order-response` | Alert team and optionally notify customer on fraud-flagged orders | Shopify → Gorgias + Slack / Zendesk + Slack | Active |
| `delivery-exception-alert` | Notify customer when a shipment hits a delivery exception | AfterShip + Shopify → Gorgias / Zendesk | Active |

All skill types support an optional `escalation` slot for routing high-priority internal alerts to a separate support channel.

## Customer Deliverables

These are standalone packages built for specific customers. They are **not** PA Core platform features (see ADR-006).

| Solution | Package | Status |
|----------|---------|--------|
| Backorder Detection (Yota) | [shopify-backorder](../../packages/shopify-backorder/) | Delivered — customer-owned |

## Planned Skill Types

| Skill Type | Description | Priority |
|------------|-------------|----------|
| Order Routing | Route orders to fulfillment centers based on inventory/location | Medium |
| Support Triage | Classify and route inbound tickets | Medium |

## Solution Architecture

Each solution consists of:

```
┌─────────────────────────────────────────────────────────────┐
│                    SOLUTION PACKAGE                          │
│  packages/<solution-name>/                                   │
├─────────────────────────────────────────────────────────────┤
│  MCP TOOLS                                                   │
│  - Integration tools (shopify.*, gorgias.*, etc.)           │
│  - Exposed via HTTP/WebSocket                               │
├─────────────────────────────────────────────────────────────┤
│  AI AGENT (Phase 2+)                                         │
│  - Solution-specific prompts                                │
│  - Calls MCP tools + workflow.execute                       │
├─────────────────────────────────────────────────────────────┤
│  WORKFLOWS (Phase 3+)                                        │
│  - Deterministic processing                                 │
│  - Exposed via Workflow MCP                                 │
├─────────────────────────────────────────────────────────────┤
│  DOCUMENTATION                                               │
│  - CLAUDE.md (AI agent context)                             │
│  - docs/ (architecture, patterns, ADRs)                     │
└─────────────────────────────────────────────────────────────┘
```

## Customization Points

Solutions allow customers to swap integrations:

### Input Adapters (Data Sources)

| Category | Adapters |
|----------|----------|
| E-commerce | Shopify, WooCommerce, Magento, BigCommerce |
| ERP | NetSuite, SAP, Odoo |
| Support | Gorgias, Zendesk, Freshdesk, Intercom |

### Output Adapters (Actions)

| Category | Adapters |
|----------|----------|
| Email | Gmail, SendGrid, Mailgun, SES |
| Messaging | Slack, Teams, Discord |
| Ticketing | Gorgias, Zendesk, Jira |
| SMS | Twilio, MessageBird |

## IP Ownership

Solutions follow the [Orchestrator business model](../product-strategy.md#business-model-orchestrator):

- **We own**: Solution templates, MCP tools, workflow definitions, agent prompts
- **Customer owns**: Their credentials, business rules, thresholds, data, execution history

A customer's configuration is portable. The platform and reusable components are our IP.

## Adding a New Solution

1. **Create standalone package**: `packages/<solution-name>/`
2. **Build MCP tools**: Expose integration capabilities
3. **Document**: Create CLAUDE.md and docs/
4. **Validate**: Test with real customer
5. **Add agent** (Phase 2): Intelligent decision layer
6. **Convert to workflow** (Phase 3): Manageable processing
7. **Package** (Phase 4): Multi-tenant deployment

See [Backorder Detection](../../packages/shopify-backorder/CLAUDE.md) as the reference implementation.

## AI Agent Guidelines

When updating this documentation:
- Add new solutions to the Active Solutions table when they reach Phase 1
- Move from Planned to Active when development starts
- Keep descriptions brief - link to package CLAUDE.md for details
- Update Customization Points when new adapters are added
