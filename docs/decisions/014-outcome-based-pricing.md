# ADR-014: Outcome-Based Pricing for Concierge Engagements

## Status
Accepted

## Context

### The Value Misalignment Problem

ADR-011 defines per-operation pricing as the self-serve model: customers pay for platform operations (trigger evaluations, enrichment steps, action dispatches). Per-operation pricing is predictable and auditable, but it decouples cost from customer value.

For a Shopify brand with 600 automatable tickets/month:
- Per-operation value (ADR-011): ~$149/month (Scale tier, 200K ops)
- Actual value delivered: 600 tickets × $5/ticket cost = $3,000/month of labor cost avoided

The 20× gap means per-operation pricing captures ~5% of the value delivered. Outcome-based pricing closes this gap.

### Why Outcomes Are Measurable for E-Commerce

Unlike most SaaS categories, e-commerce operations produce concrete, measurable outcomes:
- **Ticket deflection:** Did a Gorgias ticket fail to appear after a skill fired? (Measurable via API)
- **Fraud prevention:** Did a high-risk order get correctly flagged before chargeback? (Measurable via Shopify order data)
- **Revenue retention:** Did a customer who received a backorder notification choose to wait rather than cancel? (Measurable via order status)

These are not proxy metrics — they are direct measures of labor saved, losses prevented, and revenue retained.

### Market Precedent

Outcome-based pricing is established in adjacent categories:
- **Intercom Fin AI:** $0.99/resolution — customer pays only when a support ticket is automatically resolved
- **Chargeflow:** 25% of chargebacks recovered — vendor absorbs risk, aligns entirely with customer outcome
- **Zendesk AI Agents:** $1.50–2.00/resolution — anchored to the ~$5 cost of a human agent resolution

Gartner projects 40% of enterprise SaaS will include outcome-based components by 2026 (up from 15% in 2022).

## Decision

**Concierge customers use a hybrid pricing model: base retainer + outcome fee. Per-operation metering (ADR-011) remains the self-serve pricing model.**

### Pricing Structure

Concierge pricing uses named tiers with different retainer levels and operator hour allocations (see ADR-016 for full tier structure):

| Tier | Base Retainer | Operator Hours | Active Skills |
|------|--------------|----------------|---------------|
| Starter | $750/month | ~4 hrs/month | 1 skill |
| Standard | $1,500/month | ~10 hrs/month | Up to 3 skills |
| Growth | $2,500/month | ~20 hrs/month | Unlimited skills |

All tiers include the outcome fee and expansion credit:

| Component | Amount | Trigger |
|-----------|--------|---------|
| Ticket deflection fee | $2–3 per ticket deflected above 90-day baseline | Measured via Gorgias execution history |
| Fraud prevention fee | 8% of fraud losses prevented above baseline | Measured via Shopify high-risk order data |
| Expansion credit | −$200/month per new skill activated | Incentivizes operator-led expansion |

**Billing:** Monthly invoice via Stripe Invoicing. Not Shopify Billing API. Attribution agreed in MSA before engagement starts.

### Outcome Definitions

**Ticket Deflection:**
A ticket is considered deflected when:
1. A skill fires for a qualifying event (e.g., backorder detected on an order)
2. No ticket is created in Gorgias in the same ticket category within 24 hours of the skill execution
3. The outcome is logged in `skill_executions.result JSONB` with `deflected: true`

**Fraud Loss Prevention:**
- Baseline: average monthly chargeback value in the 90 days before skill activation
- Prevented: orders flagged as high-risk where the skill fired AND no chargeback occurred within 90 days
- Fee: 8% of (baseline monthly chargeback value − current monthly chargeback value)

**Revenue Retention (backorder):**
- Retained: orders where the backorder notification was sent AND the order was not cancelled within 14 days
- Estimated retention value: order value × customer-agreed retention rate (typically 60–70% of notified customers wait)
- Fee: optional — typically included in ticket deflection metric rather than billed separately

### Baseline Measurement

**90-day silent measurement period:**
- Begins at Concierge engagement start, before skill activation
- Clarissi pulls Gorgias ticket category volume via API for 90 days
- Stored as baseline in `user_skills.configuration JSONB` per skill type
- Outcome fees begin only after baseline is established — no retroactive charges

