import { MCPTool, MCPToolResult } from '../types';
import { ShopifyClient } from '../../clients/shopify';

// Tool definitions
export const shopifyTools: MCPTool[] = [
  {
    name: 'shopify_get_order',
    description: 'Get detailed information about a Shopify order including customer info and line items',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'number',
          description: 'The Shopify order ID',
        },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'shopify_check_inventory',
    description: 'Check inventory levels for product variants. Returns available quantity for each variant.',
    inputSchema: {
      type: 'object',
      properties: {
        variant_ids: {
          type: 'array',
          description: 'Array of Shopify variant IDs to check inventory for',
          items: { type: 'number' },
        },
      },
      required: ['variant_ids'],
    },
  },
];

// Tool implementations
export class ShopifyToolExecutor {
  constructor(private client: ShopifyClient) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      switch (toolName) {
        case 'shopify_get_order':
          return await this.getOrder(args.order_id as number);

        case 'shopify_check_inventory':
          return await this.checkInventory(args.variant_ids as number[]);

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private async getOrder(orderId: number): Promise<MCPToolResult> {
    const order = await this.client.getOrder(orderId);
    return {
      success: true,
      data: {
        id: order.id,
        order_number: order.order_number,
        email: order.email,
        customer: order.customer,
        line_items: order.line_items.map(item => ({
          id: item.id,
          variant_id: item.variant_id,
          product_id: item.product_id,
          title: item.title,
          quantity: item.quantity,
          price: item.price,
          sku: item.sku,
        })),
        total_price: order.total_price,
        created_at: order.created_at,
      },
    };
  }

  private async checkInventory(variantIds: number[]): Promise<MCPToolResult> {
    const inventoryMap = await this.client.checkInventory(variantIds);

    const inventory = variantIds.map(variantId => ({
      variant_id: variantId,
      available: inventoryMap.get(variantId) ?? 0,
      is_backordered: (inventoryMap.get(variantId) ?? 0) < 0,
    }));

    return {
      success: true,
      data: { inventory },
    };
  }
}
