# ADR-017: Operator Skill Discovery — Two-Pass Assessment, Gap Aggregation, and Vertical-Agnostic Tool Design

## Status
Accepted

## Context

Clarissi's value as an operator-delivered platform depends on continuously surfacing new automation opportunities in each customer's ecosystem. The platform launched with 4 skill types. But each customer has different Gorgias tagging hygiene, different Shopify workflows, and different unautomated pain points that don't map to existing templates.

Two distinct problems drive the Assessment motion:

1. **Skill activation gap** — customer has connected integrations but hasn't activated all applicable existing templates. Pure whitespace analysis; nearly free to detect today.
2. **Net-new skill discovery** — customer has workflows that don't map to any existing template. Requires reading signal from their data and reasoning about what automation would be valuable.

These are architecturally different problems solved by different mechanisms. This ADR formalizes both and defines the data-gated evolution from manual to automated discovery.

### The Diversity Problem

Customers vary radically in Gorgias tagging hygiene:
- Mature stores: 30+ tags, consistent application, high-signal clustering
- Newer stores: zero tags, all email, subject-line clustering required

Any discovery mechanism must degrade gracefully when tags are absent. The solution at Phase 1 is LLM-based subject-line clustering — the model reasons about ticket subjects when tags are sparse or inconsistent. This is less reliable than tag-based clustering but handles the realistic distribution of customers.

### Why Two Discovery Modes Are Required

**Scripted discovery** (predefined tool call sequence → structured report) is necessary first because:
- It produces a consistent, auditable, deliverable report
- It finds what it was designed to find — activation gaps and known ticket categories
- It's predictable and fast

**Agentic discovery** (agent decides what to explore, forms hypotheses, iteratively queries) is required to find what wasn't anticipated:
- Agent notices `subscription_cancellation` ticket spike — not a current skill type
- Agent cross-references Shopify recurring order data
- Agent forms hypothesis: "orders with `subscription` tag in Shopify → ticket spike within 48 hours of renewal attempt failure"
- This skill candidate would never appear in the scripted report

Both modes are needed. Scripted = the deliverable. Agentic = "here's what else we found" — the highest-value content justifying the Assessment fee.

## Decision

### Two-Pass Assessment Architecture

The Assessment runs in two passes:

**Pass 1 — Scripted (always runs, produces the four-section report):**
```
gorgias__list_recent_tickets(100, 90 days)
  → in-context clustering (tags + subject patterns)
  → pacore_list_skill_templates
  → gap scoring (coverage × volume × automation_readiness)
  → four-section Automation Readiness Report JSON
```

**Pass 2 — Agentic exploration (Phase 2+, surfaces surprises):**
```
Agent goal: "Explore what the structured report didn't cover."
Tools: metadata discovery tools (list_tags, list_views, list_webhook_topics)
       targeted sampling tools (search_tickets, get_orders_sample)
Output: 1–3 new skill candidates with trigger hypothesis + action hypothesis
```

The operator reviews both passes before delivery. Pass 1 is the report. Pass 2 is the addendum.

### Gap Scoring Model

Each ticket category is scored on three dimensions:

| Dimension | Values | Derivation |
|-----------|--------|-----------|
| `coverage` | `covered` / `gap` | Does a matching skill template exist? |
| `volumeScore` | `high` / `medium` / `low` | % of total tickets; >30% = high, 10–30% = medium, <10% = low |
| `automationReadiness` | `high` / `medium` / `low` | Tag consistency + trigger clarity; high = tags present + clear trigger pattern |

Gap candidates with `volumeScore: high` + `automationReadiness: high/medium` are P1. These drive new skill template development.

### Category Normalization Architecture (Phase 2)

Tag variant normalization uses a two-tier dictionary:

**Tier 1 — Core dictionary** (`packages/cloud/src/skills/category-normalization.core.json`):
- Platform-maintained, updated after every Assessment
- Maps tag variants to canonical categories
- Example: `"backorder-inquiry": ["backorder", "out_of_stock", "oos", "inventory_delay", "backordered"]`
- Compounds into a moat: each Assessment adds coverage

**Tier 2 — Per-account customer dictionary** (stored in `assessments.configuration JSONB`):
- Operator-editable during Assessment review
- Overrides core for accounts with non-standard tagging conventions
- Example: a customer who uses `"b/o"` as their backorder tag

Core dictionary is authoritative; customer dict wins on conflict for that account only.

### Vertical-Agnostic Tool Design

All discovery tools must be designed for vertical-agnostic reuse. The Shopify/Gorgias implementation is first; the interface must generalize.

**Naming convention:** `{integration}__{action}` (double underscore separates integration from action).

**Tool categories:**

| Category | Purpose | Phase |
|----------|---------|-------|
| Summary tools | Aggregate raw data before LLM context | Phase 2 |
| Metadata/schema discovery tools | Let agent explore ecosystem shape | Phase 2 |
| Targeted sampling tools | Let agent test hypotheses cheaply | Phase 2 |
| Cross-signal correlation tool | Close trigger→outcome loop for new skill candidates | Phase 3 |

