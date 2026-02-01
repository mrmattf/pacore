# Work Breakdown

## Immediate Tasks (MVP Completion)

### 1. Customer Integration

**Priority: High | Blocked by: Customer**

- [ ] Receive Shopify development store credentials
- [ ] Receive Gorgias sandbox/test credentials
- [ ] Configure environment variables in Railway
- [ ] Test webhook registration in Shopify
- [ ] Verify end-to-end flow with test order

### 2. Email Template Customization

**Priority: High | Blocked by: Customer approval**

- [ ] Get customer-approved email copy
- [ ] Update `src/handler/backorder.ts` message template
- [ ] Add HTML formatting if needed
- [ ] Test email appearance in Gorgias

### 3. Testing Infrastructure

**Priority: Medium**

- [ ] Set up Jest/Vitest test framework
- [ ] Add unit tests for `config.ts` validation
- [ ] Add unit tests for backorder detection logic
- [ ] Create mock Shopify/Gorgias clients
- [ ] Add integration tests for MCP tool calls

### 4. Observability Improvements

**Priority: Medium**

- [ ] Add request ID tracking
- [ ] Improve log context (include order numbers)
- [ ] Add metrics endpoint (request counts, latencies)
- [ ] Set up Slack alert for errors

---

## Phase 2 Tasks (AI Agent)

### 5. Agent Runtime Setup

**Priority: High (Phase 2)**

- [ ] Add Anthropic Claude SDK dependency
- [ ] Create agent configuration schema
- [ ] Define system prompt for backorder scenarios
- [ ] Implement agent executor with tool calling
- [ ] Add environment variables for agent config

### 6. Agent MCP Integration

**Priority: High (Phase 2)**

- [ ] Register existing MCP tools with agent
- [ ] Add Workflow MCP tools (`workflow.execute`, `workflow.status`)
- [ ] Create tool result formatters for agent consumption
- [ ] Add tool call logging with reasoning trace
- [ ] Test agent → MCP tool → response flow

### 7. Intelligent Decision Making

**Priority: High (Phase 2)**

- [ ] Implement customer segmentation (VIP detection)
- [ ] Add order value assessment
- [ ] Create personalized message templates
- [ ] Define escalation rules (complex orders, high value, etc.)
- [ ] Implement hybrid pattern: agent calls workflow for standard cases

### 8. Agent Observability

**Priority: Medium (Phase 2)**

- [ ] Log agent reasoning steps
- [ ] Track token usage per request
- [ ] Add decision outcome metrics
- [ ] Create debug mode for prompt inspection
- [ ] Set up alerts for agent failures

---

## Phase 3 Tasks (Workflow Conversion)

### 9. Workflow DAG Definition

**Priority: High (Phase 3)**

- [ ] Design workflow nodes: get_order → check_inventory → filter → create_ticket
- [ ] Define input schema for workflow
- [ ] Add conditional logic node for edge cases
- [ ] Test workflow execution via pacore
- [ ] Document workflow in visual builder

### 10. Workflow MCP Exposure

**Priority: High (Phase 3)**

- [ ] Register MCP server with pacore registry
- [ ] Expose `workflow.execute` for this workflow
- [ ] Implement async execution support
- [ ] Add execution status tracking
- [ ] Test agent calling `workflow.execute`

### 11. Agent-Workflow Orchestration

**Priority: High (Phase 3)**

- [ ] Update agent to use workflow for standard path
- [ ] Agent handles exceptions from workflow
- [ ] Add fallback if workflow fails
- [ ] Document hybrid execution pattern
- [ ] Performance comparison: agent-only vs hybrid

### 12. Visual Editor Integration

**Priority: Medium (Phase 3)**

- [ ] Verify workflow editable in pacore UI
- [ ] Add custom node configurations
- [ ] Test workflow changes propagate to execution
- [ ] Create workflow versioning strategy

---

## Phase 4 Tasks (Solution Packaging)

### 13. Integration Abstraction

**Priority: High (Phase 4)**

- [ ] Abstract Shopify → "Order Source" interface
- [ ] Abstract Gorgias → "Notification System" interface
- [ ] Create adapter pattern for swappable integrations
- [ ] Add WooCommerce adapter (proof of concept)
- [ ] Add Zendesk adapter (proof of concept)

### 14. Multi-Tenancy

**Priority: High (Phase 4)**

- [ ] Add customer/tenant model in pacore
- [ ] Implement per-tenant credential storage
- [ ] Add tenant isolation for workflows
- [ ] Create customer onboarding flow
- [ ] Test multiple customers running same solution

### 15. Customer Configuration UI

**Priority: High (Phase 4)**

- [ ] Create solution configuration page
- [ ] Add OAuth flows for integrations (Shopify, Gorgias, etc.)
- [ ] Implement template editor for notifications
- [ ] Add trigger configuration (webhook, scheduled, manual)
- [ ] Test end-to-end customer setup

### 16. Analytics & Billing

**Priority: Medium (Phase 4)**

- [ ] Add order processing dashboard per customer
- [ ] Implement ticket analytics
- [ ] Create agent usage reports
- [ ] Add usage-based billing metrics
- [ ] Build admin dashboard for all customers

---

## Technical Debt

### Code Quality

- [ ] Add ESLint configuration
- [ ] Add Prettier formatting
- [ ] Enable stricter TypeScript options
- [ ] Add pre-commit hooks

### Documentation

- [x] Create CLAUDE.md
- [x] Document architecture
- [x] Write ADRs
- [x] Document patterns
- [ ] Add API documentation (OpenAPI spec)
- [ ] Create runbook for operations

### Security

- [ ] Add API key rotation support
- [ ] Implement request rate limiting
- [ ] Add input sanitization audit
- [ ] Set up security scanning (Snyk/Dependabot)

### Performance

- [ ] Add Redis for caching
- [ ] Implement connection pooling
- [ ] Add response compression
- [ ] Optimize Docker image size

---

## Task Dependencies

```
Customer Integration ─────┬───► Email Templates
                          │
                          └───► End-to-End Testing
                                      │
                                      ▼
                              Phase 1 Complete
                                      │
                                      ▼
                              Agent Runtime Setup
                                      │
                                      ▼
                              Agent Tool Integration
                                      │
                                      ▼
                              Phase 2 Complete
                                      │
                                      ▼
                              Workflow Definition
                                      │
                                      ▼
                              Tool Registration
                                      │
                                      ▼
                              Phase 3 Complete
                                      │
                                      ▼
                              Multi-Tenancy
                                      │
                                      ▼
                              Phase 4 Complete
```

## Estimated Effort

| Phase | Tasks | Complexity |
|-------|-------|------------|
| Phase 1 (MVP) | 4 task groups | Low-Medium |
| Phase 2 (Agent) | 4 task groups | Medium-High |
| Phase 3 (Workflows) | 3 task groups | High |
| Phase 4 (Platform) | 3 task groups | High |
| Tech Debt | 4 task groups | Ongoing |
