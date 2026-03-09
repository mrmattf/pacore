# ADR-008: Platform Reliability — Retry, Deduplication, and Escalation Routing

**Date:** 2026-03
**Status:** Accepted
**Affects:** `packages/cloud/src/integrations/adapter-registry.ts`, `packages/cloud/src/skills/skill-dispatcher.ts`, `packages/cloud/src/skills/execute-escalation.ts`, `packages/cloud/src/chains/`, `packages/core/src/types/policy.ts`, DB schema (`skill_executions.idempotency_key`)

---

## Context

Skill execution is triggered by inbound webhooks (Shopify `orders/create`, inventory webhooks, AfterShip tracking events). Three failure modes needed addressing:

1. **Transient adapter failures** — third-party APIs (Gorgias, Zendesk) are occasionally unavailable. A single failure should not permanently fail a skill execution.
2. **Duplicate webhook delivery** — Shopify and other platforms guarantee at-least-once delivery. The same `orders/create` webhook can arrive multiple times, causing duplicate customer tickets.
3. **No path for escalation** — policy rules could emit `{ type: 'escalate' }` but there was no mechanism to route the escalation to an actual support channel. It silently logged to console.

All three issues were discovered when testing end-to-end with live Shopify webhooks.

## Decision

### 1. Exponential Backoff Retry (AdapterRegistry)

`AdapterRegistry.invokeCapability()` wraps every adapter call with a retry loop:
- 3 attempts maximum
- Initial delay 1 second, 2× multiplier (1s → 2s → 4s)
- **Skips retry for 4xx errors** — these indicate bad input, not transient failure
- On final failure, throws so the chain can mark the execution as failed

The retry is centralized in `AdapterRegistry` so all adapters benefit automatically — no per-chain retry logic needed.

### 2. SHA-256 Idempotency Key (SkillDispatcher + skill_executions)

Before executing a skill, `SkillDispatcher` computes `SHA-256(rawWebhookBody)` and stores it in `skill_executions.idempotency_key`. A partial unique index enforces uniqueness:

```sql
CREATE UNIQUE INDEX skill_executions_idempotency_key_idx
  ON skill_executions(idempotency_key)
  WHERE status != 'failed';
```

The index excludes `failed` rows so that a legitimately re-triggered execution after a failure is allowed. If the same payload arrives while a `pending` or `completed` row exists, the INSERT fails and the duplicate is silently dropped.

### 3. Escalation Routing (executeEscalation + targetSlot)

The `escalate` action type in `policy.ts` is extended with an optional `targetSlot`:

```typescript
{ type: 'escalate'; message?: string; targetSlot?: string }
```

A shared utility `execute-escalation.ts` handles the action:
- When `targetSlot` is absent → `console.warn` (backwards compatible, existing policies unchanged)
- When `targetSlot` is present → resolves the named slot from `UserSkillConfig.slotConnections`, fetches encrypted credentials, calls `adapterRegistry.invokeCapability('create_ticket')` with priority `high` and tags `['escalation', 'automated']`
- Escalation failures are **non-fatal** — caught internally so a failed escalation does not prevent the primary customer notification from being marked complete

All 4 skill template families expose an optional `escalation` slot (slot key `'escalation'`, `required: false`) so users who want internal alerts can connect a support channel, and users who don't are not forced to configure anything.

## Alternatives Considered

1. **Per-chain retry logic** — rejected: duplicates retry configuration across 4 chains; harder to tune consistently.
2. **Redis-based deduplication** — deferred: would require Redis in production; DB-level unique index is simpler and sufficient for current webhook volumes. Can be revisited if Redis is reintroduced.
3. **Separate escalation skill** — rejected: escalation is a cross-cutting concern of the policy layer, not a separate skill. Making it a `targetSlot` on any skill keeps it composable without adding a new skill type per use case.
4. **Required escalation slot** — rejected: forces every user to configure an internal alert channel. Optional slot with backwards-compatible fallback matches the principle of least friction.

## Consequences

- Transient third-party API failures are automatically retried without operator intervention.
- Duplicate webhook delivery from Shopify (guaranteed at-least-once) does not produce duplicate customer tickets.
- Skill executions that fail permanently (4xx, exhausted retries) can be reprocessed by re-delivering the webhook — the idempotency key only blocks duplicates, not intentional retries.
- Any skill can opt into escalation routing by adding an `'escalation'` slot to its template variants; no chain-level changes needed for new skill types.
- Escalation failures are logged but do not affect skill execution status — operators must monitor logs for escalation delivery failures separately.
