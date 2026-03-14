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

## Patterns

- Use `apiFetch()` from `src/services/` for all API calls — it handles JWT expiry and refresh automatically
- Pages are route-level components; keep them thin, extract logic to hooks in `src/hooks/`
- TailwindCSS only — no custom CSS files
- Skill flow: SkillsPage → activate → SkillConfigPage (configure slots + fields) → BillingPage (execution history)
