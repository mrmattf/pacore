# ADR-012: Platform Intelligence Layer — Internal AI Alongside BYOM

## Status
Accepted

## Context

### The Information Asymmetry Problem

ADR-005 establishes BYOM (Bring Your Own Model) as the primary skill creation path: external AI clients (Claude Desktop, Cursor) connect to PA Core's MCP server and generate SkillDefinitions using their own LLM subscriptions. This is efficient and cost-effective for skill generation — but it has a structural blind spot.

BYOM reasoning happens entirely outside PA Core. The external AI sees:
- The current conversation with the user
- The adapter contracts PA Core exposes via `pacore_list_adapters`
- The validation and simulation results returned by PA Core tools

PA Core sees:
- Everything the external AI sees **plus:**
- Every SkillDefinition created or abandoned across all customer accounts
- Which CEL conditions fire most often in production
- Which enrichment steps succeed vs. fail and at what rate
- Which SkillDefinitions get activated vs. stay in draft indefinitely
- Execution history per skill: trigger volume, action outcomes, error patterns, DLQ events
- Cross-account patterns: what merchants with similar stacks tend to build

**This asymmetry means BYOM cannot improve over time.** Each external AI session starts fresh with no memory of what worked or failed for similar customers. PA Core accumulates this signal continuously — but without an internal AI layer, that signal goes unused.

### What BYOM Does Well (and Should Keep Doing)

- Complex, multi-adapter skill generation with conversational refinement
- Long-context reasoning about business rules and edge cases
- Novel conditions and enrichment patterns not seen before
- Zero PA Core LLM cost for skill creation

BYOM is the right tool for generation. The internal AI layer is for a different job: **using execution data to make the platform smarter over time.**

### The Compounding Value Problem

Every automation platform gets easier to use at the beginning. What separates operational intelligence platforms from commodity automation tools is whether the platform gets *better* the longer you use it — not just more familiar.

Without a platform intelligence layer:
- Customer 1 builds a backorder skill with a Fulfil enrichment step that fails 20% of the time due to a known edge case in the Fulfil API response format. They debug it manually.
- Customer 2 builds the same skill six months later. They hit the same failure. They debug it manually.
- The platform learned nothing.

With a platform intelligence layer:
- Customer 1's failure is logged. PA Core detects the pattern across similar skills.
- Customer 2's skill draft triggers a warning: "The Fulfil `get_inventory_eta` tool has a known response format issue when `sku` contains special characters — here's the recommended CEL fallback."
- The platform compounded.

## Decision

Build a **Platform Intelligence Layer** that runs alongside BYOM, using execution data to provide capabilities the external AI client path structurally cannot.

The internal AI layer has **four distinct roles**, each scoped to what PA Core data enables:

### Role 1: Recommendation Engine

Surfaces the next skill a customer should activate, based on:
- Their current adapter connections and active skill inventory
- Their trigger event volume (which events fire most, which have no skill covering them)
- What customers with similar stacks have successfully activated
- Platform-wide skill performance benchmarks

This is primarily pattern-matching over structured data — minimal LLM involvement at first, growing into natural-language recommendations as the data set matures.

```
Dashboard nudge example:
"Your Shopify account fires ~800 high-risk order events/month.
 2 other merchants with Shopify + Gorgias activated the
 High-Risk Order Response skill and deflected an average
 of 340 support tickets/month. [View Skill Template]"
```

### Role 2: Validation Correction Suggestions

When `pacore_create_skill` returns validation errors (schema violations, missing adapter references, invalid CEL syntax), the internal AI suggests specific corrections — not generic error messages.

Because the internal AI has full visibility into the adapter registry and has seen thousands of valid SkillDefinitions, it can pattern-match the error to common fixes:

```
Validation error:
  "enrichmentSpec.steps[0].tool 'fulfil__get_eta' not found"

Internal AI suggestion:
  "The correct tool name is 'fulfil__get_inventory_eta'.
   Input mapping: { sku: backorderedItems[0].sku }.
   3 other skills use this tool successfully."
```

This is especially valuable in the BYOM path: the external AI submits a SkillDefinition, gets validation errors, and the internal AI's correction suggestion is included in the error response — reducing the back-and-forth iterations.

