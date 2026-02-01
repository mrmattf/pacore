# ADR-003: Authentication Strategy

## Status
Accepted

## Context

The service has multiple types of endpoints with different security requirements:

1. **Health check**: Needs to be public for monitoring/load balancers
2. **Shopify webhooks**: Called by Shopify, cannot add custom auth headers
3. **MCP/API endpoints**: Called by internal systems and AI agents

We needed a strategy that protects endpoints appropriately without breaking integrations.

## Decision

Implement a tiered authentication strategy:

### Tier 1: Public (No Auth)
- `GET /health` - Health check endpoint
- Used by load balancers, monitoring systems

### Tier 2: HMAC Signature (Shopify Webhooks)
- `POST /webhook/*` - Shopify webhook endpoints
- Verify `X-Shopify-Hmac-Sha256` header
- Uses `SHOPIFY_WEBHOOK_SECRET` for validation
- Signature is optional (for development) but recommended

```typescript
function verifyShopifyWebhook(req: Request, secret: string): boolean {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const hash = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}
```

### Tier 3: API Key (Protected Endpoints)
- `POST /mcp/*` - MCP tool endpoints
- `POST /trigger/:orderId` - Manual trigger
- Requires `Authorization: Bearer <API_SECRET>` header
- Uses constant-time comparison to prevent timing attacks

## Consequences

### Positive
- Clear separation of auth requirements by endpoint type
- Shopify integration works out of the box
- API endpoints are protected from unauthorized access
- Timing-safe comparisons prevent attack vectors

### Negative
- API key is static (no rotation mechanism)
- No per-user authentication (single shared key)
- HMAC verification optional for flexibility (security tradeoff)

### Future Improvements
- Add API key rotation support
- Implement per-client keys with scopes
- Add rate limiting per key
- Consider JWT for pacore integration
