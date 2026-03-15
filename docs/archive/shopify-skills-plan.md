# Shopify Skills Roadmap — PA Core

> **Status: Implementation Complete (March 2026)** — All 4 skill types (backorder-notification, low-stock-impact, high-risk-order-response, delivery-exception-alert) are built and deployed.
> The market research and competitive analysis below remains valid strategic context.

## Market Validation Summary

Research confirms Shopify merchants have a universal automation problem: **every existing tool is trigger → template**. A data event fires, a pre-written message goes out with variable substitution. No tool reads the full context of an order, customer history, and inventory situation to decide what the right action and message actually is. That is the PA Core differentiator.

### Pain Points Validated

| Pain Point | Market Evidence | Existing Tools | Gap |
|---|---|---|---|
| Backorder notification (post-purchase) | Merchants manually notify customers; chargebacks from mishandled backorders | "Back in Stock" apps are all **pre-purchase waitlists** — none handle orders already placed | ✅ True gap |
| Proactive delivery exception | WISMO tickets = 60% of all support tickets | AfterShip sends tracking emails; Zipchat answers WISMO questions reactively | ✅ No proactive outreach before complaint |
| Low stock → order impact | Inventory oversell / stockout is #1 operational chaos complaint | Merchant-only alerts (Ablestar, Stocky) — no bridge to customer communication | ✅ True gap |
| High-risk order response | Chargebacks up 14% YoY; merchants lose 80% of disputes | Signifyd/Kount provide a risk score — nobody handles the customer-facing communication | ✅ True gap |
| WISMO / order status | 60% of support tickets | AfterShip, Zipchat well-established | ❌ Too competitive — skip |
| Cart abandonment | Real pain but highly contested | Klaviyo dominates; requires marketing team, not automation | ❌ Skip |
| Inventory reorder / PO | Real pain | Prediko, Assisty exist with AI forecasting | ❌ Different buyer (ops/purchasing vs. CS) — skip |

### Why Existing Tools Lose to PA Core

- **Klaviyo / Omnisend**: Dominant for marketing email, but rule-based template fills. Can't read an order and compose a contextually appropriate message. High setup burden, not operational.
- **Gorgias / Zendesk automation rules**: Keyword-matching if/then. A VIP customer with a $3,000 backordered order gets the same response as a first-time buyer with a $40 order.
- **AfterShip Returns / Loop**: Customer-initiated — the customer files the return first. Nothing proactive.
- **Shopify Flow**: Improved in 2025-2026 (Sidekick AI assists with building flows), but still fires pre-built templates. Exception handling is fragile — one bad input halts the entire flow.
- **The consolidation problem**: Average Shopify merchant runs 14+ apps costing $200-500/month with no cross-system intelligence. PA Core's pitch is one platform that reads across all of them.

---

## Skills to Build

### Skill 1 — Backorder Notification ✅ Already Built

**What it does:** Detects when a newly placed order contains items with zero or negative inventory and sends a proactive customer notification via Gorgias or Zendesk offering partial shipment options.

**Why it wins:** Every "Back in Stock" app on the market is a pre-purchase waitlist. None handle "order placed, item now backordered — communicate with customer." This scenario has no dedicated product. PA Core owns it.

**Status:** SkillTemplate implemented with Shopify → Gorgias and Shopify → Zendesk variants. Validated — Yota migrated from standalone app to this Clarissi skill.

---

### Skill 2 — Delivery Exception Alert

**What it does:** Monitors shipment status for active orders. When a carrier reports a delivery exception (failed delivery, damaged, returned to sender, weather delay) the skill proactively contacts the customer with a resolution — before they file a WISMO ticket or leave a negative review.

**Why it wins:** AfterShip emails customers tracking updates but doesn't compose a contextual resolution message. Zipchat answers "where is my order" reactively when the customer asks. No tool proactively reaches out the moment a delivery goes wrong and offers to reship, refund, or escalate based on order value and customer history.

