import type { UserSkillConfig, AdapterAction, Action, CompiledPolicy, ExecutionStep } from '@pacore/core';
import type {
  HighRiskPolicyEvalContext,
  HighRiskCondition,
  RiskSignal,
} from './high-risk-order-types';
import { CredentialManager } from '../mcp/credential-manager';
import { ShopifyOrderAdapter } from '../integrations/shopify/shopify-order-adapter';
import type { ShopifyRisk } from '../integrations/shopify/shopify-api-client';
import { AdapterRegistry } from '../integrations/adapter-registry';
import { SkillTemplateRegistry } from '../skills/skill-template-registry';
import { renderHighRiskTemplate, renderHighRiskSubject } from '../skills/high-risk-order-templates';

export interface HighRiskChainDeps {
  credentialManager: CredentialManager;
  skillTemplateRegistry: SkillTemplateRegistry;
  adapterRegistry: AdapterRegistry;
}

export interface HighRiskChainResult {
  orderId: number;
  orderNumber: number;
  riskRecommendation: 'cancel' | 'investigate' | 'accept';
  riskScore: number;
  actions: string[];
  invokeResults: unknown[];
  steps: ExecutionStep[];
  skipped?: boolean;
  skipReason?: string;
  dryRun?: {
    wouldTakeAction: Array<{
      slot: string;
      capability: string;
      subject?: string;
      message?: string;
    }>;
  };
}

// ---- High-risk condition evaluator ----

function matchesHighRiskCondition(cond: unknown, ctx: Record<string, unknown>): boolean {
  const c = cond as HighRiskCondition;
  switch (c.type) {
    case 'risk_recommendation':
      return ctx.riskRecommendation === c.value;
    case 'risk_score_gt':
      return typeof ctx.riskScore === 'number' && ctx.riskScore > c.value;
    case 'order_total_gt':
      return typeof ctx.orderTotal === 'number' && ctx.orderTotal > c.value;
    case 'is_new_customer':
      return ctx.isNewCustomer === c.value;
    default:
      return false;
  }
}

function evaluateHighRiskPolicy(
  policy: CompiledPolicy,
  ctx: HighRiskPolicyEvalContext
): Action[] {
  const ctxMap = ctx as unknown as Record<string, unknown>;
  for (const rule of policy.rules) {
    const conditions = rule.conditions as unknown[][];
    const matches = conditions.some(andGroup =>
      andGroup.every(cond => matchesHighRiskCondition(cond, ctxMap))
    );
    if (matches) return rule.actions as Action[];
  }
  return policy.defaultActions as Action[];
}

function stepTimer(steps: ExecutionStep[], name: string) {
  const start = Date.now();
  return (status: ExecutionStep['status'], summary: string, detail?: unknown) => {
    steps.push({ name, status, summary, detail, duration_ms: Date.now() - start });
  };
}

// ---- Webhook payload extraction ----

export function extractHighRiskOrderId(payload: unknown): number {
  const p = payload as Record<string, unknown>;
  const id = p.id;
  if (typeof id === 'number') return id;
  if (typeof id === 'string') return parseInt(id, 10);
  throw new Error('Could not extract order ID from webhook payload');
}

// ---- Risk signal normalization ----

/**
 * Resolves the single most-severe risk recommendation from all risk signals.
 * Priority: cancel > investigate > accept
 */
function resolveRiskRecommendation(
  risks: ShopifyRisk[]
): { recommendation: 'cancel' | 'investigate' | 'accept'; score: number; messages: string } {
  if (risks.length === 0) {
    return { recommendation: 'accept', score: 0, messages: '' };
  }

  let recommendation: 'cancel' | 'investigate' | 'accept' = 'accept';
  let topScore = 0;
  const messages: string[] = [];

  for (const risk of risks) {
    const score = parseFloat(risk.score as unknown as string) || 0;
    if (score > topScore) topScore = score;
    if (risk.message) messages.push(risk.message);

    if (risk.recommendation === 'cancel') {
      recommendation = 'cancel';
    } else if (risk.recommendation === 'investigate' && recommendation !== 'cancel') {
      recommendation = 'investigate';
    }
  }

  return { recommendation, score: topScore, messages: messages.join('; ') };
}

