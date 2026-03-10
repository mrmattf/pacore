# ADR-011: Skill Pricing Model — Per-Operation with Static Cost Preview

## Status
Accepted

## Context

### The Pricing Problem for Customer-Created Skills

Customer-created skills (generated via external AI clients or the internal Builder Agent) introduce a pricing challenge. If PA Core charges per "skill build," the cost is unpredictable — a merchant cannot know how many iterations a skill creation will require. Variable LLM costs billed to the customer create anxiety and limit adoption.

General-purpose automation platforms face this problem differently:
- **Per-seat** (n8n Cloud): predictable but decoupled from actual usage
- **Per-execution** (Zapier): predictable per task, surprises at volume
- **Per-credit** (Make): opaque — customers don't know what a "credit" costs until the bill arrives

None of these align cost with the value delivered.

### BYOM: External AI Clients as the Primary Creation Path

The agent-codegen spec establishes that skills are data (SkillDefinition), not code. The LLM reasoning that *creates* a skill can happen in two paths:

**1. External AI Client (Primary — Bring Your Own Model)**

Claude Desktop, Cursor, or any MCP-compatible AI client connects to PA Core's MCP server and calls skill creation tools directly. The LLM reasoning happens entirely *outside PA Core* — paid for by the customer through their own AI subscription. PA Core receives the finished SkillDefinition via tool call and handles validation, simulation, and execution.

**2. Internal Builder Agent (Optional Add-On)**

PA Core hosts an AI Composer that performs the LLM reasoning internally. This path is available for customers without their own AI client access or for customers who prefer a guided, embedded experience.

**Key consequence of BYOM as primary path**: For most customers, there is zero PA Core LLM cost during skill creation. PA Core's costs are purely operational: webhook ingestion, enrichment calls, action dispatch, deduplication, and audit logging. This eliminates "skill builds" as a billing unit.

### Operations Are Statically Countable

A SkillDefinition is structured data. Its execution cost is fully calculable at parse time — before the skill ever runs:

- **1 op** per trigger evaluation (policy conditions checked)
- **1 op** per enrichment step (`enrichmentSpec.steps[]` entry)
- **1 op** per worst-case invoke action (maximum actions across all policy branches)

This means PA Core can show an exact cost-per-execution at activation time, giving customers a cost preview before they commit.

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
- Skill creation via BYOM path (external LLM handles reasoning; PA Core MCP tools are free to call)
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

**BYOM path (primary):**
- External AI client (Claude Desktop, Cursor, etc.) generates the SkillDefinition at zero PA Core cost
- Customer pays their AI provider for the LLM reasoning
- PA Core charges only for operations executed after activation
- MCP tool calls during creation (`pacore_create_skill`, `pacore_simulate_skill`, `pacore_get_cost_estimate`) consume zero ops

**Internal Builder Agent path (optional add-on):**
- AI Composer LLM calls are billed separately — flat fee per session or included in Enterprise
- Execution ops are billed identically to the BYOM path

This separation keeps the base pricing model simple: **BYOM customers pay only for what runs, never for how they built it.**

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
- **BYOM-aligned**: External AI clients create skills at zero PA Core LLM cost; only execution is metered
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

## Related

- [ADR-005: Builder Agent](005-builder-agent.md) — Primary skill creation paths (BYOM + internal)
- [ADR-007: Skill Template Architecture](007-skill-template-architecture.md) — SkillDefinition structure
- [specs/agent-codegen.md](specs/agent-codegen.md) — Declarative skill generation and BYOM MCP tools
- [ADR-010: Durable Webhook Ingestion](010-durable-webhook-ingestion.md) — Operation execution and retry model