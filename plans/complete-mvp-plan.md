# PA Core - Complete MVP Implementation Plan

## Executive Summary

This document outlines the complete MVP implementation plan for PA Core - a hybrid cloud-native AI orchestration platform. The MVP integrates seven core pillars to deliver a comprehensive AI automation platform.

## MVP Core Pillars

```
┌────────────────────────────────────────────────────────────────┐
│                      PA Core MVP                                │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Multi-LLM Provider Support (Cloud + On-Premise)           │
│  2. Persistent Conversation Memory (Vector + SQL)             │
│  3. Self-Learning Category System (AI-Driven)                 │
│  4. MCP Server Management (External Tools)                     │
│  5. AI Workflow Automation (Natural Language → DAG)           │
│  6. On-Premise Agent System (Behind Firewalls)                │
│  7. Web UI Dashboard (Unified Control Center)                 │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                            │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────────┐  │
│  │  Chat    │   MCP    │ Workflow │ Settings │ Conversations│  │
│  │  Page    │ Servers  │Dashboard │   Page   │   History    │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                      Cloud Service Layer                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    API Gateway                            │  │
│  │  /v1/complete  /v1/mcp/*  /v1/workflows/*  /v1/agents/*  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Orchestrator                            │  │
│  │  • Routing Logic      • Context Injection                │  │
│  │  • Auto-Classification • Workflow Detection              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                   │
│  ┌────────┬────────┬──────────┬──────────┬────────────────┐   │
│  │Provider│ Memory │Classifier│ Workflow │  MCP Registry  │   │
│  │Registry│Manager │  (AI)    │  Engine  │   + Client     │   │
│  └────────┴────────┴──────────┴──────────┴────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         ↓                    ↓                    ↓
┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
│   Cloud LLMs │   │ PostgreSQL       │   │  External MCP    │
│  • Anthropic │   │ • Conversations  │   │    Servers       │
│  • OpenAI    │   │ • Categories     │   │  • Legal DB      │
│  • Custom    │   │ • Workflows      │   │  • Weather API   │
└──────────────┘   │ • MCP Servers    │   │  • Email         │
                    │                  │   └──────────────────┘
                    │ pgvector         │
                    │ • Embeddings     │
                    └──────────────────┘

         WebSocket Connection
                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                  On-Premise Agent (Optional)                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Agent Process                                            │  │
│  │  • WebSocket Client  • Local LLM Integration             │  │
│  │  • Capabilities      • Auto-Reconnection                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↓                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Local LLM Providers                                    │    │
│  │  • Ollama (Llama2, Mistral, CodeLlama)                 │    │
│  │  • LM Studio (Future)                                   │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Pillar 1: Multi-LLM Provider Support

### Current State
✅ **Implemented Backend:**
- LLMProvider interface (`@pacore/core`)
- LLMProviderRegistry with per-user configurations
- Adapters: AnthropicProvider, OpenAIProvider, CustomEndpointProvider, OllamaProvider
- Encrypted API key storage (PostgreSQL)
- Provider configuration API endpoints
- Streaming support for all providers

❌ **Missing Frontend:**
- Provider selection UI
- Provider configuration form
- API key management interface

### Implementation Tasks

#### Backend (Already Complete)
- ✅ Provider registry
- ✅ Configuration storage
- ✅ Health checks
- ✅ Streaming support

#### Frontend (To Build)

**1. ProviderSelector Component** ✅ (Already Exists)
```
Location: packages/web/src/components/ProviderSelector.tsx
Status: Already implemented in ChatPage header
Features:
  - Dropdown showing available providers
  - Selected provider stored in Zustand
  - Integrated into chat interface
```

**2. Settings Page → Provider Management Tab** ⏳
```
Location: packages/web/src/pages/SettingsPage.tsx
Features:
  - List configured providers
  - Add/edit provider credentials
  - Test connection button
  - Delete provider configuration
  - Set default provider

Components:
  - ProviderConfigModal.tsx (form for API keys)
  - ProviderCard.tsx (display provider status)
  - hooks/useProviders.ts (API integration)
```

**API Endpoints** (Already Exist):
```
POST   /v1/providers/:id/configure
GET    /v1/providers
DELETE /v1/providers/:id/config
POST   /v1/providers/:id/test
```

### MVP Scope
- Support 4 providers: Anthropic, OpenAI, Custom Endpoint, Ollama
- Provider selection in chat UI
- Simple API key configuration in settings
- Default provider preference
- Connection testing

---

## Pillar 2: Persistent Conversation Memory

### Current State
✅ **Implemented Backend:**
- VectorMemoryStore (pgvector + Pinecone support)
- MemoryManager with dual storage (PostgreSQL + vectors)
- Semantic search with relevance scoring
- Context retrieval for conversations
- Conversation CRUD operations
- Auto-save conversations with metadata

❌ **Missing Frontend:**
- Conversation history viewer
- Search interface
- Conversation management (view, delete, export)

### Implementation Tasks

#### Backend (Already Complete)
- ✅ Vector embeddings storage
- ✅ Semantic search
- ✅ Conversation lifecycle management
- ✅ Context injection into prompts

#### Frontend (To Build)

**1. ConversationsPage** ⏳
```
Location: packages/web/src/pages/ConversationsPage.tsx
Features:
  - List all conversations (paginated)
  - Filter by date, category, provider
  - Search conversations (semantic)
  - View conversation details
  - Delete conversations
  - Export conversation

