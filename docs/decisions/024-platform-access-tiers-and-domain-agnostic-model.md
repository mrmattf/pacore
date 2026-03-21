# ADR-024: Platform Access Tiers, Skill Creation Gates, and Domain-Agnostic Model

**Date:** 2026-03-20
**Status:** Proposed
**Affects:** `packages/cloud/src/mcp/mcp-gateway.ts`, `packages/core/src/types/skill.ts`,
`docs/decisions/017-operator-skill-discovery.md`, `docs/decisions/005-builder-agent.md`

---

## Context

### Three Converging Decisions

ADR-011 (per-op pricing), ADR-016 (three-tier customer journey), ADR-017 (Assessment MCP tools),
ADR-023 (agent MCP gateway), and ADR-005 (Builder Agent) collectively describe a platform with:
multiple customer tiers, a growing set of MCP tools, and a planned path toward customer-facing
skill creation. None of those ADRs explicitly defines:

1. Which MCP tools are accessible to which customer tier
2. What "skill creation" means at each self-serve plan tier vs. catalog configuration
3. Whether the platform architecture has a "vertical" concept — and if not, how domain expansion works

This ADR makes those three decisions explicit before the tooling ships.

### Current State

Today, all analysis/discovery MCP tools are operator-only (run via Claude Desktop during paid
Assessment engagements). As the platform matures toward self-serve MCP exposure and customer-facing
skill creation (ADR-005 Phase 5), access rules need to be codified before — not after — that
work begins. Without this ADR, plan-tier enforcement gets bolted on after the fact and e-commerce
assumptions get baked into platform code that should be domain-agnostic.

---

## Decision

### 1. Three-Tier MCP Tool Access Model

MCP tools are classified into three access tiers based on:
- Infrastructure cost per call
- Data sensitivity and interpretation risk
- Competitive moat value (topology tools are operator-exclusive)

**Tier 1 — Free, all plans and all self-serve customers:**
- `pacore__list_skill_templates` — catalog discovery
- `pacore__list_connections` — connected integration status
- `pacore__get_execution_log` — raw execution history
- Session management: `pacore__switch_org`, `pacore__list_accessible_orgs`

**Tier 2 — Self-serve Professional and Scale; all Concierge; all operators:**
- `gorgias__list_recent_tickets` / `gorgias__ticket_summary`
- `shopify__order_pattern_summary`
- `gorgias__list_tags`, `gorgias__list_views`, `shopify__list_webhook_topics`
- Future: equivalent summary/listing tools for any new domain adapter
- Billed at 1 op per call (ADR-023), metered against plan budget

**Tier 3 — Operators and Concierge-run sessions only:**
- `pacore__get_integration_topology`
- `shopify__list_flows`, `gorgias__list_automation_rules`
- `aftership__list_notification_settings`, `zendesk__list_triggers`
- Assessment Pass 3 configuration discovery tools
- Future: equivalent configuration tools for any new domain adapter

**Access matrix:**

| Tool Tier | Self-Serve Starter | Self-Serve Professional | Self-Serve Scale | Concierge | Operator |
|---|---|---|---|---|---|
| Tier 1 (discovery) | Free | Free | Free | Free | Free |
| Tier 2 (data/analysis) | No | 1 op/call | 1 op/call | Absorbed in retainer | 1 op/call |
| Tier 3 (topology/config) | No | No | No | Operator-run | Yes |

**Enforcement:** Tier 2 gates on `plan_tier` claim in JWT (`Professional`/`Scale`/`Concierge`/
`Operator`). Tier 3 gates on `is_operator` claim in JWT (ADR-018). MCPGateway checks both
claims before adapter dispatch. These checks are added in ADR-023 Phase 3 implementation.

**Competitive rationale for Tier 3 operator-exclusivity:**
Single-system tools (Shopify MCP, Gorgias MCP) cannot surface cross-system topology findings.
The topology tools expose the connective tissue between systems — where redundancy, fragmentation,
and coverage gaps exist across a customer's full automation stack. This is Clarissi's structural
moat vs. system incumbents (single-system view only) and cross-system competitors (no execution
history, no analysis-to-activation loop). Restricting topology tools to operators preserves the
Assessment as a differentiated, paid engagement.

**Important:** Any customer invoking the MCP endpoint already has an AI agent configured — that
is a prerequisite for MCP tool use. Tool access tiers are not gatekeeping based on agent access;
they gate based on plan-tier value alignment and interpretation risk.

**Evolutionary note:** Tier assignments can expand (e.g., Scale-tier access to previously
Tier 3 tools) as competitive conditions warrant. Do not pre-optimize.

---

### 2. Skill Creation vs. Skill Configuration

**Terminology that must be consistent across all ADRs:**

- **Skill configuration** = activating a template from the catalog, connecting slots to
  integrations, customizing editable fields (intro/body/closing/subject). Available to ALL
  self-serve tiers today. No LLM involved. This is not "skill creation."

