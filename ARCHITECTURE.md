# PA Core Architecture

## Overview

PA Core is designed as a hybrid cloud-native AI orchestration platform that allows organizations to leverage multiple LLM providers while maintaining conversation memory and supporting both cloud and on-premise deployments.

## Core Principles

1. **Provider Agnostic**: Users can bring their own LLM API keys or use platform-provided services
2. **Hybrid Architecture**: Cloud-first with on-premise agent support for firewall environments
3. **Memory-First**: All conversations are stored with semantic search capabilities
4. **AI-Driven Automation**: Workflows emerge naturally from conversations
5. **Extensible**: Easy to add new LLM providers, data sources, and capabilities
6. **Secure**: API keys encrypted, tokens signed, data isolated per user

## System Components

### 1. Core Package (`@pacore/core`)

The foundation package containing all shared types and the LLM provider registry.

**Key Components:**
- `LLMProvider` interface - Contract all providers must implement
- `LLMProviderRegistry` - Central registry for managing providers
- Type definitions for messages, conversations, and agents

**Design Decisions:**
- Provider interface supports both streaming and non-streaming
- Registry allows per-user configuration of providers
- All types are framework-agnostic for maximum reusability

### 2. Adapters Package (`@pacore/adapters`)

Provider-specific implementations for different LLMs.

**Implemented Providers:**
- **AnthropicProvider**: Claude models (Sonnet, Opus, Haiku)
- **OpenAIProvider**: GPT-4, GPT-3.5-turbo
- **CustomEndpointProvider**: Any OpenAI-compatible API
- **OllamaProvider**: Local LLM execution

**Design Decisions:**
- Each provider is self-contained
- Streaming support is mandatory
- Health checks for connection validation
- Error handling normalized across providers

### 3. Cloud Service Package (`@pacore/cloud`)

The main orchestration service running in the cloud.

#### 3.1 Memory System

**VectorMemoryStore:**
- Uses Pinecone for semantic search
- Stores embeddings of conversation messages
- Supports filtering by user, date, provider, tags

**MemoryManager:**
- Dual storage: PostgreSQL for structured data + Pinecone for vectors
- Search with relevance scoring
- Conversation lifecycle management

**Design Decisions:**
- Vector store is pluggable (can swap Pinecone for Qdrant/Weaviate)
- Embeddings generated lazily (TODO: integrate actual embedding model)
- Content truncation to fit metadata limits

#### 3.2 Orchestration Layer

**Orchestrator:**
- Routes requests to appropriate LLM provider
- Retrieves relevant context from memory
- Handles conversation storage
- Implements intelligent routing logic
- **NEW: Detects workflow automation opportunities during conversations**
- **NEW: Integrates with workflow builder for automatic workflow generation**

**Routing Strategy:**
1. User-specified provider (highest priority)
2. Data residency requirements
3. Query type analysis (code, analytical, general)
4. User's default provider

**Workflow Intent Detection:**
1. Analyzes user messages for automation opportunities
2. Uses LLM to detect workflow patterns (multi-step, data fetching, scheduled tasks)
3. Returns confidence score and description
4. Only triggers on high confidence (>0.7)
5. Can be disabled via `detectWorkflowIntent: false`

**Design Decisions:**
- Context injection is automatic unless disabled
- Routing can be overridden per request
- Workflow detection runs AFTER LLM response to avoid interference
- Graceful degradation if workflow system unavailable
- Intent detection is optional and enabled by default

#### 3.3 API Gateway

**APIGateway:**
- REST API for client requests
- WebSocket support for streaming
- JWT-based authentication
- CORS configuration

**Endpoints:**
- `/v1/complete` - Main completion endpoint
- `/v1/providers/*` - Provider management
- `/v1/memory/*` - Memory operations
- `/v1/conversations/*` - Conversation history

**Design Decisions:**
- RESTful design for ease of use
- WebSocket for real-time streaming
- Authentication middleware separates concerns
- Error handling with meaningful messages

#### 3.4 MCP Integration Layer

**MCP (Model Context Protocol):**
- Connects to external data sources and tools
- Supports HTTP protocol (WebSocket/stdio planned)
- Manages server registration and capabilities
- Handles tool invocation and responses

**MCPRegistry:**
- Central registry for user's MCP servers
- Stores connection configurations securely
- Category-based organization (work, family, hobby, etc.)
- Capability discovery and caching

**MCPClient:**
- HTTP-based communication with MCP servers
- Standard protocol: tools/list, tools/call
- Connection testing and validation
- Error handling for unreachable servers

**Design Decisions:**
- Protocol-agnostic design (HTTP now, WebSocket/stdio later)
- Per-user server isolation
- Category filtering for context-specific workflows
- Graceful handling of server failures

#### 3.5 Workflow System

**WorkflowManager:**
- CRUD operations for workflows
- DAG validation (no cycles, valid node references)
- Category-based organization
- Execution history tracking

