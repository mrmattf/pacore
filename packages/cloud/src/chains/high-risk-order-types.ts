// High-Risk Order Response skill — condition and context types.
// These are NOT platform types — they are only used by the high-risk-order chain and its templates.
// Platform ECA primitives (CompiledPolicy, Action, etc.) live in @pacore/core policy.ts.

export type HighRiskCondition =
  | { type: 'risk_recommendation'; value: 'cancel' | 'investigate' | 'accept' }
  | { type: 'risk_score_gt'; value: number }
  | { type: 'order_total_gt'; value: number }
  | { type: 'is_new_customer'; value: boolean };

export interface RiskSignal {
  recommendation: 'cancel' | 'investigate' | 'accept';
  score: number;
  source: string;
  message: string;
  causeCancel: boolean;
}

export interface HighRiskPolicyEvalContext {
  // Order context
  orderId: number;
  orderNumber: number;
  customerEmail: string;
  customerName: string;
  orderTotal: number;

  // Risk context
  riskRecommendation: 'cancel' | 'investigate' | 'accept';
  riskScore: number;
  riskMessages: string; // joined human-readable risk messages for template substitution
  isNewCustomer: boolean;
  customerOrderCount: number;

  [key: string]: unknown;
}
