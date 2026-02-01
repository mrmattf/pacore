# ADR-002: MCP Tool Design Pattern

## Status
Accepted

## Context

The service needs to expose functionality that can be consumed by:
1. Internal webhook handlers (immediate use)
2. AI agents via Claude tool calling (Phase 2)
3. pacore workflow engine (Phase 3/4)

We needed a consistent interface that works for all these consumers.

## Decision

Implement Model Context Protocol (MCP) style tools:

1. **Tool Definition**: Each tool has a name, description, and JSON Schema for inputs
2. **Namespaced Names**: Use `service.action` format (e.g., `shopify.get_order`)
3. **Consistent Response**: All tools return `{ success: boolean, data?: T, error?: string }`
4. **Dual Endpoints**: Expose tools via both JSON-RPC 2.0 and REST
5. **Internal Consumption**: Handler code uses `mcpServer.callTool()` internally

### Tool Structure

```typescript
interface MCPTool {
  name: string;           // e.g., "shopify.get_order"
  description: string;    // Human-readable for AI agents
  inputSchema: object;    // JSON Schema for validation
}

interface MCPResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

## Consequences

### Positive
- AI agents can discover and use tools via standard MCP protocol
- Same tools work for webhooks, manual triggers, and agent calls
- Clear contract between service and consumers
- Easy to add new tools without changing endpoint structure
- Tool descriptions help AI agents understand capabilities

### Negative
- Additional abstraction layer adds some complexity
- JSON Schema validation has runtime overhead
- Tools must be stateless (no session context)

### Future Considerations
- Tools can be registered in pacore's central MCP registry
- Agent layer can compose multiple tool calls intelligently
- Workflow engine can execute tools as workflow steps
