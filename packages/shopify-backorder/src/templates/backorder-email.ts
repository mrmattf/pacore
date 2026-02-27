import { ShopifyLineItem, ShopifyOrder } from '../clients/shopify';
import { BackorderOption, TemplateConfig } from './template-store';

export interface BackorderedItem {
  lineItem: ShopifyLineItem;
  available: number;
  backordered: number;
}

// ─── Security helpers ─────────────────────────────────────────────────────────

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function applyVars(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(vars[key] ?? ''));
}

// Converts **text** → <strong>text</strong> after HTML escaping.
// Safe: the input is already escaped so no raw HTML can slip through.
function boldInline(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// ─── Default options (used when merchant hasn't configured custom options) ────

const DEFAULT_OPTIONS: BackorderOption[] = [
  {
    label: 'Option A — Split shipment',
    description: 'Reply **"A"** to this email and we\'ll ship your available items right away. The backordered items will follow in a separate shipment once they\'re back in stock.',
  },
  {
    label: 'Option B — Wait & ship together',
    description: 'No reply needed. If we don\'t hear from you, we\'ll hold the order and ship everything together once all items are available.',
  },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function logoHtml(style: NonNullable<TemplateConfig['style']>): string {
  if (!style.logoUrl) return '';
  const src = escapeAttr(style.logoUrl);
  const alt = escapeAttr(style.brandName ?? '');
  return `<img src="${src}" alt="${alt}" style="max-height: 48px; margin-bottom: 16px; display: block;">`;
}

function footerHtml(style: NonNullable<TemplateConfig['style']>): string {
  const signOff = style.signOff ?? style.brandName ?? 'Customer Support Team';
  const footer = style.footerText ? `<p style="margin-top: 4px; color: #718096; font-size: 13px;">${escapeHtml(style.footerText)}</p>` : '';
  return `<p>Best regards,<br><strong>${escapeHtml(signOff)}</strong></p>${footer}`;
}

function baseStyles(): string {
  return 'font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;';
}

// ─── Exported row/custom-HTML helpers (used by backorder-chain for {{vars}}) ──

/** Pre-renders <tr> rows for the backordered items table. */
export function renderBackorderedRows(items: BackorderedItem[]): string {
  return items.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(item.lineItem.title)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.lineItem.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.backordered} backordered</td>
    </tr>
  `).join('');
}

/** Pre-renders <tr> rows for the available items table. */
export function renderAvailableRows(items: ShopifyLineItem[]): string {
  if (items.length === 0) return '<tr><td colspan="3" style="padding: 8px; color: #666;">No items ready to ship</td></tr>';
  return items.map(item => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(item.title)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">Ready to ship</td>
    </tr>
  `).join('');
}

/**
 * Substitutes {{variables}} in a merchant-provided HTML template.
 * Does NOT HTML-escape values — row vars are already HTML; order/customer
 * values come from Shopify (not from merchant input).
 */
