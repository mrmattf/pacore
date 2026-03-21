# UXR-002: Skill Creation Flows — BYOM Discovery, Intent-to-Draft, and Connect-First Onboarding

**Date:** 2026-03-21
**Status:** Accepted
**Linked ADR:** [ADR-024: Platform Access Tiers, Skill Creation Gates, and Domain-Agnostic Model](../../docs/decisions/024-platform-access-tiers-and-domain-agnostic-model.md)

---

## Context

ADR-024 defines two custom skill authoring paths beyond catalog configuration:

1. **BYOM (Bring Your Own Model)** — Professional+ operators connect their own external AI client (Claude Desktop, Cursor, etc.) to the Clarissi MCP server and generate a new SkillDefinition via `pacore__create_skill` and `pacore__simulate_skill`. Zero Clarissi LLM cost.
2. **Platform-assisted (Intent-to-Draft)** — Scale operators type a sentence describing what they want; Clarissi's platform LLM generates a SkillDefinition draft. Clarissi incurs LLM cost.

Both paths are currently operator-only (ADR-005 Phase 2–3). When self-serve authoring ships, these UX patterns govern how the platform surfaces each path.

Additionally, ADR-024 makes the platform domain-agnostic — catalog templates carry domain tags for filtering. A self-serve customer whose connected adapters span non-e-commerce systems should see relevant templates, not a locked vertical.

## Decision

### Pattern 1: BYOM Discovery Block in SkillsPage

Professional+ operators see a persistent discovery block at the bottom of the SkillsPage catalog — below the standard skill cards, above the footer. Starter operators do not see it (not gated with a badge — simply not shown, because the pattern requires an external AI client which Starter customers are not expected to have configured).

**The block contains:**
1. Headline: "Build a custom skill with your AI client"
2. One sentence: "Connect your Claude Desktop or AI client to the Clarissi MCP server and author a new skill from scratch."
3. A link to MCP connection setup documentation
4. A secondary CTA: "See what's possible" — links to the Builder Agent documentation or examples

**Rationale:** *Bleeding edge without alienating* — BYOM is a technically sophisticated path. Surfacing it as a catalog-level discovery block (not a modal, not a settings page) makes it visible to operators who would benefit without overwhelming Starter customers who wouldn't. The block is informational-first, not action-first.

### Pattern 2: Intent-to-Draft as First-Class Scale Feature

Scale operators see an "Intent-to-Draft" entry point in the SkillsPage header — a text input with the label "Describe a skill you'd like to build" and a "Draft →" button. This is equivalent in visual weight to the search input.

**Flow:**
1. Operator types intent: "Send a Slack alert when a high-value order is placed from a new customer"
2. Platform generates a SkillDefinition draft (async, shows loading state)
3. Draft opens in a review panel with: generated title, trigger, conditions, action steps, and editable fields
4. Operator reviews, edits if needed, and submits to activate
5. Skill appears in catalog as "Custom" with a "Draft" badge until first execution

**Loading state:** Must show a skeleton/progress state — not a spinner alone. The operator submitted work; the platform is doing something. *Trust through precision* requires visible activity.

**Rationale:** Intent-to-Draft is the highest-capability self-serve feature. It belongs at the top level of the catalog interface, not buried in a settings drawer. Leading with it as a persistent input (vs. a button that opens a modal) signals that this is a first-class creation surface, not an advanced option.

### Pattern 3: Connect-First Banner

When a customer visits SkillsPage with zero connected adapters (no Shopify, no Gorgias, no integrations configured), a full-width banner appears above the catalog:

> **Set up your first connection to activate skills.**
> Skills need at least one connected system to execute. [Connect an integration →]

This banner replaces the standard catalog view until at least one adapter is connected. The catalog is visible but dimmed behind the banner — the operator can see what's available without being able to act on it.

**Rationale:** *Claritas first* — showing a full catalog to an operator who can't activate anything creates confusion and false starts. The connect-first pattern is honest about the prerequisite. Showing the dimmed catalog behind the banner preserves the operator's understanding of what they're working toward.

### Pattern 4: "Custom" Skill Tag in Catalog

Skills authored via BYOM or Intent-to-Draft appear in the catalog with a "Custom" tag (distinct from platform-provided templates). This allows operators to:
- Quickly identify which skills they built vs. which came from the catalog
- Understand that custom skills don't receive automatic updates from Clarissi
- Filter the catalog by type if needed

**Rationale:** *Trust through precision* — operators need to know what they're responsible for maintaining.

## Implementation Requirements

### `src/pages/SkillsPage.tsx`
- BYOM discovery block: render at bottom of catalog for `plan === 'professional' || plan === 'scale'`. Do not render for Starter.
- Intent-to-Draft input: render in page header for `plan === 'scale'` only
- Connect-first banner: render when `connections.length === 0`, dim the catalog list (opacity-40 or similar)
- Custom skill tag: render `Custom` badge alongside skill name for any skill with `source: 'byom' | 'platform-assisted'`

### Intent-to-Draft Component (`src/components/IntentToDraft.tsx` — new)
- Controlled text input with "Draft →" submit button
- On submit: POST to `/v1/skills/draft` with `{ intent: string }`
- Loading state: skeleton panel replacing the input area (not a spinner)
- On success: opens `SkillDraftReviewPanel`

### `src/components/SkillDraftReviewPanel.tsx` — new
- Slides in from the right (sheet/drawer pattern)
- Shows: title, trigger, conditions table, action steps, editable fields preview
- CTA: "Activate Skill" → routes to SkillConfigPage with draft pre-loaded
- Secondary: "Discard Draft"

### Connect-First Banner (`src/components/ConnectFirstBanner.tsx` — new)
- Full-width, above the catalog grid
- Link to integrations/connections setup page
- Does not block catalog visibility — catalog grid is rendered but dimmed

## Rejected Alternatives

| Alternative | Why rejected |
|-------------|-------------|
| Intent-to-Draft in a modal behind a button | Buries the highest-capability feature. Scale customers are paying for this — it should be discoverable without hunting. Violates *Claritas first*. |
| BYOM discovery in Settings/Integrations | Operators configure skills from SkillsPage. Discovery of a skill creation path should be co-located with skill browsing, not hidden in a configuration area. |
| Hiding catalog until connections exist | Too restrictive. Operators should be able to browse and plan before connecting. The dimmed catalog + banner preserves discovery while making the prerequisite clear. |
| No distinction between custom and catalog skills | Without a "Custom" tag, operators can't tell which skills they're responsible for vs. which Clarissi maintains. Violates *Trust through precision*. |

## Related

- [ADR-024: Platform Access Tiers, Skill Creation Gates, and Domain-Agnostic Model](../../docs/decisions/024-platform-access-tiers-and-domain-agnostic-model.md)
- [ADR-005: Builder Agent](../../docs/decisions/005-builder-agent.md)
- [ADR-012: Platform Intelligence Layer](../../docs/decisions/012-platform-intelligence-layer.md) — Intent-to-Draft (Role 3)
- [UXR-001: Tier Gate UX Patterns](001-tier-gate-ux-patterns.md)
