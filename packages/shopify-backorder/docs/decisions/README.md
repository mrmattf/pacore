# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Shopify Backorder Service.

## Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| [001](./001-standalone-package.md) | Standalone Package Structure | Accepted | 2024-01 |
| [002](./002-mcp-tool-design.md) | MCP Tool Design Pattern | Accepted | 2024-01 |
| [003](./003-authentication-strategy.md) | Authentication Strategy | Accepted | 2024-01 |
| [004](./004-docker-deployment.md) | Docker Deployment over Nixpacks | Accepted | 2024-01 |
| [005](./005-zod-configuration.md) | Zod for Configuration Validation | Accepted | 2024-01 |
| [006](./006-workflow-mcp-server.md) | Workflow MCP Server | Proposed | 2024-01 |
| [007](./007-agent-workflow-orchestration.md) | Agent-Workflow Orchestration | Proposed | 2024-01 |

## When to Create an ADR

**Create ADR for:**
- Technology choices (libraries, frameworks, services)
- Architectural patterns that affect multiple files
- Security-related decisions
- Integration approaches with external systems
- Decisions that were non-obvious or involved tradeoffs

**Skip ADR for:**
- Bug fixes
- Minor refactoring
- Implementation details within a single file
- Following established patterns (just reference existing ADR)

**Never modify existing ADRs** - if a decision changes, create a new ADR that supersedes the old one.

## ADR Template

When creating a new ADR, use this template:

```markdown
# ADR-XXX: Title

## Status
Proposed | Accepted | Deprecated | Superseded by ADR-XXX

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult to do because of this change?
```
