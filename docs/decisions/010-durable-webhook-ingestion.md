# ADR-010: Durable Webhook Ingestion — Queue, DLQ, and Circuit Breakers

**Date:** 2026-03
**Status:** Proposed
**Affects:** `packages/cloud/src/api/gateway.ts`, `packages/cloud/src/skills/skill-dispatcher.ts`, new `packages/cloud/src/queue/`

---

## Context

ADR-008 addressed in-process reliability: retry loops inside a single request lifecycle, DB-level idempotency, and escalation routing. This raised skill execution reliability from ~85% to ~92–97%.

The remaining gap is **infrastructure-level**: webhooks processed inline (synchronously in the HTTP handler) are vulnerable to failures that no amount of in-process retry can recover from:

1. **Webhook drop on process crash** — if the Node process restarts mid-execution, the webhook is gone. Shopify will retry delivery, but only for a limited window and with no guarantee.
2. **No replay capability** — a failed execution cannot be re-run without re-delivering the original webhook. Operators have no self-service recovery path.
3. **No backpressure** — a traffic spike or downstream outage causes HTTP handlers to block or reject. There is no buffer between webhook receipt and execution.
4. **Silent DLQ gap** — ADR-008's retry exhaustion throws an error and logs it. No structured path exists to capture and inspect permanently failed jobs.
5. **No circuit breaker** — if Gorgias is down for 20 minutes, every skill execution in that window exhausts all retries before failing. A circuit breaker would fast-fail immediately and queue for later, reducing wasted retry cycles.

Closing these gaps moves reliability from 92–97% toward 99%+.

---

## Decision

### Architecture Overview

```
Shopify Webhook
      │
      ▼
┌─────────────────────────┐
│  POST /webhooks/shopify  │  ← Validates HMAC signature
│  (gateway.ts)           │  ← Deduplicates by X-Shopify-Webhook-Id
└────────────┬────────────┘
             │ enqueue (fast, ~1ms)
             ▼
┌─────────────────────────┐
│     BullMQ Queue        │  ← Backed by Redis
│   "skill-executions"    │
└────────────┬────────────┘
             │
    ┌────────┴────────┐
    │   Worker Pool    │  ← Concurrency-limited workers
    │  (N concurrent)  │
    └────────┬────────┘
             │
    ┌────────▼────────┐
    │  SkillDispatcher │  ← Existing execution logic unchanged
    │  + AdapterRegistry│
    └────────┬────────┘
             │ on failure after retries
             ▼
┌─────────────────────────┐
│   Dead Letter Queue      │  ← "skill-executions-dlq"
│   (BullMQ failed jobs)   │  ← Inspectable, replayable via admin API
└─────────────────────────┘
```

### 1. Queue-Backed Webhook Ingestion (BullMQ + Redis)

The HTTP handler's only job becomes: validate → deduplicate → enqueue → 200 OK.

```typescript
// gateway.ts — webhook handler (new)
app.post('/webhooks/shopify', validateShopifyHmac, async (req, res) => {
  const webhookId = req.headers['x-shopify-webhook-id'] as string;

  // Exactly-once at queue entry (Redis SET NX with TTL)
  const isNew = await webhookDedup.setIfAbsent(webhookId, 24 * 60 * 60);
  if (!isNew) return res.status(200).json({ status: 'duplicate' });

  await skillQueue.add('process-webhook', {
    topic: req.headers['x-shopify-topic'],
    shopDomain: req.headers['x-shopify-shop-domain'],
    webhookId,
    payload: req.body,
  }, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 7 * 24 * 60 * 60 }, // keep 7 days
    removeOnFail: false, // keep in DLQ forever until replayed
  });

  res.status(200).json({ status: 'queued' });
});
```

**Why BullMQ over SQS/RabbitMQ:**
- Redis is already planned infrastructure (see CLAUDE.md env vars)
- BullMQ provides job inspection, retry control, and DLQ without additional services
- Can swap to SQS later without changing SkillDispatcher (queue is an adapter boundary)

### 2. Dead Letter Queue (DLQ) + Replay API

Jobs that exhaust all retry attempts move to BullMQ's failed state automatically. A thin admin API exposes inspection and replay:

