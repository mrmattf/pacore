import { SkillRegistry } from './skill-registry';
import { MCPRegistry } from '../mcp/mcp-registry';
import { CredentialManager, CredentialScope } from '../mcp/credential-manager';
import { runBackorderDetection } from '../chains/backorder-detection';

/**
 * Routes a trigger event to the correct tool chain based on the activated skill's config.
 */
export class SkillDispatcher {
  constructor(
    private skillRegistry: SkillRegistry,
    private mcpRegistry: MCPRegistry,
    private credentialManager: CredentialManager
  ) {}

  async dispatch(
    executionId: string,
    userSkillId: string,
    payload: unknown
  ): Promise<void> {
    const userSkill = await this.skillRegistry.getUserSkill(userSkillId);
    if (!userSkill) {
      await this.skillRegistry.failExecution(executionId, `UserSkill not found: ${userSkillId}`);
      return;
    }

    const definition = this.skillRegistry.getSkillDefinition(userSkill.skillId);
    if (!definition) {
      await this.skillRegistry.failExecution(executionId, `Skill definition not found: ${userSkill.skillId}`);
      return;
    }

    const scope: CredentialScope = userSkill.orgId
      ? { type: 'org',  orgId:  userSkill.orgId  }
      : { type: 'user', userId: userSkill.userId! };

    try {
      let result: unknown;

      switch (definition.toolChain) {
        case 'backorder-detection': {
          const cfg = userSkill.configuration as Record<string, unknown>;

          result = await runBackorderDetection(
            extractOrderId(payload),
            {
              scope,
              shopifyDomain:        cfg.shopifyDomain       as string,
              shopifyClientId:      cfg.shopifyClientId     as string,
              shopifyClientSecret:  cfg.shopifyClientSecret as string,
              gorgiasApiKey:        cfg.gorgiasApiKey       as string,
              gorgiasEmail:         cfg.gorgiasEmail        as string,
              gorgiasFromEmail:     cfg.gorgiasFromEmail    as string | undefined,
              notificationToolName: (cfg.notificationToolName as string) ?? 'gorgias.create_ticket',
              inventoryThreshold:   (cfg.inventoryThreshold  as number)  ?? 0,
              subjectTemplate:      (cfg.subjectTemplate     as string)
                ?? 'Order #{orderNumber} — Backorder Update',
            },
            { mcpRegistry: this.mcpRegistry }
          );
          break;
        }

        default:
          throw new Error(`Unknown tool chain: ${definition.toolChain}`);
      }

      await this.skillRegistry.completeExecution(executionId, result);
    } catch (error) {
      await this.skillRegistry.failExecution(executionId, (error as Error).message);
    }
  }
}

/**
 * Extract order ID from a Shopify webhook payload.
 * Shopify sends the full order object — `id` is the internal numeric ID.
 */
function extractOrderId(payload: unknown): number {
  const p = payload as Record<string, unknown>;
  const id = p.id;
  if (typeof id === 'number') return id;
  if (typeof id === 'string') return parseInt(id, 10);
  throw new Error('Could not extract order ID from webhook payload');
}
