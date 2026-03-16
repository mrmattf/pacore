import type { UserSkillConfig, SkillTemplate } from '@pacore/core';
import { CredentialManager } from '../mcp/credential-manager';
import { AdapterRegistry } from '../integrations/adapter-registry';

/**
 * Minimal context shared by all skill chains that can trigger an escalation.
 * Each chain passes its own evaluation context (which satisfies this interface).
 */
export interface EscalationContext {
  orderId: number;
  orderNumber: number;
  customerEmail: string;
  orderTotal: number;
}

/**
 * Executes an escalate action from a policy rule.
 *
 * When `action.targetSlot` is present → resolves the slot's adapter and dispatches
 * an internal plain-text ticket (not customer-facing) via `create_ticket`.
 *
 * When `action.targetSlot` is absent → logs a warning (backwards-compatible behaviour
 * for policies that don't configure an escalation channel yet).
 */
export async function executeEscalation(
  action: { type: 'escalate'; message?: string; targetSlot?: string },
  ctx: EscalationContext,
  userSkillConfig: UserSkillConfig,
  template: SkillTemplate,
  orgId: string,
  deps: {
    credentialManager: CredentialManager;
    adapterRegistry: AdapterRegistry;
  }
): Promise<void> {
  if (!action.targetSlot) {
    // No escalation channel configured — warn and continue.
    console.warn(`[Escalation] order #${ctx.orderNumber}: ${action.message ?? '(no message)'} — no targetSlot configured`);
    return;
  }

  const { credentialManager, adapterRegistry } = deps;
  const slotKey = action.targetSlot;

  const slot = template.slots.find(s => s.key === slotKey);
  if (!slot) {
    console.warn(`[Escalation] order #${ctx.orderNumber}: targetSlot '${slotKey}' not defined in template '${template.id}' — skipping`);
    return;
  }

  const connectionId = userSkillConfig.slotConnections[slotKey];
  if (!connectionId) {
    // Escalation slot is optional — if not connected, skip silently.
    console.warn(`[Escalation] order #${ctx.orderNumber}: no connection for slot '${slotKey}' — skipping`);
    return;
  }

  const creds = await credentialManager.getCredentials({ type: 'org', orgId }, connectionId);
  if (!creds) {
    console.warn(`[Escalation] order #${ctx.orderNumber}: no credentials for '${slot.integrationKey}' connection '${connectionId}' — skipping`);
    return;
  }

  const subject = `[Action Required] Escalation — Order #${ctx.orderNumber}`;
  const bodyLines: string[] = [
    `Order #${ctx.orderNumber} (ID: ${ctx.orderId}) requires attention.`,
    ``,
    `Customer: ${ctx.customerEmail}`,
    `Order Total: $${ctx.orderTotal.toFixed(2)}`,
  ];
  if (action.message) {
    bodyLines.push(``, `Reason: ${action.message}`);
  }
  const message = bodyLines.join('\n');

  try {
    await adapterRegistry.invokeCapability(
      slot.integrationKey,
      'create_ticket',
      {
        customerEmail: ctx.customerEmail,
        subject,
        message,
        messagePlainText: message,
        priority: 'high',
        tags: ['escalation', 'automated'],
      },
      creds as unknown as Record<string, unknown>
    );
    console.log(`[Escalation] order #${ctx.orderNumber}: escalation ticket created via ${slot.integrationKey}`);
  } catch (err) {
    // Escalation failures are non-fatal — the primary action (customer ticket) already succeeded.
    console.error(`[Escalation] order #${ctx.orderNumber}: failed to create escalation ticket via ${slot.integrationKey}: ${(err as Error).message}`);
  }
}
