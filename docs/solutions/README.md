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

## Active Solutions

| Solution | Package | Phase | Agent | Workflows | Edge | Customization |
|----------|---------|-------|-------|-----------|------|---------------|
| Backorder Detection | [shopify-backorder](../../packages/shopify-backorder/) | 1 - MVP | Planned | Planned | Optional | Order source, notification system |

## Planned Solutions

| Solution | Description | Order Source | Action System | Priority |
|----------|-------------|--------------|---------------|----------|
| Order Routing | Route orders to fulfillment centers | Shopify, WooCommerce | Shipping APIs | Medium |
| Support Triage | Classify and route support tickets | Gorgias, Zendesk | Ticket systems | Medium |
| Inventory Alerts | Proactive low-stock notifications | Shopify, ERP | Slack, Email | Low |

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
