# UXR-001: Tier Gate UX Patterns — Plan Badges, Upgrade Flows, and Gated Catalog

**Date:** 2026-03-21
**Status:** Accepted
**Linked ADR:** [ADR-024: Platform Access Tiers, Skill Creation Gates, and Domain-Agnostic Model](../../docs/decisions/024-platform-access-tiers-and-domain-agnostic-model.md)

---

## Context

ADR-024 establishes three self-serve plan tiers (Starter, Professional, Scale) with meaningful capability differences — not just ops volume differences. Starter customers configure catalog skills only. Professional customers gain BYOM custom skill authoring and Tier 2 MCP analysis tools. Scale customers gain platform-assisted Intent-to-Draft authoring.

This creates a UI challenge: the catalog, skill creation surfaces, and analysis tools all have plan gates. The wrong pattern — locks, disabled grays, cryptic 403 errors — creates anxiety and churn. The right pattern — capability-informed, upgrade-motivated, never dismissive — creates conversion and confidence.

## Decision

### Pattern 1: Plan Badges, Not Locks

Gated catalog skills and features are visible and labeled with their plan requirement. They are not hidden, disabled with no explanation, or shown as locked with an icon that implies "broken."

**Use:** An amber/gold pill badge (`Professional` or `Scale`) adjacent to the skill title or feature label. The badge signals "available on this plan" — not "you can't have this."

**Reject:** Padlock icons, grayed-out rows with no label, or features that appear only after upgrade. Hidden content creates anxiety ("am I missing something?") and violates *Trust through precision*. Visible gating with clear labeling creates upgrade motivation and respects the operator's intelligence.

**Rationale:** *Claritas first* — make the tier requirement visible and scannable. The operator should immediately know what they have and what they'd gain. The badge is information, not a wall.

### Pattern 2: Upgrade Modal, Not Dead End

Clicking a gated skill or feature opens an upgrade modal — not a page redirect, not a dead-end error state, not a redirect to the billing page.

**The modal must include:**
1. What the skill/feature does (one sentence)
2. Which plan unlocks it
3. What else they'd gain by upgrading (summarize the tier's capability jump)
4. A single CTA: "Upgrade to [Plan]" — links to billing

**Reject:** Toast errors ("You don't have access"), redirects to a generic settings page, or modals that only show the price without explaining the value. These are anxiety-producing and violate *Bleeding edge without alienating*.

**Rationale:** *AI as delivery, outcomes as product* — the modal must lead with what the operator gets, not what the platform costs. "Unlock BYOM custom skill authoring and analysis tools" is a better heading than "$99/month."

### Pattern 3: "Set Up" for Gated Skills in Context

When a Starter operator views a catalog skill that requires Professional+, the primary action is labeled **"Set Up on Professional"** — not a disabled "Activate" button, not a lock.

This preserves the spatial relationship between the skill and its action (it's still a button, still in the right place) while making the upgrade path explicit in the action label itself.

**Rationale:** *Trust through precision* — the action label is honest about what happens next. It does not pretend the skill is available, but it does not make the operator feel excluded.

### Pattern 4: Tailwind Brand Token Prerequisite

**Pre-loaded structural gap:** Before any of the above patterns can express Clarissi brand quality, `packages/web/tailwind.config.js` must be updated with the `primary-*` / `neutral-*` color scales from `clarissi-www/tailwind.config.mjs`. Without this, the amber/gold plan badges, the upgrade modal CTA buttons, and the tier-tier color differentiation all fall back to generic Tailwind `yellow-*` or `blue-600` — which looks like a different product than the marketing site.

**Closing the brand gap is a prerequisite for shipping tier gate UX at quality.** It is ~30 minutes of config work: copy color scales, add font packages, add font CSS imports, add fontFamily overrides.

## Implementation Requirements

### `src/pages/SkillsPage.tsx`
- Render plan badge (`Professional` / `Scale`) alongside skill name for all gated skills — always visible, never conditionally hidden
- Clicking a gated skill opens the upgrade modal (Pattern 2), not the skill config flow
- Gated skills use "Set Up on Professional" / "Set Up on Scale" as the action label (Pattern 3)
- Active, unlocked skills continue to use "Configure" as the action label

### Upgrade Modal (`src/components/UpgradeModal.tsx` — new component)
- Receives: skill name, required plan, current plan
- Shows: skill description (one sentence), plan name, tier capability summary, single "Upgrade to [Plan]" CTA
- Links CTA to billing page or upgrade flow
- Must be dismissible (Escape key + backdrop click)
- Do not show the price in the modal — that belongs on the billing/upgrade page

### Plan Badge (`src/components/PlanBadge.tsx` — new component)
- Takes `plan: 'professional' | 'scale'` prop
- Renders a small pill: amber for Professional, electric blue for Scale (matching brand tokens once applied)
- Used inline in skill cards and feature labels

### `packages/web/tailwind.config.js`
- Must have `primary-*` and `neutral-*` color scales added before shipping tier gate UX
- Font family overrides for Outfit Variable (headings) and Inter Variable (body)
- See `clarissi-www/tailwind.config.mjs` for the source token values

## Rejected Alternatives

| Alternative | Why rejected |
|-------------|-------------|
| Lock icons on gated skills | Creates anxiety and implies broken/forbidden rather than upgradeable. Violates *Trust through precision* — the operator doesn't know what the lock means without additional copy. |
| Hiding gated skills entirely | Violates *Claritas first* — the operator cannot see what they'd gain by upgrading. Reduces upgrade motivation and makes the platform appear to have fewer capabilities than it does. |
| Disabled "Activate" button with tooltip | A disabled button with a tooltip is low-discoverability. Tooltips are not reliable on mobile and do not convey full upgrade context. |
| Inline error on click ("Plan required") | Error states are for failures. A plan gate is not a failure — it's a feature invitation. Using an error pattern frames upgrade as a rejection. |

## Related

- [ADR-024: Platform Access Tiers, Skill Creation Gates, and Domain-Agnostic Model](../../docs/decisions/024-platform-access-tiers-and-domain-agnostic-model.md)
- [ADR-016: Three-Tier Customer Journey](../../docs/decisions/016-three-tier-customer-journey.md)
- [UXR-002: Skill Creation Flows](002-skill-creation-flows.md)
