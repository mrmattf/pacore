import { Pool } from 'pg';

/** Well-known IDs for platform-managed MCP servers. */
export const PLATFORM_SERVER_IDS = {
  shopify:  'platform:shopify',
  gorgias:  'platform:gorgias',
  zendesk:  'platform:zendesk',
  skills:   'platform:skills',
} as const;

/**
 * Auto-register platform-hosted internal MCP servers in the mcp_servers table.
 * These servers are mounted as internal Express sub-routers — not external HTTP services.
 * The URL is the internal route path used by MCPRegistry to route tool calls.
 *
 * Call once at startup after MCPRegistry.initialize().
 */
export async function registerPlatformMCPServers(db: Pool): Promise<void> {
  const servers = [
    {
      id:         PLATFORM_SERVER_IDS.shopify,
      name:       'Shopify (Platform)',
      categories: ['shopify', 'ecommerce'],
      route:      '/internal/mcp/shopify',
    },
    {
      id:         PLATFORM_SERVER_IDS.gorgias,
      name:       'Gorgias (Platform)',
      categories: ['notification', 'support'],
      route:      '/internal/mcp/gorgias',
    },
    {
      id:         PLATFORM_SERVER_IDS.zendesk,
      name:       'Zendesk (Platform)',
      categories: ['notification', 'support'],
      route:      '/internal/mcp/zendesk',
    },
    {
      id:         PLATFORM_SERVER_IDS.skills,
      name:       'PA Core Skills',
      categories: ['skills', 'platform'],
      route:      '/internal/mcp/skills',
    },
  ];

  for (const server of servers) {
    await db.query(
      `INSERT INTO mcp_servers (id, name, server_type, protocol, connection_config, categories)
       VALUES ($1, $2, 'platform', 'internal', $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         connection_config = EXCLUDED.connection_config`,
      [
        server.id,
        server.name,
        JSON.stringify({ route: server.route }),
        server.categories,
      ]
    );
    console.log(`[PlatformServers] Registered ${server.id} → ${server.route}`);
  }
}
