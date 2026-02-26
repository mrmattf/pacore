import { MCPRegistry } from '../mcp/mcp-registry';
import { CredentialScope } from '../mcp/credential-manager';
import { MCPClient } from '../mcp/mcp-client';
import { PLATFORM_SERVER_IDS } from '../mcp/platform-servers';

export interface BackorderDetectionConfig {
  scope: CredentialScope;            // user or org running this skill
  shopifyDomain: string;
  shopifyClientId: string;
  shopifyClientSecret: string;
  gorgiasApiKey: string;
  gorgiasEmail: string;              // Gorgias account email for Basic Auth
  gorgiasFromEmail?: string;         // optional sender email for tickets
  notificationToolName: string;      // e.g. 'gorgias.create_ticket'
  inventoryThreshold: number;        // default 0 (negative = backordered)
  subjectTemplate: string;           // e.g. 'Order #{orderNumber} — Backorder Update'
}

export interface BackorderedItem {
  title: string;
  sku: string;
  orderedQty: number;
  availableQty: number;
  backorderedQty: number;
}

export interface BackorderDetectionResult {
  orderId: number;
  orderNumber: number;
  hasBackorders: boolean;
  backorderedItems: BackorderedItem[];
  notificationSent: boolean;
  notificationResult?: unknown;
}

/**
 * Backorder Detection tool chain — platform implementation.
 *
 * Uses the platform-hosted Shopify+Gorgias MCP server (registered at startup
 * from PLATFORM_MCP_SHOPIFY_GORGIAS_URL). Per-user credentials are injected
 * as custom headers on each request — the MCP server builds per-request clients
 * from those headers, so no user credentials are stored in the service itself.
 *
 * Steps:
 * 1. Build credential headers from config
 * 2. Fetch order via shopify.get_order MCP tool
 * 3. Check inventory for all line items
 * 4. Identify backordered items (available ≤ threshold)
 * 5. If backordered: call gorgias.create_ticket MCP tool
 * 6. Return structured result
 */
export async function runBackorderDetection(
  orderId: number,
  config: BackorderDetectionConfig,
  deps: { mcpRegistry: MCPRegistry }
): Promise<BackorderDetectionResult> {
  const { mcpRegistry } = deps;

  // ---- Resolve the platform MCP server ----
  const platformServer = await mcpRegistry.getServer(PLATFORM_SERVER_IDS.shopifyGorgias);
  if (!platformServer) {
    throw new Error(
      'Platform Shopify+Gorgias MCP server not registered. ' +
      'Set PLATFORM_MCP_SHOPIFY_GORGIAS_URL in the cloud service environment.'
    );
  }

  // ---- Build credential headers injected into every MCP request ----
  const customHeaders: Record<string, string> = {
    'X-Shopify-Domain': config.shopifyDomain,
    'X-Shopify-Client-Id': config.shopifyClientId,
    'X-Shopify-Client-Secret': config.shopifyClientSecret,
    'X-Gorgias-Api-Key': config.gorgiasApiKey,
    'X-Gorgias-Email': config.gorgiasEmail,
  };
  if (config.gorgiasFromEmail) {
    customHeaders['X-Gorgias-From-Email'] = config.gorgiasFromEmail;
  }

  const mcpClient = new MCPClient(platformServer, { customHeaders });

  // ---- Step 1: Fetch order ----
  const orderResult = await mcpClient.callTool({
    serverId: platformServer.id,
    toolName: 'shopify.get_order',
    parameters: { order_id: orderId },
  });

  if (!orderResult.success || !orderResult.data) {
    throw new Error(`Failed to fetch order ${orderId}: ${orderResult.error}`);
  }

  const order = orderResult.data as {
    id: number;
    order_number: number;
    email: string;
    customer?: { first_name: string | null; last_name: string | null };
    line_items: Array<{
      title: string;
      sku: string;
      quantity: number;
      variant_id: number;
    }>;
  };

  const result: BackorderDetectionResult = {
    orderId: order.id,
    orderNumber: order.order_number,
    hasBackorders: false,
    backorderedItems: [],
    notificationSent: false,
  };

  // ---- Step 2: Check inventory for each line item ----
  const inventoryMap = new Map<number, number>();

  for (const item of order.line_items) {
    if (item.variant_id == null) continue;

    const invResult = await mcpClient.callTool({
      serverId: platformServer.id,
      toolName: 'shopify.check_inventory',
      parameters: { variant_id: item.variant_id },
    });

    if (invResult.success && invResult.data != null) {
      inventoryMap.set(item.variant_id, (invResult.data as { available: number }).available);
    } else {
      inventoryMap.set(item.variant_id, 0);
    }
  }

  // ---- Step 3: Identify backordered items ----
  const backordered: BackorderedItem[] = [];

  for (const item of order.line_items) {
    const available = inventoryMap.get(item.variant_id) ?? 0;
    if (available <= config.inventoryThreshold) {
      backordered.push({
        title: item.title,
        sku: item.sku,
        orderedQty: item.quantity,
        availableQty: Math.max(0, available),
        backorderedQty: Math.max(0, item.quantity - Math.max(0, available)),
      });
    }
  }

  if (backordered.length === 0) {
    return result;
  }

  result.hasBackorders = true;
  result.backorderedItems = backordered;

  // ---- Step 4: Send notification via Gorgias ----
  try {
    const subject = config.subjectTemplate.replace('{orderNumber}', String(order.order_number));
    const customerName = order.customer
      ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(' ') || 'Valued Customer'
      : 'Valued Customer';

    const notificationPayload = buildNotificationPayload(
      subject,
      customerName,
      order.email,
      order.order_number,
      backordered
    );

    const notifResult = await mcpClient.callTool({
      serverId: platformServer.id,
      toolName: config.notificationToolName,
      parameters: notificationPayload,
    });

    result.notificationSent = true;
    result.notificationResult = notifResult;
  } catch (error) {
    console.error('[BackorderDetection] Notification failed:', error);
    // Don't re-throw — detection succeeded, notification is best-effort
    result.notificationSent = false;
  }

  return result;
}

function buildNotificationPayload(
  subject: string,
  customerName: string,
  customerEmail: string,
  orderNumber: number,
  backordered: BackorderedItem[]
): Record<string, unknown> {
  const bodyHtml = `
<p>Hi ${customerName},</p>
<p>Thank you for your order <strong>#${orderNumber}</strong>. Some items are temporarily out of stock:</p>
<ul>
  ${backordered.map(item => `
    <li>
      <strong>${item.title}</strong> — ordered ${item.orderedQty},
      ${item.backorderedQty} unit(s) backordered
      ${item.sku ? `(SKU: ${item.sku})` : ''}
    </li>
  `).join('')}
</ul>
<p>Please reply with your preference:</p>
<p>
  <strong>A</strong> — Ship available items now; send backordered items when ready (separate shipments)<br>
  <strong>B</strong> — Wait until everything is in stock and ship together
</p>
<p>We apologize for the inconvenience and appreciate your patience.</p>
`.trim();

  return {
    customer_email: customerEmail,
    customer_name: customerName,
    subject,
    message: bodyHtml,
    tags: ['backorder', 'automated'],
  };
}
