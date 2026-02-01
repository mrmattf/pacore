# Development Session Log

Brief tracking of significant changes. Keep entries to 1-2 sentences. Delete entries older than 5 sessions.

---

## 2025-01-28
- Created WorkflowsPage for viewing/editing saved workflows. Fixed API array response handling.
- Added 2-minute timeout and status message for workflow build endpoint.
- Created documentation system: CLAUDE.md, .cursorrules, ADRs for AI continuity.
- Customer research: Yota Xpedition (Toyota aftermarket, uses Fulfil.io ERP).

## 2025-01-27
- Implemented schema-aware input mapping: SchemaFormBuilder, SchemaField, NodeOutputMapper components.
- Extended workflow-executor parameter resolution to support property paths (`$input[0].user.email`).

## 2025-01-26
- Visual workflow builder with React Flow and NodeConfigPanel.
- Workflow execution engine with DAG traversal.

## 2025-01-25
- MCP server registration and tool discovery.
- Basic workflow CRUD operations.

---

## Next Priorities
1. Test schema-aware input mapping with real MCP tools
2. Edge Agent MVP (start with Telegram)
3. Customer demo for Yota Xpedition