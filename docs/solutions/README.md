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

## Deprecated Customer Deliverables

These packages were built for specific customers and are no longer active. They are archived for reference only (see ADR-006).

| Solution | Package | Status |
|----------|---------|--------|
| Backorder Detection (Yota) | [shopify-backorder](../../packages/shopify-backorder/) | Deprecated — archived; Yota migrated to Clarissi platform skill |

## Planned Skill Types

Sourced from Skills Assessment gap analysis (ADR-015/017). Second assessment (March 2026) expanded the catalog to 20+ candidates across 5 dependency tiers. Customer selects which skills to build — prioritization is customer-driven. See [ADR-019](../decisions/019-gorgias-webhook-source.md) for the Gorgias webhook infrastructure decision.

### Dependency Tiers

| Tier | Blocker | Notes |
|------|---------|-------|
| **A** | None | Shopify-only trigger — no net-new skills identified (partial shipment already covered by `backorder-notification` `partial_backorder` template) |
| **B** | ADR-019 implementation | Gorgias as webhook source — enables all Gorgias-triggered skills |
| **C** | ADR-021 + Fulfil.io MCP registration | Fulfil.io ERP events — genuinely new capabilities, no existing tool equivalent |
| **D** | ADR-010 (BullMQ) + ADR-022 (scheduled execution) | Delayed/timed skills — gate on queue infrastructure |
| **E** | Turn 14 `Turn14Adapter` (REST, OAuth 2.0) | Turn 14 Distribution supplier integration — polling-based triggers |

### Tier B — Gorgias-Triggered Skills
> Gorgias AI Agent 2.0 natively handles cancellations and address edits. For those skills, Clarissi's value is governance (operator templates, audit trail) and backorder-specific logic Gorgias doesn't have. `post-resolution-review-request` is genuinely new — no native Gorgias equivalent.

| Skill Type | Description | Integrations | Value Type | Priority |
|------------|-------------|--------------|------------|----------|
| `order-cancel-urgent-edit` | Cancel/urgent-edit ticket → if backordered: offer ETA/substitute/incentive before cancel; if shipped: return instructions | Gorgias + Shopify → Gorgias | Governance + backorder logic | P1 |
| `pre-fulfillment-address-edit` | Address edit ticket → update Shopify address if unfulfilled; empathetic reply if already shipped | Gorgias + Shopify → Gorgias | Governance | P1 |
| `post-resolution-review-request` | CSAT 5 or Positive tag → 48h delayed review link sent to customer | Gorgias → Gorgias | Genuinely new | P2 |
| `negative-feedback-recovery` | CSAT < 3 or Negative tag → 24h delayed recovery message + Shopify discount code | Gorgias + Shopify → Gorgias | Partial overlap with Gorgias Rules; adds discount code generation | P2 |
| `partner-product-status` | Partner product ticket → fulfillment redirect response | Gorgias + Shopify → Gorgias | Governance | P2 |
| `abandoned-cart-reachout` | Shopify abandoned checkout → timed outbound Gorgias sequence. **Note:** Shopify Flow already handles basic abandoned cart emails natively — only build if customer needs Gorgias-channel outreach, cart-value segmentation, or operator template control | Shopify → Gorgias | Light governance | P3 |

### Tier C — Fulfil.io ERP Skills
> Fulfil.io is data-layer only — no native customer-facing notifications for any PO, ASN, routing, or inventory event. All Tier C skills are genuinely new capabilities. Fulfil.io has a native MCP server; PA Core registers it via `MCPRegistry` for zero-code enrichment. A minimal `FulfilioWebhookAdapter` (webhook registration + HMAC only) handles Tier C triggers.

