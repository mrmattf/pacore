import type { TemplateContent } from '@pacore/core';
import type { DeliveryExceptionPolicyEvalContext } from '../chains/delivery-exception-types';
import { escapeHtml, substituteVars } from './backorder-templates';

/**
 * Renders a full HTML email body for a Delivery Exception customer notification.
 * Used for tickets created via Gorgias or Zendesk.
 */
export function renderDeliveryExceptionTemplate(
  template: TemplateContent,
  context: DeliveryExceptionPolicyEvalContext
): string {
  const vars = buildVarMap(context);

  const intro   = substituteVars(template.intro,   vars);
  const body    = substituteVars(template.body,    vars);
  const closing = substituteVars(template.closing, vars);

  return `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
  <p>${intro}</p>
  ${body}
  <p>${closing}</p>
</div>
`.trim();
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
