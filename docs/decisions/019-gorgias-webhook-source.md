# ADR-019: Gorgias as WebhookSourceAdapter — Enabling Gorgias-Triggered Skills

**Date:** 2026-03
**Status:** Proposed
**Affects:** `packages/cloud/src/integrations/gorgias/gorgias-notification-adapter.ts`, `packages/cloud/src/integrations/gorgias/gorgias-api-client.ts`, `packages/cloud/src/skills/` (new skill types), `packages/core/src/types/`

---

## Context

All four existing platform skills are triggered by **Shopify or AfterShip webhooks**. The `ShopifyOrderAdapter` implements `WebhookSourceAdapter` — registering webhooks programmatically on skill activation and emitting events that the skill dispatcher routes to chains.

The first live Gorgias Skills Assessment (March 2026) identified three new automation candidates where the **trigger is a Gorgias support ticket**, not a Shopify event:

- **Order Cancellation / Urgent Edit** — fires when a ticket tagged "Cancel Order" or "Urgent Order Edit" arrives; needs to check Shopify order fulfillment status and respond in-thread
- **Partner Product Order Status** — fires when a ticket tagged "Partner Product" arrives; routes to partner fulfillment info

Both require `GorgiasNotificationAdapter` to emit webhook events, which it does not currently support. Today it is exclusively a notification target (creating tickets), never a trigger source.

A secondary gap uncovered: `add_message` is declared in `GorgiasNotificationAdapter.capabilities[]` and exposed in the MCP router schema, but `GorgiasApiClient` has no `addMessage()` method and `invoke()` has no matching case — it would throw at runtime. The Gorgias-triggered skills above need `add_message` to reply to the triggering ticket rather than open a new one.

---

## Decision

### 1. Implement `WebhookSourceAdapter` on `GorgiasNotificationAdapter`

Add the four interface methods to `GorgiasNotificationAdapter`:

```typescript
readonly webhookTopics: Record<string, string>;
// Maps skillTypeId → Gorgias event type
// e.g. { 'order-cancel-urgent-edit': 'ticket_created', 'partner-product-status': 'ticket_created' }

async registerWebhook(topic: string, address: string, creds: GorgiasCredentials): Promise<{ externalWebhookId: string }>;
async deregisterWebhook(externalWebhookId: string, creds: GorgiasCredentials): Promise<void>;
getWebhookHmacSecret(creds: GorgiasCredentials): string;
```

**Gorgias webhook registration** uses `POST /api/v2/webhooks` with a JSON body specifying the event type and target URL. Gorgias supports a `secret` field at registration time for HMAC signature verification on delivery.

### 2. HMAC Secret Strategy: Per-Connection, Stored in `mcp_credentials`

**Decision: generate a random 32-byte secret per Gorgias connection and store it in `mcp_credentials` alongside the existing Gorgias API credentials.**

When `registerWebhook()` is called, the adapter:
1. Reads the HMAC secret from `creds.webhookSecret` (generated at connection creation time or on first skill activation if absent)
2. Passes it to the Gorgias webhook registration API as the `secret` field
3. `getWebhookHmacSecret()` returns the same value for HMAC verification in `WebhookTriggerHandler`

**Why per-connection, not a platform env var:**
The multi-tenant credential model (ADR-007, ADR-018) stores all credentials per org. A platform-level env var would require all Gorgias connections across all tenants to share the same HMAC secret — if it were ever compromised, all tenants' webhook endpoints would need re-registration simultaneously. Per-connection secrets scope the blast radius to a single org and are consistent with how Shopify's `SHOPIFY_APP_CLIENT_SECRET` is handled (one app-level secret, acceptable for a single-app model; but Gorgias uses a per-webhook secret, which maps naturally to per-connection).

**Rejected alternative — platform-level env var (`GORGIAS_WEBHOOK_SECRET`):**
Simpler to implement but breaks multi-tenant isolation. If two customers both use Gorgias, both share the same secret. Does not align with the `mcp_credentials` model established in ADR-007.

### 3. Tag-Based Filtering in the Chain (Not at the Adapter)

Gorgias webhooks fire on all ticket creation/update events — there is no server-side tag filter in the Gorgias webhook API. Tag-based routing (`"Cancel Order"`, `"Partner Product"`) must happen in the skill chain after the webhook payload is received:

```typescript
// chain entry guard (before any enrichment)
const tags: string[] = payload.ticket?.tags ?? [];
if (!tags.includes('Cancel Order') && !tags.includes('Urgent Order Edit')) {
  return { status: 'skipped', reason: 'tag_not_matched' };
}
```

This is the same pattern used by existing chains that silently skip irrelevant events (e.g., backorder chain skipping orders with no backordered items).

**Implication:** Every Gorgias-triggered skill will receive ALL ticket creation events for a given Gorgias account and discard non-matching ones. At typical Gorgias volumes this is acceptable. If an account generates >10K tickets/month, revisit with a server-side filter or a Gorgias View-based webhook.

### 4. Fix `add_message` Stub

`GorgiasApiClient.addMessage(ticketId, message)` and the `case 'add_message':` branch in `GorgiasNotificationAdapter.invoke()` must be implemented before any Gorgias-triggered skill goes live. The stub is currently declared but hollow — calling it would fall through to `default: throw`.

---

## Consequences

### Positive
- Enables a new class of skills triggered by support ticket events — not possible with any current adapter
- Per-connection HMAC secrets maintain multi-tenant isolation (each org's webhook endpoint is independently secured)
- Tag-based filtering in the chain keeps the adapter generic — a single Gorgias `ticket_created` webhook registration covers any number of tag-based skills without additional webhook registrations
- Fixes the `add_message` latent bug before it causes a production error

### Negative / Trade-offs
- All ticket creation events flow through the dispatcher even when tags don't match — minor CPU overhead, not a reliability concern at current volumes
- Gorgias HMAC secret must be generated and stored at connection creation time (or lazily on first skill activation) — adds a credential field to `GorgiasNotificationAdapter.credentialFields`
- `deregisterWebhook()` must be called on skill deactivation; failure to deregister leaves a dangling Gorgias webhook that fires to a dead endpoint (Gorgias disables webhooks after repeated 4xx delivery failures, so this self-heals but produces noise in Gorgias webhook logs)

### Out of Scope
- Server-side tag filtering via Gorgias Views API — deferred; not needed at current volumes
- Gorgias `ticket_updated` event type — not needed for initial skill types; can be added to `webhookTopics` map without architecture changes

---

## Implementation Stages

| Stage | Work |
|-------|------|
| 1 | `GorgiasApiClient.registerWebhook()`, `.deleteWebhook()`, `.addMessage()` |
| 2 | `GorgiasNotificationAdapter` implements `WebhookSourceAdapter`; add `webhookSecret` to `credentialFields`; fix `add_message` invoke case |
| 3 | New skill type: `order-cancel-urgent-edit` (chain + template) |
| 4 | New skill type: `partner-product-status` (chain + template, after scope confirmation) |

Stage 1–2 is shared infrastructure for both new skill types; build once, reuse for both.

---

## Related

- [ADR-007: Skill Template Architecture](007-skill-template-architecture.md) — credential model and slot adapter pattern this extends
- [ADR-008: Platform Reliability](008-platform-reliability.md) — retry + escalation routing pattern applies to Gorgias-triggered chains
- [ADR-018: Operator Platform](018-operator-platform-identity-and-onboarding.md) — per-org credential storage model
- [Assessment plan](../../.claude/plans/fancy-nibbling-globe.md) — full architectural analysis including compiled policy and enrichment specs for both new skill types
