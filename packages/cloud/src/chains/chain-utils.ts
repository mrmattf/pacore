import type { Action, AdapterAction, UserSkillConfig, ExecutionStep, SkillTemplate } from '@pacore/core';
import type { CredentialManager } from '../mcp/credential-manager';
import type { AdapterRegistry } from '../integrations/adapter-registry';
import { executeEscalation, type EscalationContext } from '../skills/execute-escalation';

/**
 * Converts an HTML message string to readable plain text for use in
 * execution step previews. Block-level tags become newlines; all other
 * tags are stripped. Common HTML entities are decoded. Excess whitespace
 * is collapsed.
 */
export function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|table|thead|tbody|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Creates a step timer. Call the returned function to push a completed step. */
export function stepTimer(steps: ExecutionStep[], name: string) {
  const start = Date.now();
  return (status: ExecutionStep['status'], summary: string, detail?: unknown) => {
    steps.push({ name, status, summary, detail, duration_ms: Date.now() - start });
  };
}

/**
 * Resolves credentials for a named slot connection.
 * Throws with a clear message if the connection or credentials are missing.
 */
export async function resolveSlotCredential(
  slotKey: string,
  slotConnections: Record<string, string>,
  orgId: string,
  credentialManager: CredentialManager,
): Promise<Record<string, unknown>> {
  const connectionId = slotConnections[slotKey];
  if (!connectionId) throw new Error(`No connection configured for slot '${slotKey}'`);
  const creds = await credentialManager.getCredentials({ type: 'org', orgId }, connectionId);
  if (!creds) throw new Error(`No credentials found for slot '${slotKey}' (connection: ${connectionId})`);
  return creds as unknown as Record<string, unknown>;
}

/**
 * Dispatches a policy action list (skip / escalate / invoke) against the adapter registry.
 *
 * Template rendering is caller-provided via `buildParams` — each skill chain provides
 * its own rendering logic while this utility handles slot lookup, credential resolution,
 * adapter dispatch with error handling, and result collection.
 *
 * Not suitable for:
 * - Per-order iteration loops (low-stock pattern) — use stepTimer/resolveSlotCredential directly
 * - Dispatch loops with dryRun checks embedded mid-loop (backorder pattern)
 */
export async function dispatchActions(
  actions: Action[],
  template: SkillTemplate,
  userSkillConfig: UserSkillConfig,
  orgId: string,
  credentialManager: CredentialManager,
  adapterRegistry: AdapterRegistry,
  steps: ExecutionStep[],
  ctx: EscalationContext,
  buildParams: (invokeAction: AdapterAction) => Promise<Record<string, unknown>>,
  resultCollector: { actions: string[]; invokeResults: unknown[] },
): Promise<{ skipped: boolean }> {
  for (const action of actions) {
    if (action.type === 'skip') {
      resultCollector.actions.push('skip');
      return { skipped: true };
    }

    if (action.type === 'escalate') {
      await executeEscalation(action, ctx, userSkillConfig, template, orgId, { credentialManager, adapterRegistry });
      resultCollector.actions.push('escalate');
      continue;
    }

    if (action.type === 'invoke') {
      const invokeAction = action as AdapterAction;
      const slot = template.slots.find(s => s.key === invokeAction.targetSlot);
      if (!slot) throw new Error(`No slot '${invokeAction.targetSlot}' defined in template '${template.id}'`);

      const slotCreds = await resolveSlotCredential(
        invokeAction.targetSlot,
        userSkillConfig.slotConnections,
        orgId,
        credentialManager,
      );

      const invokeParams = await buildParams(invokeAction);

      const done = stepTimer(steps, `${invokeAction.capability} → ${slot.integrationKey}`);
      try {
        const invokeResult = await adapterRegistry.invokeCapability(
          slot.integrationKey,
          invokeAction.capability,
          invokeParams,
          slotCreds,
        );
        done('ok', `Dispatched ${slot.integrationKey}:${invokeAction.capability}`);
        resultCollector.actions.push(`${slot.integrationKey}:${invokeAction.capability}`);
        resultCollector.invokeResults.push(invokeResult);
      } catch (err) {
        done('error', `${slot.integrationKey} error: ${(err as Error).message}`);
        throw err;
      }
    }
  }
  return { skipped: false };
}
