import type { TemplateContent } from '@pacore/core';
import type { LowStockPolicyEvalContext } from '../chains/low-stock-types';
import { escapeHtml, substituteVars, SafeHtml } from './backorder-templates';

/** Converts \n line breaks to <br> tags for HTML rendering. */
function nl2br(s: string): string {
  return s.replace(/\n/g, '<br>');
}

/**
 * Renders a full HTML email body for a Low Stock Customer Impact notification.
 * Template fields use plain text with \n line breaks; nl2br converts them before substitution.
 */
export function renderLowStockTemplate(
  template: TemplateContent,
  context: LowStockPolicyEvalContext & { companyName?: string; logoUrl?: string; signature?: string }
): string {
  const vars = buildVarMap(context);

  const intro   = substituteVars(nl2br(template.intro),   vars);
  const body    = substituteVars(nl2br(template.body),    vars);
  const closing = substituteVars(nl2br(template.closing), vars);

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
 * Renders a plain-text email body for adapters that don't support HTML (e.g. Re:amaze).
 */
export function renderLowStockTemplatePlainText(
  template: TemplateContent,
  context: LowStockPolicyEvalContext & { signature?: string }
): string {
  const vars = buildVarMapText(context);
  const parts = [
    substituteVarsPlain(template.intro,   vars),
    substituteVarsPlain(template.body,    vars),
    substituteVarsPlain(template.closing, vars),
  ].filter(Boolean);
  if (context.signature) parts.push(`— ${context.signature}`);
  return parts.join('\n\n');
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
  const affectedItemsTable = new SafeHtml(buildAffectedItemsHtml(ctx));

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

function buildVarMapText(ctx: LowStockPolicyEvalContext): Record<string, string> {
  return {
    affectedItemsTable: buildAffectedItemsText(ctx),
    customerName:       ctx.customerName || 'Valued Customer',
    orderNumber:        String(ctx.orderNumber),
    orderId:            String(ctx.orderId),
    customerEmail:      ctx.customerEmail,
    orderTotal:         String(ctx.orderTotal),
    productTitle:       ctx.productTitle || '',
    sku:                ctx.sku || '',
    availableQty:       String(ctx.availableQty),
    affectedOrderCount: String(ctx.affectedOrderCount),
  };
}

/** Plain-text variable substitution — no HTML escaping. */
function substituteVarsPlain(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
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

function buildAffectedItemsText(ctx: LowStockPolicyEvalContext): string {
  if (!ctx.affectedItems || ctx.affectedItems.length === 0) return '';
  const separator = '-'.repeat(50);
  const rows = ctx.affectedItems.map(item =>
    `${item.title}  |  ${item.sku || '—'}  |  Qty: ${item.quantity}`
  );
  return ['Item  |  SKU  |  Qty Ordered', separator, ...rows].join('\n');
}
