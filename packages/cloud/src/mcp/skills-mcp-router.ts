import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { CredentialManager } from './credential-manager';
import { AdapterRegistry } from '../integrations/adapter-registry';
import { isWebhookSourceAdapter } from '../integrations/slot-adapter';
import { SkillRegistry } from '../skills/skill-registry';
import { SkillTemplateRegistry } from '../skills/skill-template-registry';
import type { UserSkillConfig } from '@pacore/core';

/**
 * MCP tools exposed by the platform:skills server.
 * Used by Claude Code, Claude Desktop, or any MCP-compatible client to
 * orchestrate skill setup, testing, and management — without writing custom agent code.
 *
 * Authentication: x-user-id header (set by the MCP client using the user's JWT).
 */
const SKILLS_TOOLS = [
  {
    name: 'pacore_list_skill_templates',
    description: 'List all available skill templates. Returns template ID, name, required integrations (slots), and editable fields.',
    inputSchema: {
      type: 'object',
      properties: {
        skillTypeId: {
          type: 'string',
          description: 'Optional: filter by skill type ID (e.g. "backorder-notification")',
        },
      },
    },
  },
  {
    name: 'pacore_list_connections',
    description: 'List all integration connections saved for this user.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'pacore_test_connection',
    description: 'Test credentials for an integration without saving them. Returns success or a descriptive error.',
    inputSchema: {
      type: 'object',
      properties: {
        integrationKey: {
          type: 'string',
          description: 'Integration key (e.g. "shopify", "gorgias", "reamaze")',
        },
        credentials: {
          type: 'object',
          description: 'Integration-specific credential fields (see pacore_list_skill_templates slots for field names)',
          additionalProperties: true,
        },
      },
      required: ['integrationKey', 'credentials'],
    },
  },
  {
    name: 'pacore_save_connection',
    description: 'Test and save an integration connection. Returns the new connection ID.',
    inputSchema: {
      type: 'object',
      properties: {
        integrationKey: {
          type: 'string',
          description: 'Integration key (e.g. "shopify", "gorgias", "reamaze")',
        },
        displayName: {
          type: 'string',
          description: 'Human-friendly name for this connection (e.g. "My Shopify Store")',
        },
        credentials: {
          type: 'object',
          description: 'Integration-specific credential fields',
          additionalProperties: true,
        },
      },
      required: ['integrationKey', 'displayName', 'credentials'],
    },
  },
  {
    name: 'pacore_activate_skill',
    description: 'Activate a skill template for this user. Returns the userSkillId to use for configure/trigger calls.',
    inputSchema: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: 'Skill template ID (e.g. "backorder-shopify-gorgias")',
        },
      },
      required: ['templateId'],
    },
  },
  {
    name: 'pacore_configure_skill',
    description: 'Configure a user skill: set slot connection IDs and field overrides.',
    inputSchema: {
      type: 'object',
      properties: {
        userSkillId: {
          type: 'string',
          description: 'User skill ID returned by pacore_activate_skill',
        },
        slotConnections: {
          type: 'object',
          description: 'Map of slot key → connection ID (e.g. {"shopify": "<connectionId>", "notification": "<connectionId>"})',
          additionalProperties: { type: 'string' },
        },
        fieldOverrides: {
          type: 'object',
          description: 'Map of field key → value for editable fields (e.g. {"companyName": "My Store"})',
          additionalProperties: true,
        },
      },
      required: ['userSkillId', 'slotConnections'],
    },
  },
  {
    name: 'pacore_create_trigger',
    description: 'Create a webhook trigger for a configured skill. If the skill uses Shopify, automatically registers the webhook with Shopify and configures HMAC verification.',
    inputSchema: {
      type: 'object',
      properties: {
        userSkillId: {
          type: 'string',
          description: 'User skill ID',
        },
      },
      required: ['userSkillId'],
    },
  },
  {
    name: 'pacore_get_execution_log',
    description: 'Get the execution history for a skill. Returns recent executions with status, payload, result, and errors.',
    inputSchema: {
      type: 'object',
      properties: {
        userSkillId: {
          type: 'string',
          description: 'User skill ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of executions to return (default 20)',
        },
      },
      required: ['userSkillId'],
    },
  },
  {
    name: 'pacore_delete_skill',
    description: 'Delete a user skill and deregister any auto-registered webhooks from the source platform.',
    inputSchema: {
      type: 'object',
      properties: {
        userSkillId: {
          type: 'string',
          description: 'User skill ID to delete',
        },
      },
      required: ['userSkillId'],
    },
  },
  {
    name: 'pacore_get_integration_fields',
    description: 'Get the credential fields and setup guide for an integration. Use this to know what credentials to collect before calling pacore_save_connection.',
    inputSchema: {
      type: 'object',
      properties: {
        integrationKey: {
          type: 'string',
          description: 'Integration key (e.g. "shopify", "gorgias", "reamaze", "zendesk", "slack", "aftership")',
        },
      },
      required: ['integrationKey'],
    },
  },
];