// ---- High-Risk Order Response tool chain ----

/**
 * High-Risk Order Response tool chain.
 *
 * Execution path:
 * 1. Get order from Shopify
 * 2. Get fraud risk assessments for the order
 * 3. Get customer order count (to distinguish new vs. returning)
 * 4. Build HighRiskPolicyEvalContext
 * 5. Evaluate policy → actions
 * 6. Dispatch invoke actions (notify customer + alert team)
 * 7. Return aggregate result
 */
export async function runHighRiskOrderChain(
  orderId: number,
  userSkillConfig: UserSkillConfig,
  userId: string,
  deps: HighRiskChainDeps,
  options: { dryRun?: boolean } = {}
): Promise<HighRiskChainResult> {
  const { credentialManager, skillTemplateRegistry, adapterRegistry } = deps;
  const steps: ExecutionStep[] = [];

  // ---- Resolve template ----
  const template = skillTemplateRegistry.getTemplate(userSkillConfig.templateId);
  if (!template) {
    throw new Error(`SkillTemplate not found: ${userSkillConfig.templateId}`);
  }

  // ---- Resolve Shopify credentials ----
  const shopifyConnectionId = userSkillConfig.slotConnections['shopify'];
  if (!shopifyConnectionId) {
    throw new Error('No Shopify connection configured for this skill');
  }

  const shopifyCreds = await credentialManager.getCredentials(
    { type: 'user', userId },
    shopifyConnectionId
  );
  if (!shopifyCreds) {
    throw new Error(`No credentials found for Shopify connection: ${shopifyConnectionId}`);
  }

  const shopifyCredsMap = shopifyCreds as unknown as Record<string, unknown>;
  const shopifyAdapter = new ShopifyOrderAdapter();

  // ---- Get order ----
  const doneOrder = stepTimer(steps, 'Fetch Order + Risk');
  const order = await shopifyAdapter.getOrder(orderId, shopifyCredsMap) as {
    id: number; orderNumber: number; email: string;
    customer: { id: number; firstName: string | null; lastName: string | null } | null;
    totalPrice: string;
  };

  // ---- Get order risks ----
  const risks = await shopifyAdapter.getOrderRisks(orderId, shopifyCredsMap);
  const { recommendation, score, messages } = resolveRiskRecommendation(risks);
  doneOrder('ok', `Order #${order.orderNumber} — risk: ${recommendation} (score ${score.toFixed(2)})`, { orderId, recommendation, score, riskMessages: messages });

  const result: HighRiskChainResult = {
    orderId,
    orderNumber: order.orderNumber,
    riskRecommendation: recommendation,
    riskScore: score,
    actions: [],
    invokeResults: [],
    steps,
  };

  // ---- Get customer order count ----
  let customerOrderCount = 0;
  if (order.customer?.id) {
    try {
      customerOrderCount = await shopifyAdapter.getCustomerOrderCount(
        order.customer.id,
        shopifyCredsMap
      );
    } catch {
      // Non-fatal — treat as unknown customer
    }
  }

  const customerName = order.customer
    ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') || 'Valued Customer'
    : 'Valued Customer';

  const ctx: HighRiskPolicyEvalContext = {
    orderId,
    orderNumber:       order.orderNumber,
    customerEmail:     order.email,
    customerName,
    orderTotal:        parseFloat(order.totalPrice) || 0,
    riskRecommendation: recommendation,
    riskScore:         score,
    riskMessages:      messages,
    isNewCustomer:     customerOrderCount <= 1,
    customerOrderCount,
  };

  const donePolicy = stepTimer(steps, 'Evaluate Policy');
  const actions = evaluateHighRiskPolicy(template.compiledPolicy, ctx);
  donePolicy('ok', `Policy evaluated: ${actions.length} action(s), recommendation=${recommendation}`, { recommendation, score, actionCount: actions.length });

  if (options.dryRun) {
    const doneSend = stepTimer(steps, 'Send Notifications');
    const previews: HighRiskChainResult['dryRun'] = { wouldTakeAction: [] };

    for (const action of actions) {
      if (action.type === 'skip') break;
      if (action.type !== 'invoke') continue;

      const invokeAction = action as AdapterAction;
      const slot = template.slots.find(s => s.key === invokeAction.targetSlot);
      if (!slot) continue;

      const preview: { slot: string; capability: string; subject?: string; message?: string } = {
        slot: invokeAction.targetSlot,
        capability: invokeAction.capability,
      };

      if (invokeAction.templateKey) {
        const namedTemplates = userSkillConfig.namedTemplates ?? template.defaultTemplates;
        const msgTemplate = namedTemplates[invokeAction.templateKey];
        if (msgTemplate) {
          preview.subject = renderHighRiskSubject(msgTemplate.subject, ctx);
          preview.message = renderHighRiskTemplate(msgTemplate, ctx);
        }
      }

      previews.wouldTakeAction.push(preview);
    }

    doneSend('sandbox', `Dry run — would take ${previews.wouldTakeAction.length} action(s)`, {
      count: previews.wouldTakeAction.length,
      previews: previews.wouldTakeAction.map(p => ({
        slot: p.slot,
        capability: p.capability,
        subject: p.subject,
        messageHtml: p.message,
      })),
    });
    result.dryRun = previews;
    return result;
  }

  // ---- Live dispatch ----
  for (const action of actions) {
    if (action.type === 'skip') {
      result.actions.push('skip');
      break;
    }

    if (action.type === 'escalate') {
      console.warn(`[HighRiskOrderChain] escalate for order ${order.orderNumber}: ${action.message ?? '(no message)'}`);
      result.actions.push('escalate');
      continue;
    }

    if (action.type === 'invoke') {
      const invokeAction = action as AdapterAction;

      const slot = template.slots.find(s => s.key === invokeAction.targetSlot);
      if (!slot) {
        throw new Error(`No slot '${invokeAction.targetSlot}' defined in template '${template.id}'`);
      }

      const slotConnectionId = userSkillConfig.slotConnections[invokeAction.targetSlot];
      if (!slotConnectionId) {
        throw new Error(`No connection configured for slot '${invokeAction.targetSlot}'`);
      }

      const slotCreds = await credentialManager.getCredentials(
        { type: 'user', userId },
        slotConnectionId
      );
      if (!slotCreds) {
        throw new Error(`No credentials for ${slot.integrationKey} connection: ${slotConnectionId}`);
      }

      let invokeParams: Record<string, unknown> = {
        orderId:       String(ctx.orderId),
        customerEmail: ctx.customerEmail,
        customerName:  ctx.customerName,
        tags:          ['high-risk', 'automated'],
        ...invokeAction.params,
      };

      if (invokeAction.templateKey) {
        const namedTemplates = userSkillConfig.namedTemplates ?? template.defaultTemplates;
        const msgTemplate = namedTemplates[invokeAction.templateKey];
        if (!msgTemplate) {
          throw new Error(`Message template not found: ${invokeAction.templateKey}`);
        }

        const subject = renderHighRiskSubject(msgTemplate.subject, ctx);
        const message = renderHighRiskTemplate(msgTemplate, ctx);
        invokeParams = { ...invokeParams, subject, message };
      }

      

      const doneAction = stepTimer(steps, `Dispatch Action: ${invokeAction.capability}`);
      try {
        const invokeResult = await adapterRegistry.invokeCapability(
          slot.integrationKey,
          invokeAction.capability,
          invokeParams,
          slotCreds as unknown as Record<string, unknown>
        );
        doneAction('ok', `Dispatched ${slot.integrationKey}:${invokeAction.capability} for order #${order.orderNumber}`, { orderId });
        result.actions.push(`${slot.integrationKey}:${invokeAction.capability}`);
        result.invokeResults.push(invokeResult);
      } catch (err) {
        doneAction('error', `Failed to dispatch ${slot.integrationKey}:${invokeAction.capability}`, { error: String(err) });
        throw err;
      }
    }
  }

  return result;
}
