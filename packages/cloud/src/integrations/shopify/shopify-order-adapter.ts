import type { EcommerceOrderAdapter, NormalizedOrder, InventoryResult } from '@pacore/core';
import type { SlotAdapter, CredentialField, WebhookSourceAdapter, AgentToolDefinition } from '../slot-adapter';
import { ShopifyApiClient } from './shopify-api-client';
import type { ShopifyVariant, ShopifyOrder, ShopifyRisk, ScheduledInventoryChange } from './shopify-api-client';
import type { ShopifyConnectionCredentials } from './shopify-types';

/**
 * Implements both EcommerceOrderAdapter and SlotAdapter using ShopifyApiClient.
 * Credentials are passed per-call (fetched from CredentialManager by the tool chain).
 * Also absorbs getVariantMetafields — single canonical implementation shared by chain + MCP router.
 */
export class ShopifyOrderAdapter implements EcommerceOrderAdapter, SlotAdapter, WebhookSourceAdapter {
  readonly integrationKey = 'shopify';
  readonly capabilities = [
    'get_order',
    'check_inventory',
    'get_variant_metafields',
    'get_inventory_eta',
    'find_orders_by_variant',
    'get_variant_by_inventory_item',
    'get_order_risks',
    'get_customer_order_count',
    'analyze_backorder_history',
    'list_recent_orders',
  ] as const;

