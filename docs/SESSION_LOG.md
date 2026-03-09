# Development Session Log

Brief tracking of significant changes. Keep entries to 1-2 sentences each. Delete entries older than 5 sessions.

---

## 2026-03 (recent sessions)
- Auth bug: SkillsPage and TemplatePickerPage were using raw `fetch()` with token captured at render time; replaced all calls with `apiFetch()` so JWT expiry is handled transparently via refresh.
- Platform reliability: added exponential-backoff retry in `AdapterRegistry.invokeCapability()`, SHA-256 idempotency-key deduplication in `SkillDispatcher` (`skill_executions.idempotency_key`), and `executeEscalation()` shared utility routing `escalate` policy actions to a configurable support slot.
- Gorgias adapter fixed: added `sender`, `from_agent: true`, `source.from` fields; corrected `ticketUrl` construction using stored subdomain.
- Re:amaze adapter fixed: `conversation[user]` field (not `customer`), base URL changed to `.reamaze.com`.
- Template engine overhauled: plain-text base templates with per-adapter renderers (nl2br for Gorgias/Zendesk, plain text for Re:amaze); intro/body/closing/subject are all editable per skill config; `templateVariables` shown as clickable chips in the Customize tab; fixed subject override bug (`applyTemplateFieldOverrides`).
- Added three new skill types: `low-stock-impact`, `high-risk-order-response`, `delivery-exception-alert` — each with Gorgias, Zendesk, and Re:amaze template variants plus optional escalation slot on all templates.

## 2026-02-28
- Built multi-tenant PA Core MCP Gateway (`/v1/mcp`): aggregates tools from user's active-skill servers, namespaces as `{server}__{tool}`, injects per-tenant credentials, exposes `list_skills`/`activate_skill`/`deactivate_skill` meta-tools.
- Added tenant keying to shopify-backorder (multi-store config via `X-Org-Id`/`X-User-Id` headers) as a standalone feature; shopify-backorder has zero PA Core dependencies.
- Architecture decision: shopify-backorder is a customer deliverable with no deployment relationship to PA Core — PA Core will build native Shopify/Gorgias integrations clean-room (ADR-006).
- Designed and implemented native PA Core Backorder Detection skill: two-layer SkillTemplate architecture (skill developer pre-compiles ECA policy + enrichment spec; end users configure credentials only), IntegrationConnection named credential sets, and three templates (Shopify→Gorgias/Zendesk/Freshdesk).
- Established four platform-level security requirements (non-optional): Shopify HMAC webhook verification, read-only tool restriction in NL compiler, HTML escaping in template rendering, and enrichment iterateOver iteration cap (50).

## 2025-01-28
- Created WorkflowsPage for viewing/editing saved workflows. Fixed API array response handling.
- Added 2-minute timeout and status message for workflow build endpoint.
- Created documentation system: CLAUDE.md, .cursorrules, ADRs for AI continuity.

---

## Next Priorities
1. Test all 4 skill types end-to-end with live Shopify webhooks
2. Add Re:amaze variants for low-stock, high-risk, delivery-exception templates
3. Edge Agent MVP