Components:
  - ConversationList.tsx (grid/list view)
  - ConversationCard.tsx (preview)
  - ConversationDetailModal.tsx (full view)
  - ConversationSearchBar.tsx (semantic search)
  - hooks/useConversations.ts
```

**2. Enhanced ChatPage Context Display** ⏳
```
Feature: Show "Context Used" section
Location: packages/web/src/components/ChatBox.tsx
Display:
  - Number of relevant past conversations retrieved
  - Expandable view of context snippets
  - Link to source conversation
```

**API Endpoints** (Already Exist):
```
GET    /v1/conversations
GET    /v1/conversations/:id
DELETE /v1/conversations/:id
POST   /v1/memory/search
```

### MVP Scope
- View conversation history
- Basic search (text + semantic)
- Delete conversations
- See which context was used in current chat
- Filter by category

---

## Pillar 3: Self-Learning Category System

### Current State
✅ **Implemented Backend:**
- ConversationClassifier service (AI-powered)
- Dynamic category management (user-defined)
- Category CRUD API
- Auto-classification with confidence scoring
- Category suggestion when no match found
- Accept/reject category suggestions

✅ **Implemented Frontend:**
- CategorySelector with dynamic categories
- CategorySuggestionBanner (accept/dismiss)
- useCategories hook with API integration
- Category stored in Zustand (persisted)
- Default categories fallback

⚠️ **Known Issues:**
- Category dropdown doesn't auto-refresh after accepting suggestion (deprioritized)

### Implementation Tasks

#### Backend (Already Complete)
- ✅ AI-driven classification
- ✅ Tag generation
- ✅ Title generation
- ✅ Category matching
- ✅ Suggestion system
- ✅ User category CRUD

#### Frontend (Already Complete)
- ✅ Category selector
- ✅ Suggestion banner
- ✅ Add custom categories
- ✅ API integration

#### Enhancements (Future)
⏳ **Category Management Page:**
```
Location: packages/web/src/pages/CategoriesPage.tsx
Features:
  - View all categories with conversation counts
  - Rename categories
  - Merge categories
  - Delete categories (with reassignment)
  - Category statistics (most used, recent)
```

### MVP Scope
- ✅ Dynamic user-defined categories
- ✅ AI-powered suggestions
- ✅ Accept/reject workflow
- ✅ Auto-classification
- 7 default categories as fallback
- Category-based filtering (in conversations page)

---

## Pillar 4: MCP Server Management

### Current State
✅ **Implemented Backend:**
- MCPRegistry service
- MCPClient (HTTP protocol)
- MCP server CRUD operations
- Capability discovery
- Server testing endpoint
- Category-based organization

❌ **Missing:**
- Credential encryption (designed but not implemented)
- Frontend UI for MCP management
- WebSocket/stdio protocol support

### Implementation Tasks

#### Backend

**1. Credential Management Service** ⏳
```
Location: packages/cloud/src/mcp/credential-manager.ts

class CredentialManager {
  async storeCredentials(userId, serverId, credentials): Promise<void>
  async getCredentials(userId, serverId): Promise<any>
  async deleteCredentials(userId, serverId): Promise<void>
  async updateCredentials(userId, serverId, credentials): Promise<void>

  private encrypt(data: string): Promise<string>  // AES-256
  private decrypt(data: string): Promise<string>
}

Database:
  CREATE TABLE mcp_credentials (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    server_id VARCHAR(255) NOT NULL,
    encrypted_data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, server_id)
  );
```

**2. Enhanced MCPClient with Credentials** ⏳
```
Location: packages/cloud/src/mcp/mcp-client.ts

async callTool(
  server: MCPServer,
  toolName: string,
  inputs: any,
  credentials?: MCPCredentials  // NEW
): Promise<any> {
  // Inject credentials into headers
  const headers = {
    'Content-Type': 'application/json',
    ...(credentials?.apiKey && {
      'Authorization': `Bearer ${credentials.apiKey}`
    }),
    ...(credentials?.customHeaders || {})
  };

  // Make request with credentials
}
```

**3. New API Endpoints** ⏳
```
POST   /v1/mcp/servers/:id/credentials    - Store credentials
GET    /v1/mcp/servers/:id/tools          - List tools
POST   /v1/mcp/servers/:id/test           - Test with credentials (exists)
```

#### Frontend

**1. MCPServersPage** ⏳
```
Location: packages/web/src/pages/MCPServersPage.tsx

