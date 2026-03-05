// Delivery Exception Alert skill — condition and context types.
// These are NOT platform types — they are only used by the delivery-exception chain and its templates.
// Platform ECA primitives (CompiledPolicy, Action, etc.) live in @pacore/core policy.ts.

export type DeliveryExceptionCondition =
  | { type: 'order_total_gt'; value: number }
  | { type: 'exception_subtag'; value: string }; // partial match against AfterShip subtag

export interface DeliveryExceptionPolicyEvalContext {
  // Tracking context (from AfterShip webhook)
  trackingNumber: string;
  carrier: string;          // AfterShip slug: 'ups', 'fedex', 'usps', etc.
  exceptionSubtag: string;  // e.g. 'Exception_001', 'Exception_002'
  exceptionMessage: string; // human-readable: 'Shipment damaged', 'Address not found', etc.

  // Order context (from Shopify lookup)
  orderId: number;
  orderNumber: number;
  customerEmail: string;
  customerName: string;
  orderTotal: number;

  // Estimated delivery (from AfterShip)
  estimatedDelivery: string; // ISO date string or empty string if not available

  [key: string]: unknown;
}