### Role 3: Intent-to-Draft for Simple Cases

For straightforward activations — minor adjustments to a pre-built skill template — the internal AI converts a single-sentence intent description into a complete SkillDefinition draft, ready for simulation.

**At initial release, this is an operator capability**, used by Clarissi operators to rapidly build custom skills discovered during Assessments. Customer-facing access to Intent-to-Draft is deferred to a future release.

This path requires no external AI subscription and no conversational back-and-forth. It handles the 80% of cases that are variations of known patterns:

```
Operator: "Create a backorder notification that only fires for orders over $200
           and includes the Fulfil ETA in the message"

→ Internal AI drafts SkillDefinition (template + field overrides)
→ Goes directly to pacore_simulate_skill
→ Operator reviews simulation results and activates on customer's behalf
```

For novel or complex skills (new adapter combinations, multi-step enrichment chains, custom business logic), the internal AI surfaces a prompt to continue in the operator's external AI client.

### Role 4: Pattern-Based Improvement Alerts

After skills are active, the internal AI continuously analyzes execution data and surfaces actionable insights:

| Signal | Alert |
|--------|-------|
| Enrichment step failure rate > 10% | "This enrichment step is failing for 1 in 8 executions. [View fix]" |
| Trigger volume 3x above estimate | "Monthly ops on track to exceed plan limit. [View options]" |
| Similar skill in platform has higher success rate | "A newer version of this skill pattern is available with improved error handling" |
| Conditions never firing | "This condition has not matched in 60 days — it may be filtering out more than intended" |
| DLQ accumulation | "12 executions in the dead-letter queue — all have the same root cause. [Replay with fix]" |

These alerts require cross-account data and execution history — they are impossible for the BYOM path to generate.

### Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  BYOM PATH (Primary — skill generation)                        │
│  Claude Desktop / Cursor / any MCP client                     │
│  LLM reasoning external, customer's subscription              │
└──────────────────────┬────────────────────────────────────────┘
                       │ pacore_create_skill (SkillDefinition)
                       ▼
┌───────────────────────────────────────────────────────────────┐
│  PA CORE PLATFORM                                              │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  PLATFORM INTELLIGENCE LAYER (Internal AI)              │  │
│  │                                                         │  │
│  │  ┌──────────────────┐  ┌──────────────────────────┐    │  │
│  │  │  Recommendation  │  │  Validation Corrections  │    │  │
│  │  │  Engine          │  │  (included in error resp)│    │  │
│  │  └──────────────────┘  └──────────────────────────┘    │  │
│  │                                                         │  │
│  │  ┌──────────────────┐  ┌──────────────────────────┐    │  │
│  │  │  Intent-to-Draft │  │  Improvement Alerts      │    │  │
│  │  │  (simple cases)  │  │  (post-activation)       │    │  │
│  │  └──────────────────┘  └──────────────────────────┘    │  │
│  │                                                         │  │
│  │  DATA SOURCES                                           │  │
│  │  • Execution history (all customers, anonymized)        │  │
│  │  • SkillDefinition corpus (activated, abandoned)        │  │
│  │  • Adapter registry (events, tools, capabilities)       │  │
│  │  • DLQ patterns and resolution history                  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  Validation → Simulation → Activation → Execution → Audit     │
└───────────────────────────────────────────────────────────────┘
```

### The Flywheel

```
More customers activate skills
        │
        ▼
PA Core accumulates execution data
        │
        ▼
Platform Intelligence Layer improves recommendations + alerts
        │
        ▼
Faster skill activation, fewer failures, better outcomes
        │
        ▼
