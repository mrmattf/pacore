# ADR-013: Go-to-Market — SEAN Hybrid / Concierge-First Model

## Status
Accepted

## Context

### The SaaS Distribution Problem

The default assumption for a skills platform is Shopify App Store distribution: build a listing, merchants install, billing flows through Shopify's API. This path has concrete problems at the current stage:

- Shopify App Store requires Shopify Billing API for revenue collection — which mandates 15% revenue share above $1M cumulative developer revenue and forecloses external billing via Stripe
- App Store discovery requires an established brand, ratings, and marketing budget — none of which Clarissi has at launch
- Self-serve onboarding creates a customer success vacuum: merchants who self-install at $49–$149/month generate insufficient revenue to fund meaningful support
- The SaaS pricing ceiling ($149/month = ~$1,800 ACV) dramatically underprices the value delivered — a brand with 600 automatable tickets/month at $5/ticket is receiving $3,000/month of value; charging $149 misaligns incentives

### Taylor Holiday's SEAN Thesis

Taylor Holiday (Common Thread Collective) argues that the SaaS/agency distinction is collapsing. The most valuable next-wave businesses combine SaaS scalability with agency outcome-orientation. Key insight: SaaS companies and agencies both use the same humans — it's an accounting label, not a structural difference.

CTC's Prophit System is the canonical example: software + strategy layer sold as a single managed offering. CTC ran e-commerce clients first, learned what the platform needed, built it, then offered it as a managed service. That is exactly what Clarissi/Clarissi is doing via Track 1 consulting.

SEANs (Software-Enabled Agency Networks) run at 60–70% gross margins (vs. 90% SaaS) but achieve NRR >100% — because operators proactively expand customers into new capabilities. They are highly PE-attractive for this reason.

### Clarissi Is Already an Accidental SEAN

The Track 1 consulting work (Yota Xpedition) and the platform (Clarissi) are the same people doing the same work — the only question is what to call it on the invoice. The strategic decision is to name and formalize this deliberately rather than continuing to treat managed service revenue as "not the real business."

## Decision

**Primary GTM is Concierge (managed service), not self-serve App Store listing. Shopify App Store distribution is deferred to Year 2+ when self-serve becomes a deliberate strategic choice. Self-Serve is a live path today for the right customer profile — see ADR-016.**

### The Concierge Model

Clarissi assigns a dedicated operator per Concierge client. The operator:
- Handles credential setup and skill activation on the customer's behalf
- Reviews execution logs weekly and tunes skill thresholds
- Produces monthly outcome reports (tickets deflected, fraud prevented, revenue retained)
- Proactively activates new skills as they ship — driving NRR >100%

The operator is the trust anchor; the software is the delivery infrastructure.

### The Sales Motion: Assessment → Concierge

Cold-selling a $149/month Shopify app has poor conversion. Leading with a paid diagnostic converts at higher rates and anchors the customer relationship on outcomes before any commitment.

**Step 1 — Skills Assessment ($1,500–2,500 one-time):**
- Clarissi runs an agent-powered diagnostic against the customer's live Shopify and Gorgias data
- Produces an Automation Readiness Report: current exposure, skills match matrix, skill gap analysis, ROI projection
- Powered by existing MCP tools (`shopify_check_inventory`, `pacore_list_skill_templates`, `gorgias_get_tickets`)
- The assessment IS the product demo — the agent using Clarissi's tools is the same infrastructure the customer will use in production
- See [ADR-015](015-assessment-first-sales.md) for full Assessment motion detail

**Step 2 — Concierge Retainer:**
- Hybrid pricing: base retainer ($1,500–2,000/month) + outcome fee ($2–3/ticket deflected above 90-day baseline)
- Operator handles everything — customer's only interaction is the monthly readout call
- See [ADR-014](014-outcome-based-pricing.md) for outcome pricing detail

### Distribution Channels (in order of priority)

| Channel | Timeline | Notes |
|---------|----------|-------|
| Track 1 relationships → Concierge conversion | Now | Yota and similar existing relationships |
| Outbound to Shopify + Gorgias brands | Months 1–3 | ICP: $3M–$20M GMV, 500+ tickets/month |
| E-commerce agencies as platform customers | Months 6–18 | One agency deal = access to 20–100 brands |
| Shopify App Store (self-serve) | Year 2+ | Only when self-serve is the deliberate strategy |

### IP Protection for Track 1 Customers

When a Track 1 customer's operational insights influence the platform roadmap, the following protections apply (codified in the engagement MSA):

1. **IP separation clause:** Customer owns their configuration, thresholds, templates, and data. Clarissi owns platform execution mechanics and generalized patterns.
2. **Named competitor exclusion:** Clarissi will not sell to specified direct competitors for 18 months from engagement start.
3. **Configuration confidentiality:** Customer-specific rules, thresholds, and templates are never shared with or accessible to other customers. This is architecturally enforced (per-account data isolation) and contractually guaranteed.

### Vertical Expansion

E-commerce (Shopify + Gorgias) is the launch vertical. The Concierge model and Assessment motion are vertical-agnostic — the same playbook applies to:
- Marketing agencies (campaign pacing alerts, ROAS flags, client reporting)
- Manufacturing (production line alerts, supplier lead time, maintenance scheduling)
- Financial services (compliance alerts, portfolio threshold flags, deadline tracking)
- Legal (matter deadline alerts, billing flags, intake routing)
- Healthcare (after HIPAA compliance investment, Year 3+)

**Expansion signal:** 2+ Track 1 engagements requesting the same class of problem in a new vertical. Start with one Concierge client in the target vertical; build skill templates from that engagement.

## Consequences

### Positive

- **Higher ACV:** Concierge retainers at $2,500–4,000/month vs. $149/month SaaS — 17–27× better unit economics
- **NRR >100%:** Operators proactively activate new skills, making expansion automatic
- **No Shopify App Store dependency:** Direct billing via Stripe/invoice; 0% Shopify revenue share; no App Store review requirement
- **Customer success built-in:** Operator manages outcomes — no customer success vacuum typical of low-ACV self-serve
- **Platform roadmap driven by real ops:** Concierge operators surface gaps that become new skill templates; Assessment skill gap analysis provides direct demand signal

### Negative

- **Operator headcount required:** Concierge does not scale infinitely without hiring operators (~1 operator per 8–10 clients)
- **Slower to scale than self-serve:** Direct sales motion is slower than App Store install; compensated by dramatically higher revenue per customer
- **Operator churn risk:** A departing operator could take client relationships. Mitigated by documented playbooks and multiple operators per account above 5 clients.

### Rejected Alternative: App Store First

Deferred rather than rejected outright. App Store listing becomes the right move when:
- Self-serve is the deliberate revenue strategy (Year 2+)
- Brand and ratings are established via Concierge case studies
- The $1M fee-free App Store tier provides runway before 15% revenue share kicks in

## Related

- [ADR-011: Skill Pricing Model](011-skill-pricing-model.md) — Per-op pricing for Self-Serve; Concierge overlay
- [ADR-014: Outcome-Based Pricing](014-outcome-based-pricing.md) — Outcome metric definitions, attribution methodology, and Concierge tier structure
- [ADR-015: Assessment-First Sales Motion](015-assessment-first-sales.md) — Skills Assessment as entry wedge
- [ADR-016: Three-Tier Customer Journey](016-three-tier-customer-journey.md) — Self-Serve as currently available path; Concierge tier definitions (Starter/Standard/Growth)
- [ADR-005: Builder Agent](005-builder-agent.md) — Entry points updated to include Concierge
- [Product Strategy](../product-strategy.md) — Track 1/2 model and SEAN positioning