Features:
  - Grid of registered MCP servers
  - Server cards showing:
    • Server name, endpoint URL
    • Category badge
    • ✓ Authenticated badge (if credentials stored)
    • Tool count
    • Last connected timestamp
  - "Add Server" button → modal
  - Actions: View Tools, Edit, Delete, Test Connection

Components:
  - MCPServerCard.tsx
  - MCPServerModal.tsx (registration form)
  - MCPServerTools.tsx (tool list viewer)
  - hooks/useMCPServers.ts
```

**2. MCPServerModal** ⏳
```
Location: packages/web/src/components/MCPServerModal.tsx

Form Fields:
  - Server Name (required)
  - Endpoint URL (required)
  - Category (optional dropdown - uses existing categories)
  - Credentials (collapsible section):
    • API Key field
    • Username field
    • Password field (masked)
    • Custom Headers (JSON editor or key-value pairs)
  - "Test Connection" button (validates before save)
  - Save button (disabled until test passes)
```

**API Integration:**
```
POST /v1/mcp/servers
{
  name: "Legal Database API",
  serverType: "cloud",
  protocol: "http",
  connectionConfig: {
    url: "https://api.legal-db.com/mcp"
  },
  category: "legal"
}

Then:
POST /v1/mcp/servers/:id/credentials
{
  apiKey: "...",
  customHeaders: { "X-Custom": "value" }
}
```

### MVP Scope
- Cloud server registration only (users provide URLs)
- HTTP protocol only
- Credential encryption with AES-256
- Test connection before save
- View available tools per server
- Category-based organization
- No deployment service (users deploy their own MCP servers)

---

## Pillar 5: AI Workflow Automation

### Current State
✅ **Implemented Backend:**
- WorkflowManager (CRUD, validation)
- WorkflowExecutor (DAG execution)
- WorkflowBuilder (AI-driven generation)
- Node types: mcp_fetch, transform, filter, merge, action, conditional
- Execution history tracking
- Intent detection from conversations
- Workflow refinement

❌ **Missing:**
- Frontend UI for workflows
- MCP tool integration in workflows
- Credential injection during execution
- `mcp_tool` node type (replaces `mcp_fetch`)

### Implementation Tasks

#### Backend

**1. New Node Type: `mcp_tool`** ⏳
```
Location: packages/cloud/src/workflow/types.ts

interface MCPToolNode extends WorkflowNode {
  type: 'mcp_tool';
  config: {
    serverId: string;        // Reference to MCP server
    toolName: string;        // Specific tool to call
    inputs: Record<string, any>;  // Can reference previous node outputs
  };
}

Example:
{
  id: "fetch_legal_cases",
  type: "mcp_tool",
  description: "Fetch recent legal cases",
  config: {
    serverId: "legal-db-server-123",
    toolName: "search_cases",
    inputs: {
      query: "copyright disputes",
      limit: 10,
      dateFrom: "{{nodes.get_date_range.output.startDate}}"
    }
  },
  inputs: ["get_date_range"]  // Depends on previous node
}
```

**2. Enhanced WorkflowExecutor** ⏳
```
Location: packages/cloud/src/workflow/workflow-executor.ts

private async executeMCPToolNode(
  node: MCPToolNode,
  context: ExecutionContext
): Promise<any> {
  // 1. Get MCP server
  const server = await this.mcpRegistry.getServer(node.config.serverId);

  // 2. Get encrypted credentials
  const credentials = await this.credentialManager.getCredentials(
    context.userId,
    server.id
  );

  // 3. Resolve inputs (replace {{node.id.output.field}} references)
  const resolvedInputs = this.resolveInputs(node.config.inputs, context);

  // 4. Call MCP tool with credentials
  const result = await this.mcpClient.callTool(
    server,
    node.config.toolName,
    resolvedInputs,
    credentials  // Automatically injected
  );

  return result;
}
```

**3. Enhanced WorkflowBuilder with MCP Tools** ⏳
```
Location: packages/cloud/src/workflow/workflow-builder.ts

