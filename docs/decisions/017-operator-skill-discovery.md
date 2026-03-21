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

**Phase 2 Extension — Configuration Topology Discovery (see below)**

**Phase 3 additions:**
- `assessment_gap_candidates` table — anonymized cross-customer gap patterns
- Recommendation engine SQL
- Execution signal gap detection (requires ADR-014 P0 deflection counting)
- Automated Assessment runner ("Run Assessment" button → draft PDF in 5–10 min)

### Phase 2 Extension: Configuration Topology Discovery

#### The Gap in Current Architecture

The two-pass Assessment reads **data patterns** (ticket volume, order events) to identify automation *opportunities*. It does not read **system configuration** to identify automation *inefficiencies*. These are distinct and equally valuable.

What an agent currently sees via `pacore__list_connections`:
- "You have Shopify, Gorgias, and AfterShip connected"

What an agent does NOT currently see:
- How Shopify is configured internally (Flows, automation rules, metafield usage)
- How Gorgias automation rules are set up (what fires automatically, what manual handlers exist)
- How AfterShip notification rules are configured (what events send customer-facing messages)
- Where these configurations overlap, conflict, or leave gaps

This matters because **Clarissi is uniquely positioned to perform cross-system configuration analysis** — it holds credentials to all connected systems simultaneously. No individual system's MCP server can produce this view. A Shopify MCP can only see Shopify. A Gorgias MCP can only see Gorgias. Only Clarissi can answer:

- "Your Shopify Flow + Gorgias automation + AfterShip are all sending notifications for the same order — customers receive 3 messages for one event."
- "Your Shopify tags orders `out-of-stock`; your Gorgias automation fires on `backorder`. Same concept, fragmented tagging — manual reconciliation overhead."
- "AfterShip fires `delivery_exception` events. No Gorgias automation and no Clarissi skill handles them. Failed deliveries get no response."
- "You have a Gorgias view called 'VIP Complaints' but nothing in Shopify or any active skill defines what makes a customer VIP. The signal isn't flowing through."

#### Third Assessment Pass: Configuration Audit (Pass 3)

The Assessment architecture expands from two passes to three:

**Pass 1 — Scripted (unchanged):** ticket data → automation gap report (four-section deliverable)

**Pass 2 — Agentic exploration (unchanged):** data exploration → unexpected skill candidates

**Pass 3 — Configuration Audit (new):** configuration topology → operational efficiency findings

Pass 3 runs after Pass 2. The operator uses `pacore__get_integration_topology` (new tool, see below) plus per-adapter configuration tools to produce an **Operational Efficiency Report** — a separate section in the Assessment deliverable.

**Pass 3 output structure:**

| Finding Type | Description | Example |
|---|---|---|
| **Redundancy** | Multiple systems sending notifications for the same event | Shopify Flow + Gorgias automation both message the customer on order creation |
| **Fragmentation** | Same concept using different labels/tags across systems | `out-of-stock` (Shopify) vs. `backorder` (Gorgias) for the same workflow |
| **Coverage gap** | Events firing in connected systems with no automation handling (neither Clarissi skill nor native) | AfterShip delivery exceptions with no handler |
| **Efficiency opportunity** | Where a Clarissi skill could replace a manual Gorgias rule (more observable, cross-system, auditable) | Gorgias automation manually doing what `high-risk-order-response` skill does deterministically |

#### New Tool Category: Configuration Discovery Tools

Each adapter adds a `configurationTools[]` array alongside `agentTools[]`. These tools read system configuration, not data:

| Tool | What It Returns |
|------|----------------|
| `shopify__list_flows` | Active Shopify Flow automations with trigger conditions and action types |
| `gorgias__list_automation_rules` | Gorgias automation rules: conditions, actions, enabled status |
| `aftership__list_notification_settings` | AfterShip notification rules per tracking event type |
| `zendesk__list_triggers` | Zendesk trigger rules and conditions |

These are read-only API calls using the same credentials the adapters already hold. They are exposed via MCPGateway alongside the existing `agentTools[]`.

**Naming and interface:** Same double-underscore namespacing as data tools. Consistent with the vertical-agnostic design principle — the abstract pattern is `{integration}__list_automations()` regardless of what the underlying system calls its automation rules.

**Implementation note:** Configuration tools follow the same `agentTools[]` registration pattern in each adapter — add to the array, MCPGateway surfaces them automatically. No gateway changes required (consistent with the pattern noted in the Operator Skill Discovery initiative: adding tools to an adapter only requires updating the adapter file).

