import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { MCPTool } from '@pacore/core';
import { MCPRegistry } from './mcp-registry';
import { MCPClient } from './mcp-client';
import { CredentialManager, CredentialScope } from './credential-manager';
import { SkillRegistry, SkillScope } from '../skills/skill-registry';
import { OrgManager } from '../organizations/org-manager';
import { AdapterRegistry } from '../integrations/adapter-registry';

export interface UserConnection {
  id: string;
  integrationKey: string;
  displayName: string;
}

export interface MCPGatewayConfig {
  mcpRegistry: MCPRegistry;
  credentialManager: CredentialManager;
  skillRegistry: SkillRegistry;
  orgManager: OrgManager;
  /** Registry of all built-in integration adapters (Shopify, Gorgias, etc.) */
  adapterRegistry: AdapterRegistry;
  /**
   * Returns the active integration connections for a user/org scope.
   * Used to determine which built-in adapter tools are available and to resolve credentials.
   */
  listConnections: (scope: CredentialScope) => Promise<UserConnection[]>;
}

interface AuthenticatedRequest extends Request {
  user?: { id: string; [key: string]: any };
}

/**
 * PA Core MCP Gateway
 *
 * Exposes a single MCP endpoint that aggregates tools from:
 * 1. Externally registered MCP servers (user/org-scoped)
 * 2. Built-in integration adapters (Shopify, Gorgias, etc.) — read-only agent tools only
 *
 * Each tool is namespaced as `{server_slug}__{tool_name}` to avoid collisions.
 *
 * Meta-tools (list_skills, activate_skill, deactivate_skill) are always included
 * so AI clients can discover and manage skills without leaving the MCP session.
 *
 * Auth: relies on the parent Express app's `authenticateRequest` middleware.
 * Org scope: opt-in via `X-Org-Id` request header. Membership is verified.
 *
 * Mounts at: /v1/mcp
 */
export class MCPGateway {
  private router = Router();
  /** In-memory SSE sessions: sessionId → active SSE Response.
   *  ⚠ Single-instance only. Use Redis Pub/Sub when scaling horizontally. */
  private sseSessions = new Map<string, Response>();

  constructor(private config: MCPGatewayConfig) {
    this.setupRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  // ---------------------------------------------------------------------------
  // Public API for in-process agent loops (bypasses HTTP layer)
  // ---------------------------------------------------------------------------

  /** Returns all agent-available tools for the given scope. Used by the orchestrator agent loop. */
  async getAgentTools(scope: CredentialScope): Promise<MCPTool[]> {
    const userId = scope.type === 'user' ? scope.userId : undefined;
    const orgId  = scope.type === 'org'  ? scope.orgId  : undefined;
    return this.buildToolList(scope, userId, orgId);
  }

  /** Calls a tool for the given scope. Used by the orchestrator agent loop. */
  async invokeAgentTool(
    toolName: string,
    args: Record<string, unknown>,
    scope: CredentialScope
  ): Promise<unknown> {
    const userId = scope.type === 'user' ? scope.userId : '';
    return this.dispatchToolCall(userId, toolName, args, scope);
  }

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  private setupRoutes(): void {
    // GET: capability discovery for Streamable HTTP clients
    this.router.get('/', (req: AuthenticatedRequest, res: Response) => {
      res.json({
        name: 'PA Core MCP Gateway',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        transport: 'streamable-http',
      });
    });

    // GET /sse — open an SSE session for streaming MCP (used by Claude Desktop)
    this.router.get('/sse', (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user?.id;
      if (!userId) {
        const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0].trim() ?? req.protocol;
        const host  = req.headers['host'] as string;
        const base  = `${proto}://${host}`;
        res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const sessionId = randomBytes(16).toString('hex');

      // Build absolute base URL — required by Claude Desktop and MCP clients
      const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0].trim() ?? req.protocol;
      const host  = req.headers['host'] as string;
      const base  = `${proto}://${host}`;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Tell the client where to POST JSON-RPC messages (absolute URL required)
      res.write(`event: endpoint\ndata: ${base}/v1/mcp/message?sessionId=${sessionId}\n\n`);

      this.sseSessions.set(sessionId, res);

      // 30s keepalive to prevent proxy timeouts
      const keepalive = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 30_000);

      req.on('close', () => {
        clearInterval(keepalive);
        this.sseSessions.delete(sessionId);
      });
    });

