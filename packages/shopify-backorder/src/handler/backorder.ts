import { ShopifyOrder, ShopifyLineItem } from '../clients/shopify';
import { MCPServer } from '../mcp/server';
import { logger, alertSlack } from '../logger';
import {
  BackorderedItem,
  renderBackorderEmailHtml
} from '../templates/backorder-email';

export interface BackorderResult {
  orderId: number;
  orderNumber: number;
  hasBackorders: boolean;
  backorderedItems: BackorderedItem[];
  ticketId?: number;
  emailSent: boolean;
}

export async function handleBackorderCheck(
  order: ShopifyOrder,
  mcp: MCPServer
): Promise<BackorderResult> {
  const result: BackorderResult = {
    orderId: order.id,
    orderNumber: order.order_number,
    hasBackorders: false,
    backorderedItems: [],
    emailSent: false,
  };

  logger.info('backorder.check.start', {
    orderId: order.id,
    orderNumber: order.order_number,
    itemCount: order.line_items.length
  });

  // Get variant IDs from line items
  const variantIds = order.line_items
    .map(item => item.variant_id)
    .filter(id => id != null);

  // Check inventory using MCP tool
  const inventoryResult = await mcp.callTool('shopify.check_inventory', {
    variant_ids: variantIds,
  });

  if (!inventoryResult.success) {
    logger.error('backorder.inventory.failed', new Error(inventoryResult.error || 'Unknown error'), {
      orderId: order.id,
    });
    throw new Error(`Failed to check inventory: ${inventoryResult.error}`);
  }

  const inventoryData = inventoryResult.data as {
    inventory: Array<{ variant_id: number; available: number; is_backordered: boolean }>;
  };

  // Build inventory map
  const inventoryMap = new Map<number, number>();
  for (const item of inventoryData.inventory) {
    inventoryMap.set(item.variant_id, item.available);
  }

  // Identify backordered items
  const backorderedItems: BackorderedItem[] = [];
  const availableItems: ShopifyLineItem[] = [];

  for (const item of order.line_items) {
    const available = inventoryMap.get(item.variant_id) ?? 0;

    if (available < 0) {
      // Item is backordered (negative inventory)
      backorderedItems.push({
        lineItem: item,
        available: Math.max(0, item.quantity + available), // What we can ship
        backordered: Math.abs(available), // What's backordered
      });
    } else {
      availableItems.push(item);
    }
  }

  if (backorderedItems.length === 0) {
    logger.info('backorder.check.none', {
      orderId: order.id,
      orderNumber: order.order_number
    });
    return result;
  }

  // We have backorders
  result.hasBackorders = true;
  result.backorderedItems = backorderedItems;

  logger.info('backorder.detected', {
    orderId: order.id,
    orderNumber: order.order_number,
    backorderedCount: backorderedItems.length,
    items: backorderedItems.map(b => ({
      title: b.lineItem.title,
      sku: b.lineItem.sku,
      backordered: b.backordered,
    })),
  });

  // Create Gorgias ticket with email using MCP tool
  try {
    const customerName = order.customer
      ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
      : 'Customer';

    const emailHtml = renderBackorderEmailHtml(order, backorderedItems, availableItems);

    const ticketResult = await mcp.callTool('gorgias.create_ticket', {
      customer_email: order.email,
      customer_name: customerName,
      subject: `Order #${order.order_number} - Some items are backordered`,
      message: emailHtml,
      tags: ['backorder', 'automated'],
    });

    if (!ticketResult.success) {
      throw new Error(ticketResult.error || 'Failed to create ticket');
    }

    const ticketData = ticketResult.data as { ticket_id: number };
    result.ticketId = ticketData.ticket_id;
    result.emailSent = true;

    logger.info('backorder.ticket.created', {
      orderId: order.id,
      orderNumber: order.order_number,
      ticketId: ticketData.ticket_id,
    });

    await alertSlack(
      `Backorder detected for Order #${order.order_number}. ` +
      `${backorderedItems.length} item(s) affected. Ticket #${ticketData.ticket_id} created.`,
      'info'
    );

  } catch (error) {
    logger.error('backorder.ticket.failed', error as Error, {
      orderId: order.id,
      orderNumber: order.order_number,
    });

    await alertSlack(
      `Failed to create ticket for Order #${order.order_number}: ${(error as Error).message}`,
      'error'
    );

    throw error;
  }

  return result;
}
