# Development Session Log

Brief tracking of significant changes. Keep entries to 1-2 sentences. Delete entries older than 5 sessions.

---

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
- Customer research: Yota Xpedition (Toyota aftermarket, uses Fulfil.io ERP).

## 2025-01-27
- Implemented schema-aware input mapping: SchemaFormBuilder, SchemaField, NodeOutputMapper components.
- Extended workflow-executor parameter resolution to support property paths (`$input[0].user.email`).

## 2025-01-26
- Visual workflow builder with React Flow and NodeConfigPanel.
- Workflow execution engine with DAG traversal.

---

## Next Priorities
1. Test schema-aware input mapping with real MCP tools
2. Edge Agent MVP (start with Telegram)
3. Customer demo for Yota Xpedition