# Spec: Agent-Generated Skills — Declarative Skill Definition

**Status:** Accepted
**Related:** [ADR-005 Builder Agent](../005-builder-agent.md), [ADR-007 Skill Template Architecture](../007-skill-template-architecture.md), [ADR-010 Durable Webhook Ingestion](../010-durable-webhook-ingestion.md), [ADR-011 Skill Pricing Model](../011-skill-pricing-model.md)

---

## Skill Creation Paths

Skills can be created by two paths. Both paths produce an identical `SkillDefinition` and go through the same validation → simulation → activation pipeline. The difference is only who does the LLM reasoning.

### Primary Path: External AI Client (Bring Your Own Model)

Any MCP-compatible AI client (Claude Desktop, Cursor, or any agent framework) connects to PA Core's MCP server and calls skill management tools. The customer's own AI subscription pays for the LLM reasoning. PA Core charges zero for skill creation — only operations executed after activation are billed (ADR-011).

**PA Core MCP tools exposed for skill creation:**

| Tool | Description |
|------|-------------|
| `pacore_list_adapters` | Returns all registered adapters with their events, enrichment tools, and capabilities — grounds the external AI in real, available contracts |
| `pacore_create_skill` | Accepts a SkillDefinition object; validates schema + adapter references; stores as `draft`; returns validation errors for self-correction |
| `pacore_simulate_skill` | Runs skill against fixture data (dry run, no real API calls); returns which actions would fire and rendered template output |
| `pacore_get_cost_estimate` | Returns `OpsProfile` (ops per execution breakdown) + estimated monthly ops based on historical trigger volume |
| `pacore_activate_skill` | Promotes skill from `simulated` → `active`; wires trigger into execution pipeline |
| `pacore_list_skills` | Returns customer's skill inventory with status and ops consumption |

**Example Claude Desktop session:**
```
User: "Create a skill that fires when a Shopify order is created with backordered items,
       looks up the ETA in Fulfil, and creates a Gorgias ticket with the expected date."

Claude Desktop → pacore_list_adapters()
  ← shopify: [order_created, inventory_updated, ...], fulfil: [get_inventory_eta, ...], gorgias: [create_ticket, ...]

Claude Desktop → pacore_create_skill({
  trigger: { adapter: 'shopify', event: 'order_created' },
  enrichmentSpec: { steps: [{ tool: 'fulfil__get_inventory_eta', ... }] },
  slots: [{ key: 'notification', role: 'output', integrationKey: 'gorgias' }],
  policy: { conditions: [{ type: 'expr', cel: 'hasBackorderedItems == true' }], ... },
  ...
})
  ← { skillId: 'abc123', status: 'draft', validationErrors: [] }

Claude Desktop → pacore_simulate_skill('abc123')
  ← { wouldFire: true, ticketPreview: '...', enrichmentResults: { eta: '2026-04-15' } }

Claude Desktop → pacore_get_cost_estimate('abc123')
  ← { opsPerExecution: 3, estimatedMonthlyTriggers: 2400, estimatedMonthlyOps: 7200 }

Claude Desktop → pacore_activate_skill('abc123')
  ← { status: 'active' }
```

### Secondary Path: Internal Builder Agent (Optional Add-On)

PA Core hosts an AI Composer that performs the skill generation conversation internally. Available for customers without their own AI client access, or who prefer an embedded guided experience. Priced as a flat-fee add-on (or included in Enterprise). Produces the same SkillDefinition as the BYOM path — execution pricing is identical.

---

## Core Insight

A skill is almost entirely data. Code exists only at two well-defined boundaries:

```
┌──────────────────────────────────────────────────────────────┐
│  ADAPTERS  (code — written once per integration)              │
│  Shopify, Gorgias, Zendesk, AfterShip, Fulfil, Slack...      │
│  Each adapter exposes: events it can trigger on,              │
│  capabilities it can perform, and fields it provides.         │
└──────────────────────────┬───────────────────────────────────┘
                           │ provides events, capabilities, fields
┌──────────────────────────▼───────────────────────────────────┐
│  SKILLS  (data — agent-generated, no code)                    │
│  Declarative SkillDefinition that composes existing adapters. │
│  One trigger. Many enrichment adapters. Many output slots.    │
│  CEL handles arbitrary condition logic without code.          │
└──────────────────────────┬───────────────────────────────────┘
                           │ user-owned configuration
┌──────────────────────────▼───────────────────────────────────┐
│  CUSTOMER CONFIG  (data — customer-owned)                     │
│  Slot connections, field overrides, message templates         │
└──────────────────────────────────────────────────────────────┘
```

