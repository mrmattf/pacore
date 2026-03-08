import type { TemplateContent } from '@pacore/core';
import type { DeliveryExceptionPolicyEvalContext } from '../chains/delivery-exception-types';
import { escapeHtml, substituteVars } from './backorder-templates';

/** Converts \n line breaks to <br> tags for HTML rendering. */
function nl2br(s: string): string {
  return s.replace(/\n/g, '<br>');
}

/**
 * Renders a full HTML email body for a Delivery Exception customer notification.
 * Used for tickets created via Gorgias or Zendesk.
 * Template fields use plain text with \n line breaks; nl2br converts them before substitution.
 */
export function renderDeliveryExceptionTemplate(
  template: TemplateContent,
  context: DeliveryExceptionPolicyEvalContext
): string {
  const vars = buildVarMap(context);

  const intro   = substituteVars(nl2br(template.intro),   vars);
  const body    = substituteVars(nl2br(template.body),    vars);
  const closing = substituteVars(nl2br(template.closing), vars);

  return `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
  <p>${intro}</p>
  ${body}
  <p>${closing}</p>
</div>
`.trim();
}

/**
 * Renders a plain-text email body for adapters that don't support HTML (e.g. Re:amaze).
 */
export function renderDeliveryExceptionTemplatePlainText(
  template: TemplateContent,
  context: DeliveryExceptionPolicyEvalContext & { signature?: string }
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
 * Renders the ticket subject line for a delivery exception notification.
 */
export function renderDeliveryExceptionSubject(
  subjectTemplate: string,
  context: DeliveryExceptionPolicyEvalContext
): string {
  const vars = buildVarMap(context);
  return substituteVars(subjectTemplate, vars);
}

// ---- Private helpers ----

function buildVarMap(ctx: DeliveryExceptionPolicyEvalContext): Record<string, unknown> {
  const customerName = ctx.customerName || 'Valued Customer';
  const carrierName = formatCarrierName(ctx.carrier);

  return {
    ...ctx,
    customerName,
    carrierName,
    orderId:           String(ctx.orderId),
    orderNumber:       String(ctx.orderNumber),
    customerEmail:     escapeHtml(ctx.customerEmail),
    orderTotal:        String(ctx.orderTotal),
    trackingNumber:    escapeHtml(ctx.trackingNumber),
    carrier:           escapeHtml(ctx.carrier),
    exceptionMessage:  escapeHtml(ctx.exceptionMessage),
    estimatedDelivery: escapeHtml(ctx.estimatedDelivery || 'to be confirmed'),
  };
}

function buildVarMapText(ctx: DeliveryExceptionPolicyEvalContext): Record<string, string> {
  return {
    customerName:      ctx.customerName || 'Valued Customer',
    carrierName:       formatCarrierName(ctx.carrier),
    orderId:           String(ctx.orderId),
    orderNumber:       String(ctx.orderNumber),
    customerEmail:     ctx.customerEmail,
    orderTotal:        String(ctx.orderTotal),
    trackingNumber:    ctx.trackingNumber,
    carrier:           ctx.carrier,
    exceptionMessage:  ctx.exceptionMessage,
    estimatedDelivery: ctx.estimatedDelivery || 'to be confirmed',
  };
}

/** Plain-text variable substitution — no HTML escaping. */
function substituteVarsPlain(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

/**
 * Converts AfterShip carrier slugs to human-readable names for use in templates.
 * Falls back to slug uppercased for unknown carriers.
 */
function formatCarrierName(slug: string): string {
  const names: Record<string, string> = {
    ups:    'UPS',
    fedex:  'FedEx',
    usps:   'USPS',
    dhl:    'DHL',
    dhl_express: 'DHL Express',
    canada_post: 'Canada Post',
    australia_post: 'Australia Post',
    royal_mail: 'Royal Mail',
  };
  return names[slug.toLowerCase()] ?? slug.toUpperCase();
}
