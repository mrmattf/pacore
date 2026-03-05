# ADR-007: Skill Template Architecture (Two-Layer Model)

**Date:** 2026-02-28
**Status:** Accepted
**Affects:** `packages/cloud/src/skills/`, `packages/cloud/src/chains/`, `packages/cloud/src/integrations/`, `packages/web/src/pages/`

---

## Context

PA Core needed a way to ship pre-built automations ("skills") that end users can activate with minimal friction — no NL instruction writing, no ECA rule editing, no knowledge of AI internals. The first skill is Backorder Detection (Shopify → support tool).

The challenge: how do we let skill developers (us, marketplace integrators) encode complex logic once, while letting end users simply fill in credentials and click Activate?

## Decision

Skills are **two-layer artifacts**:

### Layer 1 — Skill Developer
The developer pre-compiles everything a skill needs to execute:

- **`CompiledPolicy`** — deterministic ECA rules (conditions + actions). Authored via the NL compiler (`compileInstructions()`), stored as a versioned TypeScript object. Zero LLM at execution time.
- **`DataEnrichmentSpec`** — declarative list of MCP tool calls to make before policy evaluation (e.g., fetch ETA from Shopify variant metafields). Executed deterministically.
- **`NamedTemplates`** — pre-drafted email layouts (subject + intro + body + closing). Support Handlebars-style `{{var}}` substitution.
- **`slots`** — what integrations the user needs to provide (e.g., a Shopify store, a Zendesk account).
- **`editableFields`** — the specific fields users are allowed to customize (e.g., inventory threshold, ticket subject lines).

The compiled output is a `SkillTemplate` TypeScript object, versioned with semver.

### Layer 2 — End User
The end user sees only:
1. A template picker (browse available templates for a skill type)
2. A connection picker per slot (reuse existing credentials or add new ones)
3. A few editable fields
4. An activate button

No NL authoring, no ECA rule editing, no enrichment spec configuration.

### IntegrationConnection (Named Account-Level Connections)

Credentials are stored at the **account level**, not per-skill:

- `integration_connections` table: one row per named connection (display name, integration key, status). No credentials here.
- `mcp_credentials` table: credentials encrypted via AES-256-GCM, keyed by the connection's UUID.
- Multiple connections of the same type are supported (two Shopify stores = two UUIDs, two credential sets).
- `user_skills.configuration` stores only connection UUIDs (via `slotConnections`), never credentials.

### UserSkillConfig (Per-Skill, Non-Sensitive)

```typescript
{
  templateId: string;
  slotConnections: Record<string, string>;   // slot key → connection UUID
  fieldOverrides: Record<string, unknown>;   // editable field → user value
  namedTemplates: NamedTemplates;            // starts as template defaults; user edits here
}
```

Stored in `user_skills.configuration` JSONB. Never contains credentials.

### Slot Adapter Pattern (Vertical Extensibility)

Adapters are named by **functional role** (slot type), not by skill:
- `EcommerceOrderAdapter` — `getOrder()`, `checkInventory()`
- `NotificationToolAdapter` — `createTicket()`

Implementations: `ShopifyOrderAdapter`, `GorgiasNotificationAdapter`, `ZendeskNotificationAdapter`. A new vertical (law, finance) = new slot type interface + new adapter implementations. `SkillConfigPage` renders any template automatically — no frontend changes needed for new skills.

### Code-Defined Templates for MVP

Templates are TypeScript objects in `packages/cloud/src/skills/templates/`. The `SkillTemplateRegistry` holds all registered types and templates in memory. No DB required for MVP. Future milestone: `skill_templates` DB table for marketplace integrators.

## Platform Security Requirements (Non-Optional)

These four controls apply to all skills regardless of author:

| Control | Location | Detail |
|---------|----------|--------|
| **Shopify HMAC verification** | `WebhookTriggerHandler` | Verify `X-Shopify-Hmac-Sha256` with `crypto.timingSafeEqual()` before any processing. Raw body buffer captured before JSON middleware. |
| **Read-only tool restriction** | `logic-compiler.ts` → `compileInstructions()` | Only read-only MCP tools exposed to NL compiler. Write/mutate tools excluded from `CompiledPolicy` and `DataEnrichmentSpec` scope. |
| **HTML escaping** | `backorder-templates.ts` → `substituteVars()` | All customer-controlled data (names, titles, order notes, enrichment results) HTML-escaped before template interpolation. |
| **Enrichment iteration cap** | `logic-compiler.ts` → `runEnrichmentSteps()` | Hard cap of 50 iterations per enrichment step with `iterateOver`. Enforced at execution time. |

## Alternatives Considered

1. **Visual workflow builder for skills** — rejected: too much complexity for end users; skills should feel like installing an app, not building a workflow.
2. **Store compiled policy in DB** — deferred: code-defined templates are simpler for MVP and allow fast iteration; DB-backed templates are the marketplace path.
3. **Store credentials per-skill** — rejected: re-entering Shopify credentials for every new skill is terrible UX; account-level connections enable reuse across all Shopify-based skills.
4. **LLM at execution time** — rejected: non-deterministic, adds latency and cost at webhook-trigger scale, and creates unpredictable behavior in multi-tenant production.

## Consequences

- End users experience a template-picker UX (not NL authoring) — lower friction, higher adoption for standard integration patterns.
- Skill developers (us) do the heavy lifting once; execution is pure TypeScript, zero LLM overhead.
- New integration source or notification target = new adapter + registration; no frontend changes.
- New vertical (law, finance) = new slot type interfaces + templates; `SkillConfigPage` renders automatically.
- Template marketplace is architecturally ready (versioned artifacts, code-defined for now).
- `mcp_credentials.server_id` FK to `mcp_servers` dropped in migration 002 to allow connection UUIDs as credential keys alongside MCP server IDs.