export function applyCustomHtml(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

// ─── Partial backorder email (some items available, some backordered) ─────────
//
// Merchant configures how many options to show (and what they say).
// If options is undefined, DEFAULT_OPTIONS (A/B) are used.
// If options is [], the "How would you like to proceed?" box is hidden.

export function renderPartialBackorderEmailHtml(
  order: ShopifyOrder,
  backorderedItems: BackorderedItem[],
  availableItems: ShopifyLineItem[],
  config: TemplateConfig = {}
): string {
  const style = config.style ?? {};
  const msgs = config.messages?.partialBackorder ?? {};
  const primaryColor = style.primaryColor ?? '#1a202c';
  const accentColor = style.accentColor ?? '#e53e3e';

  const vars: Record<string, string> = {
    orderNumber: String(order.order_number),
    customerName: order.customer?.first_name || 'Valued Customer',
  };

  const customerName = vars.customerName;
  const intro = applyVars(msgs.intro ?? 'Thank you for your order! Some items are temporarily out of stock — we wanted to let you know and give you a choice on how to proceed.', vars);
  const closing = applyVars(msgs.closing ?? 'We apologize for the inconvenience and appreciate your patience!', vars);

  const backorderedRows = backorderedItems
    .map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(item.lineItem.title)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.lineItem.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; color: ${accentColor};">${item.backordered} backordered</td>
      </tr>
    `)
    .join('');

  const availableRows = availableItems.length > 0
    ? availableItems.map(item => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(item.title)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; color: #38a169;">Ready to ship</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" style="padding: 8px; color: #666;">No items ready to ship</td></tr>';

  // options: undefined → use defaults; [] → hide box; [...] → use custom list
  const options = msgs.options ?? DEFAULT_OPTIONS;
  const optionItems = options.map((opt, i) =>
    `<p${i === options.length - 1 ? ' style="margin-bottom: 0;"' : ''}>
      <strong>${applyVars(escapeHtml(opt.label), vars)}:</strong> ${boldInline(applyVars(escapeHtml(opt.description), vars))}
    </p>`
  ).join('');

  const optionsBox = options.length === 0 ? '' : `
  <div style="background: #f7fafc; padding: 20px; margin-top: 24px; border-radius: 8px;">
    <p style="font-size: 16px; font-weight: bold; color: ${primaryColor}; margin: 0 0 12px 0;">${applyVars(msgs.optionsTitle ?? 'How would you like us to proceed?', vars)}</p>
    ${optionItems}
  </div>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="${baseStyles()}">
  ${logoHtml(style)}
  <p style="font-size: 22px; font-weight: bold; color: ${primaryColor}; margin: 0 0 16px 0;">Order #${order.order_number} Update</p>

  <p>Hi ${escapeHtml(customerName)},</p>

  <p>${intro}</p>

  <p style="font-size: 16px; font-weight: bold; color: ${accentColor}; margin: 24px 0 8px 0;">Backordered Items</p>
  <table style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr style="background: #f7fafc;">
        <th style="padding: 8px; text-align: left;">Item</th>
        <th style="padding: 8px; text-align: left;">Qty</th>
        <th style="padding: 8px; text-align: left;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${backorderedRows}
    </tbody>
  </table>

  <p style="font-size: 16px; font-weight: bold; color: #38a169; margin: 24px 0 8px 0;">Items Ready to Ship</p>
  <table style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr style="background: #f7fafc;">
        <th style="padding: 8px; text-align: left;">Item</th>
        <th style="padding: 8px; text-align: left;">Qty</th>
        <th style="padding: 8px; text-align: left;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${availableRows}
    </tbody>
  </table>

  ${optionsBox}

  <p style="margin-top: 24px;">${closing}</p>

  ${footerHtml(style)}
</body>
</html>
`.trim();
}

// ─── All-backordered email (every item in the order is out of stock) ──────────
//
// No options box — there's nothing to split. Just notify and give a cancel option.

export function renderAllBackorderedEmailHtml(
  order: ShopifyOrder,
  backorderedItems: BackorderedItem[],
  config: TemplateConfig = {}
): string {
  const style = config.style ?? {};
  const msgs = config.messages?.allBackordered ?? {};
  const primaryColor = style.primaryColor ?? '#1a202c';
  const accentColor = style.accentColor ?? '#e53e3e';

  const vars: Record<string, string> = {
    orderNumber: String(order.order_number),
    customerName: order.customer?.first_name || 'Valued Customer',
  };

  const customerName = vars.customerName;
  const intro = applyVars(msgs.intro ?? 'Thank you for your order! We wanted to let you know that all items in your order are currently on backorder.', vars);
  const waitMessage = applyVars(msgs.waitMessage ?? "We'll ship your complete order as soon as all items are back in stock — no action is needed from you.", vars);
  const cancelMessage = applyVars(msgs.cancelMessage ?? "If you'd prefer to cancel your order, simply reply to this email and our team will take care of it right away.", vars);
  const closing = applyVars(msgs.closing ?? 'We apologize for the inconvenience and appreciate your patience!', vars);

  const backorderedRows = backorderedItems
    .map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(item.lineItem.title)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.lineItem.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; color: ${accentColor};">${item.backordered} backordered</td>
      </tr>
    `)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="${baseStyles()}">
  ${logoHtml(style)}
  <p style="font-size: 22px; font-weight: bold; color: ${primaryColor}; margin: 0 0 16px 0;">Order #${order.order_number} Update</p>

  <p>Hi ${escapeHtml(customerName)},</p>

  <p>${intro}</p>

  <p style="font-size: 16px; font-weight: bold; color: ${accentColor}; margin: 24px 0 8px 0;">Backordered Items</p>
  <table style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr style="background: #f7fafc;">
        <th style="padding: 8px; text-align: left;">Item</th>
        <th style="padding: 8px; text-align: left;">Qty</th>
        <th style="padding: 8px; text-align: left;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${backorderedRows}
    </tbody>
  </table>

  <div style="background: #f7fafc; padding: 20px; margin-top: 24px; border-radius: 8px;">
    <p style="margin-top: 0;">${waitMessage}</p>
    <p style="margin-bottom: 0; color: #718096; font-size: 14px;">${cancelMessage}</p>
  </div>

  <p style="margin-top: 24px;">${closing}</p>

  ${footerHtml(style)}
</body>
</html>
`.trim();
}

// ─── Keep the original plain-text function (used by some tests/legacy) ────────

export function renderBackorderEmail(
  order: ShopifyOrder,
  backorderedItems: BackorderedItem[],
  availableItems: ShopifyLineItem[]
): string {
  const customerName = order.customer?.first_name || 'Valued Customer';

  const backorderedList = backorderedItems
    .map(item => `  - ${item.lineItem.title} (x${item.lineItem.quantity}) - ${item.backordered} unit(s) backordered`)
    .join('\n');

  const availableList = availableItems.length > 0
    ? availableItems.map(item => `  - ${item.title} (x${item.quantity})`).join('\n')
    : '  (None)';

  return `
Hi ${customerName},

Thank you for your order #${order.order_number}!

We wanted to let you know that some items in your order are temporarily out of stock:

**Backordered Items:**
${backorderedList}

**Items Ready to Ship:**
${availableList}

**How would you like us to proceed?**

Option A — Reply "A" to ship available items now; backordered items will follow separately.
Option B — No reply needed. We'll wait and ship everything together once all items are in stock.

We apologize for any inconvenience and appreciate your patience!

Best regards,
Customer Support Team
`.trim();
}
