# Architecture Decision Records (ADR)

This directory contains Architecture Decision Records for PA Core.

## What is an ADR?

An ADR documents a significant architectural decision made in the project, including the context, decision, and consequences.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](001-mcp-for-integrations.md) | Use MCP for external integrations | Accepted | 2024-12 |
| [002](002-dag-workflows.md) | DAG-based workflow execution | Accepted | 2024-12 |
| [003](003-multi-provider-llm.md) | Multi-provider LLM support | Accepted | 2024-12 |
| [004](004-edge-cloud-hybrid.md) | Edge + Cloud hybrid architecture | Proposed | 2025-01 |

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