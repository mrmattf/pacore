# MVP Status

## Phase Overview

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Standalone MVP with MCP tools | **In Progress** |
| Phase 2 | AI agent layer integration | Not Started |
| Phase 3 | pacore workflow migration | Not Started |
| Phase 4 | Full pacore platform integration | Not Started |

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
2. Agent uses existing MCP tools to gather context
3. Agent determines appropriate customer communication
4. Agent can escalate complex cases
5. Agent calls workflows via Workflow MCP for deterministic processing

### Agent Capabilities

| Capability | Description |
|------------|-------------|
| Urgency Assessment | Determine priority based on order value, customer history |
| Customer Segmentation | VIP customers get personalized handling |
| Message Personalization | Tailor notification based on context |
| Exception Handling | Handle cases that workflow can't (unusual items, bulk orders) |
| Escalation | Route complex cases to human agents |

### Planned Features

- [ ] Agent runtime integration (Claude SDK)
- [ ] System prompt for backorder scenarios
- [ ] Context gathering (order history, customer data)
- [ ] Decision logging and observability
- [ ] Token usage tracking
- [ ] Fallback to workflow for standard cases

### Agent + MCP Pattern

```
Event → Agent reasons → Calls MCP tools → Decides
                     → For standard cases: workflow.execute
                     → For VIP/complex: direct handling
                     → For unknown: escalate
```

See [AI Agents](../../../docs/ai-agents.md) for platform-wide agent patterns.

## Phase 3: Workflow Conversion (Planned)

### Goals

1. Convert business logic to pacore workflow DAG
2. Expose via Workflow MCP (`workflow.execute`)
3. Agent orchestrates workflow + handles exceptions
4. Visual editing via workflow builder

### Workflow Design

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Get Order   │───►│   Check      │───►│   Filter     │───►│   Create     │
│  (mcp_fetch) │    │  Inventory   │    │  Backorders  │    │   Ticket     │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### Workflow MCP Tools

Once converted, agents can call:
- `workflow.execute({ id: 'backorder-detection', inputs: { orderId } })`
- `workflow.status({ executionId })`

See [Workflow MCP](../../../docs/workflow-mcp.md) for tool specifications.

## Phase 4: Solution Packaging (Planned)

### Goals

1. "Backorder Detection" as customer-facing product
2. Customizable integrations (order source, notification system)
3. Multi-tenant deployment
4. Customer configuration UI

### Customization Points

| Point | Options |
|-------|---------|
| Order Source | Shopify, WooCommerce, Magento, BigCommerce |
| Notification System | Gorgias, Zendesk, Gmail, Slack |
| Trigger | Webhook, scheduled scan, manual |
| Templates | Customer-defined email templates |

### Multi-Tenant Architecture

```
┌─────────────────────────────────────────┐
│            PACORE PLATFORM              │
│  ┌─────────────────────────────────┐    │
│  │    Backorder Detection Solution │    │
│  │    - Shared workflow definition │    │
│  │    - Shared agent prompts       │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Customer A          Customer B         │
│  - Shopify config    - WooCommerce      │
│  - Gorgias creds     - Zendesk creds    │
│  - Custom templates  - Custom templates │
└─────────────────────────────────────────┘
```

See [Solutions Index](../../../docs/solutions/README.md) for solution patterns.

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
