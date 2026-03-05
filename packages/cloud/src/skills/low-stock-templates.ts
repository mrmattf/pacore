import type { TemplateContent } from '@pacore/core';
import type { LowStockPolicyEvalContext } from '../chains/low-stock-types';
import { escapeHtml, substituteVars } from './backorder-templates';

/**
 * Renders a full HTML email body for a Low Stock Customer Impact notification.
 */
export function renderLowStockTemplate(
  template: TemplateContent,
  context: LowStockPolicyEvalContext & { companyName?: string; logoUrl?: string; signature?: string }
): string {
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
 * Renders the ticket subject line for a low-stock notification.
 */
export function renderLowStockSubject(
  subjectTemplate: string,
  context: LowStockPolicyEvalContext
): string {
  const vars = buildVarMap(context);
  return substituteVars(subjectTemplate, vars);
}

// ---- Private helpers ----

function buildVarMap(ctx: LowStockPolicyEvalContext): Record<string, unknown> {
  const customerName = ctx.customerName || 'Valued Customer';
  const affectedItemsTable = buildAffectedItemsHtml(ctx);

  return {
    ...ctx,
    affectedItemsTable,
    customerName,
    orderNumber:        String(ctx.orderNumber),
    orderId:            String(ctx.orderId),
    customerEmail:      ctx.customerEmail,
    orderTotal:         String(ctx.orderTotal),
    productTitle:       escapeHtml(ctx.productTitle || ''),
    sku:                escapeHtml(ctx.sku || ''),
    availableQty:       String(ctx.availableQty),
    affectedOrderCount: String(ctx.affectedOrderCount),
  };
}

function buildAffectedItemsHtml(ctx: LowStockPolicyEvalContext): string {
  if (!ctx.affectedItems || ctx.affectedItems.length === 0) return '';

  const rows = ctx.affectedItems.map(item => `
    <tr>
      <td style="padding: 4px 8px;">${escapeHtml(item.title)}</td>
      <td style="padding: 4px 8px;">${escapeHtml(item.sku || '—')}</td>
      <td style="padding: 4px 8px;">${item.quantity}</td>
    </tr>`).join('');

  return `
<table style="border-collapse: collapse; width: 100%; font-size: 13px;">
  <thead>
    <tr style="background: #f5f5f5;">
      <th style="padding: 4px 8px; text-align: left;">Item</th>
      <th style="padding: 4px 8px; text-align: left;">SKU</th>
      <th style="padding: 4px 8px; text-align: left;">Qty Ordered</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`.trim();
}