**Every new adapter multiplies the number of skills an agent can compose without writing any further code.** Adding a Fulfil adapter unlocks all Fulfil-aware skills. Adding a Monday.com adapter unlocks project-management skills. The agent composes; it never writes integration code.

---

## Multi-Adapter Skills

A skill has **one trigger** but can use **any number of adapters** in enrichment and output:

| Role | Cardinality | Example |
|------|-------------|---------|
| `trigger` | Exactly one | Shopify `order_created` webhook |
| `enrichmentSpec.steps` | Zero or many, any adapter | Fulfil ETA lookup, Shopify customer history |
| `slots` (output) | One or many, any adapter | Gorgias ticket + Slack escalation |

The trigger is singular by design — a skill execution starts from one event. Enrichment and output are unconstrained. An agent-generated skill can pull from Fulfil, Shopify, and a 3PL in the same enrichment pass, and dispatch to Gorgias and Slack in the same action loop.

**Example: 4-adapter skill (agent-generated)**

```yaml
trigger:
  adapter: shopify
  event: order_created

enrichmentSpec:
  steps:
    - tool: fulfil__get_inventory_eta       # Fulfil adapter
      inputMapping: { sku: backorderedItems[0].sku }
      resultPath: eta
    - tool: shopify__get_customer           # Shopify (second call, enrichment)
      inputMapping: { customerId: customerId }
      resultPath: customerOrderHistory

slots:
  - key: shopify       # source data
    role: source
  - key: notification  # → Gorgias or Zendesk (user picks)
    role: output
  - key: escalation    # → Slack (optional)
    role: escalation
```

---

## Skill Promotion Model

A generated skill moves through three states within a customer's account, with an optional future path to the public marketplace:

```
draft → simulated → active (customer-private)
                        │
                        └──► org-shared (within customer's organization)
                                  │
                                  └──► [FUTURE] marketplace-submitted
                                            │
                                            └──► marketplace-published (PA Core curates)
```

### States

| State | Who can use it | Who owns it | Initial release |
|-------|---------------|-------------|-----------------|
| `draft` | Creator only | Customer | ✓ |
| `simulated` | Creator only (reviewed simulation results) | Customer | ✓ |
| `active` | Customer's account | Customer | ✓ |
| `org-shared` | All users in customer's org | Customer | ✓ |
| `marketplace-submitted` | PA Core review queue | Customer (pending) | Future |
| `marketplace-published` | All PA Core customers | PA Core (per ADR-006) | Future |

### Marketplace Path (Future)

When a customer submits a skill to the marketplace:
1. PA Core reviews the `SkillDefinition` — strips customer-specific business rules, generalizes conditions, replaces hardcoded values with configurable field overrides
2. The curated version is published as a **platform skill template** — PA Core's IP per ADR-006
3. Other customers activate the template with their own slot connections and field overrides
4. The submitting customer retains their private `active` version unchanged

Submission is always an **explicit, opt-in act** — skills never auto-publish. IP transfer terms must be accepted at submission time.

---

## SkillDefinition Schema

```typescript
interface SkillDefinition {
  // Identity
  id: string;                        // e.g. 'vip-abandoned-cart'
  version: number;                   // incremented on each update
  skillType: string;                 // groups related skills
  description: string;               // shown in Skills UI
  status: SkillStatus;

  // Trigger — the one event that starts execution
  trigger: {
    adapter: string;                 // registered adapter key, e.g. 'shopify'
    event: string;                   // adapter-defined event, e.g. 'checkout_abandoned'
  };

  // Slots — integration connections (source + output targets)
  slots: SkillSlot[];

  // Context — maps trigger payload fields to named variables
  // Available in CEL conditions and message templates
  contextMapping: ContextFieldMapping[];

  // Enrichment — additional data fetched before policy evaluation
  // Steps may reference any registered adapter's read-only tools
  enrichmentSpec: DataEnrichmentSpec;

  // Policy — rules evaluated against the enriched context
  policy: CompiledPolicy;

  // Templates — message content referenced by invoke actions
  defaultTemplates: NamedTemplates;
}

type SkillStatus = 'draft' | 'simulated' | 'active' | 'org-shared' | 'deprecated';
// 'marketplace-submitted' and 'marketplace-published' are future states

interface SkillSlot {
  key: string;                       // abstract name, e.g. 'notification'
  integrationKey: string;            // default adapter, e.g. 'gorgias'
  required: boolean;
  role: 'source' | 'output' | 'escalation';
  allowedIntegrations?: string[];    // restricts what user can connect
}

interface ContextFieldMapping {
  name: string;                      // context variable name (used in CEL + templates)
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'object';
  source: string;                    // dot-path into the trigger payload
  fallback?: unknown;                // value if source path is missing
}
```

