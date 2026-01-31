import { Config } from '../config';

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
    first_name: string;
    last_name: string;
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
  private headers: Record<string, string>;

  constructor(config: Config) {
    this.baseUrl = `https://${config.shopifyStoreDomain}/admin/api/2024-01`;
    this.headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.shopifyAccessToken,
    };
  }

  async getOrder(orderId: number): Promise<ShopifyOrder> {
    const response = await fetch(`${this.baseUrl}/orders/${orderId}.json`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.order;
  }

  async getInventoryLevel(inventoryItemId: number): Promise<InventoryLevel[]> {
    const response = await fetch(
      `${this.baseUrl}/inventory_levels.json?inventory_item_ids=${inventoryItemId}`,
      { headers: this.headers }
    );

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.inventory_levels;
  }

  async getVariantInventoryItemId(variantId: number): Promise<number> {
    const response = await fetch(`${this.baseUrl}/variants/${variantId}.json`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
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
        inventoryMap.set(variantId, totalAvailable);
      } catch (error) {
        // If we can't get inventory, assume 0
        inventoryMap.set(variantId, 0);
      }
    }

    return inventoryMap;
  }
}