| Skill Type | Description | Integrations | Priority |
|------------|-------------|--------------|----------|
| `inbound-po-eta-update` | Fulfil.io PO ASN confirmed → fan-out notify all backordered customers with confirmed inbound date | Fulfil.io + Shopify → Gorgias | P1 |
| `restock-date-change-alert` | Fulfil.io PO delivery date updated → push revised ETA to affected customers before they ask | Fulfil.io + Shopify → Gorgias | P1 |
| `pre-order-ship-date-update` | Fulfil.io restock date refreshes → push updated ETA to backorder customers (14+ days waiting prioritized) | Fulfil.io + Shopify → Gorgias | P1 |
| `dropship-partner-status-update` | Fulfil.io dropship PO events → proactive supplier timeline message to customer | Fulfil.io + Shopify → Gorgias | P1 |
| `oversell-prevention-alert` | Shopify order → compare committed vs available in Fulfil.io → internal Slack alert if oversold | Fulfil.io + Shopify → Slack | P1 (internal) |
| `automated-dropship-po-notification` | Fulfil.io auto-creates dropship PO → customer notification at earliest possible moment | Fulfil.io + Shopify → Gorgias | P2 |
| `high-value-order-routing-confirmation` | Fulfil.io assigns order to fulfillment location → personalized confirmation for $500+ orders | Fulfil.io + Shopify → Gorgias | P2 |
| `inventory-reconciliation-alert` | Fulfil.io/Shopify inventory diverges beyond threshold → ops Slack alert | Fulfil.io + Shopify → Slack | P2 (internal) |

### Tier D — Scheduled/Delayed Skills
> Gated on ADR-010 (BullMQ queue) + ADR-022 (scheduled execution). The following Tier B skills have a delay gate in addition to the Gorgias webhook requirement:
- `negative-feedback-recovery` — 24h delay before sending recovery message
- `post-resolution-review-request` — 48h delay before sending review request
- `abandoned-cart-reachout` — multi-step timed sequence (T+1h, T+24h)

### Tier E — Turn 14 Distribution Supplier Skills
> Turn 14 Distribution is YotaXpedition's B2B automotive parts supplier. They use Turn 14's dropship program; "Drop Ship" and "Partner Product" Gorgias tags are Turn 14-fulfilled orders. Turn 14 has a REST API (OAuth 2.0) with real-time inventory, pricing, orders, and shipment tracking. No native MCP server — requires `Turn14Adapter`. Confirm with customer: API credentials, % dropship volume, and whether the Turn 14 Shopify app (Data Here-to-There) is already in use before building.

| Skill Type | Description | Integrations | Priority |
|------------|-------------|--------------|----------|
| `turn14-inventory-sync` | Scheduled: query Turn 14 stock for sourced SKUs → update Shopify product availability if Turn 14 is out of stock | Turn 14 + Shopify | P1 |
| `turn14-dropship-eta-notification` | Turn 14-fulfilled order ships → query Turn 14 tracking → proactive Gorgias message with ETA | Turn 14 + Shopify → Gorgias | P1 |
| `turn14-partner-product-auto-response` | Gorgias "Partner Product" ticket → auto-reply with live Turn 14 lead time + shipping info | Turn 14 + Gorgias → Gorgias | P2 |
| `turn14-price-sync-monitor` | Scheduled: compare Turn 14 MAP pricing to Shopify prices → internal Gorgias alert on MAP violation | Turn 14 + Shopify → Gorgias | P2 |
| `turn14-restock-alert` | Polling: Turn 14 inventory moves 0→in-stock for tracked SKU → re-enable Shopify product + optionally notify waitlist | Turn 14 + Shopify → Gorgias | P2 |

**Tier C vs Tier E:** Fulfil.io manages YotaXpedition's own fulfillment operations. Turn 14 is an upstream supplier — they own the inventory and ship direct to customer. `dropship-partner-status-update` (Tier C) uses Fulfil.io PO events if Fulfil.io manages Turn 14 POs; `turn14-dropship-eta-notification` (Tier E) queries Turn 14 directly. Customer chooses based on whether Fulfil.io manages Turn 14 POs.

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
| ERP | Fulfil.io (native MCP server), NetSuite, SAP, Odoo |
| Supplier/Distributor | Turn 14 Distribution (REST API, OAuth 2.0) |
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

See [Backorder Detection](../../packages/shopify-backorder/CLAUDE.md) as a reference implementation (archived).

## AI Agent Guidelines

When updating this documentation:
- Add new solutions to the Active Solutions table when they reach Phase 1
- Move from Planned to Active when development starts
- Keep descriptions brief - link to package CLAUDE.md for details
- Update Customization Points when new adapters are added
