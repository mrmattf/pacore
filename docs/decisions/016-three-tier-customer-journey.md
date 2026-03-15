# ADR-016: Three-Tier Customer Journey — Self-Serve, Assessment, Concierge

## Status
Accepted

## Context

### The Multi-Path Problem

Clarissi has three distinct customer types with different needs, readiness levels, and support expectations:

1. **Technical buyers** who understand what they need, want to self-configure, and prefer predictable per-operation costs without operator involvement.
2. **Interested but uncertain buyers** who need to see their own data before committing — the Assessment is designed for this group.
3. **Outcome-focused buyers** who want a fully managed service with measurable ROI — the Concierge is designed for this group.

Early positioning (ADR-013) framed the primary GTM as Concierge-first, which is correct for maximum ACV. However, the per-operation pricing model (ADR-011) and the Clarissi skills platform are **currently available** and fully capable of serving self-serve customers without operator involvement. Treating Self-Serve as a "Year 2+ future" understates what is available today.

Similarly, ADR-015 framed the Assessment as a gateway exclusively to Concierge. In practice, some customers who complete an Assessment will be better served by Self-Serve — either because their stack is technically simple, they have internal resources to manage skills, or they want to start smaller before committing to a retainer. An Assessment that forces every customer toward Concierge is a misaligned conversion and increases churn risk.

### The Custom Skill Pricing Clarification

A recurring source of confusion: "custom skill pricing calculated at activation." This refers to the static per-operation cost calculation (ADR-011) that occurs when **any** new skill is activated — including skills developed for a Concierge customer's specific use case. When a Concierge operator develops a new custom skill for a customer (from an Assessment Skill Gap Analysis or ongoing monitoring), the platform calculates the ops-per-execution profile at activation time. This is not a separate pricing model. It is the same calculation used for all skills. The cost preview is absorbed into the retainer — it does not create a separate invoice line. The operator uses it to verify the skill is within reasonable operational cost bounds before activating.

## Decision

**Clarissi operates three customer tiers. All three are currently available. The primary sales motion is Concierge-first (ADR-013), but Self-Serve is a live path for the right customer profile today.**

### Tier 1: Self-Serve Skills

**Who it's for:** Technical buyers, existing platform users, or Assessment customers directed to self-manage.

**How it works:**
- Customer connects their Shopify and Gorgias credentials via the Clarissi platform UI
- Activates pre-built skill templates — no operator involvement required
- Skills run autonomously with deduplication, retry, and audit logging (ADR-008)
- Priced per operation (ADR-011): Starter (10K ops/month), Professional (50K ops/month), Scale (200K ops/month)

**Cost preview:** The platform shows exact cost-per-execution at activation — no bill surprises (ADR-011).

**Custom skills in Self-Serve:** Custom skills are developed and activated by Clarissi operators. The platform calculates the per-op cost at activation (ADR-011) — you see the cost preview before the skill goes live. Customer-facing skill creation (BYOM via external AI clients) is not part of the supported Self-Serve experience at initial release; it is planned for a future release once tooling and onboarding are mature.

### Tier 2: Skills Assessment

**Who it's for:** Any prospect who wants to understand their automation opportunity before committing to a tier.

**How it works:** See ADR-015 for full detail. In brief:
- Paid engagement ($1,500–2,500 one-time, based on stack complexity)
- Operator runs agent-powered diagnostic against the customer's live Shopify and Gorgias data
- Produces 4-section Automation Readiness Report: Current Exposure, Skills Match Matrix, Skill Gap Analysis, ROI Projection
- Assessment fee credited toward first Concierge month if converted within 30 days

**Assessment converts to either tier — not exclusively Concierge:**

| Assessment Outcome | Recommended Tier | Signal |
|-------------------|-----------------|--------|
| High ticket volume (500+/mo), complex stack, wants managed outcomes | Concierge | Full ROI projection justifies retainer |
| Lower volume, simple stack, technical buyer, or wants to start small | Self-Serve | ROI positive but retainer overhead not justified yet |
| Gaps identified requiring new custom skills | Concierge | Only operator-led development can fill gaps from Skill Gap Analysis |

The Assessment report explicitly states "We recommend Self-Serve" or "We recommend Concierge" — the recommendation is not left implicit.