**AI differentiator:** The message content adapts — a $500 order gets a personal apology and immediate reship offer; a $20 order gets a standard notification. Rule-based tools send the same template to both.

**New infrastructure needed:**
- AfterShip adapter (`SlotAdapter` implementing webhook receipt + tracking API)
- New webhook trigger type: `fulfillment_events` (shipping status change)

**Template variants:** Shopify + AfterShip → Gorgias, Shopify + AfterShip → Zendesk

---

### Skill 3 — Low Stock Customer Impact

**What it does:** When inventory for a product variant drops to zero (or below a configured threshold), the skill identifies all open orders containing that variant, evaluates the impact per customer, and sends proactive notifications with options — wait for restock, substitute with a similar item, or cancel for a full refund.

**Why it wins:** Every inventory alert app notifies the **merchant** (Ablestar, Stocky, Low Stock Alert). None bridge that alert to **customer impact**. A merchant learns their inventory hit zero but still has to manually figure out which orders are affected and send emails one by one. PA Core closes that loop automatically.

**AI differentiator:** The skill can prioritize outreach by customer LTV and order value — high-value customers hear first, with a more personal message and a stronger offer.

**New infrastructure needed:**
- New webhook trigger type: `inventory_levels/update` (Shopify inventory webhook)
- Shopify adapter: `findOrdersByVariant()` method (find open orders containing a variant)

**Template variants:** Shopify → Gorgias, Shopify → Zendesk

---

### Skill 4 — High-Risk Order Response

**What it does:** When Shopify's fraud analysis flags an order as medium or high risk, the skill evaluates whether to (a) send an identity verification email to the customer, (b) hold fulfillment and alert the merchant internally, or (c) auto-cancel with a notification — based on order value, customer history, and the specific risk signals present.

**Why it wins:** Shopify Flow can cancel a high-risk order or tag it. Signifyd/Kount provide a risk score and chargeback guarantee. Nobody handles the **customer-facing communication** side. A legitimate repeat customer placing an unusually large order gets the same auto-cancel as an actual fraudster — causing lost revenue and a furious customer. PA Core's skill reads context and chooses the right response.

**AI differentiator:** A rule-based tool sees "high risk = cancel." PA Core sees "high risk + 5 previous orders + same shipping address = send verification email, not cancel."

**New infrastructure needed:**
- New webhook trigger type: `orders/risk_analyzed` (Shopify sends this after fraud analysis completes)
- Shopify adapter: `getCustomerOrderHistory()` method

**Template variants:** Shopify → Gorgias, Shopify → Zendesk, Shopify → internal Slack alert

---

## Architecture Fit

All four skills map cleanly onto the existing SkillTemplate infrastructure:

```
Shopify webhook → SkillTrigger → SkillDispatcher
  → BackorderChain        (Skill 1 — done)
  → DeliveryExceptionChain (Skill 2)
  → LowStockImpactChain   (Skill 3)
  → HighRiskOrderChain    (Skill 4)
    ↓
  AdapterRegistry.invokeCapability('gorgias' | 'zendesk' | 'slack', ...)
```

Shared infrastructure across all four:
- Shopify SlotAdapter (already built — `read_orders`, `read_products`, `read_inventory`)
- Gorgias SlotAdapter (already built)
- Zendesk SlotAdapter (already built)
- SkillTemplateRegistry (already built)
- CredentialManager (already built)
- Webhook trigger pipeline (already built)

New adapters needed:
- **AfterShip** SlotAdapter — for Skill 2 (shipping tracking webhooks + API)
- **Slack** SlotAdapter — for Skill 4 internal alerts (simple incoming webhook)

New Shopify webhook types to support (minor addition to existing trigger handler):
- `inventory_levels/update` — Skill 3
- `orders/risk_analyzed` — Skill 4
- `fulfillment_events/create` — Skill 2 (if not using AfterShip)

---

## Execution Plan

