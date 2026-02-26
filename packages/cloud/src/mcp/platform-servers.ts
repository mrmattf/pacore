import { Pool } from 'pg';

/** Well-known IDs for platform-managed MCP servers. Use these in tool chains to look up servers. */
export const PLATFORM_SERVER_IDS = {
  shopifyGorgias: 'platform-shopify-gorgias',
} as const;

/**
 * Auto-register platform-hosted MCP servers based on environment variables.
 * Call once at startup after MCPRegistry.initialize().
 *
 * Env vars:
 *   PLATFORM_MCP_SHOPIFY_GORGIAS_URL    — URL of the hosted shopify-backorder service
 *   PLATFORM_MCP_SHOPIFY_GORGIAS_SECRET — API_SECRET of that service (used as Bearer token)
 *
 * If the URL var is not set, nothing is registered. Safe to call on every startup (idempotent).
 */
export async function registerPlatformMCPServers(db: Pool): Promise<void> {
  const shopifyGorgiasUrl = process.env.PLATFORM_MCP_SHOPIFY_GORGIAS_URL;
  const shopifyGorgiasSecret = process.env.PLATFORM_MCP_SHOPIFY_GORGIAS_SECRET;

  if (shopifyGorgiasUrl) {
    await db.query(
      `INSERT INTO mcp_servers (id, name, server_type, protocol, connection_config, categories)
       VALUES ($1, $2, 'platform', 'http', $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         connection_config = EXCLUDED.connection_config`,
      [
        PLATFORM_SERVER_IDS.shopifyGorgias,
        'Shopify + Gorgias (Platform)',
        JSON.stringify({
          url: shopifyGorgiasUrl,
          ...(shopifyGorgiasSecret ? { apiKey: shopifyGorgiasSecret } : {}),
        }),
        ['shopify', 'notification'],
      ]
    );
    console.log(`[PlatformServers] Registered platform-shopify-gorgias → ${shopifyGorgiasUrl}`);
  }
}