    // POST /message?sessionId=<id> — receive JSON-RPC 2.0, respond via SSE stream
    this.router.post('/message', async (req: AuthenticatedRequest, res: Response) => {
      const sessionId = req.query.sessionId as string;
      const sseRes = this.sseSessions.get(sessionId);
      if (!sseRes) {
        res.status(400).json({ error: 'Unknown or expired sessionId' });
        return;
      }

      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const body = req.body;
      if (!body || body.jsonrpc !== '2.0') {
        res.status(400).json({ error: 'Expected JSON-RPC 2.0 request' });
        return;
      }

      const { id, method, params } = body;

      const sendResult = (result: unknown) => {
        sseRes.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`);
      };
      const sendError = (code: number, message: string) => {
        sseRes.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n\n`);
      };

      try {
        let result: unknown;
        const { credScope } = await this.resolveScope(userId, req);

        switch (method) {
          case 'initialize':
            result = {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'PA Core MCP Gateway', version: '1.0.0' },
            };
            break;
          case 'notifications/initialized':
            result = {};
            break;
          case 'tools/list':
            result = { tools: await this.buildToolList(credScope, userId) };
            break;
          case 'tools/call': {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
            if (!toolName) throw new Error('tools/call requires params.name');
            const toolData = await this.dispatchToolCall(userId, toolName, toolArgs, credScope);
            result = { content: [{ type: 'text', text: JSON.stringify(toolData) }] };
            break;
          }
          default:
            sendError(-32601, `Method not found: ${method}`);
            res.json({ ok: true });
            return;
        }

        sendResult(result);
        res.json({ ok: true });
      } catch (error: any) {
        console.error('[MCPGateway/SSE] Error handling method', method, ':', error.message);
        sendError(-32603, error.message);
        res.json({ ok: true });
      }
    });

    // POST: JSON-RPC 2.0 over HTTP
    this.router.post('/', async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user!.id;
      const body = req.body;

      if (!body || body.jsonrpc !== '2.0') {
        res.status(400).json({ error: 'Expected JSON-RPC 2.0 request' });
        return;
      }

      const { id, method, params } = body;

      try {
        let result: unknown;
        const { credScope } = await this.resolveScope(userId, req);

        switch (method) {
          case 'initialize':
            result = {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'PA Core MCP Gateway', version: '1.0.0' },
            };
            break;

          case 'notifications/initialized':
            result = {};
            break;

          case 'tools/list':
            result = { tools: await this.buildToolList(credScope, userId) };
            break;

          case 'tools/call': {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
            if (!toolName) {
              throw new Error('tools/call requires params.name');
            }
            const toolData = await this.dispatchToolCall(userId, toolName, toolArgs, credScope);
            result = { content: [{ type: 'text', text: JSON.stringify(toolData) }] };
            break;
          }

          default:
            res.json({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Method not found: ${method}` },
            });
            return;
        }

        res.json({ jsonrpc: '2.0', id, result });
      } catch (error: any) {
        console.error('[MCPGateway] Error handling method', method, ':', error.message);
        res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: error.message },
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Scope helpers
  // ---------------------------------------------------------------------------

  private async resolveScope(
    userId: string,
    req: Request
  ): Promise<{ skillScope: SkillScope; credScope: CredentialScope }> {
    const orgId = req.headers['x-org-id'] as string | undefined;

    if (orgId) {
      // Verify the user is actually a member of the requested org
      const role = await this.config.orgManager.getMemberRole(orgId, userId);
      if (!role) {
        throw new Error('Not a member of the requested organization');
      }
      return {
        skillScope: { type: 'org', orgId },
        credScope: { type: 'org', orgId },
      };
    }

    return {
      skillScope: { type: 'user', userId },
      credScope: { type: 'user', userId },
    };
  }

  // ---------------------------------------------------------------------------
  // tools/list (core logic, reused by HTTP and in-process paths)
  // ---------------------------------------------------------------------------

  private async buildToolList(
    credScope: CredentialScope,
    userId?: string,
    _orgId?: string
  ): Promise<MCPTool[]> {
    const effectiveUserId = userId ?? (credScope.type === 'user' ? credScope.userId : '');

    // Determine which tool chains are active for this tenant
    const activeSkills = credScope.type === 'org'
      ? await this.config.skillRegistry.listOrgSkills(credScope.orgId)
      : await this.config.skillRegistry.listUserSkills(effectiveUserId);

    const activeToolChains = new Set<string>();
    for (const userSkill of activeSkills) {
      if (userSkill.status !== 'active') continue;
      const def = this.config.skillRegistry.getSkillDefinition(userSkill.skillId);
      if (def?.toolChain) activeToolChains.add(def.toolChain);
    }

    // All MCP servers visible to this user (personal + org-shared)
    const servers = await this.config.mcpRegistry.listServersForUser(effectiveUserId);

    // Filter to servers whose categories or name match an active skill's tool chain
    const activeServers = activeToolChains.size > 0
      ? servers.filter(s =>
          s.categories?.some(cat => activeToolChains.has(cat)) ||
          activeToolChains.has(s.name)
        )
      : [];

    const aggregatedTools: MCPTool[] = [];

    for (const server of activeServers) {
      try {
        const serverCred: CredentialScope = server.orgId
          ? { type: 'org', orgId: server.orgId }
          : { type: 'user', userId: effectiveUserId };

        const creds = await this.config.credentialManager.getCredentials(serverCred, server.id);
        const client = new MCPClient(server, creds ?? undefined);
        const capabilities = await client.listCapabilities();

        for (const tool of capabilities.tools) {
          aggregatedTools.push({
            ...tool,
            name: `${slugify(server.name)}__${tool.name}`,
            description: `[${server.name}] ${tool.description}`,
          });
        }
      } catch (err) {
        // Non-fatal: log and skip unavailable servers
        console.warn(`[MCPGateway] Could not fetch tools from server "${server.name}":`, (err as Error).message);
      }
    }

    // Built-in adapter agent tools — read-only capabilities from configured connections
    const connections = await this.config.listConnections(credScope);
    const seenIntegrations = new Set<string>();

    for (const conn of connections) {
      if (seenIntegrations.has(conn.integrationKey)) continue; // first connection wins
      const adapter = this.config.adapterRegistry.getAdapter(conn.integrationKey);
      if (!adapter?.agentTools?.length) continue;

      seenIntegrations.add(conn.integrationKey);
      for (const toolDef of adapter.agentTools) {
        aggregatedTools.push({
          name: `${conn.integrationKey}__${toolDef.capability}`,
          description: `[${conn.displayName}] ${toolDef.description}`,
          inputSchema: toolDef.inputSchema as any,
        });
      }
    }

    // Meta-tools always come first
    return [...this.buildMetaTools(), ...aggregatedTools];
  }

  // ---------------------------------------------------------------------------
  // tools/call (core logic, reused by HTTP and in-process paths)
  // ---------------------------------------------------------------------------

  private async dispatchToolCall(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    credScope: CredentialScope
  ): Promise<unknown> {
    // Meta-tools
    switch (toolName) {
      case 'list_skills':
        return this.metaListSkills(userId, credScope);
      case 'activate_skill':
        return this.metaActivateSkill(userId, args.skill_id as string, credScope);
      case 'deactivate_skill':
        return this.metaDeactivateSkill(args.user_skill_id as string);
    }

    // Namespaced tool: integrationKey__capability or serverSlug__toolName
    const sepIdx = toolName.indexOf('__');
    if (sepIdx === -1) {
      throw new Error(`Unknown tool: "${toolName}". Use list_skills to see available tools.`);
    }

    const prefix = toolName.slice(0, sepIdx);
    const actualName = toolName.slice(sepIdx + 2);

    // Try built-in adapter first (e.g., shopify__get_order, gorgias__list_recent_tickets)
    const adapter = this.config.adapterRegistry.getAdapter(prefix);
    if (adapter?.agentTools?.some(t => t.capability === actualName)) {
      const connections = await this.config.listConnections(credScope);
      const conn = connections.find(c => c.integrationKey === prefix);
      if (!conn) {
        throw new Error(`No ${prefix} connection configured. Add one via the Integrations page.`);
      }
      const creds = await this.config.credentialManager.getCredentials(credScope, conn.id);
      if (!creds) {
        throw new Error(`Credentials not found for ${prefix} connection "${conn.displayName}"`);
      }
      return this.config.adapterRegistry.invokeCapability(prefix, actualName, args, creds as Record<string, unknown>);
    }

    // Fall through to registered external MCP servers
    const servers = await this.config.mcpRegistry.listServersForUser(userId);
    const server = servers.find(s => slugify(s.name) === prefix);
    if (!server) {
      throw new Error(`No MCP server found for tool namespace "${prefix}"`);
    }

    const serverCred: CredentialScope = server.orgId
      ? { type: 'org', orgId: server.orgId }
      : { type: 'user', userId };

    const creds = await this.config.credentialManager.getCredentials(serverCred, server.id);
    const client = new MCPClient(server, creds ?? undefined);

    const result = await client.callTool({
      serverId: server.id,
      toolName: actualName,
      parameters: args,
    });

    if (!result.success) {
      throw new Error(result.error ?? 'Tool call failed');
    }

    return result.data;
  }

  // ---------------------------------------------------------------------------
  // Meta-tool implementations
  // ---------------------------------------------------------------------------

  private async metaListSkills(userId: string, credScope: CredentialScope): Promise<unknown> {
    const catalog = this.config.skillRegistry.listSkills();
    const active = credScope.type === 'org'
      ? await this.config.skillRegistry.listOrgSkills(credScope.orgId)
      : await this.config.skillRegistry.listUserSkills(userId);

    const activeBySkillId = new Map(active.map(s => [s.skillId, s]));

    return {
      skills: catalog.map(def => ({
        id: def.id,
        name: def.name,
        description: def.description ?? '',
        status: activeBySkillId.get(def.id)?.status ?? 'not_activated',
        userSkillId: activeBySkillId.get(def.id)?.id ?? null,
      })),
    };
  }

  private async metaActivateSkill(
    userId: string,
    skillId: string,
    credScope: CredentialScope
  ): Promise<unknown> {
    if (!skillId) throw new Error('activate_skill requires skill_id');
    const skillScope: SkillScope = credScope.type === 'org'
      ? { type: 'org', orgId: credScope.orgId }
      : { type: 'user', userId };
    const userSkill = await this.config.skillRegistry.activateSkill(skillScope, skillId);
    return { success: true, userSkill };
  }

  private async metaDeactivateSkill(userSkillId: string): Promise<unknown> {
    if (!userSkillId) throw new Error('deactivate_skill requires user_skill_id');
    await this.config.skillRegistry.deleteUserSkill(userSkillId);
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Meta-tool schemas
  // ---------------------------------------------------------------------------

  private buildMetaTools(): MCPTool[] {
    return [
      {
        name: 'list_skills',
        description:
          'List all available skills and their activation status for the current tenant. ' +
          'Returns the platform skill catalog with status: "active", "pending", or "not_activated". ' +
          'Use this to discover what skills are available before activating them.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'activate_skill',
        description:
          'Activate a skill for the current tenant. Once activated, the skill\'s tools become available ' +
          'via tools/list. Use list_skills first to find the skill_id.',
        inputSchema: {
          type: 'object',
          properties: {
            skill_id: {
              type: 'string',
              description: 'The skill ID to activate (from list_skills)',
            },
          },
          required: ['skill_id'],
        },
      },
      {
        name: 'deactivate_skill',
        description:
          'Deactivate an active skill for the current tenant. ' +
          'The user_skill_id is returned by list_skills in the userSkillId field.',
        inputSchema: {
          type: 'object',
          properties: {
            user_skill_id: {
              type: 'string',
              description: 'The userSkillId to deactivate (from list_skills)',
            },
          },
          required: ['user_skill_id'],
        },
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a server name to a safe slug for use as a tool namespace prefix.
 * e.g. "Shopify Backorder" → "shopify_backorder"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/, '');
}
