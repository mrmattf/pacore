# MCP Server Management, Workflow Creation & Dashboard Implementation Plan

## Executive Summary

Build a comprehensive UI and backend enhancement to enable end-users to:
1. Create, deploy, and manage MCP servers
2. Create workflows from conversations with MCP tool integration
3. Visualize and execute workflows in a dashboard

## Critical Architecture Decision: MCP Server Placement

### Analysis

**Current State:**
- MCP servers are registered per-user in `mcp_servers` table
- MCPRegistry and MCPClient exist in the cloud service
- Workflows use `mcp_fetch` nodes that reference MCP servers
- Current design: MCP servers are external data sources, not LLM providers

**Option 1: MCP Servers as Orchestration Tools (RECOMMENDED)**
- MCP servers remain in the orchestration layer
- Individual MCP tools become workflow node types
- Workflow DAG references specific tools by `serverId.toolName`
- Benefits:
  - Each tool is a discrete, reusable workflow step
  - Clear separation: LLMs for intelligence, MCP tools for data/actions
  - Enables fine-grained workflow control
  - Matches MCP protocol design (servers expose multiple tools)
  - Users can mix-and-match tools from different servers

**Option 2: MCP Servers as Agent Providers**
- Register MCP servers like Claude/OpenAI in LLMProviderRegistry
- Treat MCP responses as LLM completions
- Benefits:
  - Simpler mental model (everything is a "provider")
  - Could route certain queries to MCP servers
- Drawbacks:
  - Conflates data sources with intelligence providers
  - MCP tools aren't conversational - they're discrete operations
  - Loses granularity (server vs individual tools)
  - Doesn't align with MCP protocol design

### DECISION: Option 1 - MCP Tools as Orchestration Steps

**Rationale:**
1. MCP servers expose **tools**, not conversational AI
2. Workflows need **granular control** over which tool to call
3. A single MCP server may have 10+ tools - each should be a separate workflow node
4. Matches the existing `mcp_fetch` node design
5. Enables composition: fetch from Server A → transform with LLM → save to Server B

**Implementation:**
- MCP servers remain in orchestration layer (no LLM registry changes)
- New workflow node type: `mcp_tool` (replaces `mcp_fetch`)
- Node config: `{ serverId: "server-123", toolName: "search_cases", inputs: {...} }`
- WorkflowBuilder generates these nodes when building from conversation

## Credential Management System

### Secure Credential Storage

**Backend Implementation:**
```typescript
// packages/cloud/src/mcp/credential-manager.ts
interface MCPCredentials {
  serverId: string;
  userId: string;
  credentials: {
    apiKey?: string;
    username?: string;
    password?: string;
    customHeaders?: Record<string, string>;
  };
}

class CredentialManager {
  async storeCredentials(userId: string, serverId: string, creds: any): Promise<void> {
    // 1. Encrypt credentials using AES-256
    const encrypted = await this.encrypt(JSON.stringify(creds));
    // 2. Store in database with user_id + server_id as key
    await this.db.query(
      'INSERT INTO mcp_credentials (user_id, server_id, encrypted_data) VALUES ($1, $2, $3)',
      [userId, serverId, encrypted]
    );
  }

  async getCredentials(userId: string, serverId: string): Promise<any> {
    const result = await this.db.query(
      'SELECT encrypted_data FROM mcp_credentials WHERE user_id = $1 AND server_id = $2',
      [userId, serverId]
    );
    return JSON.parse(await this.decrypt(result.rows[0].encrypted_data));
  }
}
```

**Database Schema:**
```sql
CREATE TABLE mcp_credentials (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  server_id VARCHAR(255) NOT NULL,
  encrypted_data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, server_id)
);

CREATE INDEX idx_mcp_creds_user_server ON mcp_credentials(user_id, server_id);
```