**WorkflowExecutor:**
- Topological sort for execution order
- Node-by-node execution with dependency resolution
- Support for multiple node types:
  - `mcp_fetch`: Fetch data from MCP servers
  - `transform`: AI-powered or code-based data transformation
  - `filter`: Array filtering with conditions
  - `merge`: Combine multiple data sources
  - `action`: Save, notify, webhook, email
  - `conditional`: Branch based on conditions
- Execution logging and error handling

**WorkflowBuilder (AI-Driven):**
- Intent detection from natural language
- Workflow generation using LLM
- Tool catalog building from available MCP servers
- Workflow refinement based on feedback
- Similarity matching for existing workflows

**Workflow DAG Structure:**
```typescript
{
  id: string,
  userId: string,
  name: string,
  description: string,
  category: string,
  nodes: [
    {
      id: string,
      type: 'mcp_fetch' | 'transform' | 'filter' | 'merge' | 'action' | 'conditional',
      description: string,
      config: {...},  // Node-specific configuration
      inputs: string[]  // IDs of dependent nodes
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

**Design Decisions:**
- DAG structure ensures no infinite loops
- Node IDs are descriptive (e.g., "fetch_legal_cases")
- Workflow validation happens before save
- AI generates workflows from user intent
- Workflows can be refined iteratively
- Execution state tracked for debugging

### 4. On-Premise Agent Package (`@pacore/agent`)

Agent that runs behind corporate firewalls and connects to cloud service.

**Key Features:**
- WebSocket connection to cloud
- Local LLM integration (Ollama, LM Studio)
- Automatic reconnection
- Capability reporting

**Communication Protocol:**
```typescript
// Message types
- llm_request / llm_response
- llm_stream / llm_stream_end
- tool_request / tool_response
- health_check / health_response
- capabilities
```

**Design Decisions:**
- Stateless agent design (cloud maintains state)
- Request/response pattern with unique IDs
- Graceful degradation on disconnect
- CLI for easy deployment

### 5. SDK Package (`@pacore/sdk`)

Client library for application integration.

**Features:**
- Simple API for completions
- Streaming support
- Provider configuration
- Memory search

**Design Decisions:**
- Minimal dependencies
- TypeScript-first
- Promise-based API with async iterators for streaming
- Re-exports core types for convenience

## Data Flow

### Standard Request Flow

```
1. Client → SDK → API Gateway
2. API Gateway → Orchestrator
3. Orchestrator → Memory Manager (context search)
4. Orchestrator → LLM Provider (with context)
5. LLM Provider → External API
6. Response → Memory Manager (store)
7. Response → Client
```

### Request Flow with Workflow Intent Detection

```
1. Client → SDK → API Gateway
2. API Gateway → Orchestrator
3. Orchestrator → Memory Manager (context search)
4. Orchestrator → LLM Provider (with context)
5. LLM Provider → External API
6. Orchestrator → WorkflowBuilder.detectIntent() [if enabled]
7. WorkflowBuilder → LLM (analyze for workflow patterns)
8. If intent detected (confidence > 0.7):
   - Return workflowIntent in response
9. Response → Memory Manager (store)
10. Response (with workflowIntent) → Client
```

### Workflow Execution Flow

```
1. Client → POST /v1/workflows/:id/execute
2. API Gateway → WorkflowExecutor
3. WorkflowExecutor → Load workflow DAG
4. WorkflowExecutor → Topological sort (determine execution order)
5. For each node in order:
   a. If mcp_fetch:
      - WorkflowExecutor → MCPClient → External MCP Server
   b. If transform:
      - WorkflowExecutor → LLM Provider (for AI transform)
   c. If filter/merge:
      - WorkflowExecutor → Execute locally
   d. If action:
      - WorkflowExecutor → Perform action (save/notify/webhook)
