# Development Session Log

Brief tracking of significant changes. Keep entries to 1-2 sentences each. Delete entries older than 5 sessions.

---

## 2026-03 (recent sessions)
- Org-scoped MCP sessions: Added `pacore__list_accessible_orgs` and `pacore__switch_org` MCP tools with 4-priority resolution chain (session override → URL slug → X-Org-Id header → auto-resolve); fixed cross-tenant skill deletion bug in `deleteUserSkill`; updated assessment prompt with Step 0 org selection.
- Debug mode for operator skill testing: Added Bug icon toggle in SkillsPage operator view to enable `testMode` via `PUT /configure`; debug mode shows amber badge and sandbox execution labels; normal mode shows last 3 executions with step details and inline HTML previews.
- Operator UI and data flow polish: Fixed onboarding credential storage to create `integration_connections` rows alongside `mcp_credentials` (now visible to ConnectionPicker); added skill activation flow to OperatorCustomerDetail SkillsTab; added shared `AppNav` component with Clarissi wordmark and UserMenu; fixed ConnectionPicker dependency array (`orgId`, `token`).
- Operator Platform complete: DB migration 013 added `is_operator`, `operator_customers`, `customer_profiles` (with `management_mode`), and `credential_intake_tokens` tables; backend operators-routes, operator-guards, onboarding-routes with atomic token consumption + Cloudflare Turnstile; frontend OperatorDashboard, OperatorCustomerDetail, CredentialIntakePage, useOperator hook; JWT `isOperator` flag and `/me` response; ADR-018 documents identity model, credential intake flow, and management mode lifecycle.
- Frontend org context switching: Added `contextStore.ts` (Zustand + localStorage), `useOrgs` hook for member API calls, `ContextSwitcher` dropdown in SkillsPage header (Personal / orgs / "+ New Organization"), and `OrgPanel` slide-over for admin member management; all skill API calls now context-aware via `skillsBasePath()` helper across SkillsPage, SkillConfigPage, TemplatePickerPage, BillingPage.

---

## Next Priorities
1. Test all 4 skill types end-to-end with live Shopify webhooks
2. Add Re:amaze variants for low-stock, high-risk, delivery-exception templates
3. Edge Agent MVP
