# Architecture

## System Overview

The Shopify Backorder Service is a webhook-driven microservice that monitors Shopify orders for inventory issues and automatically creates customer support tickets in Gorgias.

```
┌─────────────┐     Webhook      ┌──────────────────────┐
│   Shopify   │ ───────────────► │  Backorder Service   │
│   Store     │                  │  (Express + MCP)     │
└─────────────┘                  └──────────┬───────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
            ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
            │ Shopify API   │      │ Gorgias API   │      │ Slack Alerts  │
            │ (Inventory)   │      │ (Tickets)     │      │ (Optional)    │
            └───────────────┘      └───────────────┘      └───────────────┘
```

## Data Flow

### Order Created Flow

1. Customer places order on Shopify
2. Shopify sends `orders/create` webhook to `/webhook/orders/create`
3. Service validates HMAC signature
4. Service acknowledges webhook (200 OK) within 5 seconds
5. Async processing begins:
   - Extract variant IDs from line items
   - Check inventory levels via Shopify API
   - Compare ordered quantity vs available
   - If backorder detected: create Gorgias ticket
6. Log result and optionally alert to Slack

### Manual Trigger Flow

1. API client calls `POST /trigger/:orderId` with Bearer token
2. Service fetches order from Shopify
3. Runs same backorder check logic
4. Returns result synchronously

### MCP Tool Call Flow

1. AI agent calls `POST /mcp/tools/call` with tool name and arguments
2. Service validates request against tool schema
3. Executes appropriate client method
4. Returns structured result for agent consumption

## Component Responsibilities

### Express Server (`src/index.ts`)

- Route registration and middleware
- Authentication (API key, HMAC)
- Request/response handling
- Server lifecycle management

### Configuration (`src/config.ts`)

- Environment variable loading
- Zod schema validation
- Type-safe config object
- Empty string to undefined conversion for optionals

### MCP Server (`src/mcp/server.ts`)

- Tool registration and discovery
- JSON-RPC 2.0 endpoint (`/mcp/rpc`)
- REST endpoint (`/mcp/tools/call`)
- Tool schema validation
- Result formatting

### Clients (`src/clients/`)

- API communication abstraction
- Authentication handling
- Response parsing
- Error standardization

### Handler (`src/handler/`)

- Business logic implementation
- Orchestrates client calls via MCP
- Decision making (when to create tickets)
- Message formatting

## Security Model

### Authentication Layers

1. **Public**: Health check only
2. **HMAC Protected**: Shopify webhooks (signature verification)
3. **API Key Protected**: All other endpoints (Bearer token)

### Security Measures

- Constant-time comparison for secrets (timing attack prevention)
- HMAC-SHA256 for webhook integrity
- Minimum secret length enforcement (16 chars)
- No secrets in logs

## External Dependencies

| Service | Purpose | Auth Method |
|---------|---------|-------------|
| Shopify Admin API | Orders, inventory | Access token header |
| Gorgias API | Support tickets | Basic auth (email:key) |
| Slack Webhooks | Alerts (optional) | Webhook URL |

## Deployment Architecture

### Current (Railway)

```
┌────────────────────────────────────────┐
│  Railway                               │
│  ┌──────────────────────────────────┐  │
│  │  Docker Container                │  │
│  │  ┌────────────────────────────┐  │  │
│  │  │  Node.js 18                │  │  │
│  │  │  Express Server            │  │  │
│  │  │  Port: $PORT (3002)        │  │  │
│  │  └────────────────────────────┘  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Environment Variables                 │
│  - API_SECRET                          │
│  - SHOPIFY_*                           │
│  - GORGIAS_*                           │
│  - SLACK_WEBHOOK_URL                   │
└────────────────────────────────────────┘
```

### Future (pacore Integration)

```
┌─────────────────────────────────────────────────────┐
│  pacore Platform                                    │
│  ┌───────────────┐  ┌───────────────┐              │
│  │  Workflow     │  │  Agent        │              │
│  │  Engine       │──│  Runtime      │              │
│  └───────┬───────┘  └───────┬───────┘              │
│          │                  │                       │
│          ▼                  ▼                       │
│  ┌─────────────────────────────────────┐           │
│  │  MCP Tool Registry                   │           │
│  │  - shopify.get_order                 │           │
│  │  - shopify.check_inventory           │           │
│  │  - gorgias.create_ticket             │           │
│  │  - gorgias.add_message               │           │
│  └─────────────────────────────────────┘           │
└─────────────────────────────────────────────────────┘
```

## Scalability Considerations

### Current Limitations

- Single instance (no horizontal scaling)
- Synchronous inventory checks (sequential API calls)
- No request queuing or rate limiting
- In-memory only (no persistence)

### Future Improvements

- Add Redis for rate limiting and caching
- Implement job queue for async processing
- Add database for audit logging
- Support multiple Shopify stores
