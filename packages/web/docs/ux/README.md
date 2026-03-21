# UX Decision Records (UXR)

Design decisions for the Clarissi platform UI (`packages/web`). These records capture the *why* behind UX choices so that implementation doesn't re-debate resolved design questions.

## Format

UXRs are numbered sequentially, same convention as ADRs. Each UXR is linked to one or more ADRs that motivated the design requirement.

## What warrants a UXR?

Write a UXR when:
- A platform architecture decision has specific UX implementation requirements that engineers need to know
- A design decision affects multiple components or pages
- A pattern is established that should be followed consistently (e.g., how to handle gated features)
- A design choice has a non-obvious rationale that future contributors would otherwise re-debate

Skip UXRs for: pixel-level tweaks, one-off copy fixes, or anything already covered by brand token alignment.

## Index

| UXR | Title | Status | Linked ADR | Date |
|-----|-------|--------|-----------|------|
| [001](001-tier-gate-ux-patterns.md) | Tier Gate UX Patterns — Plan Badges, Upgrade Flows, and Gated Catalog | Accepted | ADR-024 | 2026-03-21 |
| [002](002-skill-creation-flows.md) | Skill Creation Flows — BYOM Discovery, Intent-to-Draft, and Connect-First Onboarding | Accepted | ADR-024 | 2026-03-21 |

## Brand Reference

The Clarissi design system is documented in `.claude/commands/ux-design.md`. The brand principles (Claritas, vibrant not sterile, AI as delivery mechanism, trust through precision) are the evaluative lens for all UX decisions.

**Known structural gap (pre-loaded):** `packages/web/tailwind.config.js` uses vanilla Tailwind with no brand tokens. `clarissi-www` has a full `primary-*` / `neutral-*` color scale and custom fonts (Outfit Variable + Inter Variable). Closing this gap is ~30 min of config work and is a prerequisite for all deeper brand work on the app. See UXR-001 for the alignment path.