**Upgrade path from Self-Serve:** A Self-Serve customer who grows to 500+/month ticket volume or who wants operator management can upgrade to Concierge without a new Assessment — the operator uses 30+ days of execution history as the data source.

### Tier 3: Clarissi Concierge

**Who it's for:** Merchants who want managed outcomes, not a tool to manage.

**Concierge tier structure:**

| Tier | Monthly Retainer | Operator Hours | Active Skills | Target Customer |
|------|-----------------|----------------|---------------|-----------------|
| Starter | $750/month | ~4 hrs/month | 1 skill | Smaller brands, single workflow, validation stage |
| Standard | $1,500/month | ~10 hrs/month | Up to 3 skills | Growing brands, multiple workflows |
| Growth | $2,500/month | ~20 hrs/month | Unlimited skills | High-volume brands, full operational automation |

**All Concierge tiers include:**
- Outcome fee: $2–3 per ticket deflected above 90-day baseline (ADR-014)
- Expansion credit: −$200/month per new skill activated
- Weekly execution log review and threshold tuning
- Monthly outcome report
- Billing via Stripe Invoicing (not Shopify Billing API)

**Custom skills in Concierge:** When the operator develops a new skill for a Concierge customer (from Assessment Skill Gap Analysis or proactive monitoring), the platform calculates the per-op cost at activation (ADR-011). This cost is absorbed into the retainer — it does not create a separate invoice line. The operator uses the cost preview to verify operational cost bounds before activating.

### Customer Journey Map

```
Prospect   │
           ├──► Self-Serve ──────────────────────────────────────► Active Skills
           │    (technical buyer, direct signup)                    (per-op billing)
           │
           ├──► Assessment ($1,500–2,500) ──► Recommend Self-Serve ► Active Skills
           │    (uncertain buyer)          └──► Recommend Concierge ──► Concierge Retainer
           │
           └──► Concierge (direct from relationship) ────────────► Concierge Retainer
                (outcome buyer, Track 1 relationship)               (retainer + outcome fee)

Upgrade path:
Self-Serve (30+ days execution data) ──────────────────────────────► Concierge (no new Assessment)
Concierge Starter ──► Concierge Standard ──► Concierge Growth       (as volume and skill count grow)
```

## Consequences

### Positive

- **No revenue left on the table:** Technical buyers who don't need operator support have a live, billable path today — not a Year 2+ promise
- **Assessment is conversion-agnostic:** Removing pressure to force every Assessment toward Concierge increases customer trust and long-term retention
- **Concierge Starter lowers the commitment bar:** $750/month makes Concierge accessible for brands that are not yet ready for Standard; creates a natural upgrade path
- **Custom skill pricing is unambiguous:** Ops calculated at activation applies to all skills in all tiers — no special pricing model for Concierge custom skills
- **Upgrade path from Self-Serve:** Serves the full customer lifecycle without requiring re-acquisition when a customer outgrows self-management

### Negative

- **Three paths require clear positioning:** Marketing, sales, and the website must clearly distinguish the tiers — risk of confusion if messaging is inconsistent
- **Self-Serve requires self-service onboarding quality:** The platform UI must guide a non-technical buyer through credential setup and skill activation without operator assistance — investment required
- **Concierge Starter margin is tighter:** $750/month with ~4 hrs of operator time leaves less room for error than Standard/Growth

### Mitigation

- Website pricing page clearly differentiates the three paths with distinct entry points and CTAs
- Assessment recommendation output explicitly states the recommended tier with reasoning — not left implicit
- Concierge Starter is positioned as a validation stage, with an explicit expectation of upgrading to Standard within 3 months

## Related

- [ADR-011: Skill Pricing Model](011-skill-pricing-model.md) — Per-op pricing for Self-Serve; static cost preview applies to all tiers including Concierge custom skills
- [ADR-013: SEAN Concierge GTM](013-sean-concierge-gtm.md) — Primary sales motion is Concierge-first; Self-Serve is a live secondary path
- [ADR-014: Outcome-Based Pricing](014-outcome-based-pricing.md) — Outcome fee and Concierge tier retainer structure
- [ADR-015: Assessment-First Sales Motion](015-assessment-first-sales.md) — Assessment converts to either Self-Serve or Concierge based on customer profile