**Credential Injection at Runtime:**
```typescript
// When executing workflow with mcp_tool node
async executeMCPToolNode(node: MCPToolNode, context: ExecutionContext) {
  const server = await this.mcpRegistry.getServer(node.config.serverId);
  const credentials = await this.credentialManager.getCredentials(
    context.userId,
    server.id
  );

  // Inject credentials into request
  const result = await this.mcpClient.callTool(
    server,
    node.config.toolName,
    node.config.inputs,
    credentials  // Automatically added to headers/auth
  );
  return result;
}
```

**Frontend UI:**
```
When adding MCP server:
1. User enters endpoint URL
2. Form shows "Connection Settings" section
3. Fields: API Key, Username/Password, Custom Headers
4. "Test Connection" button validates with credentials
5. On save: Credentials encrypted and stored, never shown again
6. Server card shows "✓ Authenticated" badge
```

## Phase 1: MCP Server Management UI

### 1.1 MCP Server Registration (Cloud Servers Only)

**User Journey:**
1. User clicks "Add MCP Server" in UI
2. Fills out form:
   - Server Name (e.g., "Legal Database API")
   - Endpoint URL (e.g., "https://api.legal-db.com/mcp")
   - Category (optional): work, legal, personal, etc.
   - Credentials (optional but recommended):
     - API Key field
     - Username/Password fields
     - Custom Headers (JSON)
3. Clicks "Test Connection" to validate
4. On success, saves server + encrypted credentials

**Backend Components:**

**NEW: CredentialManager**
(See "Credential Management System" section above)

**UPDATED: MCPClient**
```typescript
// packages/cloud/src/mcp/mcp-client.ts
async callTool(
  server: MCPServer,
  toolName: string,
  inputs: any,
  credentials?: MCPCredentials  // NEW parameter
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Inject credentials
  if (credentials?.apiKey) {
    headers['Authorization'] = `Bearer ${credentials.apiKey}`;
  }
  if (credentials?.customHeaders) {
    Object.assign(headers, credentials.customHeaders);
  }

  const response = await fetch(`${server.connectionConfig.url}/tools/call`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool: toolName, input: inputs })
  });

  return await response.json();
}
```

**Frontend Components:**

```
packages/web/src/pages/MCPServersPage.tsx
  - List of user's MCP servers in grid
  - "Add Server" button → modal
  - Server cards showing:
    - Server name, category
    - ✓ Authenticated badge (if credentials stored)
    - Tool count
    - Last connected timestamp
  - Actions: View Tools, Edit, Delete

packages/web/src/components/MCPServerModal.tsx
  - Form fields:
    - Server Name (required)
    - Endpoint URL (required)
    - Category (optional dropdown)
    - Credentials section (collapsible):
      - API Key field
      - Username field
      - Password field (masked)
      - Custom Headers (JSON editor)
  - "Test Connection" button
  - Save button (disabled until test passes)

packages/web/src/components/MCPServerTools.tsx
  - Modal/page showing all tools from a server
  - Tool list with: name, description, input schema
  - "Use in Workflow" button (future)

packages/web/src/hooks/useMCPServers.ts
  - fetchServers(): Get user's servers
  - registerServer(data): Register new server + credentials
  - testConnection(serverId): Validate connection
  - deleteServer(serverId): Remove server + credentials
  - fetchServerTools(serverId): Get available tools
```

## Phase 2: Workflow Creation from Conversations

### 2.1 Enhanced Workflow Builder with MCP Tools

**Current State:**
- WorkflowBuilder exists, generates DAGs from natural language
- Uses LLM to analyze intent and build workflow
- Knows about MCP servers via MCPRegistry

**Enhancement: MCP Tool Discovery**

**UPDATED: WorkflowBuilder**
```typescript
// packages/cloud/src/workflow/workflow-builder.ts
class WorkflowBuilder {
  private async buildToolCatalog(userId: string, category?: string): Promise<ToolCatalog> {
    const servers = await this.mcpRegistry.listUserServers(userId, { category });

    const tools = [];
    for (const server of servers) {
      const capabilities = await this.mcpClient.getCapabilities(server.id);
      for (const tool of capabilities.tools) {
        tools.push({
          id: `${server.id}.${tool.name}`,
          serverId: server.id,
          serverName: server.name,
          toolName: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          category: server.category
        });
      }
    }
    return tools;
  }

  async buildWorkflowFromConversation(
    userId: string,
    message: string,
    category: string
  ): Promise<Workflow> {
    // 1. Get tools available for this category
    const tools = await this.buildToolCatalog(userId, category);

    // 2. Build prompt with tool catalog
    const prompt = `
