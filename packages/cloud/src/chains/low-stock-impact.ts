import type { UserSkillConfig, AdapterAction, Action, CompiledPolicy, ExecutionStep } from '@pacore/core';
import type {
  LowStockPolicyEvalContext,
  AffectedItemContext,
} from './low-stock-types';
import { CredentialManager } from '../mcp/credential-manager';
import { ShopifyOrderAdapter } from '../integrations/shopify/shopify-order-adapter';
import { AdapterRegistry } from '../integrations/adapter-registry';
import { SkillTemplateRegistry } from '../skills/skill-template-registry';
import { renderLowStockTemplate, renderLowStockTemplatePlainText, renderLowStockSubject } from '../skills/low-stock-templates';
import { applyTemplateFieldOverrides } from '../skills/template-utils';

export interface LowStockChainDeps {
  credentialManager: CredentialManager;
  skillTemplateRegistry: SkillTemplateRegistry;
  adapterRegistry: AdapterRegistry;
}

export interface LowStockOrderResult {
  orderId: number;
  orderNumber: number;
  customerEmail: string;
  actions: string[];
  invokeResults: unknown[];
}

export interface LowStockChainResult {
  inventoryItemId: number;
  variantId: number;
  productTitle: string;
  availableQty: number;
  affectedOrderCount: number;
  notifiedOrderCount: number;
  orderResults: LowStockOrderResult[];
  steps: ExecutionStep[];
  skipped?: boolean;
  skipReason?: string;
  dryRun?: {
    wouldNotify: Array<{ orderId: number; orderNumber: number; subject: string; message: string; priority: string }>;
  };
}

// ---- Low-stock condition evaluator ----
// Evaluates LowStockCondition types against a LowStockPolicyEvalContext.

function matchesLowStockCondition(cond: unknown, ctx: Record<string, unknown>): boolean {
  const c = cond as { type: string; value: unknown };
  switch (c.type) {
    case 'available_lte':
      return typeof ctx.availableQty === 'number' && ctx.availableQty <= (c.value as number);
    case 'order_total_gt':
      return typeof ctx.orderTotal === 'number' && ctx.orderTotal > (c.value as number);
    case 'affected_order_count_gt':
      return typeof ctx.affectedOrderCount === 'number' && ctx.affectedOrderCount > (c.value as number);
    default:
      return false;
  }
}

