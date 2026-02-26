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
}