**Baseline update policy:**
- Baselines do not auto-update after the initial period — prevents baseline drift gaming
- Can be renegotiated annually or after major operational changes (e.g., 2× GMV growth)

### Attribution Methodology

The biggest risk in outcome pricing is attribution disputes — did the deflection happen because of Clarissi or because of a seasonal decline, carrier improvement, or other factor?

**Mitigation:**
1. **Pre-agreed methodology in MSA:** Attribution rules are documented and customer-signed before engagement starts
2. **Gorgias execution log:** Every skill execution is logged with `idempotency_key`, timestamp, and outcome — provides an auditable trail
3. **Category-level attribution:** Deflection is measured per ticket category (e.g., `backorder_inquiry`) matching the skill type — not total tickets. A decline in shipping delay tickets does not credit the backorder notification skill.
4. **30-day dispute window:** Customer may flag attribution disputes within 30 days of invoice. Clarissi shares execution logs to resolve.

### Infrastructure Requirements

Outcome pricing requires infrastructure not yet fully built. Priority order:

| Priority | Work | Timeline |
|----------|------|---------|
| P0 | Gorgias deflection counting: after skill fires, call Gorgias API to verify ticket category did not appear within 24 hours | 4 weeks |
| P1 | Baseline storage: 90-day pre-activation ticket volume per category in `user_skills.configuration JSONB` | 2 weeks |
| P2 | Operator dashboard: multi-client view with deflection totals, monthly report generation | 3–4 weeks |
| P3 | Assessment report generator: automated Automation Readiness Report from MCP tools | 2 weeks |

**Key files:**
- `packages/cloud/src/api/gateway.ts` — new deflection verification endpoint
- `packages/cloud/src/integrations/gorgias/` — post-execution ticket verification call
- `packages/core/src/types/skill.ts` — add `baseline` and `deflectionCount` to execution result
- `packages/web/src/pages/BillingPage.tsx` — operator dashboard + monthly report view

### Self-Serve Outcome Pricing (Future)

Outcome-based pricing is currently exclusive to Concierge. When self-serve is the deliberate strategy (Year 2+), a simplified outcome model can be offered alongside per-operation pricing:
- Customer opts into outcome pricing tier at activation
- Platform measures deflection automatically
- Billing via Stripe metered billing (not Shopify Billing API if sold direct)

## Consequences

### Positive

- **ACV 17–27× higher** than per-operation self-serve for the same volume of work
- **NRR >100%** — outcome fees grow as more skills activate and deflection compounds
- **Customer alignment:** Customer pays more only when they receive more value — no adversarial billing relationship
- **Competitive moat:** Competitors cannot offer outcome pricing without outcome measurement infrastructure (which requires deep Gorgias/Shopify integration)

### Negative

- **Attribution disputes:** High likelihood (70% of outcome-pricing companies report disputes). Mitigated by pre-agreed methodology and execution log audit trail.
- **Cash flow variability:** Outcome component fluctuates month-to-month. Base retainer provides floor; outcome provides upside.
- **Infrastructure dependency:** Gorgias deflection counting and baseline measurement must be built before outcome pricing can be formally invoiced. Can be manually verified in the interim.

### Mitigation

- Manual verification during infrastructure build phase: operator manually reviews Gorgias ticket volume against baseline and prepares invoice
- Transparent execution logs shared with customer monthly — builds trust before automated billing
- Start outcome fee at 90 days (after baseline + tuning) — never charge outcome fees on day 1

## Related

- [ADR-011: Skill Pricing Model](011-skill-pricing-model.md) — Per-operation model for Self-Serve; this ADR defines the Concierge overlay
- [ADR-013: SEAN Concierge GTM](013-sean-concierge-gtm.md) — Business model context for Concierge pricing
- [ADR-015: Assessment-First Sales Motion](015-assessment-first-sales.md) — Assessment produces the ROI projection that sets pricing expectations
- [ADR-016: Three-Tier Customer Journey](016-three-tier-customer-journey.md) — Full Concierge tier definitions (Starter/Standard/Growth) and Self-Serve path