You are a workflow builder. The user wants to automate a task.

User's request: "${message}"

Available MCP tools:
${tools.map(t => `- ${t.id}: ${t.description}`).join('\n')}

Build a DAG workflow using these node types:
- mcp_tool: Call an MCP tool { serverId, toolName, inputs }
- transform: AI transformation { prompt, model }
- filter: Filter data { condition }
- action: Save/notify { type, config }

Return JSON workflow DAG.
`;

    const response = await this.llm.complete([
      { role: 'system', content: prompt }
    ]);

    return this.parseWorkflowDAG(response);
  }
}
```

**NEW: Workflow Node Type `mcp_tool`**
```typescript
// packages/cloud/src/workflow/types.ts
interface MCPToolNode extends WorkflowNode {
  type: 'mcp_tool';
  config: {
    serverId: string;
    toolName: string;
    inputs: Record<string, any>; // Can reference previous node outputs
  };
}
```

**UPDATED: WorkflowExecutor**
```typescript
// packages/cloud/src/workflow/workflow-executor.ts
class WorkflowExecutor {
  private async executeMCPToolNode(
    node: MCPToolNode,
    context: ExecutionContext
  ): Promise<any> {
    const server = await this.mcpRegistry.getServer(node.config.serverId);
    const result = await this.mcpClient.callTool(
      server,
      node.config.toolName,
      this.resolveInputs(node.config.inputs, context)
    );
    return result;
  }
}
```

### 2.2 Conversation-to-Workflow UI Flow

**User Journey:**
1. User has conversation in ChatPage
2. System detects workflow intent (already implemented)
3. Banner appears: "This looks like a workflow! Create automation?"
4. User clicks "Create Workflow"
5. WorkflowBuilder analyzes conversation + available MCP tools
6. Shows visual workflow preview
7. User can edit/refine before saving

**Frontend Components:**

```
packages/web/src/components/WorkflowIntentBanner.tsx
  - Appears when workflowIntent detected in response
  - "Create Workflow" button
  - Shows detected intent description

packages/web/src/components/WorkflowPreviewModal.tsx
  - Visual DAG representation
  - Each node shows: type, description, inputs
  - Edit button → opens workflow builder
  - Save & Execute button

packages/web/src/hooks/useWorkflowBuilder.ts
  - buildFromConversation(message, category)
  - Returns workflow DAG
```

## Phase 3: Workflow Dashboard

### 3.1 Workflows Page

**Features:**
- List all workflows (filterable by category)
- Execute workflow with one click
- View execution history
- Edit/delete workflows
- Visual DAG viewer

**Frontend Components:**

```
packages/web/src/pages/WorkflowsPage.tsx
  - Grid of workflow cards
  - Filter by category
  - "Create Workflow" button

packages/web/src/components/WorkflowCard.tsx
  - Workflow name, description, category
  - Last executed timestamp
  - Execute button
  - View/Edit/Delete actions

packages/web/src/components/WorkflowDAGViewer.tsx
  - Visual representation using react-flow or dagre
  - Node types color-coded
  - Click node to see details

packages/web/src/components/WorkflowExecutionHistory.tsx
  - List of past executions
  - Status (success/failed), duration
  - View logs/results

packages/web/src/hooks/useWorkflows.ts
  - Fetch workflows
  - Execute workflow
  - Get execution history
```

### 3.2 Workflow Editor (Future Enhancement)

Visual drag-and-drop builder (Phase 4, not now):
- Drag MCP tools from palette
- Connect nodes to build DAG
- Configure node parameters
- Validate before save

## Implementation Phases

