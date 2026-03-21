# ADR-020: Generic Test Webhook Detection via Adapter-Declared Header

## Status
Proposed — implementation deferred pending ADR-010 (durable webhook ingestion / BullMQ queue)

## Context

Webhook source systems (Shopify, AfterShip, future integrations) send test/sandbox webhooks that should not count toward customer billing. For example, Shopify sends `X-Shopify-Test: true` on any webhook fired via "Send test notification" in the merchant admin panel.

Without detection, these test events create real `skill_executions` rows with `sandbox = false`, incrementing the monthly `usage_records` counter for paid orgs — effectively billing customers for synthetic events.

The detection mechanism needs to be generic: each integration has its own convention for signaling test webhooks, and the trigger handler (`webhook-trigger.ts`) must remain agnostic to specific systems.

**Deferred reason:** `webhook-trigger.ts` is in scope for ADR-010's BullMQ queue refactor. Implementing detection now would require a second touch when the queue lands. The pattern and plan are captured here to be implemented alongside ADR-010.

## Decision

Each `WebhookSourceAdapter` optionally declares a `testWebhookHeader` property — the lowercase HTTP header name that the source system uses to signal a test event (expected value: `'true'`).

At trigger creation time, `autoRegisterWebhook` reads this property from the adapter and stores it in the trigger's `verification_config` JSONB alongside the existing HMAC config:

```json
{
  "type": "hmac_sha256",
  "header": "x-shopify-hmac-sha256",
  "secret": "...",
  "testWebhookHeader": "x-shopify-test"
}
```

At runtime, `webhook-trigger.ts` reads `testWebhookHeader` from the trigger record and sets `sandboxMode = true` if the request carries that header with value `'true'`. No adapter reference is needed at request time.

**When ADR-010 is implemented:** the `testWebhookHeader` value should be included in the queue message payload so the consumer can apply `sandbox = true` at execution creation time without re-reading headers.

### Interface changes (deferred)

```ts
// slot-adapter.ts — WebhookSourceAdapter
readonly testWebhookHeader?: string;  // e.g. 'x-shopify-test'
readonly webhookHmacHeader?: string;  // e.g. 'x-shopify-hmac-sha256' (removes hard-coded string in skill-routes)

// skill.ts — WebhookVerification union (hmac_sha256 + hmac_sha256_v0 variants)
testWebhookHeader?: string;
```

### Adapter implementations (deferred)

```ts
// ShopifyOrderAdapter
readonly testWebhookHeader = 'x-shopify-test';
readonly webhookHmacHeader = 'x-shopify-hmac-sha256';
```

AfterShip: no known test webhook header as of 2026-03. Implement `testWebhookHeader` when/if AfterShip documents one.
Fulfil.io: not yet integrated — add property when adapter is built.
Gorgias: N/A — action-only, does not send webhooks to pacore.

## Consequences

**Positive:**
- Adding a new webhook source never requires changes to `webhook-trigger.ts` — the adapter self-declares its test signal
- Existing trigger records without `testWebhookHeader` silently skip detection (no behavioral change, no migration needed)
- Detection logic is data-driven and stored with the trigger, survives app restarts cleanly

**Negative:**
- Existing deployed Shopify trigger records won't benefit until they are deleted and re-created (re-runs `autoRegisterWebhook`)
- If ADR-010 lands first, the runtime check location shifts from `webhook-trigger.ts` to the queue consumer — minor rework

**Systems affected:** `packages/core` (type), `packages/cloud` (slot-adapter interface, Shopify adapter, skill-routes, webhook-trigger)

## Rejected Alternatives

**Per-system if/else in webhook-trigger.ts** — works for one system but requires trigger-layer changes for every new integration. Ruled out immediately.

**Chain-level detection** — chains receive processed payload, not raw headers. Headers would need to be threaded through the entire dispatch chain. Too deep in the stack for what is essentially an infrastructure concern.

**Runtime adapter dispatch** — look up the adapter at request time and call `adapter.isTestWebhook(headers)`. Requires adding `AdapterRegistry` as a dependency of `webhook-trigger.ts`. Rejected in favor of the simpler data-driven approach (store at creation, read at runtime).
