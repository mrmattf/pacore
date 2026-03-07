import type { TemplateContent } from '@pacore/core';
import type { PolicyEvalContext } from '../chains/backorder-types';

/**
 * HTML-escapes a string to prevent injection into ticket message templates.
 * All customer-controlled data MUST pass through this before interpolation.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Marks a string as pre-sanitized HTML so substituteVars skips escaping it.
 * Only use this for HTML built entirely from already-escaped values (e.g. buildBackorderedItemsHtml).
 */
export class SafeHtml {
  constructor(public readonly html: string) {}
}

/**
 * Substitutes {{variable}} placeholders in a template string.
 * Plain values are HTML-escaped. SafeHtml instances are inserted as-is.
 */
export function substituteVars(text: string, context: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = context[key];
    if (val === undefined || val === null) return '';
    if (val instanceof SafeHtml) return val.html;
    return escapeHtml(String(val));
  });
}

/**
 * Renders a full HTML email body from a NamedTemplate and execution context.
 * Returns a self-contained HTML string suitable for Gorgias/Zendesk ticket bodies.
 */
export function renderTemplate(template: TemplateContent, context: PolicyEvalContext & { companyName?: string; logoUrl?: string; signature?: string }): string {
  const vars = buildVarMap(context);

  const intro   = substituteVars(template.intro,   vars);
  const body    = substituteVars(template.body,    vars);
  const closing = substituteVars(template.closing, vars);

  const logoHtml = context.logoUrl
    ? `<div style="margin-bottom: 16px;"><img src="${escapeHtml(context.logoUrl)}" alt="${escapeHtml(context.companyName || '')}" style="max-height: 48px; max-width: 200px;" /></div>`
    : '';

  const signatureHtml = context.signature
    ? `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #eee; font-size: 13px; color: #666;">${escapeHtml(context.signature).replace(/\n/g, '<br>')}</div>`
    : '';

  return `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
  ${logoHtml}
  <p>${intro}</p>
  ${body}
  <p>${closing}</p>
  ${signatureHtml}
</div>
`.trim();
}

/**
 * Renders the ticket subject line (plain text — not HTML, but still escaped for safety).
 */
export function renderSubject(subjectTemplate: string, context: PolicyEvalContext): string {
  const vars = buildVarMap(context);
  return substituteVars(subjectTemplate, vars);
}

// ---- Private helpers ----

function buildVarMap(ctx: PolicyEvalContext): Record<string, unknown> {
  const customerName = ctx.customerName || 'Valued Customer';
  const backorderedItemsTable = new SafeHtml(buildBackorderedItemsHtml(ctx));

  return {
    ...ctx,
    backorderedItemsTable,
    backorderedCount:  String(ctx.backorderedItems.length),
    orderNumber:       String(ctx.orderNumber),
    orderId:           String(ctx.orderId),
    customerName,
    customerEmail:     ctx.customerEmail,
    orderTotal:        String(ctx.orderTotal),
  };
}

/** Coerces an eta value (string or API response object) to a display string. */
function etaToString(eta: unknown): string {
  if (!eta) return '';
  if (typeof eta === 'string') return eta;
  if (typeof eta === 'object') {
    const obj = eta as Record<string, unknown>;
    // Try common property names first
    for (const key of ['value', 'date', 'eta', 'estimated_delivery']) {
      if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string;
    }
    // Fallback: first non-empty string value in the object
    // Handles metafields maps like { "custom.backorder_eta": "2024-01-15" }
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' && val) return val;
    }
  }
  return '';
}

function buildBackorderedItemsHtml(ctx: PolicyEvalContext): string {
  if (ctx.backorderedItems.length === 0) return '';

  const rows = ctx.backorderedItems.map(item => {
    const etaStr = etaToString(item.eta);
    const etaCell = etaStr
      ? `<td style="padding: 4px 8px;">Est. ${escapeHtml(etaStr)}</td>`
      : '';
    return `
    <tr>
      <td style="padding: 4px 8px;">${escapeHtml(item.title)}</td>
      <td style="padding: 4px 8px;">${escapeHtml(item.sku || '—')}</td>
      <td style="padding: 4px 8px;">Ordered: ${item.orderedQty}, Available: ${item.availableQty}, Backordered: ${item.backorderedQty}</td>
      ${etaCell}
    </tr>`;
  }).join('');

  const etaHeader = ctx.backorderedItems.some(i => etaToString(i.eta))
    ? '<th style="padding: 4px 8px; text-align: left;">Est. Availability</th>'
    : '';

  return `
<table style="border-collapse: collapse; width: 100%; font-size: 13px;">
  <thead>
    <tr style="background: #f5f5f5;">
      <th style="padding: 4px 8px; text-align: left;">Item</th>
      <th style="padding: 4px 8px; text-align: left;">SKU</th>
      <th style="padding: 4px 8px; text-align: left;">Qty</th>
      ${etaHeader}
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`.trim();
}
