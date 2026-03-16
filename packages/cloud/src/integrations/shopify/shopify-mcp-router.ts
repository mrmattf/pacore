import { Router, Request, Response } from 'express';
import { CredentialManager } from '../../mcp/credential-manager';
import { AdapterRegistry } from '../adapter-registry';

const TOOLS = [
  {
    name: 'shopify__get_order',
    description: 'Fetch a Shopify order by ID. Returns order details including line items.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'number', description: 'Shopify order ID' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'shopify__check_inventory',
    description: 'Check inventory levels for one or more variant IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        variant_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'List of Shopify variant IDs',
        },
      },
      required: ['variant_ids'],
    },
  },
  {
    name: 'shopify__get_variant_metafields',
    description: 'Fetch all metafields for a product variant.',
    inputSchema: {
      type: 'object',
      properties: {
        variant_id: { type: 'number', description: 'Shopify variant ID' },
      },
      required: ['variant_id'],
    },
  },
];

/**
 * Express router for the internal Shopify MCP endpoint.
 * Mounted at /internal/mcp/shopify by the gateway.
 * Delegates all capability dispatch to AdapterRegistry — no tool-specific switch statement.
 * getVariantMetafields logic lives in ShopifyOrderAdapter.getVariantMetafields().
 */
export function createShopifyMcpRouter(
  credentialManager: CredentialManager,
  adapterRegistry: AdapterRegistry
): Router {
  const router = Router();

  router.post('/tools/list', (_req: Request, res: Response) => {
    res.json({ tools: TOOLS });
  });

  router.post('/tools/call', async (req: Request, res: Response) => {
    const { name, arguments: args } = req.body as { name: string; arguments: Record<string, unknown> };
    const connectionId = req.headers['x-connection-id'] as string;
    const orgId        = req.headers['x-org-id']        as string;

    if (!connectionId || !orgId) {
      return res.status(400).json({ error: 'Missing X-Connection-Id or X-Org-Id header' });
    }

    try {
      const creds = await credentialManager.getCredentials(
        { type: 'org', orgId },
        connectionId
      );
      if (!creds) {
        return res.status(401).json({ error: 'No credentials found for connection' });
      }

      const capability = name.replace('shopify__', '');
      const result = await adapterRegistry.invokeCapability(
        'shopify',
        capability,
        args,
        creds as Record<string, unknown>
      );

      res.json({ content: [{ type: 'text', text: JSON.stringify(result) }] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes('does not support capability') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  return router;
}