### Phase 1: MCP Server Management (Week 1-2)
1. **Day 1-2**: MCPDeployer service (serverless deployment)
2. **Day 3-4**: MCP Server UI (list, add cloud server, test)
3. **Day 5-7**: Code editor with templates
4. **Day 8-10**: Deploy custom servers, logs viewer

### Phase 2: Workflow Creation (Week 3)
1. **Day 1-2**: Update WorkflowBuilder with tool catalog
2. **Day 3-4**: WorkflowIntentBanner component
3. **Day 5-7**: Workflow preview and refinement UI

### Phase 3: Workflow Dashboard (Week 4)
1. **Day 1-3**: WorkflowsPage with list/execute
2. **Day 4-5**: Workflow DAG viewer
3. **Day 6-7**: Execution history and logs

## Database Schema Changes

```sql
-- Add deployment fields to mcp_servers
ALTER TABLE mcp_servers
  ADD COLUMN deployment_type VARCHAR(50),  -- 'cloud' | 'serverless' | 'container'
  ADD COLUMN deployment_id VARCHAR(255),   -- AWS Lambda ARN, Cloud Run URL, etc.
  ADD COLUMN deployed_at TIMESTAMP,
  ADD COLUMN code TEXT;                    -- Store source code

-- Tool invocation logs
CREATE TABLE mcp_tool_invocations (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  server_id VARCHAR(255) NOT NULL,
  tool_name VARCHAR(255) NOT NULL,
  inputs JSONB NOT NULL,
  result JSONB,
  error TEXT,
  duration_ms INT,
  invoked_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tool_invocations_user ON mcp_tool_invocations(user_id);
CREATE INDEX idx_tool_invocations_server ON mcp_tool_invocations(server_id);
```

## API Endpoints Summary

### MCP Management
```
GET    /v1/mcp/servers           - List servers (existing)
POST   /v1/mcp/servers           - Register server (existing)
GET    /v1/mcp/servers/:id       - Get server (existing)
DELETE /v1/mcp/servers/:id       - Delete server (existing)

POST   /v1/mcp/deploy            - Deploy custom MCP server (NEW)
PUT    /v1/mcp/:id/deploy        - Update deployment (NEW)
DELETE /v1/mcp/:id/deployment    - Delete deployment (NEW)
GET    /v1/mcp/:id/deployment/logs - Get logs (NEW)
GET    /v1/mcp/:id/tools         - List tools from server (NEW)
```

### Workflow Building
```
POST   /v1/workflows/build-from-conversation  - Build from chat (NEW)
GET    /v1/workflows/:id/preview             - Visual preview data (NEW)
```

### Workflow Management
```
GET    /v1/workflows             - List workflows (existing)
POST   /v1/workflows             - Create workflow (existing)
GET    /v1/workflows/:id         - Get workflow (existing)
PUT    /v1/workflows/:id         - Update workflow (existing)
DELETE /v1/workflows/:id         - Delete workflow (existing)
POST   /v1/workflows/:id/execute - Execute workflow (existing)
GET    /v1/workflows/:id/executions - Execution history (existing)
```

## Technical Decisions

### MCP Deployment Strategy

**Option A: AWS Lambda** (Recommended for MVP)
- Pros: Serverless, auto-scaling, pay-per-use
- Cons: Cold starts, 15min timeout
- Use: Deploy user's MCP server code as Lambda function

**Option B: Docker on Cloud Run**
- Pros: No timeout, custom runtime, WebSocket support
- Cons: More expensive, needs container registry
- Use: For long-running or WebSocket MCP servers

**Option C: Kubernetes**
- Pros: Full control, persistent connections
- Cons: Complex, expensive, overkill for MVP
- Use: Later when scale demands it

**DECISION: Start with AWS Lambda, add Cloud Run for WebSocket later**

### Code Editor

**Use Monaco Editor:**
- Same editor as VS Code
- Syntax highlighting for JS/Python
- IntelliSense for MCP protocol types
- Integrated validation

### Workflow Visualization

**Use React Flow:**
- Lightweight DAG renderer
- Interactive (zoom, pan, select)
- Customizable node styling
- Good for read-only view now, editable later

## Security Considerations