async buildWorkflowFromConversation(
  userId: string,
  message: string,
  category?: string
): Promise<Workflow> {
  // 1. Get available MCP tools for this category
  const servers = await this.mcpRegistry.listUserServers(userId, { category });

  const toolCatalog = [];
  for (const server of servers) {
    const capabilities = await this.mcpClient.getCapabilities(server.id);
    for (const tool of capabilities.tools) {
      toolCatalog.push({
        id: `${server.id}.${tool.name}`,
        serverId: server.id,
        serverName: server.name,
        toolName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      });
    }
  }

  // 2. Build prompt for LLM with tool catalog
  const prompt = `
You are a workflow builder. Build a DAG workflow for this request:
"${message}"

Available MCP tools:
${toolCatalog.map(t => `- ${t.id}: ${t.description}`).join('\n')}

Available node types:
- mcp_tool: { serverId, toolName, inputs }
- transform: { prompt, model }
- filter: { condition }
- merge: { strategy }
- action: { type: 'save' | 'notify' | 'email', config }

Return JSON workflow DAG.
`;

  const response = await this.llm.complete([
    { role: 'system', content: prompt }
  ]);

  return this.parseWorkflowDAG(response);
}
```

**4. Workflow Intent Detection** ✅ (Already Exists)
```
Integration in Orchestrator:
- Detects workflow opportunities during conversation
- Returns workflowIntent in response
- Frontend can trigger workflow creation
```

#### Frontend

**1. WorkflowIntentBanner** ⏳
```
Location: packages/web/src/components/WorkflowIntentBanner.tsx

Displays when workflowIntent.detected === true

Banner shows:
  - "This looks like a workflow! Would you like to automate it?"
  - Intent description
  - Confidence score
  - "Create Workflow" button
  - "Dismiss" button

On "Create Workflow":
  - Call POST /v1/workflows/build
  - Show WorkflowPreviewModal
```

**2. WorkflowsPage** ⏳
```
Location: packages/web/src/pages/WorkflowsPage.tsx

Features:
  - List all workflows (grid view)
  - Filter by category
  - Search workflows
  - Sort by: created, last executed
  - Workflow cards showing:
    • Name, description
    • Category badge
    • Node count
    • Last execution (timestamp + status)
  - Actions: Execute, View, Delete
  - "Create Workflow" button (manual creation - future)

Components:
  - WorkflowCard.tsx
  - WorkflowExecutionModal.tsx (show execution progress)
  - hooks/useWorkflows.ts
```

**3. WorkflowDAGViewer** ⏳
```
Location: packages/web/src/components/WorkflowDAGViewer.tsx

Visual DAG representation:
  - Use react-flow or dagre-d3
  - Nodes color-coded by type:
    • mcp_tool: Blue
    • transform: Purple
    • filter: Orange
    • action: Green
  - Click node to see details
  - Execution path highlighted
  - Read-only for MVP

Node details panel:
  - Node type
  - Description
  - Configuration
  - Inputs/outputs
```

**4. WorkflowExecutionHistory** ⏳
```
Location: packages/web/src/components/WorkflowExecutionHistory.tsx

Shows execution history for a workflow:
  - List of past executions
  - Status: success, failed, partial
  - Duration
  - Timestamp
  - Result preview
  - View logs button → modal with step-by-step logs
```

### MVP Scope
- AI-driven workflow generation from conversation
- MCP tool integration as workflow nodes
- Visual DAG viewer (read-only)
- Execute workflows on-demand
- View execution history
- No manual workflow editing (delete + recreate)
- Auto-execute when user requests

---

## Pillar 6: On-Premise Agent System

### Current State
✅ **Implemented:**
- Agent package with WebSocket client
- Agent CLI (init, start, status)
- Ollama provider integration
- Auto-reconnection logic
- Capabilities advertisement
- Message protocol defined
- Health check support

❌ **Missing:**
- Cloud-side agent connection handling
- Agent request routing in orchestrator
- Agent management UI
- Agent status monitoring

### Implementation Tasks

#### Backend

**1. Agent Connection Handler in Gateway** ⏳
```
Location: packages/cloud/src/api/gateway.ts

private setupAgentWebSocket(): void {
  this.wss.on('connection', async (ws: WebSocket, req) => {
    const token = this.extractToken(req);
    const decoded = jwt.verify(token, this.config.jwtSecret);

    if (decoded.type === 'agent') {
      const agentId = req.headers['x-agent-id'];
      await this.handleAgentConnection(ws, agentId, decoded.userId);
    }
  });
}

private async handleAgentConnection(
  ws: WebSocket,
  agentId: string,
  userId: string
): Promise<void> {
  // 1. Register agent in AgentManager
  await this.agentManager.registerAgent(agentId, userId, ws);

  // 2. Listen for agent messages
  ws.on('message', async (data) => {
    const message: AgentMessage = JSON.parse(data.toString());
    await this.agentManager.handleAgentMessage(agentId, message);
  });

  // 3. Handle disconnect
  ws.on('close', () => {
    this.agentManager.disconnectAgent(agentId);
  });
}
```

**2. AgentManager Service** ⏳
```
Location: packages/cloud/src/orchestration/agent-manager.ts

