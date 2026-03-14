# PA Core API Reference

## API Design Conventions

These conventions apply to all current and future endpoints. Follow them when adding new APIs.

### URL Structure
- `/v1/me/...` — user-scoped resources (skills, connections the user owns)
- `/v1/skill-types/...` — platform catalog (read-only for users)
- `/v1/integrations/...` — integration metadata and connections
- `/v1/mcp/...` — MCP server management
- `/v1/triggers/...` — inbound event entry points (webhooks)

### Authentication
All endpoints require `Authorization: Bearer <jwt>` except webhook trigger endpoints (which use a per-skill token in the URL path).

```http
Authorization: Bearer eyJhbGci...
```

### Naming
- URL paths: `kebab-case` (e.g., `/skill-types`, `/adapter-registry`)
- JSON keys: `camelCase` (e.g., `{ "templateId": "...", "slotConnections": [] }`)

### Error Responses
```json
{
  "error": "Human-readable message",
  "code": "OPTIONAL_MACHINE_CODE"
}
```
Standard HTTP status codes: 400 (bad request), 401 (unauthenticated), 403 (forbidden), 404 (not found), 409 (conflict), 500 (internal).

### Webhook / Async Endpoints
Inbound webhook endpoints (`POST /v1/triggers/webhook/:token`) return `200` immediately and process asynchronously. Never block on downstream integrations.

### Idempotency
Mutation endpoints that may be retried accept an optional `Idempotency-Key` header. Skill executions use SHA-256 idempotency keys internally to deduplicate.

### Pagination
Not yet standardized — endpoints return full lists. When adding pagination, use `?limit=N&offset=N` query params and include `{ total, limit, offset, items }` in the response.

---

## Authentication

### Register
```http
POST /v1/auth/register
Content-Type: application/json

{ "email": "user@example.com", "password": "SecurePassword123!" }
```

### Login
```http
POST /v1/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "SecurePassword123!" }
```

**Response:**
```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "...",
  "user": { "id": "...", "email": "user@example.com" }
}
```

### Refresh Token
```http
POST /v1/auth/refresh
Content-Type: application/json

{ "refreshToken": "..." }
```

---

## Chat

### Send Message
```http
POST /v1/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "messages": [{ "role": "user", "content": "Hello" }],
  "options": {
    "providerId": "anthropic",
    "model": "claude-sonnet-4-6",
    "temperature": 0.7
  }
}
```

### WebSocket (Real-time)
```
WS /ws
Authorization: Bearer <token>   (sent as first message after connect)
```

---

## Skills

### List Skill Types (Catalog)
```http
GET /v1/skill-types
Authorization: Bearer <token>
```
Returns all available skill types with template counts.

### List Templates for a Skill Type
```http
GET /v1/skill-types/:typeId/templates
Authorization: Bearer <token>
```

### Get User's Active Skills
```http
GET /v1/me/skills
Authorization: Bearer <token>
```

### Activate a Skill
```http
POST /v1/me/skills/:typeId/activate
Authorization: Bearer <token>
Content-Type: application/json

{ "templateId": "backorder-gorgias-v1" }
```

### Configure a Skill (Slot Connections + Field Overrides)
```http
PUT /v1/me/skills/:id/configure
Authorization: Bearer <token>
Content-Type: application/json

{
  "slotConnections": {
    "shopify": "conn_abc123",
    "gorgias": "conn_def456"
  },
  "fieldOverrides": {
    "subject": "Custom subject line"
  }
}
```

### Pause / Resume a Skill
```http
PUT /v1/me/skills/:id/pause
PUT /v1/me/skills/:id/resume
Authorization: Bearer <token>
```

### Remove a Skill
```http
DELETE /v1/me/skills/:id
Authorization: Bearer <token>
```

### Skill Execution History
```http
GET /v1/me/skills/:id/executions
Authorization: Bearer <token>
```

---

## Integrations

### Get Credential Fields for an Integration
```http
GET /v1/integrations/:key/fields
Authorization: Bearer <token>
```
Returns the field definitions needed to connect (e.g., `shopify` → `{ domain, accessToken }`).

### List Saved Connections
```http
GET /v1/integrations/:key/connections
Authorization: Bearer <token>
```

### Save a New Connection
```http
POST /v1/integrations/:key/connections
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "My Shopify Store", "credentials": { "domain": "...", "accessToken": "..." } }
```

---

## Webhooks

### Inbound Webhook Entry Point
```http
POST /v1/triggers/webhook/:token
Content-Type: application/json

<webhook payload from Shopify, AfterShip, etc.>
```

- Returns `200` immediately (async processing)
- `:token` is the per-skill webhook token from skill activation
- No `Authorization` header — the token in the URL IS the auth

---

## MCP Servers

### List MCP Servers
```http
GET /v1/mcp/servers
Authorization: Bearer <token>
```

### Register MCP Server
```http
POST /v1/mcp/servers
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My MCP Server",
  "serverType": "sse",
  "url": "https://my-server.com/mcp/sse"
}
```

### Get Server Tools
```http
GET /v1/mcp/servers/:id/tools
Authorization: Bearer <token>
```

### Execute a Tool
```http
POST /v1/mcp/servers/:id/execute
Authorization: Bearer <token>
Content-Type: application/json

{ "tool": "tool_name", "arguments": { ... } }
```