### Phase 1 — Validate Skill 1 (2 weeks)
- [ ] Complete Yota Xpedition end-to-end test (real credentials, real webhook, real Gorgias ticket)
- [ ] Confirm the SkillTemplate activation flow works end-to-end in PA Core UI
- [ ] Document what "activating a skill" looks like from the merchant's perspective
- [ ] Fix any gaps found during Yota testing

**Exit criteria:** One real order through the full pipeline, ticket created in Gorgias.

### Phase 2 — Skill 3: Low Stock Customer Impact (2 weeks)
Build this before Skill 2 because it reuses 100% of existing infrastructure — only needs a new webhook type and one new Shopify API call.

- [ ] Add `inventory_levels/update` webhook support to trigger handler
- [ ] Add `findOrdersByVariant()` to ShopifyOrderAdapter
- [ ] Write `LowStockImpactChain` (mirrors BackorderChain structure)
- [ ] Create `LowStockImpactSkillType` + two template variants (Gorgias, Zendesk)
- [ ] Register in SkillTemplateRegistry + AdapterRegistry
- [ ] End-to-end test: drop inventory to 0 → verify affected orders notified

### Phase 3 — Skill 4: High-Risk Order Response (2 weeks)
Also reuses 100% of existing infrastructure. Only new requirement is the `orders/risk_analyzed` webhook and a Slack adapter for internal alerts.

- [ ] Add `orders/risk_analyzed` webhook support to trigger handler
- [ ] Add `getCustomerOrderHistory()` to ShopifyOrderAdapter
- [ ] Create Slack SlotAdapter (simple incoming webhook — 1 day)
- [ ] Write `HighRiskOrderChain` with three action paths: verify / hold+alert / cancel+notify
- [ ] Create `HighRiskOrderSkillType` + template variants
- [ ] End-to-end test: place high-risk test order → confirm correct action path fires

### Phase 4 — Skill 2: Delivery Exception Alert (3 weeks)
Requires AfterShip adapter — most new infrastructure of the four skills.

- [ ] Create AfterShip SlotAdapter (webhook receipt + tracking API lookup)
- [ ] Add AfterShip webhook endpoint to gateway
- [ ] Write `DeliveryExceptionChain`
- [ ] Create `DeliveryExceptionSkillType` + template variants
- [ ] End-to-end test: trigger delivery exception in AfterShip sandbox → customer notification sent

---

## Product Positioning

**The pitch:** Every automation tool on Shopify is a trigger and a template. PA Core is the first platform that reads the full context — order value, customer history, inventory status, risk signals — and decides what the right action and message actually is. Not fill-in-the-blank. Not if/then rules. Situational intelligence.

**Target merchant:** Shopify stores doing $3M–$20M/year. Large enough to feel the operational pain ($500+ tickets/month, real fraud exposure, inventory events at scale), but without a dedicated automation analyst or ops engineer. They know what processes hurt — they lack the infrastructure to automate them reliably.

**Go-to-market:** Concierge-first (not self-serve app store). The primary motion is an **Assessment → Concierge Retainer** path:
1. PA Core runs a paid Skills Assessment ($1,500–2,500) using live Shopify + Gorgias data to produce an Automation Readiness Report — which skills to activate and why, with volume projections and ROI estimates
2. Assessment converts to a Concierge retainer ($1,500–2,000 base + outcome fee per ticket deflected above baseline)
3. PA Core operator manages skill activation, weekly tuning, and monthly outcome reporting on the customer's behalf

Shopify App Store distribution is a Year 2+ strategy for self-serve scale. Current distribution is direct through Track 1 consulting relationships and outbound to Shopify + Gorgias brands in the ICP.

**Pricing model:** Hybrid retainer + outcome fee. Base retainer covers operator time and platform access. Outcome component ($2–3/ticket deflected above 90-day baseline) aligns PA Core revenue with customer value delivered. Billing via Stripe invoice — not Shopify Billing API.
