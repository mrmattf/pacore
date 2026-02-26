import { ShopifyLineItem, ShopifyOrder } from '../clients/shopify';
import { TemplateConfig } from './template-store';

export interface BackorderedItem {
  lineItem: ShopifyLineItem;
  available: number;
  backordered: number;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function logoHtml(config: TemplateConfig): string {
  if (!config.logoUrl) return '';
  return `<img src="${config.logoUrl}" alt="${config.brandName ?? ''}" style="max-height: 48px; margin-bottom: 16px; display: block;">`;
}

function footerHtml(config: TemplateConfig): string {
  const signOff = config.signOff ?? config.brandName ?? 'Customer Support Team';
  const footer = config.footerText ? `<p style="margin-top: 4px; color: #718096; font-size: 13px;">${config.footerText}</p>` : '';
  return `<p>Best regards,<br><strong>${signOff}</strong></p>${footer}`;
}

function baseStyles(): string {
  return 'font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;';
}

// ─── Partial backorder email (some items available, some backordered) ─────────
//
// Option A: customer replies "A" to split the shipment
// Option B: no reply needed — silent default, we wait and ship together

export function renderPartialBackorderEmailHtml(
  order: ShopifyOrder,
  backorderedItems: BackorderedItem[],
  availableItems: ShopifyLineItem[],
  config: TemplateConfig = {}
): string {
  const customerName = order.customer?.first_name || 'Valued Customer';
  const primaryColor = config.primaryColor ?? '#1a202c';
  const accentColor = config.accentColor ?? '#e53e3e';

  const backorderedRows = backorderedItems
    .map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.lineItem.title}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.lineItem.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; color: ${accentColor};">${item.backordered} backordered</td>
      </tr>
    `)
    .join('');

  const availableRows = availableItems.length > 0
    ? availableItems.map(item => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.title}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; color: #38a169;">Ready to ship</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" style="padding: 8px; color: #666;">No items ready to ship</td></tr>';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="${baseStyles()}">
  ${logoHtml(config)}
  <h2 style="color: ${primaryColor};">Order #${order.order_number} Update</h2>

  <p>Hi ${customerName},</p>

  <p>Thank you for your order! Some items are temporarily out of stock — we wanted to let you know and give you a choice on how to proceed.</p>

  <h3 style="color: ${accentColor}; margin-top: 24px;">Backordered Items</h3>
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

  <h3 style="color: #38a169; margin-top: 24px;">Items Ready to Ship</h3>
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

  <div style="background: #f7fafc; padding: 20px; margin-top: 24px; border-radius: 8px;">
    <h3 style="margin-top: 0; color: ${primaryColor};">How would you like us to proceed?</h3>
    <p>
      <strong>Option A — Split shipment:</strong> Reply <strong>"A"</strong> to this email and we'll ship your available items right away. The backordered items will follow in a separate shipment once they're back in stock.
    </p>
    <p style="margin-bottom: 0;">
      <strong>Option B — Wait &amp; ship together:</strong> No reply needed. If we don't hear from you, we'll hold the order and ship everything together once all items are available.
    </p>
  </div>

  <p style="margin-top: 24px;">We apologize for the inconvenience and appreciate your patience!</p>

  ${footerHtml(config)}
</body>
</html>
`.trim();
}

// ─── All-backordered email (every item in the order is out of stock) ──────────
//
// No A/B choice — there's nothing to split. Just notify and give a cancel option.

export function renderAllBackorderedEmailHtml(
  order: ShopifyOrder,
  backorderedItems: BackorderedItem[],
  config: TemplateConfig = {}
): string {
  const customerName = order.customer?.first_name || 'Valued Customer';
  const primaryColor = config.primaryColor ?? '#1a202c';
  const accentColor = config.accentColor ?? '#e53e3e';

  const backorderedRows = backorderedItems
    .map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.lineItem.title}</td>
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
  ${logoHtml(config)}
  <h2 style="color: ${primaryColor};">Order #${order.order_number} Update</h2>

  <p>Hi ${customerName},</p>

  <p>Thank you for your order! We wanted to let you know that all items in your order are currently on backorder.</p>

  <h3 style="color: ${accentColor}; margin-top: 24px;">Backordered Items</h3>
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
    <p style="margin-top: 0;">
      We'll ship your complete order as soon as all items are back in stock — no action is needed from you.
    </p>
    <p style="margin-bottom: 0; color: #718096; font-size: 14px;">
      If you'd prefer to cancel your order, simply reply to this email and our team will take care of it right away.
    </p>
  </div>

  <p style="margin-top: 24px;">We apologize for the inconvenience and appreciate your patience!</p>

  ${footerHtml(config)}
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
