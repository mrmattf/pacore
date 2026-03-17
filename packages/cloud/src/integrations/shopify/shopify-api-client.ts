const API_VERSION = '2026-01';

export interface ShopifyLineItem {
  id: number;
  variant_id: number;
  product_id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string;
  customer: {
    id: number;
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
  line_items: ShopifyLineItem[];
  total_price: string;
  created_at: string;
}

export interface InventoryItem {
  variantId: number;
  available: number;
  isBackordered: boolean;
}

export interface ShopifyVariant {
  id: number;
  title: string;
  sku: string;
  product_id: number;
  inventory_item_id: number;
}

export interface ShopifyRisk {
  recommendation: 'cancel' | 'investigate' | 'accept';
  /** Returned as a string by Shopify API — parse to float before using. */
  score: string;
  source: string;
  message: string;
  cause_cancel: boolean;
}

export interface ScheduledInventoryChange {
  expectedAt: string | null;
  fromName: string;
  toName: string;
  quantity: number;
}

/**
 * Shopify Admin REST API client.
 * Accepts a pre-validated OAuth access token.
 * Supports multiple users/orgs — one instance per scope/store combination.
 */
export class ShopifyApiClient {
  private baseUrl: string;

  constructor(
    storeDomain: string,
    private accessToken: string
  ) {
    this.baseUrl = `https://${storeDomain}/admin/api/${API_VERSION}`;
  }

  async getOrder(orderId: number): Promise<ShopifyOrder> {
    const data = await this.get<{ order: ShopifyOrder }>(`/orders/${orderId}.json`);
    return data.order;
  }

  async checkInventory(variantIds: number[]): Promise<InventoryItem[]> {
    const results: InventoryItem[] = [];

    for (const variantId of variantIds) {
      try {
        const inventoryItemId = await this.getInventoryItemId(variantId);
        const available = await this.getAvailableQuantity(inventoryItemId);
        results.push({ variantId, available, isBackordered: available < 0 });
      } catch (err) {
        console.error(`[ShopifyApiClient] Failed to check inventory for variant ${variantId}:`, err);
        results.push({ variantId, available: 0, isBackordered: false });
      }
    }

    return results;
  }

  /**
   * Finds the variant that owns a given inventory item via GraphQL.
   * Shopify: one inventory item → one variant (1:1 relationship).
   * NOTE: The REST /variants.json?inventory_item_ids= filter is undocumented and ignored by Shopify;
   * the GraphQL inventoryItem query is the correct approach.
   */
  async getVariantByInventoryItem(inventoryItemId: number): Promise<ShopifyVariant | null> {
    const query = `
      query getVariantByInventoryItem($id: ID!) {
        inventoryItem(id: $id) {
          variant {
            id
            title
            sku
            product { id }
            inventoryItem { id }
          }
        }
      }
    `;
    const result = await this.graphql<{
      inventoryItem: {
        variant: {
          id: string;
          title: string;
          sku: string | null;
          product: { id: string };
          inventoryItem: { id: string };
        } | null;
      } | null;
    }>(query, { id: `gid://shopify/InventoryItem/${inventoryItemId}` });

    const v = result.inventoryItem?.variant;
    if (!v) return null;

    const parseGid = (gid: string): number => parseInt(gid.split('/').pop()!, 10);
    return {
      id: parseGid(v.id),
      title: v.title,
      sku: v.sku ?? '',
      product_id: parseGid(v.product.id),
      inventory_item_id: inventoryItemId,
    };
  }

  /**
   * Returns the title of a product.
   */
  async getProductTitle(productId: number): Promise<string> {
    const data = await this.get<{ product: { title: string } }>(
      `/products/${productId}.json?fields=title`
    );
    return data.product.title;
  }

  /**
   * Returns the Shopify risk assessments for an order.
   * Shopify Basic risk is always included; third-party fraud apps add additional entries.
   * The highest-severity recommendation should be used for policy evaluation.
   */
  async getOrderRisks(orderId: number): Promise<ShopifyRisk[]> {
    const data = await this.get<{ risks: ShopifyRisk[] }>(`/orders/${orderId}/risks.json`);
    return data.risks;
  }

  /**
   * Returns the total all-time order count for a Shopify customer.
   * Requires read_customers scope.
   */
  async getCustomerOrderCount(customerId: number): Promise<number> {
    const data = await this.get<{ customer: { orders_count: number } }>(
      `/customers/${customerId}.json?fields=orders_count`
    );
    return data.customer.orders_count;
  }

