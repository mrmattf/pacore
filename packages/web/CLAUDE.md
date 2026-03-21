# packages/web — React Frontend

Vite + React 18 + TypeScript + TailwindCSS. Entry point: `src/main.tsx`.

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Router setup, auth guards |
| `src/pages/SkillsPage.tsx` | Browse and activate skills from the catalog |
| `src/pages/SkillConfigPage.tsx` | Configure slot connections + field overrides for an activated skill |
| `src/pages/TemplatePickerPage.tsx` | Template picker for a skill type |
| `src/pages/BillingPage.tsx` | Usage, execution history per skill |
| `src/pages/ChatPage.tsx` | AI chat interface |
| `src/pages/MCPServersPage.tsx` | MCP server registration and management |
| `src/services/` | API client functions (one file per domain) |
| `src/store/` | Global state (auth, etc.) |

## UX Decision Records

Design decisions for the platform UI live in [`docs/ux/`](docs/ux/README.md). Check these before implementing tier gates, skill creation surfaces, or any pattern that recurs across multiple pages.

| UXR | Topic |
|-----|-------|
| [UXR-001](docs/ux/001-tier-gate-ux-patterns.md) | Plan badges, upgrade modals, gated catalog patterns |
| [UXR-002](docs/ux/002-skill-creation-flows.md) | BYOM discovery block, Intent-to-Draft, connect-first banner |

**Pre-loaded brand gap:** `tailwind.config.js` has no brand tokens — vanilla Tailwind only. Closing this (~30 min) is a prerequisite before shipping tier gate UX at brand quality. See UXR-001.

## Patterns

- Use `apiFetch()` from `src/services/` for all API calls — it handles JWT expiry and refresh automatically
- Pages are route-level components; keep them thin, extract logic to hooks in `src/hooks/`
- TailwindCSS only — no custom CSS files
- Skill flow: SkillsPage → activate → SkillConfigPage (configure slots + fields) → BillingPage (execution history)

## Organization Context Switching

**Store:** `src/store/contextStore.ts` — Zustand store with localStorage persistence. Holds:
- `context: AppContext` — `{ type: 'personal' }` or `{ type: 'org', orgId, orgName, role }`
- `setContext(ctx)` — updates context and persists to localStorage

**Helper:** `skillsBasePath(ctx)` — returns `/v1/me/skills` (personal) or `/v1/organizations/:orgId/skills` (org)

**UI:** `src/components/ContextSwitcher.tsx` — dropdown in SkillsPage header:
- Shows "Personal" or org name + role badge
- Switches context via `fetchOrgWithMembers()` to resolve caller's role
- On 403 (removed from org), auto-falls back to personal + refreshes org list
- "+ New Organization" option creates org and auto-switches to it

**Admin panel:** `src/components/OrgPanel.tsx` — slide-over (admin-only):
- List members with role badges; admins can change roles or remove members
- Invite form (admin only) — accepts user ID + role
- All mutations lock UI while reloading org data

**Integration:** All skill API calls in SkillsPage, SkillConfigPage, TemplatePickerPage, BillingPage use `skillsBasePath(context)` instead of hardcoded `/v1/me/skills`
