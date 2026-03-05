import type { TemplateContent } from '@pacore/core';
import type { HighRiskPolicyEvalContext } from '../chains/high-risk-order-types';
import { escapeHtml, substituteVars } from './backorder-templates';

/**
 * Renders a full HTML email body for a High-Risk Order customer notification.
 * Used for tickets created via Gorgias or Zendesk.
 */
export function renderHighRiskTemplate(
  template: TemplateContent,
  context: HighRiskPolicyEvalContext
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
 * Renders the ticket subject line for a high-risk order notification.
 */
export function renderHighRiskSubject(
  subjectTemplate: string,
  context: HighRiskPolicyEvalContext
): string {
  const vars = buildVarMap(context);
  return substituteVars(subjectTemplate, vars);
}

// ---- Private helpers ----

function buildVarMap(ctx: HighRiskPolicyEvalContext): Record<string, unknown> {
  const customerName = ctx.customerName || 'Valued Customer';

  return {
    ...ctx,
    customerName,
    orderId:           String(ctx.orderId),
    orderNumber:       String(ctx.orderNumber),
    customerEmail:     escapeHtml(ctx.customerEmail),
    orderTotal:        String(ctx.orderTotal),
    riskMessages:      escapeHtml(ctx.riskMessages),
    customerOrderCount: String(ctx.customerOrderCount),
    riskScore:         ctx.riskScore.toFixed(2),
  };
}
