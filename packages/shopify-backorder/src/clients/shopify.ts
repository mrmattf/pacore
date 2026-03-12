import { Config } from '../config';
import { ShopifyTokenManager } from './shopify-token-manager';

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
  };
  line_items: ShopifyLineItem[];
  total_price: string;
  created_at: string;
}

export interface InventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number;
}

export interface ScheduledInventoryChange {
  expectedAt: string | null;
  fromName: string;
  toName: string;
  quantity: number;
}

export class ShopifyClient {
  private baseUrl: string;
  private tokenManager: ShopifyTokenManager;

  constructor(config: Config, tokenManager: ShopifyTokenManager) {
    // Use current API version
    this.baseUrl = `https://${config.shopifyStoreDomain}/admin/api/2026-01`;
    this.tokenManager = tokenManager;
  }

  private async headers(): Promise<Record<string, string>> {
    return {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': await this.tokenManager.getToken(),
    };
  }

  async getOrder(orderId: number): Promise<ShopifyOrder> {
    const url = `${this.baseUrl}/orders/${orderId}.json`;
    console.log(`[Shopify] GET ${url}`);

    const response = await fetch(url, {
      headers: await this.headers(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Shopify] Error Response:`, {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new Error(`Shopify API error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json() as { order: ShopifyOrder };
    return data.order;
  }

  async getInventoryLevel(inventoryItemId: number): Promise<InventoryLevel[]> {
    const response = await fetch(
      `${this.baseUrl}/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
      { headers: await this.headers() }
    );

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { inventory_levels: InventoryLevel[] };
    return data.inventory_levels;
  }

  async getVariantInventoryItemId(variantId: number): Promise<number> {
    const response = await fetch(`${this.baseUrl}/variants/${variantId}.json`, {
      headers: await this.headers(),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { variant: { inventory_item_id: number } };
    return data.variant.inventory_item_id;
  }

  /**
   * Returns scheduled inventory changes (incoming → available) for a variant across all locations.
   * These are created when purchase orders or inventory transfers are marked as "ordered" in Shopify Admin.
   * NOTE: `scheduledChanges` is a deprecated GraphQL field but remains the only read API for this data.
   */
  async getInventoryScheduledChanges(variantId: number): Promise<ScheduledInventoryChange[]> {
    const inventoryItemId = await this.getVariantInventoryItemId(variantId);

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

  /**
   * Returns a human-readable ETA for a backordered variant.
   * - Future arrival date found → formatted date (e.g. "March 28, 2026")
   * - No scheduled changes or all dates in the past → "soon"
   */
  async getInventoryEta(variantId: number): Promise<string> {
    let changes: ScheduledInventoryChange[];
    try {
      changes = await this.getInventoryScheduledChanges(variantId);
    } catch {
      return 'soon';
    }

    const now = new Date();
    const futureDates = changes
      .filter(c => c.fromName === 'incoming' && c.toName === 'available' && c.expectedAt)
      .map(c => new Date(c.expectedAt!))
      .filter(d => d > now)
      .sort((a, b) => a.getTime() - b.getTime());

    if (futureDates.length === 0) return 'soon';
    return futureDates[0].toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  async checkInventory(variantIds: number[]): Promise<Map<number, number>> {
    const inventoryMap = new Map<number, number>();

    for (const variantId of variantIds) {
      try {
        const inventoryItemId = await this.getVariantInventoryItemId(variantId);
        const levels = await this.getInventoryLevel(inventoryItemId);

        // Sum available across all locations
        const totalAvailable = levels.reduce((sum, level) => sum + level.available, 0);
        console.log(`[Shopify] Inventory for variant ${variantId}: ${totalAvailable} (${levels.length} location(s))`);
        inventoryMap.set(variantId, totalAvailable);
      } catch (error) {
        console.error(`[Shopify] Inventory check failed for variant ${variantId}:`, (error as Error).message);
        inventoryMap.set(variantId, 0);
      }
    }

    return inventoryMap;
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const token = await this.tokenManager.getToken();
    const response = await fetch(`${this.baseUrl}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shopify GraphQL request failed (${response.status}): ${body}`);
    }

    const json = await response.json() as { data: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(`Shopify GraphQL errors: ${json.errors.map(e => e.message).join(', ')}`);
    }

    return json.data;
  }
}