  /**
   * Fetches orders created within the last `days` days, up to 250 (one page).
   * Used by backorder assessment — representative sample for stores with typical order volumes.
   * For stores with >250 orders in the window, the most recent 250 are returned.
   */
  async getOrdersInRange(days: number): Promise<ShopifyOrder[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
      status: 'any',
      limit: '250',
      fields: 'id,order_number,email,customer,line_items,total_price,created_at',
      created_at_min: since,
    });
    const data = await this.get<{ orders: ShopifyOrder[] }>(`/orders.json?${params}`);
    return data.orders;
  }

  /**
   * Lists recent orders with configurable time window, limit, and status filter.
   * days_back > 60 requires read_all_orders scope (included in the Clarissi app).
   */
  async listRecentOrders(params: {
    days_back?: number;
    limit?: number;
    status?: 'any' | 'open' | 'closed' | 'cancelled';
  }): Promise<ShopifyOrder[]> {
    const days = Math.min(params.days_back ?? 30, 365);
    const limit = Math.min(params.limit ?? 50, 250);
    const status = params.status ?? 'any';

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const queryParams = new URLSearchParams({
      status,
      limit: String(limit),
      fields: 'id,order_number,created_at,financial_status,fulfillment_status,email,customer,line_items,total_price,tags',
      created_at_min: since,
    });
    const data = await this.get<{ orders: ShopifyOrder[] }>(`/orders.json?${queryParams}`);
    return data.orders;
  }

  /**
   * Finds all open orders containing a given variant (client-side filter, up to 250 orders).
   * For MVP: covers merchants with ≤250 open orders (typical for $500K–$10M Shopify stores).
   */
  async findOpenOrdersByVariant(variantId: number): Promise<ShopifyOrder[]> {
    const data = await this.get<{ orders: ShopifyOrder[] }>(
      `/orders.json?status=open&limit=250&fields=id,order_number,email,customer,line_items,total_price`
    );
    return data.orders.filter(order =>
      order.line_items.some(li => li.variant_id === variantId)
    );
  }

  /**
   * Returns scheduled inventory changes for a variant across all locations.
   * These are created by Shopify when purchase orders or inventory transfers are marked as "ordered".
   * The `expectedAt` field is the estimated arrival date.
   * NOTE: `scheduledChanges` is a deprecated GraphQL field but remains the only read API for this data.
   */
  async getInventoryScheduledChanges(variantId: number): Promise<ScheduledInventoryChange[]> {
    const inventoryItemId = await this.getInventoryItemId(variantId);

    const query = `
      query GetInventoryScheduledChanges($id: ID!) {
        inventoryItem(id: $id) {
          inventoryLevels(first: 10) {
            edges {
              node {
                scheduledChanges(first: 10) {
                  edges {
                    node {
                      expectedAt
                      fromName
                      toName
                      quantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.graphql<{
      inventoryItem: {
        inventoryLevels: {
          edges: Array<{
            node: {
              scheduledChanges: {
                edges: Array<{
                  node: {
                    expectedAt: string | null;
                    fromName: string;
                    toName: string;
                    quantity: number;
                  };
                }>;
              };
            };
          }>;
        };
      } | null;
    }>(query, { id: `gid://shopify/InventoryItem/${inventoryItemId}` });

    if (!result.inventoryItem) return [];

    const changes: ScheduledInventoryChange[] = [];
    for (const levelEdge of result.inventoryItem.inventoryLevels.edges) {
      for (const changeEdge of levelEdge.node.scheduledChanges.edges) {
        changes.push(changeEdge.node);
      }
    }
    return changes;
  }

  private async getInventoryItemId(variantId: number): Promise<number> {
    const data = await this.get<{ variant: { inventory_item_id: number } }>(
      `/variants/${variantId}.json?fields=inventory_item_id`
    );
    return data.variant.inventory_item_id;
  }

  private async getAvailableQuantity(inventoryItemId: number): Promise<number> {
    const data = await this.get<{ inventory_levels: Array<{ available: number }> }>(
      `/inventory_levels.json?inventory_item_ids=${inventoryItemId}`
    );
    return data.inventory_levels.reduce((sum, l) => sum + (l.available ?? 0), 0);
  }

  /**
   * Registers a webhook via Shopify GraphQL Admin API.
   * Returns the webhook GID (e.g. "gid://shopify/WebhookSubscription/1234").
   * Note: Shopify does NOT return a signing secret here — HMAC uses the app's clientSecret.
   *
   * @param topic   REST-style topic string e.g. "orders/create" — converted to GraphQL enum internally
   * @param address Full webhook callback URL (https://pacore.app/v1/triggers/webhook/{token})
   */
  async registerWebhook(topic: string, address: string): Promise<{ webhookGid: string }> {
    const graphqlTopic = topicToGraphqlEnum(topic);
    const mutation = `
      mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const result = await this.graphql<{
      webhookSubscriptionCreate: {
        webhookSubscription: { id: string } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(mutation, {
      topic: graphqlTopic,
      webhookSubscription: { format: 'JSON', callbackUrl: address },
    });

    const { webhookSubscription, userErrors } = result.webhookSubscriptionCreate;
    if (userErrors.length > 0) {
      throw new Error(`Shopify registerWebhook failed: ${userErrors.map(e => e.message).join(', ')}`);
    }
    if (!webhookSubscription) {
      throw new Error('Shopify registerWebhook: no webhook subscription returned');
    }

    return { webhookGid: webhookSubscription.id };
  }

  /**
   * Deletes a webhook by its GID via Shopify GraphQL Admin API.
   */
  async deleteWebhook(webhookGid: string): Promise<void> {
    const mutation = `
      mutation webhookSubscriptionDelete($id: ID!) {
        webhookSubscriptionDelete(id: $id) {
          deletedWebhookSubscriptionId
          userErrors {
            field
            message
          }
        }
      }
    `;

    const result = await this.graphql<{
      webhookSubscriptionDelete: {
        deletedWebhookSubscriptionId: string | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(mutation, { id: webhookGid });

    const { userErrors } = result.webhookSubscriptionDelete;
    if (userErrors.length > 0) {
      throw new Error(`Shopify deleteWebhook failed: ${userErrors.map(e => e.message).join(', ')}`);
    }
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shopify API ${path} failed (${response.status}): ${body}`);
    }

    return response.json() as Promise<T>;
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shopify GraphQL request failed (${response.status}): ${body}`);
    }

    const json = await response.json() as { data: T; errors?: Array<{ message: string }> };
    if (json.errors && json.errors.length > 0) {
      throw new Error(`Shopify GraphQL errors: ${json.errors.map(e => e.message).join(', ')}`);
    }

    return json.data;
  }
}

/**
 * Converts REST-style Shopify webhook topic to GraphQL enum format.
 * e.g. "orders/create" → "ORDERS_CREATE"
 *      "inventory_levels/update" → "INVENTORY_LEVELS_UPDATE"
 */
function topicToGraphqlEnum(topic: string): string {
  return topic.replace('/', '_').toUpperCase();
}