---

## CEL as the Universal Condition Layer

### Why CEL, Not Skill-Specific Condition Types

Each skill currently registers its own condition types (`BackorderCondition`, `LowStockCondition`, `HighRiskCondition`). This works but has a critical scaling problem: every new skill needs a developer to enumerate condition types and write a condition evaluator function.

[Common Expression Language (CEL)](https://github.com/google/cel-spec) eliminates this. It is Google's open-specification safe expression evaluator — used in Kubernetes RBAC, Firebase Security Rules, and Google Cloud IAM:

- **Cannot execute arbitrary code** by specification — no imports, no side effects, no I/O
- **Integration-agnostic** — evaluates expressions against whatever context object the skill provides; knows nothing about Shopify or any domain
- **Agent-friendly** — CEL reads like natural conditions: `cartTotal > 500 && 'vip' in customerTags`
- **Platform-level** — one evaluator serves all skills, regardless of context shape

### Condition Types

```typescript
type PolicyCondition =
  | RegisteredCondition              // optional named alias, compiled to CEL at evaluation time
  | { type: 'expr'; cel: string };   // CEL — platform-level, always available to any skill
```

**Registered conditions** are optional named aliases for common patterns within a skill type. They are for readability only — at evaluation time they compile to equivalent CEL:

```
{ type: 'backorder_status', value: 'all' }
→ compiled to CEL: "allItemsBackordered == true"
```

Agent-generated skills with no registered aliases use pure CEL from day one. No condition evaluator code required.

### CEL Operates on the Enriched Context

All `contextMapping` fields plus all `enrichmentSpec` results are available as top-level variables:

```
// cartTotal (number) — from contextMapping
// customerTags (string[]) — from contextMapping
// eta (string) — added by enrichmentSpec Fulfil step
// customerOrderHistory (object) — added by enrichmentSpec Shopify step

"cartTotal > 500"
"'vip' in customerTags"
"cartTotal > 500 && 'vip' in customerTags"
"eta != '' && backorderedCount == lineItemCount"
"customerOrderHistory.total_orders > 5 && orderTotal > 1000"
```

### Condition Evaluator Transition

| Phase | State |
|-------|-------|
| Current | Each skill has per-skill `matchesCondition()` evaluators |
| Phase 3 | CEL evaluator added to platform. Existing conditions compile to CEL. |
| Future | New skills use pure CEL — no registered condition types needed |
| Eventual | Existing skill conditions migrated to CEL aliases, per-skill evaluators removed |

Existing skills continue working unchanged during the transition. CEL is additive.

---

## Agent Generation Flow

> This flow describes the **internal Builder Agent path** (AI Composer). For the external AI client path (BYOM), the external client calls PA Core MCP tools directly — steps 3–6 are identical, but steps 1–2 happen inside the external client's reasoning.

```
1. INTENT CAPTURE (AI Composer)
   Merchant describes in business language.
   AI Composer extracts a structured brief:
   → trigger event, conditions, actions, message tone, integrations

2. ADAPTER LOOKUP (Builder Agent)
   Agent queries AdapterRegistry for the proposed adapters:
   → what fields does the trigger event provide? (grounds contextMapping)
   → what enrichment tools are available from which adapters?
   → what capabilities do the output adapters support?
   Agent cannot reference fields or capabilities absent from the registry.

3. GENERATE SkillDefinition
   Builder Agent outputs complete YAML:
   → contextMapping from adapter's declared field schema
   → CEL conditions from merchant's described rules
   → enrichmentSpec steps from available adapter tools
   → invoke actions using adapter capabilities
   → defaultTemplates from merchant's message intent

4. VALIDATE (schema + static, no execution)
   Platform validates before any execution:
   → required fields present, correct types
   → adapter keys exist in registry
   → contextMapping sources valid against adapter's payload schema
   → enrichment tool names exist in adapter registry
   → CEL expressions parse without syntax errors
   → templateKeys in invoke actions exist in defaultTemplates
   Failure → structured errors returned to agent for self-correction (max 3 retries)

5. SIMULATE (dry run, no real API calls)
   Platform runs skill against synthetic fixture data:
   → maps context fields from fixture payload
   → evaluates CEL conditions against fixture context
   → records which actions would fire + rendered template output
   → all adapter calls go through mock AdapterRegistry
   Results shown to reviewer or used for auto-promotion decision.

6. ACTIVATE (promote to customer's account)
   On approval (human or auto, based on customer tier):
   → SkillDefinition stored in DB, status → 'active'
   → Trigger event wired into skill execution pipeline (ADR-010 queue)
   → Previous version retained — DLQ replay can target a specific version
   → Audit log: approver, Builder Agent session ID, simulation results

   [FUTURE] MARKETPLACE SUBMISSION (explicit opt-in, separate flow):
   → Customer submits active skill
   → PA Core reviews, generalizes, curates
   → Published as platform skill template (PA Core IP per ADR-006)
   → Customer's private active version unchanged
```

---

## What an Agent Can and Cannot Create

| Request | Agent generates | Requires code |
|---------|----------------|---------------|
| New skill: Shopify trigger + Gorgias output | Full SkillDefinition | No |
| New skill: Shopify + Fulfil enrichment + Gorgias + Slack | Full SkillDefinition | No |
| New skill: AfterShip trigger + Shopify enrichment + Zendesk output | Full SkillDefinition | No |
| Arbitrary complex condition logic | SkillDefinition + CEL expressions | No |
| New skill on WooCommerce (adapter already exists) | Full SkillDefinition | No |
| New skill on WooCommerce (no adapter yet) | Cannot — adapter missing | WooCommerce adapter |
| New output action type (e.g. Twilio SMS) | Cannot — no Twilio capability | Twilio adapter |
| Enrichment from a custom internal ERP | Cannot — no adapter | Custom ERP adapter |

The agent is strictly bounded by what adapters exist. This is the correct boundary — adapters are reviewed, tested code; skills are trusted, versioned data.

---

## Adapter Registration Contract

Each adapter declares its full contract at registration. The Builder Agent uses this to ground generated skills in real capabilities:

```typescript
interface AdapterRegistration {
  key: string;                         // e.g. 'shopify'
  displayName: string;

  // Events this adapter can trigger skills on
  events: Array<{
    key: string;                       // e.g. 'order_created'
    description: string;               // for Builder Agent + Skills UI
    payloadSchema: JSONSchema;         // exact fields the webhook delivers
  }>;

  // Read-only tools available for enrichmentSpec steps
  enrichmentTools: Array<{
    key: string;                       // e.g. 'shopify__get_customer'
    description: string;
    inputSchema: JSONSchema;
    outputSchema: JSONSchema;
  }>;

  // Write capabilities available in invoke actions
  capabilities: Array<{
    key: string;                       // e.g. 'create_ticket'
    description: string;
    requiredParams: string[];
    optionalParams: string[];
  }>;
}
```

---

## Implementation Phases

| Phase | Deliverable | Outcome |
|-------|------------|---------|
| 1 | `SkillDefinition` schema + DB table + validator | Platform accepts declarative skills |
| 2 | `AdapterRegistration` contract + registry query API | Agent grounded in real adapter capabilities |
| 3 | CEL evaluator integrated into policy engine | Any skill can use `{ type: 'expr', cel }` |
| 4 | Simulation harness with fixture data | Safe preview before activation |
| 5 | Builder Agent + AI Composer integration | End-to-end agent-created skills |
| 6 | Auto-promote for qualified customer tiers | Removes human review bottleneck at scale |
| 7 | Marketplace submission flow + IP terms | Customers can contribute to platform library |

Phases 1–4 can be built and tested with hand-authored `SkillDefinition` YAML before the Builder Agent exists. The infrastructure is fully independent of AI generation.