# MVP Status

## Ownership

**This is a customer engagement solution for Yota Xpedition.**
- Customer owns this specific solution per licensing agreement
- We gain infrastructure know-how and integration patterns
- A separate PA Core "Backorder Detection" Skill will be built clean-room

## Phase Overview

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Standalone MVP with MCP tools + tool chains | **In Progress** |
| Phase 2 | AI agent layer (agent decides WHEN, chain executes HOW) | Not Started |
| Phase 3 | Skill packaging (PA Core platform, separate from this) | Not Started |

## Phase 1: Standalone MVP

### Goals

1. Automatically detect backorder conditions on new Shopify orders
2. Create Gorgias support tickets when backorders are detected
3. Expose MCP tools for future AI agent integration
4. Deploy to Railway for customer testing

### Feature Checklist

| Feature | Status | Notes |
|---------|--------|-------|
| Shopify webhook receiver | Done | `/webhook/orders/create` |
| HMAC signature verification | Done | Optional via env var |
| Inventory checking | Done | Via Shopify Admin API |
| Backorder detection logic | Done | Compares quantity vs available |
| Gorgias ticket creation | Done | Creates ticket with details |
| MCP tool: shopify.get_order | Done | Fetch order by ID |
| MCP tool: shopify.check_inventory | Done | Check variant inventory |
| MCP tool: gorgias.create_ticket | Done | Create support ticket |
| MCP tool: gorgias.add_message | Done | Add message to ticket |
| API key authentication | Done | Bearer token |
| Structured logging | Done | JSON format |
| Slack alerting | Done | Optional webhook |
| Docker deployment | Done | Dockerfile ready |
| Railway deployment | Done | Successfully deployed |
| Health check endpoint | Done | `/health` |
| Manual trigger endpoint | Done | `/trigger/:orderId` |

### Current Blockers

- **Customer credentials needed**: Waiting for customer to provide:
  - Shopify store domain and access token
  - Gorgias domain and API credentials
  - Preferred email templates

### Testing Status

| Test Type | Status | Notes |
|-----------|--------|-------|
| Unit tests | Not Started | Need to add |
| Integration tests | Not Started | Need mock servers |
| End-to-end with real APIs | Not Started | Waiting for credentials |
| Load testing | Not Started | Not needed for MVP |

## Phase 2: AI Agent Layer (Planned)

### Goals

1. Add Claude-based agent for intelligent decision making
2. Agent decides WHEN to invoke the backorder tool chain
3. Tool chain executes HOW (deterministic processing)
4. Agent handles edge cases that tool chain can't
5. Agent can escalate complex cases

### Agent Capabilities

| Capability | Description |
|------------|-------------|
| Urgency Assessment | Determine priority based on order value, customer history |
| Customer Segmentation | VIP customers get personalized handling |
| Message Personalization | Tailor notification based on context |
| Exception Handling | Handle cases tool chain can't (unusual items, bulk orders) |
| Escalation | Route complex cases to human agents |

### Planned Features

- [ ] Agent runtime integration (Claude SDK)
- [ ] System prompt for backorder scenarios
- [ ] Context gathering (order history, customer data)
- [ ] Decision logging and observability
- [ ] Token usage tracking
- [ ] Tool chain invocation for standard cases

### Agent + Tool Chain Pattern

```
Event → Agent reasons → Decides action needed
      → For standard cases: call backorder tool chain (deterministic)
      → For VIP/complex: direct MCP tool calls with reasoning
      → For unknown: escalate to human
      → Tool chain handles: get_order → check_inventory → create_ticket
```

See [AI Agents](../../../docs/ai-agents.md) for platform-wide agent patterns.

## Phase 3: Skill Packaging (PA Core Platform)

**Note**: This phase applies to the PA Core platform Skill, NOT this Yota solution.

This Yota solution remains standalone. The PA Core platform will have its own "Backorder Detection" Skill built clean-room using patterns learned here.

### PA Core Skill (Separate)

| Aspect | Description |
|--------|-------------|
| **Ownership** | PA Core owns the Skill |
| **Integrations** | Swappable (Shopify → any order source, Gorgias → any notification) |
| **Deployment** | Multi-tenant on PA Core platform |
| **Configuration** | Customer configuration UI |

### Yota Solution (This Package)

| Aspect | Description |
|--------|-------------|
| **Ownership** | Yota owns this solution |
| **Integrations** | Hardcoded (Shopify + Gorgias) |
| **Deployment** | Standalone Railway deployment |
| **Configuration** | Environment variables |

See [Product Strategy](../../../docs/product-strategy.md) for the distinction between customer engagements and platform solutions.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Shopify API rate limits | Medium | Medium | Add caching, batch requests |
| Gorgias API changes | Low | High | Monitor API version, add tests |
| False positive backorders | Medium | High | Add confirmation logic, thresholds |
| Webhook delivery failures | Medium | Medium | Add retry/reconciliation job |
| Customer data privacy | Low | High | Audit logging, access controls |

## Success Metrics (MVP)

1. **Reliability**: 99% webhook processing success rate
2. **Latency**: Webhook acknowledged <1s, ticket created <10s
3. **Accuracy**: 95% correct backorder detection
4. **Coverage**: All orders processed (no missed webhooks)
