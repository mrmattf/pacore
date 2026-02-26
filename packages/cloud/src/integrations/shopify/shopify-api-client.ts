import { ShopifyTokenManager } from './shopify-token-manager';

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

/**
 * Shopify Admin REST API client.
 * Uses ShopifyTokenManager to resolve a valid access token per request.
 * Supports multiple users/orgs — one instance per scope/store combination.
 */
export class ShopifyApiClient {
  private baseUrl: string;

  constructor(
    storeDomain: string,
    private tokenManager: ShopifyTokenManager
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

  private async get<T>(path: string): Promise<T> {
    const token = await this.tokenManager.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Shopify API ${path} failed (${response.status}): ${body}`);
    }

    return response.json() as Promise<T>;
  }
}
