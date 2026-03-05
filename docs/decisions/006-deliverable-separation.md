# ADR-006: Deliverable Separation — Customer Solutions vs PA Core Integrations

## Status
Accepted

## Context

PA Core operates two parallel tracks:
1. **Customer engagements** — standalone apps built for specific customers (e.g., `packages/shopify-backorder` for Yota Xpedition). Customer owns the code per licensing agreement.
2. **Platform product** — PA Core itself, built using patterns learned from customer engagements, with its own native integrations.

During implementation of the PA Core multi-tenant MCP Gateway, the question arose: should PA Core connect to the customer's standalone app (shopify-backorder) as a deployed service, either as one instance per tenant or as a shared service with per-tenant credential injection?

## Decision

**No deployment relationship exists between customer deliverables and PA Core.**

Specifically:
- `packages/shopify-backorder` is delivered to the customer and operated by them on their own infrastructure. PA Core never calls it, connects to it, or manages it.
- PA Core builds its own native Shopify/Gorgias integrations as platform MCP servers, implemented clean-room using patterns learned from customer engagements.
- The `packages/shopify-backorder` code must not be modified to accommodate PA Core's internal architecture (adding imports from `@pacore/core`, responding to PA Core-specific headers, etc.).
- Communication between PA Core and any external service is via that service's public API, not via an intermediate customer-owned app.

## How PA Core adds Shopify capability

Platform integrations (Shopify, Gorgias, etc.) are built as **platform MCP servers** that self-register at startup:

```
packages/cloud/src/integrations/
  shopify/      ← PA Core's own Shopify MCP tools (clean-room)
  gorgias/      ← PA Core's own Gorgias MCP tools (clean-room)
```

These register in the `mcp_servers` table with `server_type = 'platform'` and expose their tools through the MCP Gateway when a user activates the corresponding skill. Credentials (API keys per tenant) are stored in `mcp_credentials` scoped to user or org.

## What the tenant header changes to shopify-backorder mean

The `X-Org-Id` / `X-User-Id` header support added to shopify-backorder this session was motivated by the (now-rejected) assumption that PA Core would connect to shopify-backorder as a backend service. Those changes remain in the codebase as a **standalone multi-store feature** — useful if the customer ever wants to serve multiple Shopify stores from one deployment. They do not add any PA Core dependency to shopify-backorder.

## Consequences

**Easier:**
- Clear IP boundary: customer code and platform code never mix.
- shopify-backorder can be handed off cleanly with no operational dependency on PA Core.
- PA Core integrations can be designed from the start for multi-tenancy and the platform's auth model, rather than adapting a single-tenant standalone app.
- No risk of violating the customer licensing agreement by embedding their code in our platform.

**Harder:**
- We build each integration twice: once for the customer engagement (validated, real-world) and once for the platform (clean-room, multi-tenant). This is intentional — the first informs the second.
- Platform Shopify/Gorgias MCP servers need to be built before PA Core can offer Backorder Detection as a platform skill.

## Related

- [Product Strategy — Track 1 vs Track 2](../product-strategy.md#go-to-market-strategy)
- [ADR-001 — Use MCP for external integrations](001-mcp-for-integrations.md)
