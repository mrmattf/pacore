# ADR-001: Use MCP for External Integrations

## Status
Accepted

## Context

PA Core needs to integrate with many external services (Gmail, GitHub, Slack, ERPs like Fulfil.io, etc.). We could:

1. **Build custom integrations** - Write specific code for each service
2. **Use existing iPaaS** - Zapier, Make, n8n APIs
3. **Use MCP (Model Context Protocol)** - Anthropic's standard for AI-tool communication

## Decision

Use MCP as the primary integration protocol for external services.

## Rationale

1. **Emerging standard** - MCP is becoming the standard for AI-to-tool communication
2. **Schema-driven** - Tools self-describe via inputSchema/outputSchema
3. **Growing ecosystem** - Composio, community servers, Fulfil.io all support MCP
4. **Reusability** - MCP servers work with Claude Desktop, other AI tools
5. **Type safety** - JSON Schema provides validation

## Consequences

### Positive
- Can leverage existing MCP servers (Composio for 100+ services)
- Schema-aware UI generation for tool parameters
- Standard protocol reduces integration complexity
- Future-proof as MCP ecosystem grows

### Negative
- MCP is still evolving, may need updates
- Not all services have MCP servers yet
- Need fallback for non-MCP integrations (web scraping, direct API)

### Neutral
- Need to build MCP client implementation
- Need MCP server registry and credential management

## Related
- `packages/cloud/src/mcp/` - MCP implementation
- `packages/web/src/components/SchemaFormBuilder.tsx` - Schema-driven UI