import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import type { SkillRegistry } from '../skills/skill-registry';
import type { SkillTemplateRegistry } from '../skills/skill-template-registry';
import type { SkillDispatcher } from '../skills/skill-dispatcher';
import type { OrgManager } from '../organizations/org-manager';
import type { AdapterRegistry } from '../integrations/adapter-registry';
import type { CredentialManager, CredentialScope } from '../mcp/credential-manager';
import type { BillingManager } from '../billing';
import { PlanLimitError } from '../billing';
import { isWebhookSourceAdapter } from '../integrations/slot-adapter';
import type { UserSkillConfig, WebhookVerification, SkillTrigger, BillingScope } from '@pacore/core';

interface AuthenticatedRequest extends Request {
  user?: { id: string; [key: string]: any };
}

function planLimitResponse(res: Response, err: PlanLimitError): Response {
  return res.status(402).json({
    error: err.message,
    limitKey: err.limitKey,
    currentPlan: err.currentPlan,
    limit: err.limit,
    current: err.current,
  });
}

async function fetchMostRecentShopifyOrderId(
  config: UserSkillConfig,
  orgId: string,
  credentialManager: CredentialManager,
): Promise<number | null> {
  try {
    const shopifyConnectionId = config.slotConnections?.['shopify'];
    if (!shopifyConnectionId) return null;

    const creds = await credentialManager.getCredentials(
      { type: 'org', orgId },
      shopifyConnectionId
    ) as Record<string, unknown> | null;
    if (!creds) return null;

    const storeDomain = creds.storeDomain as string;
    const accessToken = creds.accessToken as string;
    if (!storeDomain || !accessToken) return null;

    const ordersRes = await fetch(
      `https://${storeDomain}/admin/api/2026-01/orders.json?limit=1&status=any&fields=id`,
      { headers: { 'X-Shopify-Access-Token': accessToken } }
    );
    if (!ordersRes.ok) return null;

    const data = await ordersRes.json() as { orders: Array<{ id: number }> };
    return data.orders[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function autoRegisterWebhook(
  trigger: SkillTrigger,
  userSkillId: string,
  scope: CredentialScope,
  skillRegistry: SkillRegistry,
  skillTemplateRegistry: SkillTemplateRegistry,
  adapterRegistry: AdapterRegistry,
  credentialManager: CredentialManager,
): Promise<SkillTrigger> {
  try {
    const userSkill = await skillRegistry.getUserSkill(userSkillId);
    if (!userSkill?.configuration) return trigger;

    const config = userSkill.configuration as unknown as UserSkillConfig;
    const template = skillTemplateRegistry.getTemplate(config.templateId);
    if (!template) return trigger;

    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL?.replace(/\/$/, '') ?? '';
    if (!webhookBaseUrl) {
      console.warn('[autoRegisterWebhook] WEBHOOK_BASE_URL not set — skipping auto-registration');
      return trigger;
    }

    const webhookUrl = `${webhookBaseUrl}/v1/triggers/webhook/${trigger.endpointToken}`;

    for (const slot of template.slots) {
      const adapter = adapterRegistry.getAdapter(slot.integrationKey);
      if (!adapter || !isWebhookSourceAdapter(adapter)) continue;

      const topic = adapter.webhookTopics[template.skillTypeId];
      if (!topic) continue;

      const connectionId = config.slotConnections[slot.key];
      if (!connectionId) continue;

      const creds = await credentialManager.getCredentials(scope, connectionId);
      if (!creds) continue;

      const { externalWebhookId } = await adapter.registerWebhook(topic, webhookUrl, creds as Record<string, unknown>);
      await skillRegistry.setTriggerExternalWebhookId(trigger.id, externalWebhookId);

      let hmacSecret: string | undefined;
      const perConnectionSecret = (creds as Record<string, unknown>).clientSecret as string | undefined;
      if (perConnectionSecret) {
        hmacSecret = perConnectionSecret;
      } else {
        try {
          hmacSecret = adapter.getWebhookHmacSecret();
        } catch {
          // Secret not available — skip HMAC configuration
        }
      }
      if (hmacSecret) {
        const verification: WebhookVerification = {
          type: 'hmac_sha256',
          header: 'x-shopify-hmac-sha256',
          secret: hmacSecret,
        };
        await skillRegistry.updateTriggerVerification(trigger.id, verification);
      }

      console.log(`[autoRegisterWebhook] Registered ${slot.integrationKey} webhook GID=${externalWebhookId} for trigger ${trigger.id}`);
      return { ...trigger, externalWebhookId };
    }
  } catch (err: any) {
    console.warn(`[autoRegisterWebhook] Auto-registration failed for trigger ${trigger.id}: ${err.message}`);
  }

  return trigger;
}

async function deregisterAndDeleteTrigger(
  triggerId: string,
  userSkillId: string,
  scope: CredentialScope,
  skillRegistry: SkillRegistry,
  skillTemplateRegistry: SkillTemplateRegistry,
  adapterRegistry: AdapterRegistry,
  credentialManager: CredentialManager,
): Promise<void> {
  const trigger = await skillRegistry.getTrigger(triggerId);
  if (!trigger) return;

  if (trigger.externalWebhookId) {
    try {
      const userSkill = await skillRegistry.getUserSkill(userSkillId);
      const config = userSkill?.configuration as unknown as UserSkillConfig | undefined;
      const template = config?.templateId ? skillTemplateRegistry.getTemplate(config.templateId) : null;

      if (template) {
        for (const slot of template.slots) {
          const adapter = adapterRegistry.getAdapter(slot.integrationKey);
          if (!adapter || !isWebhookSourceAdapter(adapter)) continue;

          const connectionId = config!.slotConnections[slot.key];
          if (!connectionId) continue;

          const creds = await credentialManager.getCredentials(scope, connectionId);
          if (!creds) continue;

          await adapter.deregisterWebhook(trigger.externalWebhookId, creds as Record<string, unknown>);
          console.log(`[deregisterAndDeleteTrigger] Deregistered ${slot.integrationKey} webhook GID=${trigger.externalWebhookId}`);
          break;
        }
      }
    } catch (err: any) {
      console.warn(`[deregisterAndDeleteTrigger] Deregistration failed for trigger ${triggerId}: ${err.message}`);
    }
  }

  await skillRegistry.deleteTrigger(triggerId);
}

async function testIntegrationCredentials(
  integrationKey: string,
  credentials: Record<string, unknown>,
  adapterRegistry?: AdapterRegistry,
): Promise<void> {
  const adapter = adapterRegistry?.getAdapter(integrationKey);
  if (adapter) {
    await adapter.testCredentials(credentials);
  }
}

export function createSkillRoutes(
  db: Pool,
  skillRegistry: SkillRegistry,
  skillTemplateRegistry: SkillTemplateRegistry | undefined,
  skillDispatcher: SkillDispatcher,
  orgManager: OrgManager,
  adapterRegistry: AdapterRegistry | undefined,
  credentialManager: CredentialManager,
  billingManager: BillingManager | undefined,
): Router {
  const router = Router();

  // ---- Platform-wide skill catalog ----

  router.get('/v1/skills', async (req: AuthenticatedRequest, res: Response) => {
    try {
      res.json(skillRegistry.listSkills());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/v1/skills/:skillId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const def = skillRegistry.getSkillDefinition(req.params.skillId);
      if (!def) return res.status(404).json({ error: 'Skill not found' });
      res.json(def);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---- Skill Template Registry endpoints ----

  router.get('/v1/skill-types', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!skillTemplateRegistry) return res.json([]);
      const types = skillTemplateRegistry.getSkillTypes().map(type => ({
        ...type,
        templateCount: skillTemplateRegistry.getTemplatesForType(type.id).length,
        templateNames: skillTemplateRegistry.getTemplatesForType(type.id).map(t => t.name),
      }));
      res.json(types);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/v1/skill-types/:typeId/templates', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!skillTemplateRegistry) return res.json([]);
      const { typeId } = req.params;
      const skillType = skillTemplateRegistry.getSkillType(typeId);
      if (!skillType) return res.status(404).json({ error: 'Skill type not found' });
      const templates = skillTemplateRegistry.getTemplatesForType(typeId).map(t => ({
        id: t.id,
        skillTypeId: t.skillTypeId,
        name: t.name,
        version: t.version,
        author: t.author,
        price: t.price,
        slots: t.slots,
        editableFields: t.editableFields,
        templateVariables: t.templateVariables,
      }));
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/v1/skill-types/:typeId/template-requests', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { typeId } = req.params;
      const { integrationCombo, description } = req.body as { integrationCombo: string; description?: string };
      if (!integrationCombo) return res.status(400).json({ error: 'integrationCombo is required' });
      await db.query(
        `INSERT INTO skill_template_requests (skill_type_id, integration_combo, description, vote_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (skill_type_id, integration_combo)
         DO UPDATE SET vote_count = skill_template_requests.vote_count + 1`,
        [typeId, integrationCombo, description ?? '']
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---- Integration connection fields (no auth needed — schemas are not sensitive) ----

  router.get('/v1/integrations/:key/fields', (req: Request, res: Response) => {
    const { key } = req.params;
    if (!adapterRegistry) return res.status(503).json({ error: 'AdapterRegistry not configured' });
    const meta = adapterRegistry.getCredentialFields(key);
    if (!meta) return res.status(404).json({ error: `No adapter registered for integration '${key}'` });
    res.json(meta);
  });

  // ---- Org-level skill activations (/v1/organizations/:orgId/skills) ----

  // Activate a skill for an org (admin only)
  router.post('/v1/organizations/:orgId/skills/:skillId/activate', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, skillId } = req.params;
      await orgManager.assertAdmin(orgId, req.user!.id);

      if (billingManager) {
        try {
          await billingManager.checkLimit({ type: 'org', orgId }, 'activeSkills');
        } catch (e) {
          if (e instanceof PlanLimitError) return planLimitResponse(res, e);
          throw e;
        }
      }

      const userSkill = await skillRegistry.activateSkill({ type: 'org', orgId }, skillId);
      res.status(201).json(userSkill);
    } catch (error: any) {
      console.error('Activate org skill error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // List org's active skills (member access)
  router.get('/v1/organizations/:orgId/skills', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId } = req.params;
      await orgManager.assertMember(orgId, req.user!.id);
      const skills = await skillRegistry.listOrgSkills(orgId);
      res.json(skills);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get a single org skill
  router.get('/v1/organizations/:orgId/skills/:userSkillId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userSkillId } = req.params;
      await orgManager.assertMember(orgId, req.user!.id);
      const skill = await skillRegistry.getUserSkill(userSkillId);
      if (!skill) return res.status(404).json({ error: 'Skill not found' });
      res.json(skill);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Configure an org skill (admin only)
  router.put('/v1/organizations/:orgId/skills/:userSkillId/configure', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userSkillId } = req.params;
      await orgManager.assertAdmin(orgId, req.user!.id);
      const { status, ...configuration } = req.body;
      const updated = await skillRegistry.configureSkill(userSkillId, configuration, status === 'active');
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // List triggers for an org skill (member access)
  router.get('/v1/organizations/:orgId/skills/:userSkillId/triggers', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userSkillId } = req.params;
      await orgManager.assertMember(orgId, req.user!.id);
      const triggers = await skillRegistry.listTriggersForSkill(userSkillId);
      res.json(triggers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a webhook trigger for an org skill (admin only)
  router.post('/v1/organizations/:orgId/skills/:userSkillId/triggers', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userSkillId } = req.params;
      await orgManager.assertAdmin(orgId, req.user!.id);
      let trigger = await skillRegistry.createWebhookTrigger(userSkillId, req.body.verification);
      if (skillTemplateRegistry && adapterRegistry) {
        trigger = await autoRegisterWebhook(
          trigger, userSkillId, { type: 'org', orgId },
          skillRegistry, skillTemplateRegistry, adapterRegistry, credentialManager
        );
      }
      res.status(201).json(trigger);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a webhook trigger (deregisters from source platform)
  router.delete('/v1/organizations/:orgId/skills/:userSkillId/triggers/:triggerId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userSkillId, triggerId } = req.params;
      await orgManager.assertAdmin(orgId, req.user!.id);
      if (skillTemplateRegistry && adapterRegistry) {
        await deregisterAndDeleteTrigger(
          triggerId, userSkillId, { type: 'org', orgId },
          skillRegistry, skillTemplateRegistry, adapterRegistry, credentialManager
        );
      } else {
        await skillRegistry.deleteTrigger(triggerId);
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete org trigger error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update trigger verification for an org skill (admin only)
  router.put('/v1/organizations/:orgId/skills/:userSkillId/triggers/:triggerId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, triggerId } = req.params;
      await orgManager.assertAdmin(orgId, req.user!.id);
      await skillRegistry.updateTriggerVerification(triggerId, req.body as WebhookVerification);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Execution history for an org skill (member access)
  router.get('/v1/organizations/:orgId/skills/:userSkillId/executions', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userSkillId } = req.params;
      await orgManager.assertMember(orgId, req.user!.id);
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const executions = await skillRegistry.listExecutions(userSkillId, limit, orgId);
      res.json(executions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fire a test event (dry-run mode, member access)
  router.post('/v1/organizations/:orgId/skills/:userSkillId/test-event', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userSkillId } = req.params;
      await orgManager.assertMember(orgId, req.user!.id);

      const userSkill = await skillRegistry.getUserSkill(userSkillId);
      if (!userSkill) return res.status(404).json({ error: 'Skill not found' });

      const config = userSkill.configuration as unknown as UserSkillConfig;
      if (!config?.templateId || !skillTemplateRegistry) {
        return res.status(400).json({ error: 'Skill has no template configured' });
      }

      const template = skillTemplateRegistry.getTemplate(config.templateId);
      if (!template) return res.status(400).json({ error: 'Template not found' });

      let fixturePayload: unknown;
      switch (template.skillTypeId) {
        case 'backorder-notification':
        case 'high-risk-order-response': {
          const recentOrderId = await fetchMostRecentShopifyOrderId(config, orgId, credentialManager);
          fixturePayload = { id: recentOrderId ?? 99999999 };
          break;
        }
        case 'low-stock-impact':
          fixturePayload = { inventory_item_id: 12345678, available: 0 };
          break;
        case 'delivery-exception-alert':
          fixturePayload = {
            msg: {
              tracking_number: 'TEST123456789',
              slug: 'ups',
              tag: 'Exception',
              subtag: 'Exception_001',
              subtag_message: 'Package delayed in transit',
              order_id: '99999999',
            },
          };
          break;
        default:
          return res.status(400).json({ error: `Unsupported skill type for test events: ${template.skillTypeId}` });
      }

      const execution = await skillRegistry.createExecution(userSkillId, null, fixturePayload, { sandbox: true });
      await skillDispatcher.dispatch(execution.id, userSkillId, fixturePayload, { dryRun: true });

      const updated = await db.query('SELECT * FROM skill_executions WHERE id = $1', [execution.id]);
      res.json(updated.rows[0] ?? execution);
    } catch (error: any) {
      console.error('Test event error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Deactivate an org skill (admin only)
  router.delete('/v1/organizations/:orgId/skills/:userSkillId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userSkillId } = req.params;
      await orgManager.assertAdmin(orgId, req.user!.id);
      await skillRegistry.deleteUserSkill(userSkillId, orgId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---- Org connections (/v1/organizations/:orgId/connections) ----

  router.get('/v1/organizations/:orgId/connections', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { orgId } = req.params;
      await orgManager.assertMember(orgId, userId);
      const result = await db.query(
        `SELECT id, integration_key, display_name, status, last_tested_at, created_at
         FROM integration_connections WHERE org_id = $1 ORDER BY created_at DESC`,
        [orgId]
      );
      res.json(result.rows.map((r: any) => ({
        id: r.id,
        integrationKey: r.integration_key,
        displayName: r.display_name,
        status: r.status,
        lastTestedAt: r.last_tested_at,
        createdAt: r.created_at,
      })));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/v1/organizations/:orgId/connections', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { orgId } = req.params;
      await orgManager.assertMember(orgId, userId);
      const { integrationKey, displayName, credentials } = req.body as {
        integrationKey: string;
        displayName: string;
        credentials: Record<string, unknown>;
      };

      if (!integrationKey || !displayName || !credentials) {
        return res.status(400).json({ error: 'integrationKey, displayName, and credentials are required' });
      }

      await testIntegrationCredentials(integrationKey, credentials, adapterRegistry);

      const connectionId = randomUUID();
      await db.query(
        `INSERT INTO integration_connections (id, org_id, integration_key, display_name, status, last_tested_at)
         VALUES ($1, $2, $3, $4, 'active', NOW())`,
        [connectionId, orgId, integrationKey, displayName]
      );
      await credentialManager.storeCredentials({ type: 'org', orgId }, connectionId, credentials as any);
      res.status(201).json({ connectionId, displayName, status: 'active' });
    } catch (error: any) {
      console.error('Create org connection error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/v1/organizations/:orgId/connections/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { orgId, id } = req.params;
      await orgManager.assertMember(orgId, userId);
      await db.query('DELETE FROM integration_connections WHERE id = $1 AND org_id = $2', [id, orgId]);
      await credentialManager.deleteCredentials({ type: 'org', orgId }, id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---- Skill Pause / Resume (org — admin only) ----

  router.put('/v1/organizations/:orgId/skills/:userSkillId/pause', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userSkillId } = req.params;
      await orgManager.assertAdmin(orgId, req.user!.id);
      await skillRegistry.updateSkillStatus(userSkillId, 'paused');

      const triggers = await skillRegistry.listTriggersForSkill(userSkillId);
      for (const trigger of triggers) {
        try {
          if (skillTemplateRegistry && adapterRegistry) {
            await deregisterAndDeleteTrigger(
              trigger.id, userSkillId, { type: 'org', orgId },
              skillRegistry, skillTemplateRegistry, adapterRegistry, credentialManager
            );
          } else {
            await skillRegistry.deleteTrigger(trigger.id);
          }
        } catch (err: any) {
          console.warn(`[org pause] Failed to deregister trigger ${trigger.id}:`, err.message);
        }
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
    }
  });

  router.put('/v1/organizations/:orgId/skills/:userSkillId/resume', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userSkillId } = req.params;
      await orgManager.assertAdmin(orgId, req.user!.id);

      if (billingManager) {
        try {
          await billingManager.checkLimit({ type: 'org', orgId }, 'activeSkills');
        } catch (e) {
          if (e instanceof PlanLimitError) return planLimitResponse(res, e);
          throw e;
        }
      }

      await skillRegistry.updateSkillStatus(userSkillId, 'active');

      const existing = await skillRegistry.listTriggersForSkill(userSkillId);
      if (existing.length === 0 && skillTemplateRegistry && adapterRegistry) {
        try {
          const trigger = await skillRegistry.createWebhookTrigger(userSkillId, { type: 'none' });
          await autoRegisterWebhook(
            trigger, userSkillId, { type: 'org', orgId },
            skillRegistry, skillTemplateRegistry, adapterRegistry, credentialManager
          );
        } catch (err: any) {
          console.warn(`[org resume] Failed to re-register webhook for ${userSkillId}:`, err.message);
        }
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
    }
  });

  return router;
}
