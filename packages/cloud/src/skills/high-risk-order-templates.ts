import type { TemplateContent } from '@pacore/core';
import type { HighRiskPolicyEvalContext } from '../chains/high-risk-order-types';
import { escapeHtml, substituteVars } from './backorder-templates';

/** Converts \n line breaks to <br> tags for HTML rendering. */
function nl2br(s: string): string {
  return s.replace(/\n/g, '<br>');
}

/**
 * Renders a full HTML email body for a High-Risk Order customer notification.
 * Used for tickets created via Gorgias or Zendesk.
 * Template fields use plain text with \n line breaks; nl2br converts them before substitution.
 */
export function renderHighRiskTemplate(
  template: TemplateContent,
  context: HighRiskPolicyEvalContext
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
export function renderHighRiskTemplatePlainText(
  template: TemplateContent,
  context: HighRiskPolicyEvalContext & { signature?: string }
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

function buildVarMapText(ctx: HighRiskPolicyEvalContext): Record<string, string> {
  return {
    customerName:       ctx.customerName || 'Valued Customer',
    orderId:            String(ctx.orderId),
    orderNumber:        String(ctx.orderNumber),
    customerEmail:      ctx.customerEmail,
    orderTotal:         String(ctx.orderTotal),
    riskMessages:       ctx.riskMessages,
    customerOrderCount: String(ctx.customerOrderCount),
    riskScore:          ctx.riskScore.toFixed(2),
  };
}

/** Plain-text variable substitution — no HTML escaping. */
function substituteVarsPlain(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}
