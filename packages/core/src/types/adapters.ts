// Slot adapter interfaces — named by functional role, not by use case.
// The same interface serves all skills that need that capability.

// ---- E-commerce order source ----

export interface NormalizedOrder {
  id: number;
  orderNumber: number;
  email: string;
  customer: {
    id: number;
    firstName: string | null;
    lastName: string | null;
  } | null;
  lineItems: NormalizedLineItem[];
  totalPrice: string;
  createdAt: string;
}

export interface NormalizedLineItem {
  id: number;
  variantId: number;
  productId: number;
  title: string;
  quantity: number;
  price: string;
  sku: string;
}

export interface InventoryResult {
  variantId: number;
  available: number;
  isBackordered: boolean;
}

export interface EcommerceOrderAdapter {
  getOrder(orderId: number, creds: Record<string, unknown>): Promise<NormalizedOrder>;
  checkInventory(variantIds: number[], creds: Record<string, unknown>): Promise<InventoryResult[]>;
}

// ---- Support / notification tool ----
// PA Core creates the ticket; the support tool (Gorgias, Zendesk) emails the customer from it.
// PA Core never sends email directly.

export interface CreateTicketParams {
  orderId: string;
  customerEmail: string;
  customerName: string;
  priority: 'low' | 'normal' | 'high';
  subject: string;            // rendered from template — becomes email subject customer sees
  message: string;            // rendered HTML — Gorgias / Zendesk ticket body
  messagePlainText?: string;  // plain text — Re:amaze and other plain-text adapters
  tags?: string[];
}

export interface NotificationToolAdapter {
  createTicket(params: CreateTicketParams, creds: Record<string, unknown>): Promise<{ ticketId: string }>;
}

// ---- Future vertical slot types (stubs for discoverability) ----
// interface LegalDocumentAdapter { getDocument(...); listMatters(...) }
// interface FinancialDataAdapter  { getTransaction(...); getAccount(...) }
