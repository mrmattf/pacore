# packages/cloud — Backend Service

Express API + WebSocket server. Entry point: `src/api/gateway.ts`.

## Key Files

| File | Purpose |
|------|---------|
| `src/api/gateway.ts` | All REST endpoints and webhook entry points |
| `src/api/operator-routes.ts` | Operator-only routes: customer management, mode transitions, assessment reports |
| `src/api/operator-guards.ts` | `requireOperator` middleware and operator authorization helpers |
| `src/api/onboarding-routes.ts` | Public credential intake endpoint (one-time token validation, atomic consumption, Cloudflare Turnstile verification) |
| `src/skills/skill-dispatcher.ts` | Routes webhook events to skill tool chains |
| `src/skills/skill-template-registry.ts` | Skill catalog and template registry |
| `src/integrations/adapter-registry.ts` | Central dispatch for integration adapters (with retry) |
| `src/skills/execute-escalation.ts` | Shared escalation action handler |
| `src/utils/retry.ts` | Exponential backoff retry utility |
| `src/mcp/credential-manager.ts` | Encrypted credential storage |
| `src/mcp/mcp-registry.ts` | MCP server management |
| `src/orchestration/index.ts` | LLM orchestration (chat/agent mode) |

## Adding a New Skill Type

1. Add `SkillTemplate` variants in `src/skills/templates/<skill-type>/index.ts`
2. Create tool chain in `src/chains/<skill-type>.ts`
3. Register templates in `skill-template-registry.ts`
4. Add dispatch case in `skill-dispatcher.ts`
5. Add `SlotAdapter`(s) in `src/integrations/<integration>/`

## Adding a New Integration Adapter

1. Implement `SlotAdapter` interface in `src/integrations/<key>/`
2. Register in the `AdapterRegistry` setup in `gateway.ts`
3. Add credential fields (`credentialFields`, `setupGuide`) for the Connect UI

## Adding a New API Endpoint

Follow conventions in [API.md](../../API.md):
- User-scoped routes: `/v1/me/...`
- Platform catalog routes: `/v1/skill-types/...`
- Webhook entry points: `POST /v1/triggers/webhook/:token` → async, return 200 immediately
- All endpoints require `Authorization: Bearer <jwt>` except webhooks