1. **Code Execution Sandbox**: User-deployed MCP servers run in isolated Lambda/container
2. **Resource Limits**: CPU/memory/timeout limits on deployed servers
3. **Code Validation**: Check for malicious patterns before deployment
4. **Network Isolation**: Deployed servers can only access declared endpoints
5. **Secrets Management**: Store API keys in AWS Secrets Manager, inject at runtime

## Success Metrics

- Number of MCP servers deployed per user
- Workflows created from conversations vs manually
- MCP tool invocations per day
- Workflow execution success rate
- Time from conversation to working automation

## Files to Create/Modify

### Backend (Cloud Package)
- **NEW**: `packages/cloud/src/mcp/mcp-deployer.ts`
- **NEW**: `packages/cloud/src/mcp/code-validator.ts`
- **MODIFY**: `packages/cloud/src/workflow/workflow-builder.ts`
- **MODIFY**: `packages/cloud/src/workflow/workflow-executor.ts`
- **MODIFY**: `packages/cloud/src/workflow/types.ts`
- **NEW**: `packages/cloud/src/api/mcp-deployment-routes.ts`

### Frontend (Web Package)
- **NEW**: `packages/web/src/pages/MCPServersPage.tsx`
- **NEW**: `packages/web/src/pages/WorkflowsPage.tsx`
- **NEW**: `packages/web/src/components/MCPServerModal.tsx`
- **NEW**: `packages/web/src/components/MCPCodeEditor.tsx`
- **NEW**: `packages/web/src/components/WorkflowIntentBanner.tsx`
- **NEW**: `packages/web/src/components/WorkflowDAGViewer.tsx`
- **NEW**: `packages/web/src/components/WorkflowCard.tsx`
- **NEW**: `packages/web/src/hooks/useMCPServers.ts`
- **NEW**: `packages/web/src/hooks/useWorkflows.ts`
- **MODIFY**: `packages/web/src/pages/ChatPage.tsx` (add WorkflowIntentBanner)
- **MODIFY**: `packages/web/src/App.tsx` (add routes)

## Decisions Made

1. **MCP Deployment Strategy**: Skip Lambda deployment for MVP
   - **Reason**: Lambda adds complexity (AWS credentials, deployment pipeline, cold starts)
   - **MVP Approach**: Cloud Server registration only - users provide their own MCP endpoint URLs
   - **Future**: Add Lambda/Cloud Run deployment in Phase 2 when demand is proven

2. **Workflow Editing**: Read-only for MVP
   - Workflows cannot be edited after creation
   - User can delete and recreate if changes needed
   - Future: Add visual editor for workflow modification

3. **Execution & Credentials**: Auto-execute with secure credential management
   - Workflows execute immediately when triggered
   - **Credential Storage**: Encrypted per-user credentials for MCP servers
   - **Connection String Pattern**: Store credentials separately, inject at runtime
   - Example: Store `apiKey` for MCP server, automatically include in requests
   - User experience: "One-time credential setup, then workflows just work"

4. **Category Management**:
   - Categories are optional for MCP servers
   - **Future Enhancement**: Multi-category filtering for cross-domain workflows
   - Example: Workflow uses MCP servers from both "work" AND "legal" categories
   - Implementation: `categories: string[]` instead of `category: string`

## Why Skip Lambda for MVP?

**Lambda Deployment Complexity:**
- Requires AWS account setup
- IAM role configuration
- Deployment pipeline (package → upload → configure)
- Cold start latency (first invocation delay)
- Monitoring/logging infrastructure
- Cost estimation complexity

**Cloud Server Registration Benefits:**
- Users already have existing APIs/services
- No deployment infrastructure needed
- Faster time-to-value
- Standard HTTP protocol (already implemented)
- Clear separation of concerns: PA Core orchestrates, users deploy

**MVP to Production Path:**
1. **MVP**: Cloud Server registration (users bring their own endpoints)
2. **Phase 2**: Add deployment service when users ask "Can you deploy this for me?"
3. **Phase 3**: Marketplace of pre-built MCP servers users can deploy with one click
