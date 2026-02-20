import { z } from 'zod';

// Helper to convert empty strings to undefined
const emptyToUndefined = (val: string | undefined) =>
  val === '' || val === undefined ? undefined : val;

// Helper to properly parse boolean env vars (z.coerce.boolean treats "false" as true!)
const parseBoolean = (val: string | undefined): boolean =>
  val?.toLowerCase() === 'true' || val === '1';

const configSchema = z.object({
  port: z.coerce.number().default(3002),

  // API Security
  apiSecret: z.string().min(16, 'API_SECRET must be at least 16 characters'),

  // Shopify
  shopifyStoreDomain: z.string().min(1),
  shopifyAccessToken: z.string().min(1),
  shopifyWebhookSecret: z.string().optional(),

  // Gorgias (optional - set GORGIAS_ENABLED=true to enable)
  gorgiasEnabled: z.boolean().default(false),
  gorgiasDomain: z.string().optional(),
  gorgiasApiKey: z.string().optional(),
  gorgiasApiEmail: z.string().optional(),

  // Alerts
  slackWebhookUrl: z.string().url().optional(),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    port: process.env.PORT,
    apiSecret: process.env.API_SECRET,
    shopifyStoreDomain: process.env.SHOPIFY_STORE_DOMAIN,
    shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    shopifyWebhookSecret: emptyToUndefined(process.env.SHOPIFY_WEBHOOK_SECRET),
    gorgiasEnabled: parseBoolean(process.env.GORGIAS_ENABLED),
    gorgiasDomain: emptyToUndefined(process.env.GORGIAS_DOMAIN),
    gorgiasApiKey: emptyToUndefined(process.env.GORGIAS_API_KEY),
    gorgiasApiEmail: emptyToUndefined(process.env.GORGIAS_API_EMAIL),
    slackWebhookUrl: emptyToUndefined(process.env.SLACK_WEBHOOK_URL),
  });

  if (!result.success) {
    console.error('Configuration error:', result.error.format());
    process.exit(1);
  }

  return result.data;
}