```
GET  /admin/dlq              — list failed jobs (paginated)
GET  /admin/dlq/:jobId       — inspect job payload + failure reason
POST /admin/dlq/:jobId/retry — move job back to active queue
POST /admin/dlq/retry-all    — bulk replay (rate-limited)
DELETE /admin/dlq/:jobId     — discard permanently
```

All admin endpoints require an elevated `admin` JWT scope (not the standard user token).

### 3. Circuit Breaker (per Adapter)

`AdapterRegistry` gains a per-adapter circuit breaker using the half-open state machine pattern:

```
CLOSED (normal) → [N failures in T seconds] → OPEN (fast-fail)
OPEN → [after cooldown period] → HALF-OPEN (probe one request)
HALF-OPEN → [probe succeeds] → CLOSED
HALF-OPEN → [probe fails] → OPEN
```

Configuration per adapter:
```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;   // failures before opening (default: 5)
  windowSeconds: number;      // failure counting window (default: 60)
  cooldownSeconds: number;    // time in OPEN before probing (default: 30)
}
```

When OPEN, `invokeCapability()` throws `CircuitOpenError` immediately — no wait, no retry. The BullMQ worker catches this and reschedules the job with a delay matching the adapter's cooldown, rather than incrementing the retry counter.

### 4. Webhook Deduplication at Queue Entry

Current deduplication (ADR-008) uses a DB unique index on `SHA-256(rawBody)`. This is preserved as a second layer. The new first layer uses `X-Shopify-Webhook-Id` in Redis with a 24-hour TTL:

- **Layer 1 (Redis, new):** Blocks at HTTP handler before enqueue. Fast, ~1ms.
- **Layer 2 (DB, existing):** Blocks at execution time. Catches duplicates that slip through (different webhook IDs for semantically identical payloads — rare but possible).

### 5. Credential Health Checks

A background task runs every 5 minutes to validate active adapter credentials:

```typescript
// credential-health-checker.ts
async function checkAdapterHealth(userId: string): Promise<HealthReport> {
  // Calls a lightweight read-only endpoint on each configured adapter
  // (e.g., Gorgias GET /api/v2/account, Shopify GET /admin/api/.../shop.json)
  // Records pass/fail + latency in Redis with 10-min TTL
}
```

`AdapterRegistry` reads the health cache before invoking. Stale or failed credentials emit a warning log and trigger an escalation (if configured) rather than attempting the call and failing after retries.

---

## Alternatives Considered

1. **SQS + Lambda** — stronger durability guarantees but adds AWS dependency, increases operational complexity. Deferred; BullMQ is sufficient for current volumes.
2. **In-process queue (p-queue)** — no durability across restarts. Rejected for the same reason in-process retry alone is insufficient.
3. **Postgres-backed queue (pg-boss)** — removes Redis dependency but slower than Redis for queue operations. Viable fallback if Redis is unavailable.
4. **Sync processing with Shopify retry reliance** — current state. Rejected: Shopify's retry window is limited and unreliable for all failure modes.

---

## Consequences

- Webhook HTTP handler returns 200 in ~1ms regardless of downstream health — Shopify's retry logic is no longer needed as a reliability mechanism.
- Failed executions are inspectable and replayable without re-delivering webhooks.
- Redis becomes a hard dependency for webhook processing (currently optional).
- Worker concurrency config needs tuning per deployment (start: 5 concurrent workers).
- Admin DLQ API requires access control — must not expose raw job payloads to unauthorized users.
- Circuit breakers reduce wasted retry cycles during downstream outages but add state that must be monitored.

---

## Implementation Phases

| Phase | Work | Target Reliability |
|-------|------|--------------------|
| 0 (current) | In-process retry + DB idempotency | 92–97% |
| 1 | Queue ingestion + DLQ | 98–99% |
| 2 | + Circuit breakers | 99.5% |
| 3 | + Credential health checks + replay API | 99.9% |

Phase 3 represents the practical ceiling — the remaining 0.1% is true external unavailability (platform-wide Shopify/Gorgias outages) that no retry architecture can recover from synchronously.