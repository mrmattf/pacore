# Development Session Log

Brief tracking of significant changes. Keep entries to 1-2 sentences each. Delete entries older than 5 sessions.

---

## 2026-03 (recent sessions)
- Agent MCP gateway architecture: Added ADR-023 (agent session scaling, Redis pub/sub, per-customer rate limiting, per-tool-call billing, discoverability); expanded ADR-017 with Pass 3 Configuration Topology Discovery (`pacore__get_integration_topology`, adapter `configurationTools[]`, Operational Efficiency Report); expanded ADR-012 with Role 5 (Agent Session Intelligence) and explicit moat articulation for direct-to-system vs. through-Clarissi routing.
- Second skills assessment (YotaXpedition, March 2026): expanded catalog to 20+ skill candidates across 5 dependency tiers (B–E); identified Fulfil.io MCP server as zero-code enrichment path, Turn 14 Distribution as Tier E supplier adapter opportunity, and Gorgias AI Agent native capability overlap on Tier B; ADR-021 (Fulfil.io) and ADR-022 (scheduled execution) added as Proposed; ADR-019 advanced to Accepted—pending implementation.
- Backorder bug fix + ETA config: Refactored backorder chain to correctly compute `backorderedQty` from negative Shopify inventory (overcommitment case); made ETA dates configurable; reduced chain complexity; fixed filter support in Gorgias queries.
- Org-scoped MCP sessions: Added `pacore__list_accessible_orgs` and `pacore__switch_org` MCP tools with 4-priority resolution chain (session override → URL slug → X-Org-Id header → auto-resolve); fixed cross-tenant skill deletion bug in `deleteUserSkill`; updated assessment prompt with Step 0 org selection.
- Operator Platform complete: DB migration 013 added `is_operator`, `operator_customers`, `customer_profiles` (with `management_mode`), and `credential_intake_tokens` tables; backend operators-routes, operator-guards, onboarding-routes with atomic token consumption + Cloudflare Turnstile; frontend OperatorDashboard, OperatorCustomerDetail, CredentialIntakePage, useOperator hook; JWT `isOperator` flag and `/me` response; ADR-018 documents identity model, credential intake flow, and management mode lifecycle.

---

## Next Priorities
1. Test all 4 skill types end-to-end with live Shopify webhooks
2. Add Re:amaze variants for low-stock, high-risk, delivery-exception templates
3. Edge Agent MVP