- **Custom skill authoring** = creating a new SkillDefinition not in the catalog. Two paths:
  - **BYOM** (external AI): customer's Claude Desktop / AI client generates via MCP tools
    (`pacore__create_skill`, `pacore__simulate_skill`). Zero Clarissi LLM cost.
  - **Platform-assisted** (Intent-to-Draft, ADR-012 Role 3): Clarissi's LLM generates a
    SkillDefinition draft from a sentence intent. Clarissi incurs LLM cost.

**Gate model:**

| Capability | Starter | Professional | Scale | Concierge | Operator |
|---|---|---|---|---|---|
| Catalog template activation + configuration | Yes | Yes | Yes | Operator handles | Yes |
| BYOM custom skill authoring | No | Yes | Yes | Operator handles | Yes |
| Platform-assisted authoring (Intent-to-Draft) | No | No | Yes (in margin) | Operator handles | Yes |

**Why Starter excludes BYOM:**
BYOM has zero LLM cost to Clarissi, but custom skill authoring creates support surface area
— edge case failures, ops budgeting questions, malformed SkillDefinitions. Starter customers
are lower-value accounts and the catalog covers common use cases that justify the Starter plan.

**Why Scale gates platform-assisted:**
Clarissi incurs LLM cost for Intent-to-Draft. Scale plan margin ($1/1K ops overage on 200K
base) absorbs it. Professional ($1.50/1K on 50K base) is adequate but platform-assisted is a
clear upgrade incentive.

**Rollout sequence:** Operator BYOM first (ADR-005 Phase 2–3) → Professional BYOM follows
after operators validate tooling → Scale platform-assisted follows BYOM maturity. Self-serve
skill creation never leads operator tooling maturity.

---

### 3. Domain-Agnostic Platform Model

**The platform has no "vertical" concept.** Verticals are a sales/catalog filter — not an
architectural boundary.

The platform pipeline — `trigger event → policy conditions → enrichment → invoke actions` —
is structurally identical for any domain. An `orders/updated` event (retail) and an
`invoice/overdue` event (financial) are both events with payloads that trigger a policy
evaluation. The platform executes the same pipeline for both.

What actually varies when expanding to a new domain:

| What varies | Where it lives | Platform change required? |
|---|---|---|
| Assessment vocabulary (what categories mean) | Per-account normalization (ADR-017 Tier 2 dictionary) | No — already per-account |
| Skill template catalog content | Template registry entries | No — just new catalog data |
| Adapter implementations | SlotAdapter code | Yes — but adapter contract is unchanged |
| Marketing / GTM messaging | Website + sales | Not architectural |
| Benchmark comparisons | Aggregated from similar connected accounts | No — data, not architecture |

**Consequences of this decision:**

- **Adapters are domain-tagged, not domain-gated.** A `shopify-order-adapter` carries
  `domain: "ecommerce"` metadata for catalog filtering. The dispatch mechanism is identical
  for a `quickbooks-invoice-adapter` with `domain: "financial"`.

- **The skill template catalog is a flat list.** Templates carry `domain` tags for
  filtering. Operators and agents filter by what's relevant to the customer's connected
  systems — not a declared vertical.

- **Assessment normalization is derived, not declared.** ADR-017's normalization dictionary
  is built from the customer's connected adapters and actual data patterns. A customer with
  Shopify + Gorgias gets commerce vocabulary automatically. A customer with QuickBooks +
  Zendesk gets financial vocabulary automatically. Operators do not declare a vertical.

- **No `vertical` parameter in ADR-017.** The previously-considered `vertical` parameter
  in the normalization dictionary is not needed. Connected adapters are the domain signal.

**Guard against domain leakage:**
Platform code that explicitly references domain-specific concepts (backorder, fulfillment,
ticket, invoice) outside of adapter implementations and skill template definitions violates
this invariant. Domain vocabulary belongs in the catalog layer — not in platform utilities,
gateway code, or shared types.

**Adding a new domain:**

| What gets added | Owner |
|---|---|
| New SlotAdapter(s) tagged with `domain` | Engineering (or AI-scaffolded, see below) |
| New SkillTemplate entries tagged with `domain` | Engineering / Operator |
| Normalization vocabulary (auto-inferred from adapter events + account data) | AI-assisted, per-account |

---

### 4. AI-Assisted Adapter Scaffolding (extends ADR-005)

The per-domain adapter engineering cost can be substantially reduced by extending the BYOM
pattern to the *adapter creation* layer — the same approach OpenClaw and OpenAPI Generator use:
point an AI agent at an OpenAPI spec and have it scaffold the integration tooling.

Most SaaS platforms publish OpenAPI/Swagger specs. An operator with Claude Desktop + Clarissi's
MCP server would run:

```
Operator: "Scaffold an adapter for HubSpot using this OpenAPI spec."
  → pacore__scaffold_adapter(openapi_spec_url, domain_tag: "crm")
      reads spec
      identifies webhook events (triggers) + API actions
      generates draft SlotAdapter TypeScript
      generates MCP tool definitions (domain_tag in adapter metadata for catalog filtering)
      generates skill template stubs (tagged domain: "crm")
      → returns draft package for review
Operator: reviews + adjusts draft
  → pacore__simulate_adapter(draft_id, fixture_data)  ← tests against sample data
  → pacore__submit_adapter(draft_id)                   ← platform review queue
```