class AgentManager {
  private agents = new Map<string, AgentConnection>();
  private pendingRequests = new Map<string, PendingRequest>();

  async registerAgent(agentId, userId, ws): Promise<void>
  async disconnectAgent(agentId): Promise<void>

  async sendLLMRequest(
    agentId: string,
    request: AgentLLMRequest
  ): Promise<LLMResponse>

  async handleAgentMessage(
    agentId: string,
    message: AgentMessage
  ): Promise<void>

  async getAgentStatus(agentId): Promise<AgentStatus>
  async listUserAgents(userId): Promise<Agent[]>
}

interface AgentConnection {
  agentId: string;
  userId: string;
  ws: WebSocket;
  capabilities: AgentCapabilities;
  connectedAt: Date;
  lastHeartbeat: Date;
}
```

**3. Enhanced Orchestrator Routing** ⏳
```
Location: packages/cloud/src/orchestration/orchestrator.ts

private async executeRequest(
  routing: RoutingDecision,
  messages: Message[],
  options: RequestOptions
): Promise<LLMResponse> {
  if (routing.agentId) {
    // Route to agent
    const response = await this.agentManager.sendLLMRequest(
      routing.agentId,
      {
        providerId: routing.providerId,
        messages,
        options,
        requestId: nanoid()
      }
    );
    return response;
  } else {
    // Cloud provider
    const provider = await this.registry.getLLMForUser(userId, routing.providerId);
    return await provider.complete(messages, options);
  }
}
```

**4. Agent API Endpoints** ⏳
```
GET    /v1/agents                - List user's agents
GET    /v1/agents/:id            - Get agent status
POST   /v1/agents/:id/test       - Test agent connection
DELETE /v1/agents/:id            - Revoke agent token
POST   /v1/agents/tokens         - Generate new agent token
```

#### Frontend

**1. Settings Page → Agents Tab** ⏳
```
Location: packages/web/src/pages/SettingsPage.tsx (Agents tab)

Features:
  - List registered agents
  - Agent cards showing:
    • Agent ID, name
    • Status: connected, disconnected
    • Capabilities (providers, tools)
    • Connected since / Last seen
    • "Test Connection" button
  - "Create Agent Token" button → modal
  - Agent setup instructions

Components:
  - AgentCard.tsx
  - AgentTokenModal.tsx (generate + display token)
  - AgentSetupInstructions.tsx (CLI commands)
  - hooks/useAgents.ts
```

**2. Agent Token Generation Modal** ⏳
```
Location: packages/web/src/components/AgentTokenModal.tsx

Workflow:
1. User clicks "Create Agent Token"
2. Form asks for:
   - Agent name (optional)
   - Expiry (30 days, 90 days, never)
3. Generate token → POST /v1/agents/tokens
4. Show token + CLI commands:
   ```
   pacore-agent init --token <TOKEN> --cloud-url https://api.yourinstance.com
   pacore-agent start
   ```
5. Warning: "Save this token - it won't be shown again"
```

**3. Agent Status Indicator in Chat** ⏳
```
Location: packages/web/src/components/ProviderSelector.tsx

Enhancement:
  - If Ollama is selected, show agent status:
    • Green dot: Agent connected
    • Red dot: Agent offline
    • Gray dot: No agent configured
  - Tooltip: "Using on-premise agent: office-agent-1"
```

### MVP Scope
- Agent registration and token generation
- Agent connection handling in cloud
- Route requests to agents
- Agent status monitoring in UI
- Support Ollama provider via agents
- One agent per user (future: multiple agents)

---

## Pillar 7: Web UI Dashboard

### Current State
✅ **Implemented:**
- ChatPage with category selector, provider selector
- CategorySuggestionBanner
- Basic navigation (header with settings, logout)
- Authentication (login/register pages)
- Zustand state management

❌ **Missing:**
- Settings page with tabs
- Conversations history page
- MCP Servers page
- Workflows page
- Unified navigation

### Implementation Tasks

#### Core UI Structure

**1. App Routing** ⏳
```
Location: packages/web/src/App.tsx

Routes:
  /                    → ChatPage (default)
  /conversations       → ConversationsPage
  /workflows           → WorkflowsPage
  /mcp                 → MCPServersPage
  /settings            → SettingsPage
  /login               → LoginPage
  /register            → RegisterPage
```

**2. Unified Navigation** ⏳
```
Location: packages/web/src/components/Navigation.tsx

Sidebar navigation:
  - Chat (MessageSquare icon)
  - Conversations (History icon)
  - Workflows (GitBranch icon)
  - MCP Servers (Database icon)
  - Settings (Settings icon)
  - Logout (LogOut icon)

Active route highlighted
```

**3. Settings Page with Tabs** ⏳
```
Location: packages/web/src/pages/SettingsPage.tsx

