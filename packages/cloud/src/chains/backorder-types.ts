// Backorder-skill-specific condition and context types.
// These are NOT platform types — they are only used by the backorder chain and its templates.
// Platform ECA primitives (CompiledPolicy, Action, etc.) live in @pacore/core policy.ts.

export type BackorderCondition =
  | { type: 'backorder_status'; value: 'all' | 'partial' | 'none' }
  | { type: 'order_total_gt'; value: number }
  | { type: 'backordered_item_count_gt'; value: number }
  | { type: 'customer_order_count_gt'; value: number };

export interface BackorderedItemContext {
  title: string;
  sku: string;
  orderedQty: number;
  availableQty: number;
  backorderedQty: number;
  variantId: number;
  eta?: string;           // filled by enrichment step if configured
  [key: string]: unknown; // additional enrichment results
}

export interface BackorderPolicyEvalContext {
  orderId: number;
  orderNumber: number;
  customerEmail: string;
  customerName: string;
  orderTotal: number;
  backorderedItems: BackorderedItemContext[];
  availableItems: BackorderedItemContext[];
  allItemsBackordered: boolean;
  someItemsBackordered: boolean;
  threshold: number;
  [key: string]: unknown; // additional enrichment results
}

/** @deprecated Use BackorderPolicyEvalContext */
export type PolicyEvalContext = BackorderPolicyEvalContext;
/** @deprecated Use BackorderCondition */
export type Condition = BackorderCondition;
