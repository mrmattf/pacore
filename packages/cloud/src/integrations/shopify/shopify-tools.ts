import { MCPTool, MCPToolResult } from '@pacore/core';
import { ShopifyApiClient } from './shopify-api-client';

export const shopifyMcpTools: MCPTool[] = [
  {
    name: 'shopify.get_order',
    description: 'Fetch a Shopify order by its internal ID',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'number', description: 'Shopify internal order ID (not order number)' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'shopify.check_inventory',
    description: 'Check inventory levels for a list of variant IDs',
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
];

export class ShopifyToolExecutor {
  constructor(private client: ShopifyApiClient) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      switch (toolName) {
        case 'shopify.get_order': {
          const order = await this.client.getOrder(args.order_id as number);
          return { success: true, data: order };
        }
        case 'shopify.check_inventory': {
          const items = await this.client.checkInventory(args.variant_ids as number[]);
          return { success: true, data: { inventory: items } };
        }
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
}
