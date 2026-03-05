import crypto from 'crypto';
import type { UserSkillConfig, AdapterAction } from '@pacore/core';
import type {
  BackorderPolicyEvalContext,
  BackorderedItemContext,
} from './backorder-types';
import { CredentialManager } from '../mcp/credential-manager';
import { ShopifyOrderAdapter } from '../integrations/shopify/shopify-order-adapter';
import { AdapterRegistry } from '../integrations/adapter-registry';
import { evaluatePolicy, runEnrichmentSteps, MCPToolCaller } from '../skills/logic-compiler';
import { renderTemplate, renderSubject } from '../skills/backorder-templates';
import { SkillTemplateRegistry } from '../skills/skill-template-registry';

export interface BackorderChainDeps {
  credentialManager: CredentialManager;
  skillTemplateRegistry: SkillTemplateRegistry;
  adapterRegistry: AdapterRegistry;
}

export interface BackorderChainResult {
  orderId: number;
  orderNumber: number;
  hasBackorders: boolean;
  backorderedCount: number;
  actions: string[];
  invokeResults: unknown[];
  dryRun?: {
    wouldCreateTicket?: { subject: string; message: string; priority: string };
    wouldSkip?: boolean;
  };
}

/**
 * Verifies Shopify HMAC webhook signature.
 * MUST be called before any processing. Throws if invalid.
 *
 * PLATFORM SECURITY REQUIREMENT: All Shopify webhooks must pass this check.
 */
export function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  hmacHeader: string,
  clientSecret: string
): void {
  const computed = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody)
    .digest('base64');

  if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader))) {
    throw new Error('Shopify webhook HMAC verification failed');
  }
}

/**
 * Backorder Detection tool chain — AdapterRegistry-based implementation.
 *
 * Execution path:
 * 1. Verify Shopify HMAC signature (platform security requirement)
 * 2. Resolve slot credentials from CredentialManager via connection IDs
 * 3. Get order + check inventory via ShopifyOrderAdapter
 * 4. Build BackorderPolicyEvalContext with backordered items
 * 5. Run DataEnrichmentSpec steps (e.g., fetch ETA from metafields)
 * 6. Evaluate CompiledPolicy → Action[]
 * 7. Dispatch all invoke actions via AdapterRegistry (supports N notification targets)
 *    — only 'skip' terminates the loop early
 */
