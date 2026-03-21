# Architecture Decision Records (ADR)

This directory contains Architecture Decision Records for Clarissi.

## What is an ADR?

An ADR documents a significant architectural decision made in the project, including the context, decision, and consequences.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](001-mcp-for-integrations.md) | Use MCP for external integrations | Accepted | 2024-12 |
| [002](002-dag-workflows.md) | DAG-based workflow execution | Superseded by ADR-007 | 2024-12 |
| [003](003-multi-provider-llm.md) | Multi-provider LLM support | Accepted | 2024-12 |
| [004](004-edge-cloud-hybrid.md) | Edge + Cloud hybrid architecture | Proposed | 2025-01 |
| [005](005-builder-agent.md) | Domain-Specialized Builder Agent for E-Commerce | Accepted — operator-only at initial release; customer BYOM deferred to Phase 5 | 2026-02 |
| [006](006-deliverable-separation.md) | Deliverable Separation — Customer Solutions vs PA Core Integrations | Accepted | 2026-02 |
| [007](007-skill-template-architecture.md) | Skill Template Architecture (Two-Layer Model) | Accepted | 2026-02 |
| [008](008-platform-reliability.md) | Platform Reliability — Retry, Deduplication, and Escalation Routing | Accepted | 2026-03 |
| [009](009-template-rendering-strategy.md) | Plain-Text Template Base with Per-Adapter Renderers | Accepted | 2026-03 |
| [010](010-durable-webhook-ingestion.md) | Durable Webhook Ingestion — Queue, DLQ, and Circuit Breakers | Proposed | 2026-03 |
| [011](011-skill-pricing-model.md) | Skill Pricing Model — Per-Operation with Static Cost Preview | Accepted | 2026-03 |
| [012](012-platform-intelligence-layer.md) | Platform Intelligence Layer — Internal AI Alongside BYOM | Accepted | 2026-03 |
| [013](013-sean-concierge-gtm.md) | Go-to-Market — SEAN Hybrid / Concierge-First Model | Accepted | 2026-03 |
| [014](014-outcome-based-pricing.md) | Outcome-Based Pricing for Concierge Engagements | Accepted | 2026-03 |
| [015](015-assessment-first-sales.md) | Assessment-First Sales Motion (Skills Diagnostic) | Accepted | 2026-03 |
| [016](016-three-tier-customer-journey.md) | Three-Tier Customer Journey — Self-Serve, Assessment, Concierge | Accepted | 2026-03 |
| [017](017-operator-skill-discovery.md) | Operator Skill Discovery — Two-Pass Assessment, Gap Aggregation, Vertical-Agnostic Tool Design | Accepted | 2026-03 |
| [018](018-operator-platform-identity-and-onboarding.md) | Operator Platform — Identity Model, Credential Intake, and Management Mode Lifecycle | Accepted | 2026-03 |
| [019](019-gorgias-webhook-source.md) | Gorgias as WebhookSourceAdapter — Enabling Gorgias-Triggered Skills | Accepted — pending implementation | 2026-03 |
| [020](020-test-webhook-detection.md) | Generic Test Webhook Detection via Adapter-Declared Header | Proposed — deferred pending ADR-010 | 2026-03 |
| [021](021-fulfilio-erp-integration.md) | Fulfil.io as ERP Data Source — MCP Enrichment + Webhook Trigger Adapter | Proposed | 2026-03 |
| [022](022-scheduled-delayed-execution.md) | Scheduled and Delayed Skill Execution — BullMQ Timer Queue | Proposed — deferred until customer selects Tier D skill | 2026-03 |
| [023](023-agent-mcp-gateway-scaling.md) | Agent MCP Gateway — Scaling, Session Architecture, and Value-Add Positioning | Proposed | 2026-03-20 |

## Template

```markdown
# ADR-XXX: Title

## Status
Proposed | Accepted | Deprecated | Superseded

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult because of this change?
```