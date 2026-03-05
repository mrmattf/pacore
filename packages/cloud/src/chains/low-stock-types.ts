// Low Stock Customer Impact skill — condition and context types.
// These are NOT platform types — they are only used by the low-stock chain and its templates.
// Platform ECA primitives (CompiledPolicy, Action, etc.) live in @pacore/core policy.ts.

export type LowStockCondition =
  | { type: 'available_lte'; value: number }
  | { type: 'order_total_gt'; value: number }
  | { type: 'affected_order_count_gt'; value: number };

export interface AffectedItemContext {
  title: string;
  sku: string;
  quantity: number;
  variantId: number;
}

export interface LowStockPolicyEvalContext {
  // Product/inventory context
  inventoryItemId: number;
  variantId: number;
  productTitle: string;
  sku: string;
  availableQty: number;
  threshold: number;
  affectedOrderCount: number;

  // Per-order context (populated per-iteration in the dispatch loop)
  orderId: number;
  orderNumber: number;
  customerEmail: string;
  customerName: string;
  orderTotal: number;
  affectedItems: AffectedItemContext[];

  [key: string]: unknown;
}