export async function runBackorderDetectionV2(
  orderId: number,
  userSkillConfig: UserSkillConfig,
  userId: string,
  deps: BackorderChainDeps,
  options: { dryRun?: boolean; hmacHeader?: string; rawBody?: Buffer } = {}
): Promise<BackorderChainResult> {
  const { credentialManager, skillTemplateRegistry, adapterRegistry } = deps;

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

  // ---- HMAC verification (platform security requirement) ----
  if (options.hmacHeader && options.rawBody) {
    const clientSecret = shopifyCreds.clientSecret as string;
    if (!clientSecret) {
      throw new Error('Shopify clientSecret missing from credentials — cannot verify webhook');
    }
    verifyShopifyWebhookHmac(options.rawBody, options.hmacHeader, clientSecret);
  }

  const shopifyCredsMap = shopifyCreds as unknown as Record<string, unknown>;

  // ---- Fetch order + inventory ----
  const shopifyAdapter = new ShopifyOrderAdapter();
  const order = await shopifyAdapter.getOrder(orderId, shopifyCredsMap);

  const threshold = (userSkillConfig.fieldOverrides['threshold'] as number) ?? 0;
  const variantIds = order.lineItems.map(li => li.variantId).filter(Boolean);
  const inventoryResults = await shopifyAdapter.checkInventory(variantIds, shopifyCredsMap);

  const inventoryMap = new Map(inventoryResults.map(r => [r.variantId, r.available]));

  // ---- Build backordered items list ----
  const backorderedItems: BackorderedItemContext[] = order.lineItems
    .filter(li => {
      const available = inventoryMap.get(li.variantId) ?? 0;
      return available <= threshold;
    })
    .map(li => {
      const available = Math.max(0, inventoryMap.get(li.variantId) ?? 0);
      return {
        title:          li.title,
        sku:            li.sku,
        orderedQty:     li.quantity,
        availableQty:   available,
        backorderedQty: Math.max(0, li.quantity - available),
        variantId:      li.variantId,
      };
    });

  const result: BackorderChainResult = {
    orderId:          order.id,
    orderNumber:      order.orderNumber,
    hasBackorders:    backorderedItems.length > 0,
    backorderedCount: backorderedItems.length,
    actions:          [],
    invokeResults:    [],
  };

  if (backorderedItems.length === 0) {
    result.actions.push('skip');
    return result;
  }

  const customerName = order.customer
    ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ') || 'Valued Customer'
    : 'Valued Customer';

  // ---- Build evaluation context ----
  let ctx: BackorderPolicyEvalContext = {
    orderId:              order.id,
    orderNumber:          order.orderNumber,
    customerEmail:        order.email,
    customerName,
    orderTotal:           parseFloat(order.totalPrice) || 0,
    backorderedItems,
    allItemsBackordered:  backorderedItems.length === order.lineItems.length,
    someItemsBackordered: backorderedItems.length > 0,
    threshold,
  };

  // ---- Run enrichment steps ----
  // Enrichment tool calls route through AdapterRegistry for consistency.
  const mcpCaller: MCPToolCaller = {
    async callTool(tool, params) {
      if (tool.startsWith('shopify__')) {
        const capability = tool.replace('shopify__', '');
        return adapterRegistry.invokeCapability('shopify', capability, params, shopifyCredsMap);
      }
      throw new Error(`Unknown enrichment tool: ${tool}`);
    },
  };

  ctx = await runEnrichmentSteps(
    template.enrichmentSpec,
    ctx as any,
    mcpCaller
  ) as BackorderPolicyEvalContext;

  // ---- Evaluate policy ----
  const actions = evaluatePolicy(template.compiledPolicy, ctx as any);

  // ---- Dispatch actions ----
  // ALL invoke actions execute. Only 'skip' terminates the loop early.
  for (const action of actions) {
    if (action.type === 'skip') {
      result.actions.push('skip');
      break;
    }

    if (action.type === 'escalate') {
      console.warn(`[BackorderChain] escalate: ${action.message ?? '(no message)'}`);
      result.actions.push('escalate');
      continue;
    }

    if (action.type === 'invoke') {
      const invokeAction = action as AdapterAction;

      // Resolve the slot → integrationKey from the template definition
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

      // Build params — start with action.params, add context fields
      let invokeParams: Record<string, unknown> = {
        orderId:       String(ctx.orderId),
        customerEmail: ctx.customerEmail,
        customerName:  ctx.customerName,
        tags:          ['backorder', 'automated'],
        ...invokeAction.params,
      };

      // If templateKey is set, render subject+message and merge into params
      if (invokeAction.templateKey) {
        const stored = userSkillConfig.namedTemplates;
        const namedTemplates = (stored && Object.keys(stored).length > 0) ? stored : template.defaultTemplates;
        const msgTemplate = namedTemplates[invokeAction.templateKey];
        if (!msgTemplate) {
          throw new Error(`Message template not found: ${invokeAction.templateKey}`);
        }

        const branding = {
          companyName: (userSkillConfig.fieldOverrides['companyName'] as string) || '',
          logoUrl:     (userSkillConfig.fieldOverrides['logoUrl']     as string) || '',
          signature:   (userSkillConfig.fieldOverrides['signature']   as string) || '',
        };
        const subject = renderSubject(msgTemplate.subject, ctx as any);
        const message = renderTemplate(msgTemplate, { ...ctx, ...branding } as any);

        if (options.dryRun) {
          result.dryRun = {
            wouldCreateTicket: {
              subject,
              message,
              priority: String(invokeAction.params.priority ?? 'normal'),
            },
          };
          result.actions.push('dry_run');
          break;
        }

        invokeParams = { ...invokeParams, subject, message };
      }

      const invokeResult = await adapterRegistry.invokeCapability(
        slot.integrationKey,
        invokeAction.capability,
        invokeParams,
        slotCreds as unknown as Record<string, unknown>
      );

      result.actions.push(`${slot.integrationKey}:${invokeAction.capability}`);
      result.invokeResults.push(invokeResult);
    }
  }

  return result;
}
