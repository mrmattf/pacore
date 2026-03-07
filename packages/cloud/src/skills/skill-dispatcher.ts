import { SkillRegistry } from './skill-registry';
import { SkillTemplateRegistry } from './skill-template-registry';
import { MCPRegistry } from '../mcp/mcp-registry';
import { CredentialManager } from '../mcp/credential-manager';
import { AdapterRegistry } from '../integrations/adapter-registry';
import { runBackorderDetectionV2 } from '../chains/backorder-detection';
import { runLowStockImpactChain, extractInventoryUpdatePayload } from '../chains/low-stock-impact';
import { runHighRiskOrderChain } from '../chains/high-risk-order';
import { runDeliveryExceptionChain } from '../chains/delivery-exception';
import type { UserSkillConfig } from '@pacore/core';

/**
 * Routes a trigger event to the correct tool chain based on the activated skill's templateId.
 * Template-based skills use UserSkillConfig.templateId.
 */
export class SkillDispatcher {
  constructor(
    private skillRegistry: SkillRegistry,
    private mcpRegistry: MCPRegistry,
    private credentialManager: CredentialManager,
    private skillTemplateRegistry?: SkillTemplateRegistry,
    private adapterRegistry?: AdapterRegistry
  ) {}

  async dispatch(
    executionId: string,
    userSkillId: string,
    payload: unknown,
    options: { hmacHeader?: string; rawBody?: Buffer; dryRun?: boolean } = {}
  ): Promise<void> {
    const userSkill = await this.skillRegistry.getUserSkill(userSkillId);
    if (!userSkill) {
      await this.skillRegistry.failExecution(executionId, `UserSkill not found: ${userSkillId}`);
      return;
    }

    const userId = userSkill.userId;
    if (!userId) {
      await this.skillRegistry.failExecution(executionId, 'Only user-scoped skills are supported');
      return;
    }

    const config = userSkill.configuration as Record<string, unknown>;

    try {
      let result: unknown;

      if (config.templateId && this.skillTemplateRegistry) {
        // Template-based dispatch
        const userSkillConfig = config as unknown as UserSkillConfig;
        const template = this.skillTemplateRegistry.getTemplate(userSkillConfig.templateId);
        if (!template) {
          throw new Error(`Template not found: ${userSkillConfig.templateId}`);
        }

        switch (template.skillTypeId) {
          case 'backorder-notification': {
            if (!this.adapterRegistry) {
              throw new Error('AdapterRegistry is required for backorder-notification skills');
            }
            result = await runBackorderDetectionV2(
              extractOrderId(payload),
              userSkillConfig,
              userId,
              {
                credentialManager: this.credentialManager,
                skillTemplateRegistry: this.skillTemplateRegistry!,
                adapterRegistry: this.adapterRegistry,
              },
              options
            );
            break;
          }
          case 'low-stock-impact': {
            if (!this.adapterRegistry) {
              throw new Error('AdapterRegistry is required for low-stock-impact skills');
            }
            result = await runLowStockImpactChain(
              extractInventoryUpdatePayload(payload),
              userSkillConfig,
              userId,
              {
                credentialManager: this.credentialManager,
                skillTemplateRegistry: this.skillTemplateRegistry!,
                adapterRegistry: this.adapterRegistry,
              },
              { dryRun: options.dryRun }
            );
            break;
          }
          case 'high-risk-order-response': {
            if (!this.adapterRegistry) {
              throw new Error('AdapterRegistry is required for high-risk-order-response skills');
            }
            result = await runHighRiskOrderChain(
              extractOrderId(payload),
              userSkillConfig,
              userId,
              {
                credentialManager: this.credentialManager,
                skillTemplateRegistry: this.skillTemplateRegistry!,
                adapterRegistry: this.adapterRegistry,
              },
              { dryRun: options.dryRun }
            );
            break;
          }
          case 'delivery-exception-alert': {
            if (!this.adapterRegistry) {
              throw new Error('AdapterRegistry is required for delivery-exception-alert skills');
            }
            result = await runDeliveryExceptionChain(
              payload,
              userSkillConfig,
              userId,
              {
                credentialManager: this.credentialManager,
                skillTemplateRegistry: this.skillTemplateRegistry!,
                adapterRegistry: this.adapterRegistry,
              },
              { dryRun: options.dryRun }
            );
            break;
          }
          default:
            throw new Error(`Unknown skill type: ${template.skillTypeId}`);
        }
      } else {
        throw new Error('Legacy tool chain dispatch is no longer supported. Migrate to SkillTemplate.');
      }

      await this.skillRegistry.completeExecution(executionId, result);
    } catch (error) {
      await this.skillRegistry.failExecution(executionId, (error as Error).message);
    }
  }
}

function extractOrderId(payload: unknown): number {
  const p = payload as Record<string, unknown>;
  const id = p.id;
  if (typeof id === 'number') return id;
  if (typeof id === 'string') return parseInt(id, 10);
  throw new Error('Could not extract order ID from webhook payload');
}
