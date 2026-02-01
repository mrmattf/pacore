# ADR-005: Zod for Configuration Validation

## Status
Accepted

## Context

Configuration management in Node.js services typically involves:
1. Reading environment variables
2. Providing defaults
3. Validating required values
4. Type safety in TypeScript

Common approaches:
- Manual validation (error-prone)
- joi/yup (runtime validation, no type inference)
- env-var (lightweight but limited)
- zod (runtime validation with TypeScript inference)

## Decision

Use Zod for configuration validation with a helper for empty string handling:

```typescript
import { z } from 'zod';

// Helper to treat empty strings as undefined (for optional fields)
const emptyToUndefined = (val: string | undefined) =>
  val === '' || val === undefined ? undefined : val;

const configSchema = z.object({
  port: z.coerce.number().default(3002),
  apiSecret: z.string().min(16, 'API_SECRET must be at least 16 characters'),
  shopifyStoreDomain: z.string().min(1),
  shopifyAccessToken: z.string().min(1),
  shopifyWebhookSecret: z.string().optional(),
  gorgiasDomain: z.string().min(1),
  gorgiasApiKey: z.string().min(1),
  gorgiasApiEmail: z.string().email(),
  slackWebhookUrl: z.string().url().optional(),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    port: process.env.PORT,
    apiSecret: process.env.API_SECRET,
    // ... using emptyToUndefined for optional fields
    slackWebhookUrl: emptyToUndefined(process.env.SLACK_WEBHOOK_URL),
  });

  if (!result.success) {
    console.error('Configuration validation failed:');
    result.error.issues.forEach(issue => {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }

  return result.data;
}
```

### The Empty String Problem

Environment variables set to empty strings (`SLACK_WEBHOOK_URL=""`) were causing Zod URL validation to fail. The `emptyToUndefined` helper converts empty strings to `undefined` before validation, allowing optional fields to work correctly.

## Consequences

### Positive
- Type-safe configuration (TypeScript inference)
- Clear validation error messages at startup
- Fail-fast on missing/invalid config
- Self-documenting schema
- Coercion for numeric values (`z.coerce.number()`)

### Negative
- Additional dependency (zod)
- Learning curve for Zod syntax
- Empty string edge case required custom handling

### Alternative Considered
Using `z.preprocess()` for empty string handling:
```typescript
slackWebhookUrl: z.preprocess(
  (val) => val === '' ? undefined : val,
  z.string().url().optional()
)
```
Chose separate helper function for clarity and reusability.
