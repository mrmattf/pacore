# Code Patterns

This document describes the coding patterns and conventions used in the shopify-backorder service.

## API Client Pattern

All external API clients follow the same structure:

```typescript
export class ServiceClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: Config) {
    this.baseUrl = `https://${config.serviceDomain}/api`;
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `...`,
    };
  }

  async methodName(params: InputType): Promise<OutputType> {
    const response = await fetch(`${this.baseUrl}/endpoint`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Service API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<OutputType>;
  }
}
```

### Key Points
- Constructor takes Config, extracts needed values
- Base URL and headers stored as instance properties
- All methods are async, return typed promises
- Error handling throws descriptive errors
- Use type assertions for `response.json()` return values

## MCP Tool Definition Pattern

Tools are defined with schemas and registered in arrays:

```typescript
// Define tools array
export const serviceTools: MCPTool[] = [
  {
    name: 'service.action_name',
    description: 'Clear description for AI agents',
    inputSchema: {
      type: 'object',
      properties: {
        param_name: {
          type: 'string',
          description: 'What this parameter does',
        },
      },
      required: ['param_name'],
    },
  },
];

// Create executor function
export function createServiceExecutor(client: ServiceClient) {
  return async (toolName: string, args: Record<string, unknown>): Promise<MCPResult> => {
    switch (toolName) {
      case 'service.action_name':
        const result = await client.methodName(args.param_name as string);
        return { success: true, data: result };
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  };
}
```

### Naming Convention
- Tool names: `service.action_name` (lowercase, dot-separated)
- Actions use verb_noun: `get_order`, `create_ticket`, `check_inventory`

## Express Middleware Pattern

Middleware functions follow Express conventions:

```typescript
function middlewareName(req: Request, res: Response, next: NextFunction) {
  // Validation logic
  if (!isValid) {
    res.status(401).json({ error: 'Error message' });
    return; // Don't call next()
  }

  // Success - continue to handler
  next();
}

// Usage
app.use('/protected', middlewareName, router);
```

### Response Pattern
- Always return after sending response
- Use explicit `return` after `res.json()` to prevent further execution
- Don't call `next()` after sending response

## Async Webhook Pattern

For webhooks that need quick acknowledgment:

```typescript
app.post('/webhook', async (req: Request, res: Response) => {
  // 1. Validate signature
  if (!verifySignature(req)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // 2. Parse payload
  let data: DataType;
  try {
    data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (error) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  // 3. Acknowledge immediately (before processing)
  res.status(200).json({ received: true });

  // 4. Process asynchronously (response already sent)
  try {
    await processData(data);
    logger.info('webhook.processed', { id: data.id });
  } catch (error) {
    logger.error('webhook.failed', error as Error);
    // Can't send error to client - already responded
  }
});
```

### Key Points
- Respond before async processing (Shopify requires <5s response)
- Error handling in async section logs but can't respond
- Parse body carefully (may be Buffer from `express.raw()`)

## Structured Logging Pattern

Use structured JSON logging with consistent event names:

```typescript
// Logger interface
logger.info('event.name', { key: value });
logger.warn('event.name', { key: value });
logger.error('event.name', error, { key: value });

// Event naming convention
// component.action.result
// Examples:
logger.info('webhook.processed.ok', { orderId: 123 });
logger.info('webhook.processed.backorder', { orderId: 123, ticketId: 456 });
logger.warn('auth.invalid.api.key', { ip: req.ip });
logger.error('webhook.processing.failed', error, { orderId: 123 });
```

### Event Name Structure
- `component`: webhook, auth, server, mcp
- `action`: processed, started, invalid, failed
- `result` (optional): ok, backorder, error

## Configuration Validation Pattern

Using Zod with empty string handling:

```typescript
import { z } from 'zod';

// Helper for optional env vars that might be empty strings
const emptyToUndefined = (val: string | undefined) =>
  val === '' || val === undefined ? undefined : val;

const configSchema = z.object({
  // Required string
  apiKey: z.string().min(1),

  // Required with validation
  email: z.string().email(),

  // Number with default
  port: z.coerce.number().default(3002),

  // Optional string
  optionalValue: z.string().optional(),

  // Optional URL (needs emptyToUndefined)
  webhookUrl: z.string().url().optional(),
});

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    apiKey: process.env.API_KEY,
    email: process.env.EMAIL,
    port: process.env.PORT,
    optionalValue: emptyToUndefined(process.env.OPTIONAL_VALUE),
    webhookUrl: emptyToUndefined(process.env.WEBHOOK_URL),
  });

  if (!result.success) {
    // Log each validation error
    result.error.issues.forEach(issue => {
      console.error(`${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }

  return result.data;
}
```

## Type Assertion Pattern

For `fetch` responses with TypeScript strict mode:

```typescript
// Wrong - returns unknown
const data = await response.json();

// Correct - explicit type assertion
const data = await response.json() as { order: ShopifyOrder };
return data.order;

// For direct returns
return response.json() as Promise<GorgiasTicket>;
```

## Error Response Pattern

Consistent error responses across all endpoints:

```typescript
// Validation error
res.status(400).json({ error: 'Invalid order ID' });

// Authentication error
res.status(401).json({ error: 'Missing Authorization header' });
res.status(401).json({ error: 'Invalid API key' });
res.status(401).json({ error: 'Invalid signature' });

// Server error
res.status(500).json({ error: 'Internal server error' });
res.status(500).json({ error: (error as Error).message });
```

### Structure
- Always use `{ error: string }` format
- Use appropriate HTTP status codes
- Error messages should be user-friendly but not expose internals
