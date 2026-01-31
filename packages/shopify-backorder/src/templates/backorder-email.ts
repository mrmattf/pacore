import { ShopifyLineItem, ShopifyOrder } from '../clients/shopify';

export interface BackorderedItem {
  lineItem: ShopifyLineItem;
  available: number;
  backordered: number;
}

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

**What would you like us to do?**

A) Ship available items now, and send backordered items when ready (separate shipments)
B) Wait until everything is in stock and ship together

Simply reply to this email with your preference (A or B), and we'll take care of the rest.

We apologize for any inconvenience and appreciate your patience!

Best regards,
Customer Support Team
`.trim();
}

export function renderBackorderEmailHtml(
  order: ShopifyOrder,
  backorderedItems: BackorderedItem[],
  availableItems: ShopifyLineItem[]
): string {
  const customerName = order.customer?.first_name || 'Valued Customer';

  const backorderedRows = backorderedItems
    .map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.lineItem.title}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.lineItem.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; color: #e53e3e;">${item.backordered} backordered</td>
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #1a202c;">Order #${order.order_number} Update</h2>

  <p>Hi ${customerName},</p>

  <p>Thank you for your order! We wanted to let you know that some items are temporarily out of stock.</p>

  <h3 style="color: #e53e3e; margin-top: 24px;">Backordered Items</h3>
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
    <h3 style="margin-top: 0;">What would you like us to do?</h3>
    <p><strong>Option A:</strong> Ship available items now, and send backordered items when ready (separate shipments)</p>
    <p><strong>Option B:</strong> Wait until everything is in stock and ship together</p>
    <p style="margin-bottom: 0;">Simply reply to this email with <strong>A</strong> or <strong>B</strong>, and we'll take care of the rest.</p>
  </div>

  <p style="margin-top: 24px;">We apologize for any inconvenience and appreciate your patience!</p>

  <p>Best regards,<br>Customer Support Team</p>
</body>
</html>
`.trim();
}