**Metadata discovery tools (highest leverage):**
- `gorgias__list_tags()` → all tags in use + frequency counts
- `gorgias__list_views()` → what Gorgias queues exist (operators create these around real workflows)
- `shopify__list_webhook_topics()` → event types fired in last 90 days
- `shopify__list_metafield_namespaces()` → custom fields the merchant has defined

These let the agent discover the *shape* of the ecosystem before deciding what to query in depth. A metafield named `subscription_status` signals a workflow worth investigating. A Gorgias view named "VIP complaints" signals an escalation workflow.

**Design these as `list_integration_schema(integration_key)` in the abstract** — so the same pattern extends to Clio, NetSuite, Salesforce without redesign.

### Data Sufficiency Gates

Phase transitions are gated by data, not just engineering readiness:

| Phase | Gate | Why |
|-------|------|-----|
| Phase 1 → 2 | 3–5 completed manual Assessments | Must know what the LLM gets wrong before building automated summary tools |
| Phase 2 normalization dictionary | 10+ customers | Below this, cross-customer tag patterns are unreliable |
| Phase 3 recommendation engine | 15+ active customers | Collaborative filtering needs a minimum corpus to be credible |
| Phase 3 `assessment_gap_candidates` table | 15+ customers | Below this, anonymized patterns could re-identify individual customers |

**Do not promote Phase 2+ features to operators before data gates are met**, even if the engineering is ready. Premature promotion trains operators to distrust the tooling.

### Assessment Tool Infrastructure

**Phase 1 (current):**
- `gorgias__list_recent_tickets(limit, days_back)` — available now
- `pacore_list_skill_templates`, `pacore_list_connections`, `pacore_get_execution_log` — available now
- Operator system prompt: `docs/assessment-prompt-template.md`

**Phase 2 additions:**
- `gorgias__ticket_summary(days_back)` — backend aggregation, replaces raw ticket list for high-volume stores
- `shopify__order_pattern_summary(days_back)` — single call replaces 5 sequential Shopify calls
- Category normalization dictionary
- `assessments` DB table — stores report JSON, gap candidates, status

**Phase 3 additions:**
- `assessment_gap_candidates` table — anonymized cross-customer gap patterns
- Recommendation engine SQL
- Execution signal gap detection (requires ADR-014 P0 deflection counting)
- Automated Assessment runner ("Run Assessment" button → draft PDF in 5–10 min)

### Continuous Discovery for Active Concierge Customers (Phase 3)

Once on Concierge, the agentic loop runs monthly:
1. `pacore_get_execution_log` — last 30 days of skill executions
2. `gorgias__ticket_summary` — last 30 days of ticket categories
3. Compare: ticket category spikes without corresponding skill executions = direct gap signal
4. `shopify__list_metafield_namespaces` / `gorgias__list_tags` — new tags or metafields since Assessment = signals customer workflows have evolved

This is the proactive discovery mechanism for NRR >100%: the operator surfaces gaps before the customer asks.

### Anonymization Requirements for Cross-Customer Data

When building `assessment_gap_candidates` (Phase 3):
- Hash customer IDs (non-reversible)
- Strip business logic values (specific thresholds, brand names, SKU identifiers)
- Retain only structural patterns: `{ category_name, volume_range, slot_combination, status }`
- Do not build this table until 15+ active Concierge customers exist

Consistent with ADR-012 line 216 (platform intelligence anonymization requirements).

## Consequences

**What becomes easier:**
- Operators can run a structured Assessment in <8 hours with the Phase 1 prompt template
- New skill template decisions are driven by scored gap data, not operator intuition
- The category normalization dictionary compounds into a moat — each Assessment improves accuracy for all future Assessments
- The two-pass architecture produces both a consistent deliverable (Pass 1) and high-value unexpected findings (Pass 2)

**What becomes harder:**
- Adding new discovery tooling requires maintaining the vertical-agnostic interface — no `shopify__backorder_specific_hack` shortcuts
- Phase gates mean some operators may want automated Assessment before data justifies it — hold the line on data sufficiency

**Rejected alternatives:**

| Alternative | Why rejected |
|-------------|-------------|
| Single-pass scripted only | Misses unexpected patterns that justify Assessment fees |
| Per-customer normalization dictionaries only | Doesn't compound; each customer starts cold |
| LLM-only clustering without tag signals | Too unreliable for customers with consistent tagging; wastes tokens |
| Build Assessment UI first | Claude Desktop + MCP is sufficient for Phase 1–2; Assessment UI is Phase 5+ overhead |
| Per-vertical discovery architecture | The architecture layer is universal; only adapters and dictionaries differ (see plan vertical scaling analysis) |

## Related

- [ADR-005: Builder Agent](005-builder-agent.md) — operator-only skill creation tooling; skill draft generation routes through Builder Agent after gap candidate is identified
- [ADR-012: Platform Intelligence Layer](012-platform-intelligence-layer.md) — Intent-to-Draft (Role 3) receives gap candidates from Assessment agentic pass
- [ADR-013: GTM / SEAN Concierge Model](013-sean-concierge-gtm.md) — Assessment is the primary top-of-funnel motion
- [ADR-015: Assessment-First Sales](015-assessment-first-sales.md) — business context for why Assessment produces a paid deliverable
- [Assessment Prompt Template](../assessment-prompt-template.md) — operator system prompt for Claude Desktop