Tabs:
  - Providers (API keys configuration)
  - Agents (on-premise agents)
  - Categories (manage categories - future)
  - Profile (user info, password change)

Tab Content:
  - ProvidersTab.tsx
  - AgentsTab.tsx
  - CategoriesTab.tsx
  - ProfileTab.tsx
```

#### Pages to Build

**Summary:**
1. ✅ ChatPage (exists)
2. ⏳ ConversationsPage
3. ⏳ WorkflowsPage
4. ⏳ MCPServersPage
5. ⏳ SettingsPage (with tabs)

#### Design System

**Use Tailwind CSS + Headless UI:**
- Consistent color scheme
- Component library: shadcn/ui or Headless UI
- Icons: lucide-react
- Forms: react-hook-form + zod validation

**Theme:**
```
Primary: Blue (#3B82F6)
Success: Green (#10B981)
Warning: Orange (#F59E0B)
Error: Red (#EF4444)
Background: Gray-50 (#F9FAFB)
Text: Gray-900 (#111827)
```

### MVP Scope
- All 7 pages implemented
- Unified navigation sidebar
- Responsive design (desktop + tablet)
- Dark mode (future)
- Settings with 4 tabs

---

## Complete MVP Feature Matrix

| Feature | Backend | Frontend | Status |
|---------|---------|----------|--------|
| **1. Multi-LLM Providers** |
| Provider registry | ✅ | - | Complete |
| Anthropic integration | ✅ | - | Complete |
| OpenAI integration | ✅ | - | Complete |
| Custom endpoint | ✅ | - | Complete |
| Ollama integration | ✅ | - | Complete |
| Provider selector | - | ✅ | Complete |
| Provider config UI | - | ⏳ | To Build |
| API key management | ✅ | ⏳ | Backend done |
| **2. Conversation Memory** |
| Vector storage (pgvector) | ✅ | - | Complete |
| Semantic search | ✅ | - | Complete |
| Context injection | ✅ | - | Complete |
| Auto-save conversations | ✅ | - | Complete |
| Conversation history UI | - | ⏳ | To Build |
| Search interface | - | ⏳ | To Build |
| **3. Self-Learning Categories** |
| AI classification | ✅ | - | Complete |
| Dynamic categories | ✅ | - | Complete |
| Category CRUD | ✅ | ✅ | Complete |
| Suggestion system | ✅ | ✅ | Complete |
| Category selector | - | ✅ | Complete |
| Suggestion banner | - | ✅ | Complete |
| **4. MCP Server Management** |
| MCP registry | ✅ | - | Complete |
| HTTP protocol | ✅ | - | Complete |
| Capability discovery | ✅ | - | Complete |
| Credential encryption | ⏳ | - | To Build |
| MCP servers UI | - | ⏳ | To Build |
| Server registration | ⏳ | ⏳ | To Build |
| Tool viewer | - | ⏳ | To Build |
| **5. Workflow Automation** |
| Workflow engine | ✅ | - | Complete |
| AI workflow builder | ✅ | - | Complete |
| Intent detection | ✅ | - | Complete |
| Execution tracking | ✅ | - | Complete |
| MCP tool nodes | ⏳ | - | To Build |
| Credential injection | ⏳ | - | To Build |
| Workflow intent UI | - | ⏳ | To Build |
| Workflows page | - | ⏳ | To Build |
| DAG viewer | - | ⏳ | To Build |
| Execution history UI | - | ⏳ | To Build |
| **6. On-Premise Agents** |
| Agent package | ✅ | - | Complete |
| WebSocket protocol | ✅ | - | Complete |
| Ollama integration | ✅ | - | Complete |
| Agent CLI | ✅ | - | Complete |
| Cloud agent handler | ⏳ | - | To Build |
| Agent routing | ⏳ | - | To Build |
| Agent status UI | - | ⏳ | To Build |
| Token generation | ⏳ | ⏳ | To Build |
| **7. Web UI Dashboard** |
| Chat page | - | ✅ | Complete |
| Navigation | - | ⏳ | To Build |
| Settings page | - | ⏳ | To Build |
| Conversations page | - | ⏳ | To Build |
| Workflows page | - | ⏳ | To Build |
| MCP servers page | - | ⏳ | To Build |

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
**Goal:** Complete core backend services and basic UI structure

**Backend:**
1. Credential encryption service (MCP)
2. Agent connection handler
3. AgentManager service
4. Enhanced MCPClient with credentials

**Frontend:**
1. Unified navigation component
2. App routing setup
3. Settings page structure with tabs

**Deliverable:** Navigation works, settings page exists, agent connections accepted

---

### Phase 2: MCP & Agents (Weeks 3-4)
**Goal:** Complete MCP server management and agent system

**Backend:**
1. Agent API endpoints
2. Agent routing in orchestrator
3. MCP credential endpoints

**Frontend:**
1. MCPServersPage (full implementation)
2. MCPServerModal (registration + credentials)
3. AgentsTab in settings
4. AgentTokenModal
5. useMCPServers hook
6. useAgents hook

**Deliverable:** Users can register MCP servers with credentials, agents connect and route requests

---

### Phase 3: Workflows (Weeks 5-6)
**Goal:** Complete workflow creation and execution UI

**Backend:**
1. `mcp_tool` node type implementation
2. Enhanced WorkflowBuilder with tool catalog
3. Credential injection in executor
4. Workflow execution with MCP tools

**Frontend:**
1. WorkflowsPage
2. WorkflowIntentBanner
3. WorkflowDAGViewer
4. WorkflowExecutionHistory
5. useWorkflows hook

**Deliverable:** Users can create workflows from conversations, view DAG, execute workflows

---

### Phase 4: Conversations & History (Week 7)
**Goal:** Complete conversation management

**Frontend:**
1. ConversationsPage
2. ConversationList + ConversationCard
3. ConversationDetailModal
4. Semantic search interface
5. useConversations hook

**Deliverable:** Users can browse, search, and manage conversation history

---

### Phase 5: Provider Management & Polish (Week 8)
**Goal:** Complete provider configuration and polish UI

**Frontend:**
1. ProvidersTab in settings
2. ProviderConfigModal
3. ProviderCard
4. useProviders hook
5. UI polish and bug fixes
6. Responsive design improvements

**Deliverable:** Complete MVP ready for user testing

---

## Database Schema Summary

### Existing Tables
```sql
users
user_settings
provider_configs
conversations
agents (partially used)
api_tokens
usage_logs
mcp_servers
workflows
workflow_executions
user_categories
```

### New Tables Needed

```sql
-- Encrypted credentials for MCP servers
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

-- Agent tokens
CREATE TABLE agent_tokens (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used TIMESTAMP
);

CREATE INDEX idx_agent_tokens_user ON agent_tokens(user_id);
CREATE INDEX idx_agent_tokens_hash ON agent_tokens(token_hash);

-- Agent connection status (in-memory preferred, but DB for persistence)
CREATE TABLE agent_connections (
  agent_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  capabilities JSONB,
  connected_at TIMESTAMP,
  last_heartbeat TIMESTAMP
);
```

---

## API Endpoints Summary

### Existing Endpoints
```
POST   /v1/complete
POST   /v1/providers/:id/configure
GET    /v1/providers
POST   /v1/memory/search
GET    /v1/conversations
GET    /v1/conversations/:id
DELETE /v1/conversations/:id
POST   /v1/conversations/:id/accept-category
GET    /v1/categories
POST   /v1/categories
DELETE /v1/categories/:id
GET    /v1/mcp/servers
POST   /v1/mcp/servers
GET    /v1/mcp/servers/:id
PUT    /v1/mcp/servers/:id
DELETE /v1/mcp/servers/:id
POST   /v1/mcp/servers/:id/test
GET    /v1/mcp/servers/:id/capabilities
GET    /v1/workflows
POST   /v1/workflows
GET    /v1/workflows/:id
PUT    /v1/workflows/:id
DELETE /v1/workflows/:id
POST   /v1/workflows/:id/execute
GET    /v1/workflows/:id/executions
POST   /v1/workflows/:id/refine
POST   /v1/workflows/detect-intent
POST   /v1/workflows/suggest
POST   /v1/workflows/build
GET    /v1/executions
GET    /v1/executions/:id
```

### New Endpoints Needed

```
# MCP Credentials
POST   /v1/mcp/servers/:id/credentials
PUT    /v1/mcp/servers/:id/credentials
DELETE /v1/mcp/servers/:id/credentials
GET    /v1/mcp/servers/:id/tools

# Agents
GET    /v1/agents
GET    /v1/agents/:id
POST   /v1/agents/tokens
DELETE /v1/agents/tokens/:id
POST   /v1/agents/:id/test

# Providers (UI configuration)
GET    /v1/providers/configured
DELETE /v1/providers/:id/config
```

---

## Technology Stack

### Backend
- **Runtime:** Node.js 18+
- **Language:** TypeScript
- **Framework:** Express
- **Database:** PostgreSQL 15+ with pgvector
- **Cache:** Redis (future)
- **Vector Store:** pgvector (primary), Pinecone (optional)
- **WebSocket:** ws library
- **Authentication:** JWT
- **Encryption:** crypto (Node.js built-in, AES-256)

### Frontend
- **Framework:** React 18
- **Language:** TypeScript
- **State:** Zustand
- **Routing:** React Router v6
- **Styling:** Tailwind CSS
- **Components:** Headless UI / shadcn/ui
- **Icons:** lucide-react
- **Forms:** react-hook-form + zod
- **DAG Visualization:** react-flow / dagre-d3
- **Code Editor:** Monaco Editor (for future MCP code editing)

### DevOps
- **Containerization:** Docker + Docker Compose
- **Monorepo:** pnpm workspaces + Turbo
- **Development:** pnpm dev (all packages)
- **Build:** Turbo build pipeline

---

## Security Considerations

### Authentication & Authorization
1. JWT-based API authentication
2. Agent token authentication (Bearer tokens)
3. Per-user resource isolation
4. Provider API keys encrypted at rest (AES-256)
5. MCP credentials encrypted at rest (AES-256)

### Data Protection
1. HTTPS/WSS for all communication
2. Encrypted credentials in database
3. No credentials in logs
4. Token expiration support
5. Rate limiting (future)

### Agent Security
1. Agent tokens with expiry
2. Capability-based permissions
3. File access controls (whitelist/blacklist)
4. Tool execution sandboxing (future)

### MCP Security
1. Credential encryption per user per server
2. Test connection before save
3. Credentials never returned in API responses
4. Credential injection only at runtime

---

## Success Metrics

### User Adoption
- Number of registered users
- Daily active users
- Conversations per user per day
- Average session duration

### AI Usage
- Conversations per day
- Provider distribution (Anthropic, OpenAI, Ollama)
- Streaming vs non-streaming ratio
- Context retrieval usage

### Automation
- MCP servers registered per user
- Workflows created per user
- Workflow executions per day
- Workflow success rate

### Categories
- Categories created per user
- Category suggestions accepted vs rejected
- Auto-classification accuracy (manual validation)

### Agents
- Agents deployed per user
- Agent uptime percentage
- Agent requests per day

---

## MVP Launch Checklist

### Backend
- [ ] Credential encryption service
- [ ] Agent connection handler
- [ ] AgentManager service
- [ ] Enhanced MCPClient
- [ ] `mcp_tool` node type
- [ ] Workflow credential injection
- [ ] New API endpoints (MCP, agents)
- [ ] Database migrations

### Frontend
- [ ] Unified navigation
- [ ] Settings page with tabs
- [ ] MCPServersPage
- [ ] WorkflowsPage
- [ ] ConversationsPage
- [ ] Provider configuration UI
- [ ] Agent management UI
- [ ] All hooks implemented

### Testing
- [ ] Unit tests for critical services
- [ ] Integration tests for API endpoints
- [ ] E2E tests for core workflows
- [ ] Manual testing checklist

### Documentation
- [ ] User guide
- [ ] API documentation
- [ ] Agent setup guide
- [ ] MCP server integration guide
- [ ] Deployment guide

### DevOps
- [ ] Docker images optimized
- [ ] Environment variables documented
- [ ] Database migrations tested
- [ ] Backup strategy
- [ ] Monitoring setup

---

## Post-MVP Roadmap

### Phase 6: Advanced Features
1. Visual workflow editor (drag-and-drop)
2. Workflow templates library
3. Multi-category filtering
4. Parallel workflow execution
5. Workflow scheduling (cron)
6. Advanced agent tools (file access, custom tools)

### Phase 7: Collaboration
1. Team workspaces
2. Shared workflows
3. Shared MCP servers
4. Role-based access control

### Phase 8: Marketplace
1. Workflow marketplace
2. MCP server marketplace
3. One-click deployments
4. Community templates

### Phase 9: Analytics
1. Usage dashboards
2. Cost tracking per provider
3. Workflow performance metrics
4. Category insights

### Phase 10: Enterprise
1. SSO integration
2. Audit logs
3. Compliance features
4. On-premise deployment option
5. Multi-region support

---

## Conclusion

This MVP plan delivers a complete AI orchestration platform with 7 integrated pillars:

1. ✅ **Multi-LLM Support:** Anthropic, OpenAI, Custom, Ollama
2. ✅ **Persistent Memory:** Vector search, semantic context
3. ✅ **Self-Learning Categories:** AI-driven, dynamic, user-defined
4. ⏳ **MCP Management:** External tools with secure credentials
5. ⏳ **Workflow Automation:** AI-generated, MCP-integrated, executable
6. ⏳ **On-Premise Agents:** Behind firewalls, Ollama support
7. ⏳ **Web Dashboard:** Unified UI for all features

**Timeline:** 8 weeks to complete MVP
**Focus:** User value, security, extensibility
**Launch:** Production-ready platform for AI automation

---

## Next Steps

1. ✅ Review and approve this plan
2. ⏳ Begin Phase 1: Foundation (navigation, settings structure)
3. ⏳ Implement credential encryption service
4. ⏳ Build MCPServersPage
5. ⏳ Continue through phases 2-5

**Status:** Ready to begin implementation. Plan document created at `plans/complete-mvp-plan.md`.
