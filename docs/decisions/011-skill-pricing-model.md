# ADR-011: Clarissi Skill Pricing Model — Per-Operation with Static Cost Preview

## Status
Accepted

## Context

### The Pricing Problem for Customer-Created Skills

Customer-created skills (generated via external AI clients or the internal Builder Agent) introduce a pricing challenge. If Clarissi charges per "skill build," the cost is unpredictable — a merchant cannot know how many iterations a skill creation will require. Variable LLM costs billed to the customer create anxiety and limit adoption.

General-purpose automation platforms face this problem differently:
- **Per-seat** (n8n Cloud): predictable but decoupled from actual usage
- **Per-execution** (Zapier): predictable per task, surprises at volume
- **Per-credit** (Make): opaque — customers don't know what a "credit" costs until the bill arrives

None of these align cost with the value delivered.

### Skill Creation Paths (Operator-Only at Initial Release)

The agent-codegen spec establishes that skills are data (SkillDefinition), not code. The LLM reasoning that *creates* a skill can happen in two paths. At initial release, **both paths are used by Clarissi operators**, not by customers directly. Customer-facing skill creation is planned for a future release.

**1. External AI Client (BYOM — Operator-Used)**

The Clarissi operator connects Claude Desktop or any MCP-compatible AI client to Clarissi's MCP server and calls skill creation tools directly. The LLM reasoning happens entirely *outside Clarissi* — paid for through the operator's own AI subscription. Clarissi receives the finished SkillDefinition via tool call and handles validation, simulation, and execution.

**2. Internal Builder Agent (Optional Add-On)**

Clarissi hosts an AI Composer that performs the LLM reasoning internally. This path is available for operators who prefer a guided, embedded experience.

**Key consequence for billing**: There is zero Clarissi LLM cost during skill creation via the BYOM path. Clarissi's costs are purely operational: webhook ingestion, enrichment calls, action dispatch, deduplication, and audit logging. This eliminates "skill builds" as a billing unit — customers pay only for operations executed after activation, regardless of which path created the skill.

### Operations Are Statically Countable

A SkillDefinition is structured data. Its execution cost is fully calculable at parse time — before the skill ever runs:

- **1 op** per trigger evaluation (policy conditions checked)
- **1 op** per enrichment step (`enrichmentSpec.steps[]` entry)
- **1 op** per worst-case invoke action (maximum actions across all policy branches)

This means Clarissi can show an exact cost-per-execution at activation time, giving customers a cost preview before they commit.

## Decision

### Unit of Pricing: The Operation

An **operation** is one discrete unit of platform work during a skill execution:

| Work | Operations Charged |
|------|-------------------|
| Trigger received + policy evaluated | 1 |
| Each enrichment step executed | 1 per step |
| Each invoke action dispatched (worst-case branch) | 1 per action |
| DLQ retry of a failed execution | 1 (same as original) |

Operations are **not** charged for:
- Skill creation via BYOM path (external LLM handles reasoning; Clarissi MCP tools are free to call)
- Skill simulation (dry run against fixture data)
- Duplicate webhook detection (rejected before queue entry — ADR-010)
- Keepalive pings and health checks

### Static Cost Calculation at Activation

When a skill moves from `simulated` → `active`, the platform parses the SkillDefinition and calculates a static `OpsProfile`:

```
ops_per_execution = 1 (trigger evaluation)
                  + count(enrichmentSpec.steps)
                  + max(invoke_actions across policy branches)

estimated_monthly_ops = ops_per_execution × estimated_monthly_triggers
```

`estimated_monthly_triggers` sources (in priority order):
1. **Historical webhook volume** — 30-day rolling count for this adapter+event in the account
2. **Customer estimate** — user-entered value if no history exists
3. **Conservative default** — 1,000/month for new adapter connections

### Cost Preview UI

Before activation, the platform presents a cost breakdown:

```
Skill Cost Estimate
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Skill: VIP Backorder Notification
  Trigger evaluation       1 op
  Fulfil ETA lookup        1 op
  Shopify customer lookup  1 op
  Gorgias ticket create    1 op
  ─────────────────────────────
  Total per execution      4 ops

Estimated trigger volume:  ~2,400/month (based on last 30 days)
Estimated monthly ops:     ~9,600 ops

Current plan: Professional (50,000 ops/month included)
Remaining budget after this skill: ~40,400 ops/month

Recommendation: Within plan limits. No action needed.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Activate Skill]   [Adjust Plan]   [Back to Simulation]
```

Activation is not blocked — the preview is informational with an option to adjust the plan before proceeding.

### Plan Tiers

Plans are **per account**, not per skill. All skills in an account share the monthly ops budget.

| Plan | Ops Included | Overage (per 1,000 ops) | Target |
|------|-------------|------------------------|--------|
| Starter | 10,000/mo | $2.00 | 1–3 active skills, low volume |
| Professional | 50,000/mo | $1.50 | 5–15 active skills |
| Scale | 200,000/mo | $1.00 | High-volume commerce operations |
| Enterprise | Custom | Negotiated | Large orgs, SLA guarantees |

### Budget Guardrails

Per-skill and per-account guardrails can be configured:

| Guardrail | Default | Configurable |
|-----------|---------|-------------|
| Monthly ops cap per account | Plan limit | Yes — lower cap for predictability |
| Alert threshold | 80% of cap | Yes |
| Per-skill ops share limit | None | Yes — optional ceiling per skill |
| Overage behavior | Bill overage | Yes — can hard-stop at cap |

