/**
 * Backorder Detection Tool Chain
 *
 * This is the deterministic execution path for backorder detection.
 * It follows the agent-first architecture:
 * - Agent decides WHEN to invoke this chain
 * - Chain executes HOW (deterministic sequence of MCP tool calls)
 *
 * Chain steps:
 * 1. Check inventory for order line items (shopify.check_inventory)
 * 2. Identify backordered items
 * 3. Send appropriate email via gorgias.create_ticket:
 *    - ALL items backordered → all-backordered notification (no A/B choice)
 *    - SOME items backordered → partial backorder email (Option A = reply, Option B = silent default)
 * 4. Return result
 *
 * The chain is called by:
 * - Webhook handler (current - Phase 1)
 * - AI agent (future - Phase 2)
 */

import { ShopifyOrder, ShopifyLineItem } from '../clients/shopify';
import { MCPServer } from '../mcp/server';
import { logger, alertSlack } from '../logger';
import {
  BackorderedItem,
  renderPartialBackorderEmailHtml,
  renderAllBackorderedEmailHtml,
} from '../templates/backorder-email';
import { getTemplateConfig } from '../templates/template-store';

export interface BackorderChainInput {
  order: ShopifyOrder;
}

export interface BackorderChainResult {
  orderId: number;
  orderNumber: number;
  hasBackorders: boolean;
  backorderedItems: BackorderedItem[];
  ticketId?: number;
  emailSent: boolean;
}

/**
 * Execute the backorder detection chain.
 *
 * This is a deterministic tool chain that:
 * 1. Checks inventory via MCP tool
 * 2. Identifies backordered items
 * 3. Creates Gorgias ticket with the appropriate email:
 *    - Partial backorder: Option A (reply) / Option B (no reply needed — silent default)
 *    - All backordered: informational email only, no A/B choice
 *
 * @param input - The order to check
 * @param mcp - MCP server for tool calls
 * @returns Result with backorder details and ticket info
 */
export async function executeBackorderChain(
  input: BackorderChainInput,
  mcp: MCPServer
): Promise<BackorderChainResult> {
  const { order } = input;

  const result: BackorderChainResult = {
    orderId: order.id,
    orderNumber: order.order_number,
    hasBackorders: false,
    backorderedItems: [],
    emailSent: false,
  };

  logger.info('chain.backorder.start', {
    orderId: order.id,
    orderNumber: order.order_number,
    itemCount: order.line_items.length
  });

  // Step 1: Get variant IDs from line items
  const variantIds = order.line_items
    .map(item => item.variant_id)
    .filter(id => id != null);

  // Step 2: Check inventory using MCP tool
  const inventoryResult = await mcp.callTool('shopify.check_inventory', {
    variant_ids: variantIds,
  });

  if (!inventoryResult.success) {
    logger.error('chain.backorder.inventory_failed', new Error(inventoryResult.error || 'Unknown error'), {
      orderId: order.id,
    });
    throw new Error(`Failed to check inventory: ${inventoryResult.error}`);
  }

  const inventoryData = inventoryResult.data as {
    inventory: Array<{ variant_id: number; available: number; is_backordered: boolean }>;
  };

  // Step 3: Build inventory map
  const inventoryMap = new Map<number, number>();
  for (const item of inventoryData.inventory) {
    inventoryMap.set(item.variant_id, item.available);
  }

  // Step 4: Identify backordered vs available items
  const backorderedItems: BackorderedItem[] = [];
  const availableItems: ShopifyLineItem[] = [];

  for (const item of order.line_items) {
    const available = inventoryMap.get(item.variant_id) ?? 0;

    if (available < 0) {
      // Item is backordered (negative inventory)
      backorderedItems.push({
        lineItem: item,
        available: Math.max(0, item.quantity + available),
        backordered: Math.abs(available),
      });
    } else {
      availableItems.push(item);
    }
  }

  // Step 5: Early exit if no backorders
  if (backorderedItems.length === 0) {
    logger.info('chain.backorder.none', {
      orderId: order.id,
      orderNumber: order.order_number
    });
    return result;
  }

  // Step 6: Record backorder findings
  result.hasBackorders = true;
  result.backorderedItems = backorderedItems;

  const allBackordered = availableItems.length === 0;

  logger.info('chain.backorder.detected', {
    orderId: order.id,
    orderNumber: order.order_number,
    backorderedCount: backorderedItems.length,
    availableCount: availableItems.length,
    scenario: allBackordered ? 'all_backordered' : 'partial_backorder',
    items: backorderedItems.map(b => ({
      title: b.lineItem.title,
      sku: b.lineItem.sku,
      backordered: b.backordered,
    })),
  });

  // Step 7: Build email using template config (merchant branding + custom messages)
  const templateConfig = getTemplateConfig();

  const emailHtml = allBackordered
    ? renderAllBackorderedEmailHtml(order, backorderedItems, templateConfig)
    : renderPartialBackorderEmailHtml(order, backorderedItems, availableItems, templateConfig);

  // Use merchant-configured subject if set; apply {{orderNumber}} / {{customerName}} variables
  const vars: Record<string, string> = {
    orderNumber: String(order.order_number),
    customerName: order.customer?.first_name || 'Valued Customer',
  };
  const applyVars = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');

  const defaultSubject = allBackordered
    ? `Order #${order.order_number} — Items currently on backorder`
    : `Order #${order.order_number} — Shipping options for your order`;

  const configuredSubject = allBackordered
    ? templateConfig.messages?.allBackordered?.subject
    : templateConfig.messages?.partialBackorder?.subject;

  const subject = configuredSubject ? applyVars(configuredSubject) : defaultSubject;

  // Step 8: Create Gorgias ticket (sends email to customer)
  try {
    const customerName = order.customer
      ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(' ') || 'Customer'
      : 'Customer';

    const ticketResult = await mcp.callTool('gorgias.create_ticket', {
      customer_email: order.email,
      customer_name: customerName,
      subject,
      message: emailHtml,
      tags: ['backorder', 'automated', allBackordered ? 'all-backordered' : 'partial-backorder'],
    });

    if (!ticketResult.success) {
      throw new Error(ticketResult.error || 'Failed to create ticket');
    }

    const ticketData = ticketResult.data as { ticket_id: number };
    result.ticketId = ticketData.ticket_id;
    result.emailSent = true;

    logger.info('chain.backorder.ticket_created', {
      orderId: order.id,
      orderNumber: order.order_number,
      ticketId: ticketData.ticket_id,
      scenario: allBackordered ? 'all_backordered' : 'partial_backorder',
    });

    // Step 9: Send Slack notification
    await alertSlack(
      `Backorder detected for Order #${order.order_number}. ` +
      `${backorderedItems.length} item(s) affected. Ticket #${ticketData.ticket_id} created.`,
      'info'
    );

  } catch (error) {
    logger.error('chain.backorder.ticket_failed', error as Error, {
      orderId: order.id,
      orderNumber: order.order_number,
    });

    await alertSlack(
      `Failed to create ticket for Order #${order.order_number}: ${(error as Error).message}`,
      'error'
    );

    throw error;
  }

  logger.info('chain.backorder.complete', {
    orderId: order.id,
    orderNumber: order.order_number,
    hasBackorders: result.hasBackorders,
    ticketId: result.ticketId,
  });

  return result;
}