Note: `domain_tag` is metadata for catalog discovery/filtering only. The platform dispatch
pipeline is identical regardless of domain tag — no domain-specific execution paths.

**What this changes:**
- "New domain = new engineering sprint" → "New domain = operator + AI session + platform review"
- Adapter scaffolding becomes operator-runnable, not engineering-gated
- The platform review step is a quality gate (schema validation, ops profile check, security
  scan), not the bottleneck

**Relationship to ADR-005:** ADR-005 already includes `discover_ecommerce_integration` and
`generate_ecommerce_chain` tools and explicitly lists "OpenAPI Generator (for MCP tool
scaffolding)" in the Generation Layer. `pacore__scaffold_adapter` generalizes that pattern
beyond e-commerce. ADR-005 carries a forward reference to this ADR.

**Data gates:**
- Adapter scaffolding tooling ships after skill creation tooling matures (ADR-005 Phase 3+)
- Auto-generated adapters start as "operator-managed" and graduate to "platform-managed" after
  validation across multiple customers

---

## Consequences

### Positive
- Access tiers are explicit and enforceable before tooling ships — no retroactive restriction
- Plan tiers have clear, tangible differentiation beyond ops volume: Professional adds Tier 2
  MCP tools + BYOM skill authoring; Scale adds platform-assisted authoring
- Topology tools remain operator-exclusive — Assessment value as a paid engagement is preserved
- Platform is domain-agnostic by design — new domains added via adapter + catalog data; no
  platform code changes required
- Assessment vocabulary is derived from connected systems; operators don't declare a vertical
- Competitive response to analysis commoditization is to lean into execution data + activation
  loop, not to restrict tool access

### Negative
- Plan-tier enforcement in MCPGateway requires a `plan_tier` JWT claim not currently present
  — needs to be added at session creation (ADR-023 Phase 3)
- New domain adoption still requires adapter engineering work — the platform layer doesn't
  change, but each new adapter set must be built (mitigated by AI-assisted scaffolding above)

---

## UX & Marketing Notes

These positioning decisions are codified here so that marketing copy and UX patterns stay aligned with architecture.

**Domain-agnostic positioning:**
"Built for your stack" is the customer-facing expression of the platform's domain-agnostic model. E-commerce is the deepest integration catalog today and the correct beachhead for GTM (ADR-013), but platform-level copy (about pages, architecture descriptions) must not say "for e-commerce." The platform works for any connected adapter set.

**Tier upgrade narrative:**
Tier differentiation is capability-based, not volume-based. Upgrade copy should lead with what the operator gains: Professional unlocks analysis tools and BYOM custom skill authoring; Scale unlocks platform-assisted Intent-to-Draft authoring. Volume (ops budget) is a secondary consideration.

**Execution history as trust signal:**
Clarissi tracks live attribution — deflection rates, baselines, 90-day attribution windows — that competitors who only do configuration analysis cannot replicate. Customer-facing copy should frame this as auditability and operator confidence ("your history is yours, auditable, baselined"), not as an AI feature.

**Assessment pricing:**
The Assessment remains a separate invoiced engagement ($1,500–2,500). It must not be described as a "free audit," a "feature," or part of Concierge onboarding. Its value is operator expertise + Tier 3 topology tools + narrative deliverable — not raw MCP data access.

**UX decision records:**
See [packages/web/docs/ux/001-tier-gate-ux-patterns.md](../packages/web/docs/ux/001-tier-gate-ux-patterns.md) for how tier gates are expressed in the platform UI (badges, upgrade modals, "Set Up on Professional" pattern).
See [packages/web/docs/ux/002-skill-creation-flows.md](../packages/web/docs/ux/002-skill-creation-flows.md) for BYOM discovery, Intent-to-Draft, and connect-first UX patterns.

---

## Related

- [ADR-005: Builder Agent](005-builder-agent.md) — Skill creation BYOM path; `pacore__scaffold_adapter` extends this to adapter creation
- [ADR-011: Skill Pricing Model](011-skill-pricing-model.md) — Per-op billing; BYOM = 0 ops for creation
- [ADR-012: Platform Intelligence Layer](012-platform-intelligence-layer.md) — Intent-to-Draft (Role 3); platform-assisted skill authoring
- [ADR-016: Three-Tier Customer Journey](016-three-tier-customer-journey.md) — Self-Serve / Assessment / Concierge
- [ADR-017: Operator Skill Discovery](017-operator-skill-discovery.md) — Assessment MCP tools; normalization derived from connected adapters
- [ADR-018: Operator Identity](018-operator-platform-identity-and-onboarding.md) — `is_operator` JWT claim used by Tier 3 enforcement
- [ADR-023: Agent MCP Gateway Scaling](023-agent-mcp-gateway-scaling.md) — Enforcement point for tier checks; `plan_tier` claim required
