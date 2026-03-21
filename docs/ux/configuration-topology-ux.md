# UX Findings: Configuration Topology & Operational Efficiency Assessment

**Date:** 2026-03-20
**Context:** ADR-017 Pass 3 (Configuration Topology Discovery), ADR-023 (Agent MCP Gateway)
**Status:** Pre-implementation design guidance — findings from UX review before any UI is built

---

## Key Principles

1. **Efficiency findings and gap findings are different conversation types — never merge them.**
   - "Gaps" = additive opportunity (you should add something)
   - "Efficiency findings" = active problem (something you have is broken/redundant)
   - Different sections, different visual treatment, different operator tone

2. **Lead with efficiency, follow with gaps.**
   Active harm is a stronger motivator than missed opportunity. Leading with efficiency findings also preempts the customer objection: "do we really need more automation if what we have is already messy?"
   *Exception:* if gap findings are dramatically higher impact than efficiency findings, lead with the bigger story.

3. **Operator framing: systems-blame, not person-blame.**
   "This is common when two systems are onboarded at different times" — NOT "you set this up wrong."
   Attribute all inefficiency findings to ecosystem complexity, not customer decisions.

---

## Assessment Report UX

### Section ordering (operator readout call)
1. Validation statement: acknowledge the customer's existing automation effort
2. Efficiency findings as shared discovery (operator as investigator, not judge)
   - Redundancy items first (lowest emotional charge — just waste)
   - Fragmentation second (slightly higher — creates support inconsistency)
   - Coverage gaps last (purely additive — safest framing)
3. Automation gaps + skill match matrix (forward-looking close)

### Visual treatment separation
- **Automation Gaps**: green/gold-tinted indicators, outcome framing ("estimated ticket deflection")
- **Operational Efficiency**: amber/neutral-tinted indicators, cost framing ("estimated wasted effort, duplicated customer contact")
- Never combine the two in the same rendered row

### AssessmentTab schema change (when building)
Add `operational_efficiency` as an **optional** 5th section alongside the 4 required sections. Optional = backward compatibility with existing reports that don't have it.

```json
{
  "assessment": { ... },           // required (existing)
  "ticket_categories": { ... },    // required (existing)
  "activation_gaps": { ... },      // required (existing)
  "summary": { ... },              // required (existing)
  "operational_efficiency": { ... } // optional (new — Pass 3 only)
}
```

---

## Topology Visualization

### Now: structured table, not a graph
Do not build a graph rendering library yet. Render as a 3-column table:

| System | Event | Coverage |
|--------|-------|----------|
| Shopify | orders/updated | Covered by backorder-notification skill |
| AfterShip | delivery_exception | Uncovered |
| Shopify | orders/cancelled | Uncovered |

This renders well in the existing `pre` block or a simple HTML table. Wait for 3–5 real Pass 3 assessments before committing to a graph schema.

### When: audience split
- **Operators**: full event-level topology table (webhook → native rule → Clarissi skill, overlap analysis)
- **Customers (self-serve, future)**: integration-level summary only ("3 systems connected, 4 event types covered, 2 gaps identified")

Customers should not see raw operator-level topology output.

---

## Operator UI Additions (when building AssessmentTab)

- Add `readout_framing` optional text field to the Assessment upload panel — operator notes planned readout angle, creates a record of the interpretation layer
- The existing `recommendation` dropdown is good; the framing field is for freeform notes

---

## Self-Serve UX (future — when self-serve Assessment ships)

**Do not build a report viewer.** Build two actionable lists:

### List 1: Things to fix (efficiency findings)
- Render as a checklist, not a report section
- Each item has a clear resolution state: "Mark as reviewed / Get help"
- Card clears when all items resolved or acknowledged

### List 2: Things to turn on (gap findings)
- Render as skill cards with an Activate button
- Reuse the existing `SkillsPage.tsx` skill card component, filtered to Assessment-identified skills
- Collapse the distance between "here is a gap" and "here is the action"

### What to NOT build for self-serve MVP
- The topology graph (too abstract without operator context)
- Raw JSON view of efficiency findings
- A separate "Efficiency Report" section mirroring the operator view

**The merchant mental model:** "I have X things to fix and Y things I haven't turned on yet."

---

## Related
- [ADR-017: Operator Skill Discovery](../decisions/017-operator-skill-discovery.md) — Pass 3 architecture that this UX is for
- [ADR-023: Agent MCP Gateway Scaling](../decisions/023-agent-mcp-gateway-scaling.md) — agent-facing infrastructure
- [packages/web/src/pages/](../../packages/web/src/) — existing frontend patterns to reuse (SkillsPage, SkillConfigPage)
- [packages/cloud/src/api/operator-routes.ts](../../packages/cloud/src/api/operator-routes.ts) — AssessmentTab API