### BYOM Billing Separation

**BYOM path (operator-used):**
- Operator's external AI client (Claude Desktop, Cursor, etc.) generates the SkillDefinition at zero Clarissi cost
- Operator pays their AI provider for the LLM reasoning (not billed to customer)
- Clarissi charges only for operations executed after activation
- MCP tool calls during creation (`pacore_create_skill`, `pacore_simulate_skill`, `pacore_get_cost_estimate`) consume zero ops

**Internal Builder Agent path (optional add-on):**
- AI Composer LLM calls are billed separately — flat fee per session or included in Enterprise
- Execution ops are billed identically to the BYOM path

This separation keeps the base pricing model simple: **customers pay only for what runs, never for how it was built.**

### Plan Recommendation Engine

At the cost preview step, if estimated monthly ops exceed the current plan:

```
⚠ Estimated ops (9,600) exceed your Starter plan limit (5,000/mo).
  Activating this skill will incur ~$9.20/month in overage charges.

  Recommended upgrade: Professional ($X/mo) — includes 50,000 ops.
  [Upgrade and Activate]   [Activate Anyway]   [Go Back]
```

The recommendation engine also surfaces at the account dashboard level, aggregating all active skills' consumption against the plan budget.

## Consequences

### Positive

- **Predictable**: Exact cost shown before activation — no bill surprises
- **BYOM-aligned**: External AI clients create skills at zero Clarissi LLM cost; only execution is metered
- **Usage-aligned**: Efficient skills (fewer enrichment steps) cost less — incentivizes good skill design
- **Auditable**: Every billed operation maps to a real platform action in the execution log
- **Encourages iteration**: No per-build cost means customers can draft, revise, and simulate without cost anxiety

### Negative

- **Volume estimation is imperfect**: New customers without 30 days of history must estimate trigger volume
- **Complex skills cost more at scale**: A skill with 3 enrichment steps costs 4× more per execution than a single-step skill
- **Shared budget complexity**: Accounts with many skills must manage an aggregate ops budget

### Mitigation

- Volume estimates auto-update after 30 days of data; re-estimate prompt shown at the 30-day mark
- Ops breakdown is shown transparently — customers can optimize enrichment steps if cost is a concern
- Account-level budget dashboard shows all skills' consumption in a single view

## Implementation Phases

| Phase | Deliverable |
|-------|-------------|
| 1 | `OpsProfile` computed from SkillDefinition at parse time; stored in DB alongside definition |
| 2 | Webhook volume tracker (30-day rolling count per adapter+event per account, Redis) |
| 3 | Cost estimate API: `GET /skills/:id/cost-estimate` |
| 4 | Cost preview step in activation flow; plan recommendation engine |
| 5 | Budget guardrails: per-account ops counter (Redis), alert webhooks, configurable caps |
| 6 | Internal Builder Agent billing (add-on, separate line item) |

## Concierge Pricing Overlay

The per-operation model (above) applies to Self-Serve customers. **Self-Serve is currently available** — customers can connect credentials, activate skills, and run at per-op billing without operator involvement today (not a future state). See ADR-016 for the full three-tier customer journey.

Concierge customers (see [ADR-013](013-sean-concierge-gtm.md) and [ADR-014](014-outcome-based-pricing.md)) use a different billing structure that runs alongside, not instead of, the operations model:

**Concierge hybrid pricing:**
- **Base retainer:** $1,500–2,000/month — covers platform access + operator time (~10 hrs/month)
- **Outcome fee:** $2–3 per ticket deflected above the 90-day pre-activation baseline — measured via Gorgias execution history
- **Expansion credit:** −$200/month per new skill activated (operator incentive to expand customer coverage)

**Billing mechanics:**
- Monthly invoice via Stripe Invoicing — **not Shopify Billing API** (avoids App Store revenue share requirements)
- Per-operation metering still runs internally for Concierge customers; the operator uses ops data to tune thresholds and generate monthly outcome reports
- The cost preview (above) is still shown — the operator uses it to scope engagements and show customers projected costs at Assessment time

**Attribution methodology (required for outcome pricing):**
- 90-day silent measurement before outcome fees begin — establishes baseline ticket volume per category
- Deflection counted when a skill fires and the corresponding Gorgias ticket category does not appear within 24 hours
- Attribution methodology agreed in MSA before engagement starts — disputes are resolved by Gorgias execution log

## Related

- [ADR-005: Builder Agent](005-builder-agent.md) — Primary skill creation paths (BYOM + internal + Concierge)
- [ADR-007: Skill Template Architecture](007-skill-template-architecture.md) — SkillDefinition structure
- [ADR-013: SEAN Concierge GTM](013-sean-concierge-gtm.md) — Concierge business model
- [ADR-014: Outcome-Based Pricing](014-outcome-based-pricing.md) — Outcome metric definitions and attribution
- [ADR-016: Three-Tier Customer Journey](016-three-tier-customer-journey.md) — How Self-Serve, Assessment, and Concierge relate; custom skill pricing clarification
- [specs/agent-codegen.md](specs/agent-codegen.md) — Declarative skill generation and BYOM MCP tools
- [ADR-010: Durable Webhook Ingestion](010-durable-webhook-ingestion.md) — Operation execution and retry model