import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { MCPTool } from '@pacore/core';
import { MCPRegistry } from './mcp-registry';
import { MCPClient } from './mcp-client';
import { CredentialManager, CredentialScope } from './credential-manager';
import { SkillRegistry, SkillScope } from '../skills/skill-registry';
import { SkillTemplateRegistry } from '../skills/skill-template-registry';
import { OrgManager, AccessibleOrg } from '../organizations/org-manager';
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
  /**
   * Skill template catalog. When provided, exposes pacore__list_skill_templates,
   * pacore__list_connections, and pacore__get_execution_log for Assessment agents.
   */
  skillTemplateRegistry?: SkillTemplateRegistry;
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
interface SSESession {
  res: Response;
  userId: string;
  /** Org slug captured from ?org= query param at GET /sse connection time. */
  orgSlugFromUrl?: string;
  /** Org ID override set dynamically by pacore__switch_org. */
  orgIdOverride?: string;
}

export class MCPGateway {
  private router = Router();
  /** In-memory SSE sessions: sessionId → session state.
   *  ⚠ Single-instance only. Use Redis Pub/Sub when scaling horizontally. */
  private sseSessions = new Map<string, SSESession>();

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
    return this.buildToolList(scope, undefined, scope.orgId);
  }

  /** Calls a tool for the given scope. Used by the orchestrator agent loop. */
  async invokeAgentTool(
    toolName: string,
    args: Record<string, unknown>,
    scope: CredentialScope
  ): Promise<unknown> {
    return this.dispatchToolCall('', toolName, args, scope);
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

      // Capture optional ?org=<slug> for per-customer scoping (Claude Desktop config-time)
      const orgSlugFromUrl = req.query.org as string | undefined;

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
      this.sseSessions.set(sessionId, { res, userId, orgSlugFromUrl });

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
      const session = this.sseSessions.get(sessionId);
      if (!session) {
        res.status(400).json({ error: 'Unknown or expired sessionId' });
        return;
      }

      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({ error: 'Session does not belong to this user' });
        return;
      }

      const body = req.body;
      if (!body || body.jsonrpc !== '2.0') {
        res.status(400).json({ error: 'Expected JSON-RPC 2.0 request' });
        return;
      }

      const { id, method, params } = body;

      const sendResult = (result: unknown) => {
        session.res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`);
      };
      const sendError = (code: number, message: string) => {
        session.res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n\n`);
      };

      try {
        let result: unknown;

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
          case 'tools/list': {
            try {
              const { credScope } = await this.resolveScope(userId, req, sessionId);
              result = { tools: await this.buildToolList(credScope, userId) };
            } catch {
              // No org resolved (multi-org user with no ?org= set) — return only the two
              // org-selection tools so the client can pick an org before doing anything else.
              result = { tools: this.buildOrgSelectionTools() };
            }
            break;
          }
          case 'tools/call': {
            const toolName = params?.name as string;
            const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
            if (!toolName) throw new Error('tools/call requires params.name');
            // pacore__switch_org works without an org scope (it sets the scope)
            // pacore__list_accessible_orgs tries to resolve scope (to reflect current_org_id after switch)
            //   but falls back to empty scope for the bootstrap case (no org selected yet)
            let toolData: unknown;
            if (toolName === 'pacore__switch_org') {
              const noOrgScope: CredentialScope = { type: 'org', orgId: '' };
              toolData = await this.dispatchToolCall(userId, toolName, toolArgs, noOrgScope, sessionId);
            } else if (toolName === 'pacore__list_accessible_orgs') {
              let listOrgsScope: CredentialScope;
              try {
                ({ credScope: listOrgsScope } = await this.resolveScope(userId, req, sessionId));
              } catch {
                listOrgsScope = { type: 'org', orgId: '' };
              }
              toolData = await this.dispatchToolCall(userId, toolName, toolArgs, listOrgsScope, sessionId);
            } else {
              let credScope: CredentialScope;
              try {
                ({ credScope } = await this.resolveScope(userId, req, sessionId));
              } catch {
                // No org selected yet — surface as a tool result so the LLM can self-correct
                result = {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      error: 'no_org_selected',
                      message: 'You have access to multiple organizations. Call pacore__list_accessible_orgs to see them, then call pacore__switch_org with the desired slug before using other tools.',
                    }),
                  }],
                };
                sendResult(result);
                res.json({ ok: true });
                return;
              }
              toolData = await this.dispatchToolCall(userId, toolName, toolArgs, credScope, sessionId);
            }
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

    // POST /sse — Streamable HTTP clients (e.g. claude.ai) POST to whatever URL they were given.
    // When the user configures their MCP URL as /v1/mcp/sse?org=<slug>, claude.ai will POST here.
    // Delegate to the same JSON-RPC-over-HTTP logic as POST /.
    this.router.post('/sse', async (req: AuthenticatedRequest, res: Response) => {
      return this.handleHttpJsonRpc(req, res);
    });

    // POST: JSON-RPC 2.0 over HTTP
    this.router.post('/', async (req: AuthenticatedRequest, res: Response) => {
      return this.handleHttpJsonRpc(req, res);
    });
  }

  private async handleHttpJsonRpc(req: AuthenticatedRequest, res: Response): Promise<void> {
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
  }

  // ---------------------------------------------------------------------------
  // Scope helpers
  // ---------------------------------------------------------------------------

  private async resolveScope(
    userId: string,
    req: Request,
    sessionId?: string
  ): Promise<{ skillScope: SkillScope; credScope: CredentialScope }> {
    let orgId: string | undefined;
    const session = sessionId ? this.sseSessions.get(sessionId) : undefined;

    // Priority 1: session override set by pacore__switch_org
    if (session?.orgIdOverride) {
      const ok = await this.config.orgManager.canAccessOrg(userId, session.orgIdOverride);
      if (!ok) throw new Error('Org override is no longer accessible — call pacore__switch_org again');
      orgId = session.orgIdOverride;
    }

    // Priority 2: ?org=<slug> captured at SSE connection time
    if (!orgId && session?.orgSlugFromUrl) {
      const org = await this.config.orgManager.getOrgBySlug(session.orgSlugFromUrl);
      const ok = org ? await this.config.orgManager.canAccessOrg(userId, org.id) : false;
      if (!org || !ok) throw new Error(`Organization not found or you do not have access`);
      orgId = org.id;
    }

    // Priority 3: ?org=<slug> in the request URL (stateless Streamable HTTP clients)
    if (!orgId) {
      const slugFromQuery = req.query?.org as string | undefined;
      if (slugFromQuery) {
        const org = await this.config.orgManager.getOrgBySlug(slugFromQuery);
        const ok = org ? await this.config.orgManager.canAccessOrg(userId, org.id) : false;
        if (!org || !ok) throw new Error(`Organization not found or you do not have access`);
        orgId = org.id;
      }
    }

    // Priority 4: X-Org-Id header (non-Claude-Desktop clients)
    if (!orgId) {
      const headerId = req.headers['x-org-id'] as string | undefined;
      if (headerId) {
        const ok = await this.config.orgManager.canAccessOrg(userId, headerId);
        if (!ok) throw new Error('Not authorized for the requested organization');
        orgId = headerId;
      }
    }

    // Priority 5: auto-resolve (single org) or helpful error (multiple orgs)
    if (!orgId) {
      const accessible = await this.config.orgManager.listAccessibleOrgs(userId);
      if (accessible.length === 0) {
        throw new Error('No organizations accessible — contact your administrator');
      }
      if (accessible.length === 1) {
        orgId = accessible[0].id;
      } else {
        throw new Error(
          `You have access to ${accessible.length} organizations. ` +
          `Set ?org=<slug> in your Claude Desktop SSE URL, or call pacore__list_accessible_orgs ` +
          `then pacore__switch_org to select one.`
        );
      }
    }

    return {
      skillScope: { type: 'org', orgId },
      credScope: { type: 'org', orgId },
    };
  }

  // ---------------------------------------------------------------------------
  // tools/list (core logic, reused by HTTP and in-process paths)
  // ---------------------------------------------------------------------------

  private async buildToolList(
    credScope: CredentialScope,
    _userId?: string,
    _orgId?: string
  ): Promise<MCPTool[]> {
    // Determine which tool chains are active for this tenant
    const activeSkills = await this.config.skillRegistry.listOrgSkills(credScope.orgId);

    const activeToolChains = new Set<string>();
    for (const userSkill of activeSkills) {
      if (userSkill.status !== 'active') continue;
      const def = this.config.skillRegistry.getSkillDefinition(userSkill.skillId);
      if (def?.toolChain) activeToolChains.add(def.toolChain);
    }

    // All MCP servers visible to this org
    const servers = await this.config.mcpRegistry.listOrgServers(credScope.orgId);

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
        const serverCred: CredentialScope = { type: 'org', orgId: server.orgId ?? credScope.orgId };

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

    // Meta-tools always come first; pacore__ platform tools always follow
    return [...this.buildMetaTools(), ...this.buildPacoreTools(), ...aggregatedTools];
  }

  // ---------------------------------------------------------------------------
  // tools/call (core logic, reused by HTTP and in-process paths)
  // ---------------------------------------------------------------------------

  private async dispatchToolCall(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    credScope: CredentialScope,
    sessionId?: string
  ): Promise<unknown> {
    // Meta-tools
    switch (toolName) {
      case 'list_skills':
        return this.metaListSkills(userId, credScope);
      case 'activate_skill':
        return this.metaActivateSkill(userId, args.skill_id as string, credScope);
      case 'deactivate_skill':
        return this.metaDeactivateSkill(args.user_skill_id as string, credScope);
    }

    // Namespaced tool: integrationKey__capability or serverSlug__toolName
    const sepIdx = toolName.indexOf('__');
    if (sepIdx === -1) {
      throw new Error(`Unknown tool: "${toolName}". Use list_skills to see available tools.`);
    }

    const prefix = toolName.slice(0, sepIdx);
    const actualName = toolName.slice(sepIdx + 2);

    // Platform introspection tools (pacore__*)
    if (prefix === 'pacore') {
      return this.dispatchPacoreToolCall(actualName, args, userId, credScope, sessionId);
    }

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
    const servers = await this.config.mcpRegistry.listOrgServers(credScope.orgId);
    const server = servers.find(s => slugify(s.name) === prefix);
    if (!server) {
      throw new Error(`No MCP server found for tool namespace "${prefix}"`);
    }

    const serverCred: CredentialScope = { type: 'org', orgId: server.orgId ?? credScope.orgId };

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

  private async metaListSkills(_userId: string, credScope: CredentialScope): Promise<unknown> {
    const catalog = this.config.skillRegistry.listSkills();
    const active = await this.config.skillRegistry.listOrgSkills(credScope.orgId);

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
    _userId: string,
    skillId: string,
    credScope: CredentialScope
  ): Promise<unknown> {
    if (!skillId) throw new Error('activate_skill requires skill_id');
    const skillScope: SkillScope = { type: 'org', orgId: credScope.orgId };
    const userSkill = await this.config.skillRegistry.activateSkill(skillScope, skillId);
    return { success: true, userSkill };
  }

  private async metaDeactivateSkill(userSkillId: string, credScope: CredentialScope): Promise<unknown> {
    if (!userSkillId) throw new Error('deactivate_skill requires user_skill_id');
    await this.config.skillRegistry.deleteUserSkill(userSkillId, credScope.orgId);
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // pacore__ platform tool dispatch + implementations
  // ---------------------------------------------------------------------------

  private async dispatchPacoreToolCall(
    toolName: string,
    args: Record<string, unknown>,
    userId: string,
    credScope: CredentialScope,
    sessionId?: string
  ): Promise<unknown> {
    switch (toolName) {
      case 'list_skill_templates':
        return this.pacoreListSkillTemplates();
      case 'list_connections':
        return this.pacoreListConnections(credScope);
      case 'get_execution_log':
        return this.pacoreGetExecutionLog(userId, credScope);
      case 'list_accessible_orgs':
        return this.pacoreListAccessibleOrgs(userId, credScope);
      case 'switch_org':
        return this.pacoreSwitchOrg(args, userId, sessionId);
      default:
        throw new Error(`Unknown pacore tool: "${toolName}"`);
    }
  }

  private pacoreListSkillTemplates(): unknown {
    if (!this.config.skillTemplateRegistry) return [];
    return this.config.skillTemplateRegistry.getSkillTypes().map(type => {
      const templates = this.config.skillTemplateRegistry!.getTemplatesForType(type.id);
      return {
        id: type.id,
        name: type.name,
        description: type.description,
        category: type.category,
        templates: templates.map(t => ({
          id: t.id,
          name: t.name,
          requiredIntegrations: t.slots
            .filter(s => s.required)
            .map(s => s.integrationKey),
        })),
      };
    });
  }

  private async pacoreListConnections(credScope: CredentialScope): Promise<unknown> {
    const connections = await this.config.listConnections(credScope);
    return connections.map(c => ({
      connectionId: c.id,
      integrationKey: c.integrationKey,
      name: c.displayName,
    }));
  }

  private async pacoreGetExecutionLog(
    _userId: string,
    credScope: CredentialScope
  ): Promise<unknown> {
    const executions = await this.config.skillRegistry.listAllOrgExecutions(credScope.orgId, 30);

    return executions.map(e => ({
      skillId: e.skillTypeId ?? null,
      timestamp: e.startedAt,
      status: e.skipped ? 'skipped' : e.status,
    }));
  }

  private async pacoreListAccessibleOrgs(
    userId: string,
    credScope: CredentialScope
  ): Promise<unknown> {
    const orgs = await this.config.orgManager.listAccessibleOrgs(userId);
    return {
      current_org_id: credScope.orgId,
      orgs: orgs.map((o: AccessibleOrg) => ({
        slug: o.slug,
        name: o.name,
        access_type: o.accessType,
        role: o.role ?? null,
      })),
    };
  }

  private async pacoreSwitchOrg(
    args: Record<string, unknown>,
    userId: string,
    sessionId?: string
  ): Promise<unknown> {
    const slug = args.org as string;
    if (!slug) throw new Error('pacore__switch_org requires an "org" argument (slug)');

    const org = await this.config.orgManager.getOrgBySlug(slug);
    const ok = org ? await this.config.orgManager.canAccessOrg(userId, org.id) : false;
    if (!org || !ok) throw new Error('Organization not found or you do not have access');

    if (sessionId) {
      const session = this.sseSessions.get(sessionId);
      if (session) {
        session.orgIdOverride = org.id;
      }
    }

    return {
      success: true,
      org_id: org.id,
      org_name: org.name,
      org_slug: org.slug,
      message: `Switched to ${org.name}. All subsequent tool calls are now scoped to this organization.`,
      ...(sessionId ? {} : { note: 'Session persistence requires an SSE connection. This switch applies to the current request only.' }),
    };
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
  /** The two tools that work without an org context — used as the bootstrap tool list. */
  private buildOrgSelectionTools(): MCPTool[] {
    return this.buildPacoreTools().filter(t =>
      t.name === 'pacore__list_accessible_orgs' || t.name === 'pacore__switch_org'
    );
  }

  private buildPacoreTools(): MCPTool[] {
    return [
      {
        name: 'pacore__list_skill_templates',
        description:
          'List all available skill types and their templates with required integration slots. ' +
          'Use this during a Skills Assessment to match a customer\'s ticket categories against ' +
          'automatable skill types and determine which templates they can activate today.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'pacore__list_connections',
        description:
          'List the active integration connections for this account (e.g. Shopify, Gorgias, Slack). ' +
          'Use this during a Skills Assessment to determine which skill templates are immediately ' +
          'activatable vs. which require additional integrations to be connected.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'pacore__get_execution_log',
        description:
          'Return the 30 most recent skill executions for this account, with status and skill type. ' +
          'Use this during a Skills Assessment to check whether any skills are already active and ' +
          'firing, and to detect ticket category spikes without corresponding skill executions.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'pacore__list_accessible_orgs',
        description:
          'List all organizations you can access — including orgs you are a member of and ' +
          'customer orgs you manage as an operator. ' +
          'Returns slug, name, and access type for each. ' +
          'Call this to find the correct slug before calling pacore__switch_org.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'pacore__switch_org',
        description:
          'Switch the current MCP session to a different organization by slug. ' +
          'After switching, all subsequent tool calls operate in the context of the new org. ' +
          'Call pacore__list_accessible_orgs first to find the slug. ' +
          'Operators: use this to run a Skills Assessment for a specific customer.',
        inputSchema: {
          type: 'object',
          properties: {
            org: {
              type: 'string',
              description: 'The org slug to switch to (e.g. "yota-coffee"). Get slugs from pacore__list_accessible_orgs.',
            },
          },
          required: ['org'],
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
