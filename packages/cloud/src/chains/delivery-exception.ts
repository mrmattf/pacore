import type { UserSkillConfig, AdapterAction, Action, CompiledPolicy, ExecutionStep } from '@pacore/core';
import type {
  DeliveryExceptionPolicyEvalContext,
  DeliveryExceptionCondition,
} from './delivery-exception-types';
import { CredentialManager } from '../mcp/credential-manager';
import { ShopifyOrderAdapter } from '../integrations/shopify/shopify-order-adapter';
import { AdapterRegistry } from '../integrations/adapter-registry';
import { SkillTemplateRegistry } from '../skills/skill-template-registry';
import {
  renderDeliveryExceptionTemplate,
  renderDeliveryExceptionSubject,
} from '../skills/delivery-exception-templates';

export interface DeliveryExceptionChainDeps {
  credentialManager: CredentialManager;
  skillTemplateRegistry: SkillTemplateRegistry;
  adapterRegistry: AdapterRegistry;
}

export interface DeliveryExceptionChainResult {
  trackingNumber: string;
  carrier: string;
  orderId: number;
  orderNumber: number;
  exceptionSubtag: string;
  exceptionMessage: string;
  actions: string[];
  invokeResults: unknown[];
  steps: ExecutionStep[];
  skipped?: boolean;
  skipReason?: string;
  dryRun?: {
    wouldNotify: Array<{ slot: string; capability: string; subject: string; message: string }>;
  };
}

function stepTimer(steps: ExecutionStep[], name: string) {
  const start = Date.now();
  return (status: ExecutionStep['status'], summary: string, detail?: unknown) => {
    steps.push({ name, status, summary, detail, duration_ms: Date.now() - start });
  };
}

// ---- AfterShip webhook payload extraction ----

export interface AfterShipWebhookPayload {
  trackingNumber: string;
  carrier: string;
  tag: string;
  exceptionSubtag: string;
  exceptionMessage: string;
  orderId: string;
  estimatedDelivery: string;
}

/**
 * Extracts the relevant fields from an AfterShip tracking_update webhook payload.
 * Throws if the required fields are missing or malformed.
 */
export function extractAfterShipPayload(payload: unknown): AfterShipWebhookPayload {
  const p = payload as Record<string, unknown>;
  const msg = p.msg as Record<string, unknown> | undefined;

  if (!msg) {
    throw new Error('AfterShip webhook payload missing "msg" field');
  }

  const trackingNumber = msg.tracking_number as string;
  if (!trackingNumber) {
    throw new Error('AfterShip webhook payload missing tracking_number');
  }

  return {
    trackingNumber,
    carrier:          (msg.slug as string) || '',
    tag:              (msg.tag as string) || '',
    exceptionSubtag:  (msg.subtag as string) || '',
    exceptionMessage: (msg.subtag_message as string) || '',
    orderId:          String(msg.order_id ?? msg.order_number ?? ''),
    estimatedDelivery: (msg.latest_estimated_delivery as string) || '',
  };
}

// ---- Condition evaluator ----

function matchesDeliveryExceptionCondition(cond: unknown, ctx: Record<string, unknown>): boolean {
  const c = cond as DeliveryExceptionCondition;
  switch (c.type) {
    case 'order_total_gt':
      return typeof ctx.orderTotal === 'number' && ctx.orderTotal > c.value;
    case 'exception_subtag':
      return typeof ctx.exceptionSubtag === 'string' &&
        ctx.exceptionSubtag.toLowerCase().includes((c.value as string).toLowerCase());
    default:
      return false;
  }
}

function evaluateDeliveryExceptionPolicy(
  policy: CompiledPolicy,
  ctx: DeliveryExceptionPolicyEvalContext
): Action[] {
  const ctxMap = ctx as unknown as Record<string, unknown>;
  for (const rule of policy.rules) {
    const conditions = rule.conditions as unknown[][];
    const matches = conditions.some(andGroup =>
      andGroup.every(cond => matchesDeliveryExceptionCondition(cond, ctxMap))
    );
    if (matches) return rule.actions as Action[];
  }
  return policy.defaultActions as Action[];
}

// ---- Delivery Exception tool chain ----

/**
 * Delivery Exception Alert tool chain.
 *
 * Execution path:
 * 1. Extract AfterShip webhook payload
 * 2. Skip if tag !== 'Exception' (not a delivery exception)
 * 3. Resolve Shopify credentials and look up the order by ID
 * 4. Build DeliveryExceptionPolicyEvalContext
 * 5. Evaluate policy → actions
 * 6. Dispatch invoke actions (create customer notification ticket)
 * 7. Return aggregate result
 *
 * Note: AfterShip must be configured to include the Shopify order ID as `order_id`
 * in the tracking payload. See the AfterShipTrackingAdapter setupGuide for instructions.
 */