  /**
   * Read-only capabilities exposed to AI agents via the MCPGateway.
   * Webhook lifecycle (register/deregister) is excluded — managed by skill activation only.
   */
  readonly agentTools: readonly AgentToolDefinition[] = [
    {
      capability: 'get_order',
      description: 'Fetch a Shopify order by ID. Returns order details including line items, customer info, and total price.',
      inputSchema: {
        type: 'object',
        properties: {
          order_id: { type: 'number', description: 'Shopify order ID' },
        },
        required: ['order_id'],
      },
    },
    {
      capability: 'check_inventory',
      description: 'Check inventory levels for one or more Shopify product variants. Returns available quantity and backorder status.',
      inputSchema: {
        type: 'object',
        properties: {
          variant_ids: {
            type: 'array',
            items: { type: 'number' },
            description: 'List of Shopify variant IDs to check',
          },
        },
        required: ['variant_ids'],
      },
    },
    {
      capability: 'get_inventory_eta',
      description: 'Get the estimated restock date for a backordered Shopify variant, based on scheduled inventory changes (purchase orders).',
      inputSchema: {
        type: 'object',
        properties: {
          variant_id: { type: 'number', description: 'Shopify variant ID' },
        },
        required: ['variant_id'],
      },
    },
    {
      capability: 'get_order_risks',
      description: 'Get fraud risk assessments for a Shopify order. Returns risk level and recommendation.',
      inputSchema: {
        type: 'object',
        properties: {
          order_id: { type: 'number', description: 'Shopify order ID' },
        },
        required: ['order_id'],
      },
    },
    {
      capability: 'get_customer_order_count',
      description: 'Get the total all-time order count for a Shopify customer. Useful for distinguishing new vs. returning customers.',
      inputSchema: {
        type: 'object',
        properties: {
          customer_id: { type: 'number', description: 'Shopify customer ID' },
        },
        required: ['customer_id'],
      },
    },
    {
      capability: 'find_orders_by_variant',
      description: 'Find all open Shopify orders that contain a specific product variant. Useful for identifying customers affected by a stockout.',
      inputSchema: {
        type: 'object',
        properties: {
          variant_id: { type: 'number', description: 'Shopify variant ID' },
        },
        required: ['variant_id'],
      },
    },
    {
      capability: 'analyze_backorder_history',
      description: 'Analyze historical Shopify order data to assess the potential impact of the backorder notification skill. Returns aggregate stats: how many orders had out-of-stock items, affected order value, most impacted variants, and estimated monthly trigger volume. Use this for Skills Assessment (Path E) to show a customer what the backorder skill would automate.',
      inputSchema: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Number of days of order history to analyze (default 90). Analysis covers the most recent 250 orders within that window.',
          },
        },
        required: [],
      },
    },
    {
      capability: 'list_recent_orders',
      description: 'List recent Shopify orders for analysis. Use to assess order velocity, backorder patterns, high-risk order frequency, and fulfillment gaps.',
      inputSchema: {
        type: 'object',
        properties: {
          days_back: { type: 'number', description: 'Days back to look (default 30, max 365). Over 60 days requires the read_all_orders scope.' },
          limit: { type: 'number', description: 'Max orders to return (default 50, max 250)' },
          status: { type: 'string', enum: ['any', 'open', 'closed', 'cancelled'], description: 'Order status filter (default any)' },
        },
        required: [],
      },
    },
  ];

  readonly credentialFields: CredentialField[] = [
    { key: 'storeDomain', label: 'Store Domain', type: 'text', placeholder: 'my-store.myshopify.com' },
  ];

  readonly setupGuide =
    'Connect via OAuth — enter your store domain and click "Connect Shopify". You will be redirected to Shopify to authorize the connection.';

  /** Maps skillTypeId → Shopify webhook topic (REST-style, converted to GraphQL enum internally). */
  readonly webhookTopics: Record<string, string> = {
    'backorder-notification':    'orders/create',
    'low-stock-impact':          'inventory_levels/update',
    'high-risk-order-response':  'orders/create',
  };

  async registerWebhook(
    topic: string,
    address: string,
    creds: Record<string, unknown>
  ): Promise<{ externalWebhookId: string }> {
    const client = this.buildClient(creds);
    const { webhookGid } = await client.registerWebhook(topic, address);
    return { externalWebhookId: webhookGid };
  }

  async deregisterWebhook(
    externalWebhookId: string,
    creds: Record<string, unknown>
  ): Promise<void> {
    const client = this.buildClient(creds);
    await client.deleteWebhook(externalWebhookId);
  }

  getWebhookHmacSecret(): string {
    const secret = process.env.SHOPIFY_APP_CLIENT_SECRET;
    if (!secret) throw new Error('SHOPIFY_APP_CLIENT_SECRET env var is not set');
    return secret;
  }

  async testCredentials(creds: Record<string, unknown>): Promise<void> {
    const { storeDomain, accessToken } = creds as unknown as ShopifyConnectionCredentials;
    if (!storeDomain || !accessToken) {
      throw new Error('Shopify connection is missing storeDomain or accessToken — reconnect via OAuth');
    }
    // Validate by fetching a known lightweight endpoint
    const client = this.buildClient(creds);
    await client.getOrdersInRange(1);
  }

  async invoke(
    capability: string,
    params: Record<string, unknown>,
    creds: Record<string, unknown>
  ): Promise<unknown> {
    switch (capability) {
      case 'get_order':
        return this.getOrder(params.order_id as number, creds);
      case 'check_inventory':
        return this.checkInventory(params.variant_ids as number[], creds);
      case 'get_variant_metafields':
        return this.getVariantMetafields(params.variant_id as number, creds);
      case 'get_inventory_eta':
        return this.getInventoryEta(params.variant_id as number, creds);
      case 'find_orders_by_variant':
        return this.findOrdersByVariant(params.variant_id as number, creds);
      case 'get_variant_by_inventory_item':
        return this.getVariantByInventoryItem(params.inventory_item_id as number, creds);
      case 'get_order_risks':
        return this.getOrderRisks(params.order_id as number, creds);
      case 'get_customer_order_count':
        return this.getCustomerOrderCount(params.customer_id as number, creds);
      case 'analyze_backorder_history':
        return this.analyzeBackorderHistory((params.days as number | undefined) ?? 90, creds);
      case 'list_recent_orders':
        return this.listRecentOrders(
          (params.days_back as number | undefined),
          (params.limit as number | undefined),
          (params.status as 'any' | 'open' | 'closed' | 'cancelled' | undefined),
          creds
        );
      default:
        throw new Error(`ShopifyOrderAdapter: unsupported capability '${capability}'`);
    }
  }

  async getOrder(orderId: number, creds: Record<string, unknown>): Promise<NormalizedOrder> {
    const client = this.buildClient(creds);
    const order = await client.getOrder(orderId);

    return {
      id: order.id,
      orderNumber: order.order_number,
      email: order.email,
      customer: order.customer
        ? {
            id: order.customer.id,
            firstName: order.customer.first_name,
            lastName: order.customer.last_name,
          }
        : null,
      lineItems: order.line_items.map(li => ({
        id: li.id,
        variantId: li.variant_id,
        productId: li.product_id,
        title: li.title,
        quantity: li.quantity,
        price: li.price,
        sku: li.sku,
      })),
      totalPrice: order.total_price,
      createdAt: order.created_at,
    };
  }

  async checkInventory(variantIds: number[], creds: Record<string, unknown>): Promise<InventoryResult[]> {
    const client = this.buildClient(creds);
    const items = await client.checkInventory(variantIds);
    return items.map(item => ({
      variantId: item.variantId,
      available: item.available,
      isBackordered: item.isBackordered,
    }));
  }

  /**
   * Fetches all metafields for a variant and returns them as a flat key-value map
   * keyed by "namespace.key" (e.g. "custom.backorder_eta").
   * Canonical implementation — used by both the backorder chain (enrichment) and the MCP router.
   */
  async getVariantMetafields(
    variantId: number,
    creds: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const { storeDomain, accessToken } = creds as unknown as ShopifyConnectionCredentials;

    const response = await fetch(
      `https://${storeDomain}/admin/api/2026-01/variants/${variantId}/metafields.json`,
      { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Shopify metafields request failed: ${response.status}`);
    }

    const data = await response.json() as { metafields: Array<{ namespace: string; key: string; value: unknown }> };
    const map: Record<string, unknown> = {};
    for (const mf of data.metafields) {
      map[`${mf.namespace}.${mf.key}`] = mf.value;
    }
    return map;
  }

  /**
   * Returns a human-readable ETA for a backordered variant by querying Shopify's scheduled
   * inventory changes. These are automatically created when purchase orders or inventory
   * transfers are marked as "ordered" in Shopify Admin.
   *
   * Resolution logic (per customer spec):
   * - Future `expectedAt` found on an incoming→available change → formatted date ("March 28, 2026")
   * - No scheduled changes, or all dates are in the past → "soon"
   */
  async getInventoryEta(variantId: number, creds: Record<string, unknown>): Promise<string> {
    const client = this.buildClient(creds);

    let changes: ScheduledInventoryChange[];
    try {
      changes = await client.getInventoryScheduledChanges(variantId);
    } catch {
      return 'soon';
    }

    const now = new Date();
    const futureDates = changes
      .filter(c => c.fromName === 'incoming' && c.toName === 'available' && c.expectedAt)
      .map(c => new Date(c.expectedAt!))
      .filter(d => d > now)
      .sort((a, b) => a.getTime() - b.getTime()); // earliest first

    if (futureDates.length === 0) return 'soon';

    return futureDates[0].toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  /**
   * Finds all open orders containing a given variant.
   * Used by the Low Stock Customer Impact skill to identify affected customers.
   */
  async findOrdersByVariant(
    variantId: number,
    creds: Record<string, unknown>
  ): Promise<ShopifyOrder[]> {
    const client = this.buildClient(creds);
    return client.findOpenOrdersByVariant(variantId);
  }

  /**
   * Returns the variant that owns a given inventory item.
   * Used by the Low Stock Customer Impact skill to map inventory_item_id → variant.
   */
  async getVariantByInventoryItem(
    inventoryItemId: number,
    creds: Record<string, unknown>
  ): Promise<ShopifyVariant | null> {
    const client = this.buildClient(creds);
    return client.getVariantByInventoryItem(inventoryItemId);
  }

  /**
   * Returns the product title for a given product ID.
   */
  async getProductTitle(productId: number, creds: Record<string, unknown>): Promise<string> {
    const client = this.buildClient(creds);
    return client.getProductTitle(productId);
  }

  /**
   * Returns Shopify fraud risk assessments for an order.
   * Used by the High-Risk Order Response skill.
   */
  async getOrderRisks(orderId: number, creds: Record<string, unknown>): Promise<ShopifyRisk[]> {
    const client = this.buildClient(creds);
    return client.getOrderRisks(orderId);
  }

  /**
   * Returns the total all-time order count for a Shopify customer.
   * Used by the High-Risk Order Response skill to distinguish new vs. returning customers.
   */
  async getCustomerOrderCount(customerId: number, creds: Record<string, unknown>): Promise<number> {
    const client = this.buildClient(creds);
    return client.getCustomerOrderCount(customerId);
  }

  /**
   * Analyzes historical Shopify orders to assess the potential impact of the backorder
   * notification skill. Fetches up to 250 orders from the last `days` days, checks current
   * inventory for all unique variants, and returns aggregate backorder statistics.
   *
   * Used by the Path E Skills Assessment — shows customers what the skill would automate.
   * Note: inventory is checked at current levels, not at time of order (approximation).
   */
  async analyzeBackorderHistory(
    days: number,
    creds: Record<string, unknown>
  ): Promise<{
    totalOrders: number;
    ordersWithBackorders: number;
    backorderRate: number;
    totalBackorderedOrderValue: number;
    mostAffectedVariants: Array<{ variantId: number; title: string; sku: string; affectedOrderCount: number }>;
    estimatedMonthlyEvents: number;
    analyzedDays: number;
    note: string;
  }> {
    const client = this.buildClient(creds);

    // Fetch orders in the date range (up to 250)
    const orders = await client.getOrdersInRange(days);

    // Collect unique variant IDs, capped at the 100 most frequently occurring
    const variantFrequency = new Map<number, { title: string; sku: string; count: number }>();
    for (const order of orders) {
      for (const item of order.line_items) {
        if (!item.variant_id) continue;
        const existing = variantFrequency.get(item.variant_id);
        if (existing) {
          existing.count++;
        } else {
          variantFrequency.set(item.variant_id, { title: item.title, sku: item.sku ?? '', count: 1 });
        }
      }
    }

    const topVariantIds = [...variantFrequency.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 100)
      .map(([id]) => id);

    // Check inventory for unique variants in parallel batches of 5
    const inventoryMap = new Map<number, number>(); // variantId → available qty
    const batchSize = 5;
    for (let i = 0; i < topVariantIds.length; i += batchSize) {
      const batch = topVariantIds.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(id => client.checkInventory([id]).then(r => r[0])));
      for (const result of results) {
        if (result) inventoryMap.set(result.variantId, result.available);
      }
    }

    // Classify orders and aggregate stats
    let ordersWithBackorders = 0;
    let totalBackorderedOrderValue = 0;
    const affectedVariantCounts = new Map<number, number>();

    for (const order of orders) {
      const hasOosItem = order.line_items.some(item => {
        const available = inventoryMap.get(item.variant_id);
        return available !== undefined && available <= 0;
      });

      if (hasOosItem) {
        ordersWithBackorders++;
        totalBackorderedOrderValue += parseFloat(order.total_price) || 0;

        for (const item of order.line_items) {
          const available = inventoryMap.get(item.variant_id);
          if (available !== undefined && available <= 0) {
            affectedVariantCounts.set(item.variant_id, (affectedVariantCounts.get(item.variant_id) ?? 0) + 1);
          }
        }
      }
    }

    const mostAffectedVariants = [...affectedVariantCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([variantId, affectedOrderCount]) => {
        const info = variantFrequency.get(variantId)!;
        return { variantId, title: info.title, sku: info.sku, affectedOrderCount };
      });

    const backorderRate = orders.length > 0
      ? Math.round((ordersWithBackorders / orders.length) * 1000) / 10
      : 0;
    const estimatedMonthlyEvents = Math.round((ordersWithBackorders / days) * 30);

    const note = orders.length >= 250
      ? `Analysis based on the most recent 250 orders. Your store may have more orders in this ${days}-day period.`
      : `Analysis based on all ${orders.length} orders placed in the last ${days} days.`;

    return {
      totalOrders: orders.length,
      ordersWithBackorders,
      backorderRate,
      totalBackorderedOrderValue: Math.round(totalBackorderedOrderValue * 100) / 100,
      mostAffectedVariants,
      estimatedMonthlyEvents,
      analyzedDays: days,
      note,
    };
  }

  async listRecentOrders(
    days_back: number | undefined,
    limit: number | undefined,
    status: 'any' | 'open' | 'closed' | 'cancelled' | undefined,
    creds: Record<string, unknown>
  ): Promise<ShopifyOrder[]> {
    const client = this.buildClient(creds);
    return client.listRecentOrders({ days_back, limit, status });
  }

  private buildClient(creds: Record<string, unknown>): ShopifyApiClient {
    const { storeDomain, accessToken } = creds as unknown as ShopifyConnectionCredentials;
    if (!storeDomain || !accessToken) {
      throw new Error('ShopifyOrderAdapter: missing storeDomain or accessToken in credentials');
    }
    return new ShopifyApiClient(storeDomain, accessToken);
  }
}
