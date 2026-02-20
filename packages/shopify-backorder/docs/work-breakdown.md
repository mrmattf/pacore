# Work Breakdown

## Ownership Note

**This is a customer engagement solution for Yota Xpedition.**
- Yota owns this specific solution
- This work breakdown covers Phases 1-2 only
- Phase 3 (Skill Packaging) is for PA Core platform, not this solution

---

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

### 5. Tool Chain Creation

**Priority: High (Phase 2)**

- [ ] Create `src/chains/backorder-chain.ts`
- [ ] Extract deterministic logic from handler into tool chain
- [ ] Define chain: get_order → check_inventory → filter_backorders → create_ticket
- [ ] Add chain configuration (thresholds, templates)
- [ ] Test chain execution independently

### 6. Agent Runtime Setup

**Priority: High (Phase 2)**

- [ ] Add Anthropic Claude SDK dependency
- [ ] Create agent configuration schema
- [ ] Define system prompt for backorder scenarios
- [ ] Implement agent executor that calls tool chains
- [ ] Add environment variables for agent config

### 7. Agent + Tool Chain Integration

**Priority: High (Phase 2)**

- [ ] Register tool chain as callable by agent
- [ ] Agent decides WHEN to call tool chain
- [ ] Tool chain executes HOW (deterministic)
- [ ] Add tool call logging with reasoning trace
- [ ] Test agent → tool chain → MCP tools flow

### 8. Intelligent Decision Making

**Priority: High (Phase 2)**

- [ ] Implement customer segmentation (VIP detection)
- [ ] Add order value assessment
- [ ] Create personalized message templates
- [ ] Define escalation rules (complex orders, high value, etc.)
- [ ] Agent handles edge cases, tool chain handles standard cases

### 9. Agent Observability

**Priority: Medium (Phase 2)**

- [ ] Log agent reasoning steps
- [ ] Track token usage per request
- [ ] Add decision outcome metrics
- [ ] Create debug mode for prompt inspection
- [ ] Set up alerts for agent failures

---

## Phase 3: Skill Packaging (PA Core Platform - Separate)

**Note**: These tasks apply to the PA Core platform Skill, NOT this Yota solution.

The Yota solution ends at Phase 2. A separate "Backorder Detection" Skill will be built clean-room for the PA Core platform using patterns learned from this engagement.

See [Product Strategy](../../../docs/product-strategy.md) for the Skill packaging lifecycle.

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
                              Tool Chain Creation
                                      │
                                      ▼
                              Agent Runtime Setup
                                      │
                                      ▼
                              Agent + Tool Chain Integration
                                      │
                                      ▼
                              Phase 2 Complete
                                      │
                                      ▼
                              Yota Solution Complete
                                      │
                     (PA Core Platform Skill is separate)
```

## Estimated Effort

| Phase | Tasks | Complexity | Scope |
|-------|-------|------------|-------|
| Phase 1 (MVP) | 4 task groups | Low-Medium | This solution |
| Phase 2 (Agent) | 5 task groups | Medium-High | This solution |
| Tech Debt | 4 task groups | Ongoing | This solution |
| Phase 3 (Skill) | N/A | High | PA Core platform (separate) |