More customer value → more customers → more data
```

This flywheel is PA Core's compounding moat. BYOM customers benefit from it (their validation errors get better corrections, their skill recommendations improve) even though their generation happens externally. The flywheel cannot be replicated by n8n or Zapier without the same concentrated execution data.

### What the Internal AI Does NOT Do

The internal AI does not replace BYOM for skill generation. Attempting to build a full conversational skill builder internally would compete with Claude Desktop rather than complementing it, and would require significant LLM investment for a job BYOM already does well.

The internal AI does not have access to customer-identifiable data across accounts. Execution patterns are aggregated and anonymized before the intelligence layer processes them.

## Billing

| Role | Billed |
|------|--------|
| Recommendation Engine | Included in all plans (data queries, no LLM cost) |
| Validation Corrections | Included (returned with validation errors, no additional call) |
| Intent-to-Draft | Included in Professional and above (LLM call, platform-subsidized) |
| Improvement Alerts | Included in all plans (pattern detection, minimal LLM) |

The internal AI does not introduce a new billing unit. Its costs are absorbed into the platform margin — the efficiency gains from fewer failed activations and better skill design reduce execution ops waste, which offsets the internal AI compute cost.

## Consequences

### Positive

- **Compounding value**: Platform gets smarter with every customer execution — a moat BYOM alone cannot build
- **BYOM enhancement, not replacement**: Validation corrections improve the BYOM loop; recommendations reduce time-to-activation for all users
- **SMB accessibility**: Intent-to-Draft removes the Claude Desktop subscription requirement for simple use cases
- **Proactive reliability**: Improvement alerts catch failure patterns before customers notice them

### Negative

- **Data volume dependency**: Recommendations and pattern alerts require a critical mass of execution data — value is limited in early months
- **Anonymization complexity**: Cross-account pattern learning requires careful data handling to prevent leakage of customer-specific business logic
- **Two AI systems to maintain**: Platform intelligence layer adds operational overhead alongside the BYOM path

### Mitigation

- Phase the rollout so each role is built only when sufficient data exists to make it useful
- Anonymize at the enrichment/condition-value level (strip business-specific values, retain structural patterns)
- Start Role 1 (recommendations) as pure data queries with no LLM — add language model only when patterns are validated

## Implementation Phases

| Phase | Role | Prerequisite |
|-------|------|-------------|
| 1 | Execution data pipeline — log ops, outcomes, errors per skill per account | ADR-010 queue in place |
| 2 | Recommendation Engine (data-driven, no LLM) — "customers like you activated these skills" | 10+ active accounts |
| 3 | Validation Correction Suggestions — pattern-match errors to known fixes | 100+ SkillDefinitions in corpus |
| 4 | Improvement Alerts — DLQ patterns, condition drift, volume alerts | 30+ days execution history |
| 5 | Intent-to-Draft — LLM converts sentence to SkillDefinition for known patterns | 50+ activated skill templates |
| 6 | Language-model-powered recommendations — natural language, personalized | 50+ active accounts |

## Concierge Delivery Note

For Concierge customers (see [ADR-013](013-sean-concierge-gtm.md)), the four intelligence roles are delivered by the PA Core operator rather than the product UI:

| Role | Self-Serve Delivery | Concierge Delivery |
|------|--------------------|--------------------|
| Recommendation Engine | Dashboard nudges | Assessment report + monthly QBR |
| Validation Corrections | Inline error messages | Operator catches during skill design |
| Intent-to-Draft | UI composer | Operator drafts skill, customer approves |
| Improvement Alerts | Dashboard notifications | Operator surfaces in weekly log review |

The underlying data pipeline and pattern detection are identical — the delivery channel differs. As Concierge customers eventually graduate to self-serve, they gain access to the product UI versions of these features without any data migration.

## Related

- [ADR-005: Builder Agent](005-builder-agent.md) — BYOM as primary creation path; this ADR defines the complementary internal layer
- [ADR-007: Skill Template Architecture](007-skill-template-architecture.md) — SkillDefinition structure the intelligence layer reads and generates
- [ADR-010: Durable Webhook Ingestion](010-durable-webhook-ingestion.md) — Execution data source for the intelligence layer
- [ADR-011: Skill Pricing Model](011-skill-pricing-model.md) — Intelligence layer roles are included in platform margin, not separately billed
- [ADR-013: SEAN Concierge GTM](013-sean-concierge-gtm.md) — Concierge delivery model where operator surfaces intelligence instead of product UI
- [specs/agent-codegen.md](specs/agent-codegen.md) — Declarative skill format the internal AI generates for Intent-to-Draft