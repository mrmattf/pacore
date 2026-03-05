import type { EcommerceOrderAdapter, NormalizedOrder, InventoryResult } from '@pacore/core';
import type { SlotAdapter, CredentialField, WebhookSourceAdapter } from '../slot-adapter';
import { ShopifyApiClient } from './shopify-api-client';
import type { ShopifyVariant, ShopifyOrder, ShopifyRisk } from './shopify-api-client';

/** Direct OAuth token grant — no caching. Used by adapter for per-call credential injection. */
class DirectTokenProvider {
  constructor(
    private storeDomain: string,
    private clientId: string,
    private clientSecret: string
  ) {}

  async getToken(): Promise<string> {
    const response = await fetch(`https://${this.storeDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shopify token request failed (${response.status}): ${body}`);
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  }
}

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
    'find_orders_by_variant',
    'get_variant_by_inventory_item',
    'get_order_risks',
    'get_customer_order_count',
  ] as const;

  readonly credentialFields: CredentialField[] = [
    { key: 'storeDomain',  label: 'Store Domain',  type: 'text',     placeholder: 'my-store.myshopify.com' },
    { key: 'clientId',     label: 'Client ID',     type: 'text',     hint: 'Shopify Admin → Apps → Develop Apps → Create App → API credentials' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', hint: 'Same location as Client ID — keep this secret' },
  ];

  readonly setupGuide =
    'Shopify Admin → Apps → Develop Apps → Create App → Configure API scopes: read_orders, read_inventory, read_products, read_customers → Install app';

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

  async testCredentials(creds: Record<string, unknown>): Promise<void> {
    // Attempt a token grant — throws with a clear message if credentials are wrong
    const provider = this.buildTokenProvider(creds);
    await provider.getToken();
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
      case 'find_orders_by_variant':
        return this.findOrdersByVariant(params.variant_id as number, creds);
      case 'get_variant_by_inventory_item':
        return this.getVariantByInventoryItem(params.inventory_item_id as number, creds);
      case 'get_order_risks':
        return this.getOrderRisks(params.order_id as number, creds);
      case 'get_customer_order_count':
        return this.getCustomerOrderCount(params.customer_id as number, creds);
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
    const provider = this.buildTokenProvider(creds);
    const storeDomain = creds.storeDomain as string;
    const accessToken = await provider.getToken();

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

  private buildTokenProvider(creds: Record<string, unknown>): DirectTokenProvider {
    const storeDomain  = creds.storeDomain  as string;
    const clientId     = creds.clientId     as string;
    const clientSecret = creds.clientSecret as string;

    if (!storeDomain || !clientSecret) {
      throw new Error('ShopifyOrderAdapter: missing storeDomain or clientSecret in credentials');
    }
    return new DirectTokenProvider(storeDomain, clientId, clientSecret);
  }

  private buildClient(creds: Record<string, unknown>): ShopifyApiClient {
    const tokenProvider = this.buildTokenProvider(creds);
    return new ShopifyApiClient(creds.storeDomain as string, tokenProvider as any);
  }
}