function evaluateLowStockPolicy(
  policy: CompiledPolicy,
  ctx: LowStockPolicyEvalContext
): Action[] {
  const ctxMap = ctx as unknown as Record<string, unknown>;
  for (const rule of policy.rules) {
    const conditions = rule.conditions as unknown[][];
    const matches = conditions.some(andGroup =>
      andGroup.every(cond => matchesLowStockCondition(cond, ctxMap))
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

export interface InventoryUpdatePayload {
  inventoryItemId: number;
  available: number;
}

export function extractInventoryUpdatePayload(payload: unknown): InventoryUpdatePayload {
  const p = payload as Record<string, unknown>;

  const inventoryItemId = p.inventory_item_id;
  if (typeof inventoryItemId !== 'number') {
    throw new Error('Could not extract inventory_item_id from webhook payload');
  }

  const available = p.available;
  if (typeof available !== 'number') {
    throw new Error('Could not extract available quantity from webhook payload');
  }

  return { inventoryItemId, available };
}

// ---- Low Stock Customer Impact tool chain ----

/**
 * Low Stock Customer Impact tool chain.
 *
 * Execution path:
 * 1. Extract inventoryItemId + available from webhook payload
 * 2. Resolve Shopify credentials
 * 3. If available > threshold → skip (inventory still healthy)
 * 4. Look up the variant that owns this inventory item
 * 5. Find all open orders containing this variant
 * 6. For each affected order:
 *    a. Build LowStockPolicyEvalContext with order + product data
 *    b. Evaluate policy (per-order) → actions
 *    c. Dispatch invoke actions (create ticket per affected customer)
 * 7. Return aggregate result
 */
export async function runLowStockImpactChain(
  inventoryPayload: InventoryUpdatePayload,
  userSkillConfig: UserSkillConfig,
  userId: string,
  deps: LowStockChainDeps,
  options: { dryRun?: boolean } = {}
): Promise<LowStockChainResult> {
  const { credentialManager, skillTemplateRegistry, adapterRegistry } = deps;
  const steps: ExecutionStep[] = [];
  const { inventoryItemId, available } = inventoryPayload;

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

  // ---- Check threshold ----
  const threshold = (userSkillConfig.fieldOverrides['threshold'] as number) ?? 0;
  const result: LowStockChainResult = {
    inventoryItemId,
    variantId: 0,
    productTitle: '',
    availableQty: available,
    affectedOrderCount: 0,
    notifiedOrderCount: 0,
    orderResults: [],
    steps,
  };

  const doneThreshold = stepTimer(steps, 'Check Threshold');
  if (available > threshold) {
    doneThreshold('skipped', `Inventory (${available}) is above threshold (${threshold}) — no action needed`, { available, threshold });
    result.skipped = true;
    result.skipReason = `Inventory (${available}) is above threshold (${threshold}) — no action needed`;
    return result;
  }
  doneThreshold('ok', `Inventory (${available}) is at or below threshold (${threshold}) — proceeding`, { available, threshold });

  // ---- Resolve variant from inventory item ----
  const variant = await shopifyAdapter.getVariantByInventoryItem(inventoryItemId, shopifyCredsMap);
  if (!variant) {
    result.skipped = true;
    result.skipReason = `No variant found for inventory item ${inventoryItemId}`;
    return result;
  }

  const variantId = variant.id;
  result.variantId = variantId;

  // ---- Get product title ----
  let productTitle = variant.title || 'Unknown Product';
  try {
    const title = await shopifyAdapter.getProductTitle(variant.product_id, shopifyCredsMap);
    productTitle = title || productTitle;
  } catch {
    // Non-fatal — use variant title as fallback
  }
  result.productTitle = productTitle;

  // ---- Find affected open orders ----
  const doneFindOrders = stepTimer(steps, 'Find Affected Orders');
  const affectedOrders = await shopifyAdapter.findOrdersByVariant(variantId, shopifyCredsMap);

  if (affectedOrders.length === 0) {
    doneFindOrders('skipped', 'No open orders contain this variant — no customers to notify', { variantId });
    result.skipped = true;
    result.skipReason = 'No open orders contain this variant — no customers to notify';
    return result;
  }
  doneFindOrders('ok', `Found ${affectedOrders.length} affected order(s)`, { variantId, count: affectedOrders.length });

  result.affectedOrderCount = affectedOrders.length;

  if (options.dryRun) {
    // Dry run: render previews without dispatching
    const doneSend = stepTimer(steps, 'Send Notifications');
    const previews: LowStockChainResult['dryRun'] = { wouldNotify: [] };

    for (const order of affectedOrders) {
      const customerName = order.customer
        ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(' ') || 'Valued Customer'
        : 'Valued Customer';

      const affectedItems: AffectedItemContext[] = order.line_items
        .filter(li => li.variant_id === variantId)
        .map(li => ({ title: li.title, sku: li.sku, quantity: li.quantity, variantId: li.variant_id }));

      const ctx: LowStockPolicyEvalContext = {
        inventoryItemId,
        variantId,
        productTitle,
        sku: variant.sku || '',
        availableQty: available,
        threshold,
        affectedOrderCount: affectedOrders.length,
        orderId: order.id,
        orderNumber: order.order_number,
        customerEmail: order.email,
        customerName,
        orderTotal: parseFloat(order.total_price) || 0,
        affectedItems,
      };

      const actions = evaluateLowStockPolicy(template.compiledPolicy, ctx);
      const invokeAction = actions.find(a => a.type === 'invoke') as AdapterAction | undefined;
      if (invokeAction?.templateKey) {
        const namedTemplates = userSkillConfig.namedTemplates ?? template.defaultTemplates;
        const raw = namedTemplates[invokeAction.templateKey];
        if (raw) {
          const msgTemplate = applyTemplateFieldOverrides(raw, invokeAction.templateKey, userSkillConfig.fieldOverrides ?? {});
          const branding = {
            companyName: (userSkillConfig.fieldOverrides['companyName'] as string) || '',
            logoUrl:     (userSkillConfig.fieldOverrides['logoUrl']     as string) || '',
            signature:   (userSkillConfig.fieldOverrides['signature']   as string) || '',
          };
          previews.wouldNotify.push({
            orderId: order.id,
            orderNumber: order.order_number,
            subject: renderLowStockSubject(msgTemplate.subject, ctx),
            message: renderLowStockTemplate(msgTemplate, { ...ctx, ...branding }),
            priority: String(invokeAction.params.priority ?? 'normal'),
          });
        }
      }
    }

    doneSend('sandbox', `Dry run — would notify ${previews.wouldNotify.length} order(s)`, {
      count: previews.wouldNotify.length,
      previews: previews.wouldNotify.map(p => ({
        orderNumber: p.orderNumber,
        subject: p.subject,
        messageHtml: p.message,
      })),
    });
    result.dryRun = previews;
    return result;
  }

  // ---- Live dispatch: one ticket per affected order ----
  for (const order of affectedOrders) {
    const customerName = order.customer
      ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(' ') || 'Valued Customer'
      : 'Valued Customer';

    const affectedItems: AffectedItemContext[] = order.line_items
      .filter(li => li.variant_id === variantId)
      .map(li => ({ title: li.title, sku: li.sku, quantity: li.quantity, variantId: li.variant_id }));

    const ctx: LowStockPolicyEvalContext = {
      inventoryItemId,
      variantId,
      productTitle,
      sku: variant.sku || '',
      availableQty: available,
      threshold,
      affectedOrderCount: affectedOrders.length,
      orderId: order.id,
      orderNumber: order.order_number,
      customerEmail: order.email,
      customerName,
      orderTotal: parseFloat(order.total_price) || 0,
      affectedItems,
    };

    const orderResult: LowStockOrderResult = {
      orderId: order.id,
      orderNumber: order.order_number,
      customerEmail: order.email,
      actions: [],
      invokeResults: [],
    };

    const actions = evaluateLowStockPolicy(template.compiledPolicy, ctx);

    for (const action of actions) {
      if (action.type === 'skip') {
        orderResult.actions.push('skip');
        break;
      }

      if (action.type === 'escalate') {
        console.warn(`[LowStockChain] escalate for order ${order.order_number}: ${action.message ?? '(no message)'}`);
        orderResult.actions.push('escalate');
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
          tags:          ['low-stock', 'automated'],
          ...invokeAction.params,
        };

        if (invokeAction.templateKey) {
          const namedTemplates = userSkillConfig.namedTemplates ?? template.defaultTemplates;
          const raw = namedTemplates[invokeAction.templateKey];
          if (!raw) {
            throw new Error(`Message template not found: ${invokeAction.templateKey}`);
          }

          const msgTemplate = applyTemplateFieldOverrides(raw, invokeAction.templateKey, userSkillConfig.fieldOverrides ?? {});
          const branding = {
            companyName: (userSkillConfig.fieldOverrides['companyName'] as string) || '',
            logoUrl:     (userSkillConfig.fieldOverrides['logoUrl']     as string) || '',
            signature:   (userSkillConfig.fieldOverrides['signature']   as string) || '',
          };
          const subject          = renderLowStockSubject(msgTemplate.subject, ctx);
          const message          = renderLowStockTemplate(msgTemplate, { ...ctx, ...branding });
          const messagePlainText = renderLowStockTemplatePlainText(msgTemplate, { ...ctx, signature: branding.signature });
          invokeParams = { ...invokeParams, subject, message, messagePlainText };
        }

        const doneAction = stepTimer(steps, `Notify Order #${order.order_number}`);
        try {
          const invokeResult = await adapterRegistry.invokeCapability(
            slot.integrationKey,
            invokeAction.capability,
            invokeParams,
            slotCreds as unknown as Record<string, unknown>
          );
          doneAction('ok', `Dispatched ${slot.integrationKey}:${invokeAction.capability} for order #${order.order_number}`, { orderId: order.id });
          orderResult.actions.push(`${slot.integrationKey}:${invokeAction.capability}`);
          orderResult.invokeResults.push(invokeResult);
        } catch (err) {
          doneAction('error', `Failed to dispatch ${slot.integrationKey}:${invokeAction.capability} for order #${order.order_number}`, { error: String(err) });
          throw err;
        }
      }
    }

    result.orderResults.push(orderResult);
    if (orderResult.actions.some(a => a.includes(':'))) {
      result.notifiedOrderCount++;
    }
  }

  return result;
}