#### New Platform Meta-Tool: `pacore__get_integration_topology`

A Clarissi-level tool (added to MCPGateway's `buildPacoreTools()`) that computes the connected graph from active skill configurations and connection metadata:

```json
{
  "connectedSystems": ["shopify", "gorgias", "aftership"],
  "activeSkills": [
    {
      "skillType": "backorder-notification",
      "sourceSystem": "shopify",
      "destinationSystem": "gorgias",
      "triggerEvent": "orders/updated",
      "actionType": "create_ticket"
    }
  ],
  "coveredEventPaths": [
    "shopify:orders/updated → gorgias:create_ticket"
  ],
  "uncoveredEventPaths": [
    "shopify:orders/cancelled → (no Clarissi skill)",
    "aftership:delivery_exception → (no Clarissi skill)",
    "shopify:orders/fulfilled → (no Clarissi skill)"
  ]
}
```

The `uncoveredEventPaths` list is derived from: all webhook topics that could be registered for connected adapters (from `WebhookSourceAdapter.webhookTopics`) minus the event paths already covered by active user skills. This is purely a database query — no LLM required.

**Why only Clarissi can produce this:** The topology requires knowing (a) which systems are connected, (b) what events those systems can emit, and (c) which events have active handling. Only Clarissi holds all three simultaneously. Going directly to Shopify MCP gives (b) for Shopify only. Going directly to Gorgias MCP gives (b) for Gorgias only. Neither knows what the other's events look like or whether any automation covers them.

#### Data Gate

Configuration topology tools (Pass 3) are available in Phase 2 once at least **5 connected customer accounts** exist. Below this threshold:
- The tools themselves work (they read individual customer configs)
- Cross-customer pattern analysis (e.g., "other merchants with Shopify + Gorgias commonly have redundant order notifications") is deferred to Phase 3 (15+ customers required, consistent with anonymization requirements above)

#### Assessment Deliverable Update

With Pass 3, the Automation Readiness Report gains a fifth section:

| Section | Content | Pass |
|---|---|---|
| 1. Ticket Category Analysis | Volume, coverage, automation readiness per category | Pass 1 |
| 2. Activation Gaps | Which existing skill templates can be activated today | Pass 1 |
| 3. Skill Candidates | New skill ideas from agentic exploration | Pass 2 |
| 4. Priority Recommendations | Ranked P1/P2/P3 actions | Pass 1 + 2 |
| **5. Operational Efficiency Findings** | Redundancy, fragmentation, coverage gaps, replacement opportunities | **Pass 3** |

Section 5 is often the highest-value finding in the deliverable: it addresses existing problems in the customer's automation stack, not just future opportunities. This changes the Assessment from "what should you add" to "here's what you have, here's what's inefficient, and here's what to add" — a more complete and more defensible deliverable.

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

**Rejected alternatives for Configuration Topology:**

| Alternative | Why rejected |
|---|---|
| Read configuration via raw API calls in agent (no dedicated tools) | Inconsistent UX; agents must discover API structure themselves; no caching |
| Cross-system correlation only at Phase 3 (data gate) | Configuration tools work per-account immediately; only cross-customer patterns need the data gate |
| Separate `configurationTools[]` array on adapters | Accepted — `agentTools[]` is for data tools; `configurationTools[]` makes the distinction clear and allows MCPGateway to control surfacing separately |

## Related

- [ADR-005: Builder Agent](005-builder-agent.md) — operator-only skill creation tooling; skill draft generation routes through Builder Agent after gap candidate is identified
- [ADR-012: Platform Intelligence Layer](012-platform-intelligence-layer.md) — Intent-to-Draft (Role 3) receives gap candidates from Assessment agentic pass; Role 5 (Agent Session Intelligence) feeds on topology tool usage patterns
- [ADR-013: GTM / SEAN Concierge Model](013-sean-concierge-gtm.md) — Assessment is the primary top-of-funnel motion
- [ADR-015: Assessment-First Sales](015-assessment-first-sales.md) — business context for why Assessment produces a paid deliverable
- [ADR-023: Agent MCP Gateway Scaling](023-agent-mcp-gateway-scaling.md) — infrastructure for agent-driven Assessment sessions; `pacore__get_integration_topology` billing and rate limiting
- [Assessment Prompt Template](../assessment-prompt-template.md) — operator system prompt for Claude Desktop