export async function runDeliveryExceptionChain(
  rawPayload: unknown,
  userSkillConfig: UserSkillConfig,
  userId: string,
  deps: DeliveryExceptionChainDeps,
  options: { dryRun?: boolean } = {}
): Promise<DeliveryExceptionChainResult> {
  const { credentialManager, skillTemplateRegistry, adapterRegistry } = deps;
  const steps: ExecutionStep[] = [];

  const doneParse = stepTimer(steps, 'Parse Tracking Event');
  const afterShipPayload = extractAfterShipPayload(rawPayload);
  doneParse('ok', `Parsed AfterShip event: tag=${afterShipPayload.tag}, tracking=${afterShipPayload.trackingNumber}`, { tag: afterShipPayload.tag, trackingNumber: afterShipPayload.trackingNumber });

  const baseResult: Omit<DeliveryExceptionChainResult, 'orderId' | 'orderNumber'> & { orderId: number; orderNumber: number } = {
    trackingNumber:  afterShipPayload.trackingNumber,
    carrier:         afterShipPayload.carrier,
    orderId:         0,
    orderNumber:     0,
    exceptionSubtag: afterShipPayload.exceptionSubtag,
    exceptionMessage: afterShipPayload.exceptionMessage,
    actions:         [],
    invokeResults:   [],
    steps,
  };

  // ---- Skip if not an exception event ----
  const doneEventType = stepTimer(steps, 'Check Event Type');
  if (afterShipPayload.tag !== 'Exception') {
    doneEventType('skipped', `Not a delivery exception (tag=${afterShipPayload.tag}) — no action needed`, { tag: afterShipPayload.tag });
    return {
      ...baseResult,
      skipped: true,
      skipReason: `Not a delivery exception (tag=${afterShipPayload.tag}) — no action needed`,
    };
  }
  doneEventType('ok', `Event is a delivery exception (tag=Exception)`, { tag: afterShipPayload.tag });

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

  // ---- Look up Shopify order ----
  const shopifyOrderId = parseInt(afterShipPayload.orderId, 10);
  if (!shopifyOrderId || isNaN(shopifyOrderId)) {
    return {
      ...baseResult,
      skipped: true,
      skipReason: `Could not resolve Shopify order ID from AfterShip payload (order_id="${afterShipPayload.orderId}"). Ensure AfterShip is configured to store the Shopify numeric order ID.`,
    };
  }

  const doneOrder = stepTimer(steps, 'Fetch Order');
  const order = await shopifyAdapter.getOrder(shopifyOrderId, shopifyCredsMap) as {
    id: number; orderNumber: number; email: string;
    customer: { id: number; firstName: string | null; lastName: string | null } | null;
    totalPrice: string;
  };
  doneOrder('ok', `Fetched order #${order.orderNumber} (id=${order.id})`, { orderId: order.id, orderNumber: order.orderNumber });

  const customerName = order.customer
    ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') || 'Valued Customer'
    : 'Valued Customer';

  const result: DeliveryExceptionChainResult = {
    ...baseResult,
    orderId:     order.id,
    orderNumber: order.orderNumber,
  };

  const ctx: DeliveryExceptionPolicyEvalContext = {
    trackingNumber:   afterShipPayload.trackingNumber,
    carrier:          afterShipPayload.carrier,
    exceptionSubtag:  afterShipPayload.exceptionSubtag,
    exceptionMessage: afterShipPayload.exceptionMessage,
    orderId:          order.id,
    orderNumber:      order.orderNumber,
    customerEmail:    order.email,
    customerName,
    orderTotal:       parseFloat(order.totalPrice) || 0,
    estimatedDelivery: afterShipPayload.estimatedDelivery,
  };

  const donePolicy = stepTimer(steps, 'Evaluate Policy');
  const actions = evaluateDeliveryExceptionPolicy(template.compiledPolicy, ctx);
  donePolicy('ok', `Policy evaluated: ${actions.length} action(s)`, { actionCount: actions.length });

  if (options.dryRun) {
    const doneSend = stepTimer(steps, 'Send Notifications');
    const previews: DeliveryExceptionChainResult['dryRun'] = { wouldNotify: [] };

    for (const action of actions) {
      if (action.type === 'skip') break;
      if (action.type !== 'invoke') continue;

      const invokeAction = action as AdapterAction;
      if (!invokeAction.templateKey) continue;

      const slot = template.slots.find(s => s.key === invokeAction.targetSlot);
      if (!slot) continue;

      const namedTemplates = userSkillConfig.namedTemplates ?? template.defaultTemplates;
      const msgTemplate = namedTemplates[invokeAction.templateKey];
      if (msgTemplate) {
        previews.wouldNotify.push({
          slot:       invokeAction.targetSlot,
          capability: invokeAction.capability,
          subject:    renderDeliveryExceptionSubject(msgTemplate.subject, ctx),
          message:    renderDeliveryExceptionTemplate(msgTemplate, ctx),
        });
      }
    }

    doneSend('sandbox', `Dry run — would notify ${previews.wouldNotify.length} order(s)`, { count: previews.wouldNotify.length });
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
      console.warn(`[DeliveryExceptionChain] escalate for order ${order.orderNumber}: ${action.message ?? '(no message)'}`);
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
        tags:          ['delivery-exception', 'automated'],
        ...invokeAction.params,
      };

      if (invokeAction.templateKey) {
        const namedTemplates = userSkillConfig.namedTemplates ?? template.defaultTemplates;
        const msgTemplate = namedTemplates[invokeAction.templateKey];
        if (!msgTemplate) {
          throw new Error(`Message template not found: ${invokeAction.templateKey}`);
        }

        const subject = renderDeliveryExceptionSubject(msgTemplate.subject, ctx);
        const message = renderDeliveryExceptionTemplate(msgTemplate, ctx);
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
        doneAction('ok', `Dispatched ${slot.integrationKey}:${invokeAction.capability} for order #${order.orderNumber}`, { orderId: order.id });
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
