# PA Core API Documentation

Complete API reference for PA Core AI Orchestrator.

## Table of Contents

1. [Authentication](#authentication)
2. [Core AI Endpoints](#core-ai-endpoints)
3. [MCP Endpoints](#mcp-endpoints)
4. [Workflow Endpoints](#workflow-endpoints)
5. [AI Workflow Builder](#ai-workflow-builder)
6. [Error Handling](#error-handling)

## Authentication

All API requests require authentication using a Bearer token in the Authorization header.

```http
Authorization: Bearer YOUR_API_TOKEN
```

### Register User

```http
POST /v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

### Login

```http
POST /v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_123",
    "email": "user@example.com"
  }
}
```

---

## Core AI Endpoints

### Complete Conversation

Send messages to an LLM and get responses. Automatically detects workflow intent.

```http
POST /v1/complete
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "I need to fetch legal cases from last week and email me a summary"
    }
  ],
  "options": {
    "providerId": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "temperature": 0.7,
    "maxTokens": 4096,
    "saveToMemory": true,
    "contextSearch": true,
    "detectWorkflowIntent": true,
    "autoClassify": true,
    "autoTag": true
  }
}
```

**Response:**
```json
{
  "response": "I can help you set up an automated workflow for that...",
  "provider": "anthropic",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 200,
    "totalTokens": 350
  },
  "contextUsed": ["conv_abc123", "conv_def456"],
  "workflowIntent": {
    "detected": true,
    "confidence": 0.92,
    "description": "Automated workflow to fetch legal cases and send email summary"
  }
}
```

**Options:**
- `providerId`: LLM provider ("anthropic", "openai", "custom-endpoint")
- `model`: Specific model to use
- `temperature`: Randomness (0-1)
- `maxTokens`: Max response length
- `saveToMemory`: Store conversation (default: true)
- `contextSearch`: Search previous conversations (default: true)
- `detectWorkflowIntent`: Detect automation opportunities (default: true)
- `autoClassify`: Auto-categorize conversation (default: true)
- `autoTag`: Auto-generate tags (default: true)

### Stream Completion

Get streaming responses in real-time.

```http
POST /v1/stream
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Tell me a story" }
  ],
  "options": {
    "providerId": "anthropic"
  }
}
```

**Response:** Server-Sent Events stream
```
data: {"type":"content","content":"Once"}
data: {"type":"content","content":" upon"}
data: {"type":"content","content":" a"}
data: {"type":"content","content":" time"}
data: {"type":"done"}
```

### Configure Provider

Configure your own LLM API keys.

```http
POST /v1/providers/anthropic/configure
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "apiKey": "sk-ant-api03-...",
  "model": "claude-3-5-sonnet-20241022"
}
```

**Response:**
```json
{
  "success": true,
  "provider": "anthropic",
  "configured": true
}
```

### List Providers

Get available LLM providers.

```http
GET /v1/providers
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "providers": [
    {
      "id": "anthropic",
      "name": "Anthropic Claude",
      "configured": true,
      "models": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"]
    },
    {
      "id": "openai",
      "name": "OpenAI",
      "configured": false,
      "models": ["gpt-4-turbo-preview", "gpt-3.5-turbo"]
    }
  ]
}
```

### Search Memory

Search conversation history using semantic search.

```http
POST /v1/memory/search
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "query": "legal cases discussion",
  "limit": 10,
  "minRelevance": 0.7,
  "dateRange": {
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-31T23:59:59Z"
  },
  "tags": ["legal", "work"]
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "conv_123",
      "content": "Discussion about recent legal case...",
      "timestamp": "2024-01-15T10:00:00Z",
      "relevance": 0.89,
      "tags": ["legal", "work"],
      "category": "legal"
    }
  ]
}
```

---

## MCP Endpoints

MCP (Model Context Protocol) allows you to connect external data sources and tools.

### Register MCP Server

```http
POST /v1/mcp/servers
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "name": "Legal Database",
  "serverType": "cloud",
  "protocol": "http",
  "connectionConfig": {
    "url": "https://api.legal-db.com",
    "apiKey": "your-mcp-api-key",
    "headers": {
      "X-Custom-Header": "value"
    }
  },
  "categories": ["legal", "work"]
}
```

**Response:**
```json
{
  "id": "mcp_abc123",
  "name": "Legal Database",
  "serverType": "cloud",
  "protocol": "http",
  "categories": ["legal", "work"],
  "createdAt": "2024-01-15T10:00:00Z"
}
```

### List MCP Servers

```http
GET /v1/mcp/servers?category=legal
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "servers": [
    {
      "id": "mcp_abc123",
      "name": "Legal Database",
      "serverType": "cloud",
      "protocol": "http",
      "categories": ["legal", "work"],
      "status": "connected"
    }
  ]
}
```

### Get MCP Server

```http
GET /v1/mcp/servers/:id
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "id": "mcp_abc123",
  "name": "Legal Database",
  "serverType": "cloud",
  "protocol": "http",
  "connectionConfig": {
    "url": "https://api.legal-db.com"
  },
  "categories": ["legal", "work"],
  "capabilities": {
    "tools": [
      {
        "name": "search_cases",
        "description": "Search legal cases",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": { "type": "string" },
            "limit": { "type": "number" }
          }
        }
      }
    ]
  }
}
```

### Update MCP Server

```http
PUT /v1/mcp/servers/:id
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "name": "Updated Legal Database",
  "categories": ["legal", "work", "research"]
}
```

### Delete MCP Server

```http
DELETE /v1/mcp/servers/:id
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "MCP server deleted"
}
```

### Test MCP Connection

```http
POST /v1/mcp/servers/:id/test
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "connected": true,
  "latency": 150
}
```

### Get Server Capabilities

```http
GET /v1/mcp/servers/:id/capabilities
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "tools": [
    {
      "name": "search_cases",
      "description": "Search legal cases",
      "inputSchema": {...}
    }
  ],
  "resources": []
}
```

---

## Workflow Endpoints

### Create Workflow

Manually create a workflow DAG.

```http
POST /v1/workflows
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "name": "Legal Case Summary",
  "description": "Fetch recent legal cases and summarize",
  "category": "legal",
  "nodes": [
    {
      "id": "fetch_cases",
      "type": "mcp_fetch",
      "description": "Fetch legal cases",
      "config": {
        "serverId": "mcp_abc123",
        "serverName": "Legal Database",
        "toolName": "search_cases",
        "parameters": {
          "query": "recent cases",
          "limit": 10
        }
      },
      "inputs": []
    },
    {
      "id": "summarize",
      "type": "transform",
      "description": "Summarize cases with AI",
      "config": {
        "type": "llm",
        "prompt": "Summarize these legal cases in bullet points"
      },
      "inputs": ["fetch_cases"]
    },
    {
      "id": "send_email",
      "type": "action",
      "description": "Email the summary",
      "config": {
        "action": "email",
        "to": "user@example.com",
        "subject": "Legal Cases Summary"
      },
      "inputs": ["summarize"]
    }
  ]
}
```

**Response:**
```json
{
  "id": "wf_xyz789",
  "name": "Legal Case Summary",
  "description": "Fetch recent legal cases and summarize",
  "category": "legal",
  "nodes": [...],
  "createdAt": "2024-01-15T10:00:00Z"
}
```

**Node Types:**
- `mcp_fetch`: Fetch data from MCP server
- `transform`: AI or code-based transformation
- `filter`: Filter array data
- `merge`: Combine multiple data sources
- `action`: Perform action (save, notify, webhook, email)
- `conditional`: Branch based on condition

### List Workflows

```http
GET /v1/workflows?category=legal
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "workflows": [
    {
      "id": "wf_xyz789",
      "name": "Legal Case Summary",
      "description": "Fetch recent legal cases and summarize",
      "category": "legal",
      "nodeCount": 3,
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### Get Workflow

```http
GET /v1/workflows/:id
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "id": "wf_xyz789",
  "name": "Legal Case Summary",
  "description": "Fetch recent legal cases and summarize",
  "category": "legal",
  "nodes": [...],
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T12:00:00Z"
}
```

### Update Workflow

```http
PUT /v1/workflows/:id
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "name": "Updated Legal Case Summary",
  "description": "Updated description"
}
```

### Delete Workflow

```http
DELETE /v1/workflows/:id
Authorization: Bearer YOUR_TOKEN
```

### Execute Workflow

```http
POST /v1/workflows/:id/execute
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "id": "exec_123",
  "workflowId": "wf_xyz789",
  "status": "completed",
  "startedAt": "2024-01-15T10:00:00Z",
  "completedAt": "2024-01-15T10:01:30Z",
  "executionLog": [
    {
      "nodeId": "fetch_cases",
      "status": "completed",
      "output": {...},
      "duration": 500
    },
    {
      "nodeId": "summarize",
      "status": "completed",
      "output": "Summary: ...",
      "duration": 2000
    },
    {
      "nodeId": "send_email",
      "status": "completed",
      "output": { "sent": true },
      "duration": 300
    }
  ],
  "result": {
    "summary": "...",
    "emailSent": true
  }
}
```

### List Workflow Executions

```http
GET /v1/workflows/:id/executions
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "executions": [
    {
      "id": "exec_123",
      "status": "completed",
      "startedAt": "2024-01-15T10:00:00Z",
      "completedAt": "2024-01-15T10:01:30Z"
    }
  ]
}
```

### Refine Workflow

Use AI to refine an existing workflow based on feedback.

```http
POST /v1/workflows/:id/refine
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "feedback": "Add a filter to only show high-priority cases"
}
```

**Response:**
```json
{
  "id": "wf_xyz789",
  "name": "Legal Case Summary",
  "nodes": [
    {
      "id": "fetch_cases",
      "type": "mcp_fetch",
      ...
    },
    {
      "id": "filter_priority",
      "type": "filter",
      "description": "Filter high-priority cases",
      "config": {
        "condition": "item.priority === 'high'"
      },
      "inputs": ["fetch_cases"]
    },
    {
      "id": "summarize",
      "type": "transform",
      ...
      "inputs": ["filter_priority"]
    }
  ]
}
```

---

## AI Workflow Builder

Use natural language to generate workflows automatically.

### Detect Workflow Intent

Analyze text to detect if it contains workflow automation intent.

```http
POST /v1/workflows/detect-intent
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "message": "I need to fetch legal cases every Monday and email me a summary",
  "conversationHistory": "User previously discussed legal research..."
}
```

**Response:**
```json
{
  "detected": true,
  "confidence": 0.95,
  "description": "Weekly automated workflow to fetch legal cases and email summary",
  "suggestedNodes": ["mcp_fetch", "transform", "action"]
}
```

### Suggest Similar Workflows

Find existing workflows similar to a request.

```http
POST /v1/workflows/suggest
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "message": "I want to summarize legal documents",
  "category": "legal"
}
```

**Response:**
```json
{
  "suggestions": [
    {
      "workflowId": "wf_xyz789",
      "workflowName": "Legal Case Summary",
      "similarity": 0.87,
      "reason": "Also summarizes legal content using AI"
    }
  ]
}
```

### Build Workflow from Natural Language

AI automatically generates a complete workflow from your description.

```http
POST /v1/workflows/build
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "message": "Fetch recent legal cases from the last week, filter high-priority ones, summarize with AI, and email me the results",
  "category": "legal",
  "execute": false
}
```

**Response:**
```json
{
  "workflow": {
    "name": "Recent Legal Cases Summary",
    "description": "Fetch, filter, summarize, and email legal cases",
    "category": "legal",
    "nodes": [
      {
        "id": "fetch_legal_cases",
        "type": "mcp_fetch",
        "description": "Fetch legal cases from last week",
        "config": {
          "serverId": "mcp_abc123",
          "serverName": "Legal Database",
          "toolName": "search_cases",
          "parameters": {
            "dateFrom": "{{last_week}}",
            "limit": 50
          }
        },
        "inputs": []
      },
      {
        "id": "filter_high_priority",
        "type": "filter",
        "description": "Filter high-priority cases",
        "config": {
          "condition": "item.priority === 'high'"
        },
        "inputs": ["fetch_legal_cases"]
      },
      {
        "id": "summarize_cases",
        "type": "transform",
        "description": "AI summarization",
        "config": {
          "type": "llm",
          "prompt": "Summarize these legal cases in bullet points, highlighting key decisions"
        },
        "inputs": ["filter_high_priority"]
      },
      {
        "id": "email_summary",
        "type": "action",
        "description": "Send email with summary",
        "config": {
          "action": "email",
          "to": "{{user_email}}",
          "subject": "Weekly Legal Cases Summary"
        },
        "inputs": ["summarize_cases"]
      }
    ]
  },
  "shouldSave": true
}
```

**Options:**
- `message`: Natural language description of workflow
- `category`: Workflow category (helps find relevant MCP servers)
- `execute`: If true, immediately execute after building

### List All Executions

Get all workflow executions across all workflows.

```http
GET /v1/executions
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "executions": [
    {
      "id": "exec_123",
      "workflowId": "wf_xyz789",
      "workflowName": "Legal Case Summary",
      "status": "completed",
      "startedAt": "2024-01-15T10:00:00Z",
      "completedAt": "2024-01-15T10:01:30Z"
    }
  ]
}
```

### Get Execution Details

```http
GET /v1/executions/:id
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "id": "exec_123",
  "workflowId": "wf_xyz789",
  "status": "completed",
  "startedAt": "2024-01-15T10:00:00Z",
  "completedAt": "2024-01-15T10:01:30Z",
  "executionLog": [
    {
      "nodeId": "fetch_cases",
      "status": "completed",
      "startedAt": "2024-01-15T10:00:00Z",
      "completedAt": "2024-01-15T10:00:01Z",
      "output": {...},
      "error": null
    }
  ],
  "result": {...}
}
```

---

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid workflow DAG: Node 'summarize' references non-existent input 'missing_node'",
    "details": {
      "field": "nodes",
      "invalidNode": "summarize"
    }
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `PROVIDER_ERROR` | 500 | LLM provider error |
| `MCP_ERROR` | 500 | MCP server communication error |
| `WORKFLOW_ERROR` | 500 | Workflow execution error |

### Rate Limiting

Rate limit headers are included in all responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1610000000
```

When rate limited:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 60 seconds.",
    "retryAfter": 60
  }
}
```
