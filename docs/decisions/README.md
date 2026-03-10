# Architecture Decision Records (ADR)

This directory contains Architecture Decision Records for PA Core.

## What is an ADR?

An ADR documents a significant architectural decision made in the project, including the context, decision, and consequences.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](001-mcp-for-integrations.md) | Use MCP for external integrations | Accepted | 2024-12 |
| [002](002-dag-workflows.md) | DAG-based workflow execution | Superseded by ADR-007 | 2024-12 |
| [003](003-multi-provider-llm.md) | Multi-provider LLM support | Accepted | 2024-12 |
| [004](004-edge-cloud-hybrid.md) | Edge + Cloud hybrid architecture | Proposed | 2025-01 |
| [005](005-builder-agent.md) | Domain-Specialized Builder Agent for E-Commerce | Accepted | 2026-02 |
| [006](006-deliverable-separation.md) | Deliverable Separation — Customer Solutions vs PA Core Integrations | Accepted | 2026-02 |
| [007](007-skill-template-architecture.md) | Skill Template Architecture (Two-Layer Model) | Accepted | 2026-02 |
| [008](008-platform-reliability.md) | Platform Reliability — Retry, Deduplication, and Escalation Routing | Accepted | 2026-03 |
| [009](009-template-rendering-strategy.md) | Plain-Text Template Base with Per-Adapter Renderers | Accepted | 2026-03 |
| [010](010-durable-webhook-ingestion.md) | Durable Webhook Ingestion — Queue, DLQ, and Circuit Breakers | Proposed | 2026-03 |
| [011](011-skill-pricing-model.md) | Skill Pricing Model — Per-Operation with Static Cost Preview | Accepted | 2026-03 |
| [012](012-platform-intelligence-layer.md) | Platform Intelligence Layer — Internal AI Alongside BYOM | Accepted | 2026-03 |

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