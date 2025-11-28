# PA Core Architecture

## Overview

PA Core is designed as a hybrid cloud-native AI orchestration platform that allows organizations to leverage multiple LLM providers while maintaining conversation memory and supporting both cloud and on-premise deployments.

## Core Principles

1. **Provider Agnostic**: Users can bring their own LLM API keys or use platform-provided services
2. **Hybrid Architecture**: Cloud-first with on-premise agent support for firewall environments
3. **Memory-First**: All conversations are stored with semantic search capabilities
4. **Extensible**: Easy to add new LLM providers and capabilities
5. **Secure**: API keys encrypted, tokens signed, data isolated per user

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

**Routing Strategy:**
1. User-specified provider (highest priority)
2. Data residency requirements
3. Query type analysis (code, analytical, general)
4. User's default provider

**Design Decisions:**
- Context injection is automatic unless disabled
- Routing can be overridden per request
- Future: ML-based routing for optimal provider selection

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

## Future Enhancements

1. **Multi-tenancy**: Organization-level accounts
2. **Advanced Analytics**: Usage dashboards, cost tracking
3. **Tool Calling**: Function execution framework
4. **Fine-tuning**: Custom model training integration
5. **Prompt Management**: Versioned prompt templates
6. **Workflow Engine**: Chain multiple LLM calls
7. **Caching**: Smart response caching
8. **Embeddings**: Self-hosted embedding generation