/**
 * Creates the platform:skills MCP Express router.
 * Mount at /internal/mcp/skills in the gateway.
 */
export function createSkillsMcpRouter(
  db: Pool,
  credentialManager: CredentialManager,
  adapterRegistry: AdapterRegistry,
  skillRegistry: SkillRegistry,
  skillTemplateRegistry: SkillTemplateRegistry
): Router {
  const router = Router();

  router.post('/tools/list', (_req: Request, res: Response) => {
    res.json({ tools: SKILLS_TOOLS });
  });

  router.post('/tools/call', async (req: Request, res: Response) => {
    const { name, arguments: args = {} } = req.body as { name: string; arguments?: Record<string, unknown> };
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'Missing x-user-id header' });
    }

    try {
      const result = await dispatchTool(name, args, userId, {
        db, credentialManager, adapterRegistry, skillRegistry, skillTemplateRegistry,
      });
      res.json({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}

interface ToolDeps {
  db: Pool;
  credentialManager: CredentialManager;
  adapterRegistry: AdapterRegistry;
  skillRegistry: SkillRegistry;
  skillTemplateRegistry: SkillTemplateRegistry;
}

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  deps: ToolDeps
): Promise<unknown> {
  switch (name) {
    case 'pacore_list_skill_templates': {
      const { skillTypeId } = args as { skillTypeId?: string };
      const templates = skillTypeId
        ? deps.skillTemplateRegistry.getTemplatesForType(skillTypeId)
        : deps.skillTemplateRegistry.getAllTemplates();
      return templates.map(t => ({
        id:           t.id,
        skillTypeId:  t.skillTypeId,
        name:         t.name,
        version:      t.version,
        price:        t.price,
        slots:        t.slots.map(s => ({ key: s.key, label: s.label, integrationKey: s.integrationKey, required: s.required })),
        editableFields: t.editableFields.map(f => ({ key: f.key, label: f.label, type: f.type, defaultValue: f.defaultValue, hint: f.hint })),
      }));
    }

    case 'pacore_list_connections': {
      const result = await deps.db.query(
        `SELECT id, integration_key, display_name, status, last_tested_at, created_at
         FROM integration_connections WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      return result.rows.map(r => ({
        id:             r.id,
        integrationKey: r.integration_key,
        displayName:    r.display_name,
        status:         r.status,
        lastTestedAt:   r.last_tested_at,
        createdAt:      r.created_at,
      }));
    }

    case 'pacore_get_integration_fields': {
      const { integrationKey } = args as { integrationKey: string };
      const fields = deps.adapterRegistry.getCredentialFields(integrationKey);
      if (!fields) throw new Error(`No adapter registered for integrationKey '${integrationKey}'`);
      return fields;
    }

    case 'pacore_test_connection': {
      const { integrationKey, credentials } = args as { integrationKey: string; credentials: Record<string, unknown> };
      const adapter = deps.adapterRegistry.getAdapter(integrationKey);
      if (!adapter) throw new Error(`No adapter registered for '${integrationKey}'`);
      await adapter.testCredentials(credentials);
      return { success: true, message: 'Credentials are valid' };
    }

    case 'pacore_save_connection': {
      const { integrationKey, displayName, credentials } = args as {
        integrationKey: string;
        displayName: string;
        credentials: Record<string, unknown>;
      };

      const adapter = deps.adapterRegistry.getAdapter(integrationKey);
      if (!adapter) throw new Error(`No adapter registered for '${integrationKey}'`);

      // Test first
      await adapter.testCredentials(credentials);

      const connectionId = randomUUID();
      await deps.db.query(
        `INSERT INTO integration_connections (id, user_id, integration_key, display_name, status, last_tested_at)
         VALUES ($1, $2, $3, $4, 'active', NOW())`,
        [connectionId, userId, integrationKey, displayName]
      );
      await deps.credentialManager.storeCredentials(
        { type: 'user', userId },
        connectionId,
        credentials
      );
      return { connectionId, integrationKey, displayName, status: 'active' };
    }

    case 'pacore_activate_skill': {
      const { templateId } = args as { templateId: string };
      const template = deps.skillTemplateRegistry.getTemplate(templateId);
      if (!template) throw new Error(`Skill template '${templateId}' not found`);

      // Check if user already has a pending/active skill for this template
      const existing = await deps.db.query(
        `SELECT id FROM user_skills WHERE user_id = $1 AND (configuration->>'templateId') = $2 AND status != 'paused' LIMIT 1`,
        [userId, templateId]
      );
      if (existing.rows.length > 0) {
        return { userSkillId: existing.rows[0].id, templateId, status: 'already_active', message: 'Skill already activated' };
      }

      const userSkill = await deps.skillRegistry.activateSkill(
        { type: 'user', userId },
        template.skillTypeId  // skillId in skill catalog; templates use skillTypeId as the catalog key
      );
      // Store templateId immediately so pacore_configure_skill can read it
      await deps.skillRegistry.configureSkill(userSkill.id, { templateId });
      return { userSkillId: userSkill.id, templateId, status: 'pending' };
    }

    case 'pacore_configure_skill': {
      const { userSkillId, slotConnections, fieldOverrides = {} } = args as {
        userSkillId: string;
        slotConnections: Record<string, string>;
        fieldOverrides?: Record<string, unknown>;
      };

      const userSkill = await deps.skillRegistry.getUserSkill(userSkillId);
      if (!userSkill) throw new Error(`UserSkill '${userSkillId}' not found`);

      // Get the current templateId from configuration or try to infer it
      const existingConfig = userSkill.configuration as Partial<UserSkillConfig>;
      const templateId = existingConfig.templateId;
      if (!templateId) throw new Error('Skill has no templateId — configure was not called after activate');

      const template = deps.skillTemplateRegistry.getTemplate(templateId);
      if (!template) throw new Error(`Template '${templateId}' not found`);

      const config: UserSkillConfig = {
        templateId,
        slotConnections,
        fieldOverrides: fieldOverrides as Record<string, unknown>,
        namedTemplates: existingConfig.namedTemplates ?? template.defaultTemplates,
      };

      const updated = await deps.skillRegistry.configureSkill(userSkillId, config as unknown as Record<string, unknown>, true);
      return { userSkillId: updated.id, status: updated.status, configuration: config };
    }

    case 'pacore_create_trigger': {
      const { userSkillId } = args as { userSkillId: string };

      const trigger = await deps.skillRegistry.createWebhookTrigger(userSkillId);

      // Auto-register webhook with Shopify (if applicable)
      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL?.replace(/\/$/, '') ?? '';
      if (webhookBaseUrl) {
        try {
          const userSkill = await deps.skillRegistry.getUserSkill(userSkillId);
          const config = userSkill?.configuration as unknown as UserSkillConfig | undefined;
          const template = config?.templateId ? deps.skillTemplateRegistry.getTemplate(config.templateId) : null;

          if (template && config) {
            const webhookUrl = `${webhookBaseUrl}/v1/triggers/webhook/${trigger.endpointToken}`;
            for (const slot of template.slots) {
              const adapter = deps.adapterRegistry.getAdapter(slot.integrationKey);
              if (!adapter || !isWebhookSourceAdapter(adapter)) continue;

              const topic = adapter.webhookTopics[template.skillTypeId];
              if (!topic) continue;

              const connectionId = config.slotConnections[slot.key];
              if (!connectionId) continue;

              const creds = await deps.credentialManager.getCredentials({ type: 'user', userId }, connectionId);
              if (!creds) continue;

              const { externalWebhookId } = await adapter.registerWebhook(topic, webhookUrl, creds as Record<string, unknown>);
              await deps.skillRegistry.setTriggerExternalWebhookId(trigger.id, externalWebhookId);

              const clientSecret = (creds as Record<string, unknown>).clientSecret as string | undefined;
              if (clientSecret) {
                await deps.skillRegistry.updateTriggerVerification(trigger.id, {
                  type: 'hmac_sha256',
                  header: 'x-shopify-hmac-sha256',
                  secret: clientSecret,
                });
              }

              return {
                triggerId: trigger.id,
                endpointToken: trigger.endpointToken,
                webhookUrl,
                externalWebhookId,
                hmacConfigured: !!clientSecret,
                message: `Webhook registered with ${slot.integrationKey} and HMAC verification ${clientSecret ? 'auto-configured' : 'requires manual setup'}`,
              };
            }
          }
        } catch (err: any) {
          console.warn(`[skills-mcp] Auto-registration failed: ${err.message}`);
        }
      }

      return {
        triggerId: trigger.id,
        endpointToken: trigger.endpointToken,
        webhookUrl: webhookBaseUrl ? `${webhookBaseUrl}/v1/triggers/webhook/${trigger.endpointToken}` : null,
        externalWebhookId: null,
        message: webhookBaseUrl
          ? 'Trigger created. No auto-registerable webhook source found — register manually with your platform.'
          : 'Trigger created. Set WEBHOOK_BASE_URL to enable auto-registration.',
      };
    }

    case 'pacore_get_execution_log': {
      const { userSkillId, limit = 20 } = args as { userSkillId: string; limit?: number };
      const executions = await deps.skillRegistry.listExecutions(userSkillId, limit as number);
      return executions.map(e => ({
        id:           e.id,
        status:       e.status,
        startedAt:    e.startedAt,
        completedAt:  e.completedAt,
        error:        e.error,
        result:       e.result,
      }));
    }

    case 'pacore_delete_skill': {
      const { userSkillId } = args as { userSkillId: string };

      // Deregister any auto-registered webhook triggers first
      const triggers = await deps.skillRegistry.listTriggersForSkill(userSkillId);
      const userSkill = await deps.skillRegistry.getUserSkill(userSkillId);
      const config = userSkill?.configuration as unknown as UserSkillConfig | undefined;
      const template = config?.templateId ? deps.skillTemplateRegistry.getTemplate(config.templateId) : null;

      for (const trigger of triggers) {
        if (trigger.externalWebhookId && template && config) {
          for (const slot of template.slots) {
            const adapter = deps.adapterRegistry.getAdapter(slot.integrationKey);
            if (!adapter || !isWebhookSourceAdapter(adapter)) continue;

            const connectionId = config.slotConnections[slot.key];
            if (!connectionId) continue;

            const creds = await deps.credentialManager.getCredentials({ type: 'user', userId }, connectionId);
            if (!creds) continue;

            try {
              await adapter.deregisterWebhook(trigger.externalWebhookId, creds as Record<string, unknown>);
            } catch (err: any) {
              console.warn(`[skills-mcp] Deregistration failed: ${err.message}`);
            }
            break;
          }
        }
        await deps.skillRegistry.deleteTrigger(trigger.id);
      }

      await deps.skillRegistry.deleteUserSkill(userSkillId);
      return { success: true, userSkillId };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
