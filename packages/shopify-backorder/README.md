# Shopify Backorder Service

Automatically detects backordered items in Shopify orders and sends customer notifications via Gorgias.

## Features

- Webhook listener for Shopify `orders/create` events
- Automatic inventory check for all line items
- Creates Gorgias tickets with backorder details
- Sends formatted email offering partial shipment options
- Slack alerts for backorder events and errors
- Structured JSON logging
- **MCP Server** with tools for agent integration

## MCP Tools

This service exposes MCP (Model Context Protocol) tools that can be used by AI agents:

| Tool | Description |
|------|-------------|
| `shopify.get_order` | Get detailed order information including customer and line items |
| `shopify.check_inventory` | Check inventory levels for product variants |
| `gorgias.create_ticket` | Create a support ticket and send email to customer |
| `gorgias.add_message` | Add a message to an existing ticket |

### MCP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | JSON-RPC 2.0 endpoint |
| `/mcp/tools` | GET | List available tools |
| `/mcp/tools/:toolName/call` | POST | Call a specific tool (REST-style) |

### Example: Call MCP Tool

```bash
# List tools
curl http://localhost:3002/mcp/tools

# Call tool via REST
curl -X POST http://localhost:3002/mcp/tools/shopify.get_order/call \
  -H "Content-Type: application/json" \
  -d '{"order_id": 12345}'

# Call tool via JSON-RPC
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "shopify.check_inventory",
      "arguments": {"variant_ids": [123, 456]}
    }
  }'
```

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Shopify store with Admin API access
- Gorgias account with API access

### 2. Shopify Setup

1. Go to **Settings → Apps and sales channels → Develop apps**
2. Create a new app (or use existing)
3. Configure Admin API scopes:
   - `read_orders`
   - `read_products`
   - `read_inventory`
4. Install the app and copy the **Admin API access token**

### 3. Gorgias Setup

1. Go to **Settings → REST API**
2. Create a new API key
3. Copy the **API key** and note your **email address**
4. Your Gorgias domain is: `your-store.gorgias.com`

### 4. Deploy

#### Option A: Railway (Recommended)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

1. Connect your GitHub repo
2. Select the `packages/shopify-backorder` directory
3. Add environment variables (see below)
4. Deploy

#### Option B: Manual

```bash
# From repo root
cd packages/shopify-backorder

# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Build and run
pnpm build
pnpm start
```

### 5. Configure Webhook in Shopify

1. Go to **Settings → Notifications → Webhooks**
2. Click **Create webhook**
3. Event: `Order creation`
4. URL: `https://your-deployment-url.com/webhook/orders/create`
5. Format: `JSON`
6. Save and copy the **Webhook secret**
7. Add `SHOPIFY_WEBHOOK_SECRET` to your environment

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3002) |
| `SHOPIFY_STORE_DOMAIN` | Yes | e.g., `my-store.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Yes | Admin API access token |
| `SHOPIFY_WEBHOOK_SECRET` | No | Webhook signature verification |
| `GORGIAS_DOMAIN` | Yes | e.g., `my-store.gorgias.com` |
| `GORGIAS_API_KEY` | Yes | REST API key |
| `GORGIAS_API_EMAIL` | Yes | Email associated with API key |
| `SLACK_WEBHOOK_URL` | No | Slack incoming webhook for alerts |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (includes MCP tools list) |
| `/webhook/orders/create` | POST | Shopify webhook receiver |
| `/trigger/:orderId` | POST | Manual trigger for testing |
| `/mcp` | POST | MCP JSON-RPC endpoint |
| `/mcp/tools` | GET | List MCP tools |

## Testing

### Manual Test

```bash
# Trigger backorder check for a specific order
curl -X POST http://localhost:3002/trigger/ORDER_ID
```

### Simulate Webhook

```bash
curl -X POST http://localhost:3002/webhook/orders/create \
  -H "Content-Type: application/json" \
  -d '{"id": 123, "order_number": 1001, "email": "customer@example.com", ...}'
```

## How It Works

```
1. Shopify creates order
          ↓
2. Webhook fires to /webhook/orders/create
          ↓
3. MCP tool: shopify.check_inventory
          ↓
4. If any item has negative inventory (backordered):
   - MCP tool: gorgias.create_ticket
   - Sends customer email with options
   - Alerts Slack (if configured)
          ↓
5. Support team tracks customer response in Gorgias
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Shopify Backorder Service                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────┐  │
│  │   Webhook    │     │  MCP Server  │     │   Alerts   │  │
│  │   Handler    │────▶│              │────▶│   (Slack)  │  │
│  │              │     │  4 tools     │     │            │  │
│  └──────────────┘     └──────┬───────┘     └────────────┘  │
│                              │                              │
│         ┌────────────────────┴────────────────────┐        │
│         ▼                                         ▼        │
│  ┌─────────────┐                          ┌─────────────┐  │
│  │  Shopify    │                          │   Gorgias   │  │
│  │  Client     │                          │   Client    │  │
│  │             │                          │             │  │
│  │ • get_order │                          │ • create_   │  │
│  │ • check_inv │                          │   ticket    │  │
│  └─────────────┘                          └─────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Logging

Logs are structured JSON for easy parsing:

```json
{"level":"info","event":"backorder.detected","orderId":123,"orderNumber":1001,"timestamp":"2025-01-30T..."}
{"level":"info","event":"mcp.tool.call","tool":"gorgias.create_ticket","timestamp":"2025-01-30T..."}
```

View logs in Railway/Render dashboard or pipe to your logging service.

## Migration Path

This service is designed to evolve:

1. **Phase 1 (Current)**: Standalone service with MCP tools + fixed logic
2. **Phase 2**: Add LLM agent that uses MCP tools for intelligent decisions
3. **Phase 3**: Migrate to pacore workflow engine
4. **Phase 4**: Full pacore platform integration

## Troubleshooting

### Webhook not firing
- Verify webhook URL is publicly accessible
- Check Shopify webhook logs in Settings → Notifications
- Ensure SSL certificate is valid

### Inventory always showing 0
- Verify `read_inventory` scope is enabled
- Check if products have inventory tracking enabled
- Verify correct location is being checked

### Gorgias ticket not created
- Verify API key and email are correct
- Check that sender email matches a connected integration
- Review Gorgias API logs

## License

MIT