6. WorkflowExecutor → Store execution log
7. Response (with result) → Client
```

### AI Workflow Generation Flow

```
1. Client → POST /v1/workflows/build
2. API Gateway → WorkflowBuilder
3. WorkflowBuilder → MCPRegistry.listUserServers() (get available tools)
4. WorkflowBuilder → Build tool catalog from MCP capabilities
5. WorkflowBuilder → LLM (generate workflow from natural language + tools)
6. LLM → Returns workflow DAG
7. WorkflowBuilder → WorkflowManager.validateWorkflow()
8. If valid → Return workflow to client
9. If execute flag set → WorkflowExecutor → Execute immediately
```

### On-Premise Request Flow

```
1. Client → SDK → API Gateway
2. API Gateway → Orchestrator
3. Orchestrator → Agent Manager
4. Agent Manager → WebSocket → On-Premise Agent
5. On-Premise Agent → Local LLM
6. Response → WebSocket → Cloud
7. Response → Memory Manager (store)
8. Response → Client
```

## Database Schema

### PostgreSQL Tables

**users**: User accounts
**user_settings**: Per-user preferences and defaults
**provider_configs**: Encrypted API keys per user/provider
**conversations**: Full conversation history with messages
**agents**: Registered on-premise agents
**api_tokens**: User API tokens
**usage_logs**: Token usage tracking
**mcp_servers**: MCP server registrations with connection configs
**workflows**: Workflow DAGs with nodes and configurations
**workflow_executions**: Execution history with logs and results
**categories**: User-defined categories for organization

### Pinecone Index

**Structure:**
- Vector: 1536 dimensions (OpenAI embedding size)
- Metadata: userId, conversationId, timestamp, provider, content, tags

## Security Architecture

### Authentication & Authorization

1. **API Tokens**: JWT tokens for API access
2. **Agent Tokens**: Special tokens for agent authentication
3. **User Isolation**: All queries filtered by userId

### Data Protection

1. **Encryption at Rest**: Provider API keys encrypted in database
2. **Encryption in Transit**: HTTPS/WSS for all communication
3. **Token Signing**: JWT tokens signed with secret key

### Access Control

1. **Per-User Resources**: Users can only access their data
2. **Provider Configs**: Isolated per user
3. **Agent Pairing**: Agents bound to specific users

## Scalability Considerations

### Horizontal Scaling

1. **Stateless API**: Gateway can be replicated
2. **Database Connection Pooling**: Managed by pg Pool
3. **Redis for Sessions**: Shared state across instances (future)

### Performance Optimization

1. **Vector Search**: Indexed for fast similarity search
2. **Database Indexes**: On userId, timestamp, provider
3. **Caching**: Redis for frequently accessed data (future)

### Rate Limiting

- Per-user token limits (future)
- Request rate limiting (future)
- Provider-specific quotas (future)

## Extensibility Points

### Adding New LLM Providers

1. Implement `LLMProvider` interface
2. Add to adapters package
3. Register in cloud service
4. No changes to core or SDK needed

### Adding New Storage Backends

1. Implement vector store interface
2. Swap in MemoryManager configuration
3. Migrations may be needed for structured storage

### Adding Tools/Capabilities

1. Define tool interface in core
2. Implement in agent
3. Add routing in orchestrator

## Deployment Architectures

### Cloud-Only Deployment

```
Internet → Load Balancer → API Gateway (N instances)
                              ↓
                         PostgreSQL + Redis
                              ↓
                           Pinecone
```

### Hybrid Deployment

```
Internet → Load Balancer → API Gateway (Cloud)
                              ↓
                         PostgreSQL + Redis + Pinecone
                              ↓ (WebSocket)
Corporate Network → On-Premise Agent → Ollama
```

### Multi-Region Deployment (Future)

```
Region 1: API + DB Replica
Region 2: API + DB Replica
Global: Pinecone (distributed)
```

## Error Handling Strategy

1. **Provider Errors**: Caught and returned with context
2. **Network Errors**: Retry logic with exponential backoff
3. **Validation Errors**: Clear error messages
4. **System Errors**: Logged and generic message to user

## Monitoring & Observability

**Current:**
- Console logging
- Health check endpoint

**Future:**
- Structured logging (Winston/Pino)
- Metrics (Prometheus)
- Tracing (OpenTelemetry)
- Error tracking (Sentry)

## Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Language | TypeScript | Type safety, great tooling |
| Runtime | Node.js | JavaScript ecosystem, async I/O |
| API Framework | Express | Simple, well-known, extensible |
| WebSocket | ws | Lightweight, performant |
| Database | PostgreSQL | ACID, JSONB support, mature |
| Vector DB | Pinecone | Managed, scalable, easy to use |
| Cache | Redis | Fast, versatile, mature |
| Monorepo | npm workspaces + Turbo | Simple, built-in, fast builds |

## Recent Enhancements (Completed)

1. ✅ **MCP Integration**: Model Context Protocol for external data sources
2. ✅ **Workflow Engine**: DAG-based workflow execution system
3. ✅ **AI Workflow Builder**: Generate workflows from natural language
4. ✅ **Workflow Intent Detection**: Automatic detection during conversations
5. ✅ **Category-Based Organization**: Tag and organize workflows/servers
6. ✅ **Auto-Classification**: AI-powered conversation tagging and categorization

## Future Enhancements

1. **Workflow Scheduling**: Cron-based recurring workflow execution
2. **MCP Protocol Extensions**: WebSocket and stdio support
3. **Credential Encryption**: Secure storage for MCP API keys
4. **Multi-tenancy**: Organization-level accounts
5. **Advanced Analytics**: Usage dashboards, cost tracking, workflow metrics
6. **Fine-tuning**: Custom model training integration
7. **Prompt Management**: Versioned prompt templates
8. **Caching**: Smart response caching
9. **Embeddings**: Self-hosted embedding generation
10. **Workflow Templates**: Pre-built workflow library
11. **Parallel Execution**: Run independent workflow nodes concurrently
12. **Conditional Branching**: Advanced workflow logic with loops
