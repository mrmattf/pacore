import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import type { OrgManager } from '../organizations/org-manager';
import { OrgManager as OrgManagerClass } from '../organizations/org-manager';
import type { BillingManager } from '../billing';
import { PlanLimitError } from '../billing';
import type { MCPRegistry } from '../mcp/mcp-registry';
import type { CredentialManager, CredentialScope } from '../mcp/credential-manager';
import type { BillingScope } from '@pacore/core';

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

export function createOrgRoutes(
  db: Pool,
  orgManager: OrgManager,
  billingManager: BillingManager | undefined,
  mcpRegistry: MCPRegistry,
  credentialManager: CredentialManager,
): Router {
  const router = Router();

  // Create org (calling user becomes admin)
  router.post('/v1/organizations', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, slug, plan } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      const resolvedSlug = slug ?? OrgManagerClass.toSlug(name);
      if (!await orgManager.isSlugAvailable(resolvedSlug)) {
        return res.status(409).json({ error: 'Slug is already taken' });
      }

      const org = await orgManager.createOrg(userId, name, resolvedSlug, plan);
      res.status(201).json(org);
    } catch (error: any) {
      console.error('Create org error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // List orgs the current user belongs to
  router.get('/v1/organizations', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const orgs = await orgManager.listUserOrgs(userId);
      res.json(orgs);
    } catch (error: any) {
      console.error('List orgs error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get org details + members
  router.get('/v1/organizations/:orgId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId } = req.params;
      await orgManager.assertMember(orgId, req.user!.id);
      const org = await orgManager.getOrgWithMembers(orgId);
      if (!org) return res.status(404).json({ error: 'Organization not found' });
      res.json(org);
    } catch (error: any) {
      console.error('Get org error:', error);
      res.status(error.message.includes('member') ? 403 : 500).json({ error: error.message });
    }
  });

  // Add / invite a member (admin only)
  router.post('/v1/organizations/:orgId/members', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId } = req.params;
      const userId = req.user!.id;
      const { userId: targetUserId, role = 'member' } = req.body;
      if (!targetUserId) return res.status(400).json({ error: 'userId is required' });

      await orgManager.assertAdmin(orgId, userId);

      if (billingManager) {
        try {
          await billingManager.checkLimit({ type: 'org', orgId }, 'orgMembers');
        } catch (e) {
          if (e instanceof PlanLimitError) return planLimitResponse(res, e);
          throw e;
        }
      }

      const member = await orgManager.addMember(orgId, targetUserId, role);
      res.status(201).json(member);
    } catch (error: any) {
      console.error('Add member error:', error);
      res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
    }
  });

  // Update member role (admin only)
  router.put('/v1/organizations/:orgId/members/:userId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userId: targetUserId } = req.params;
      const callerId = req.user!.id;
      const { role } = req.body;
      if (!role) return res.status(400).json({ error: 'role is required' });

      await orgManager.assertAdmin(orgId, callerId);
      const member = await orgManager.updateMemberRole(orgId, targetUserId, role);
      if (!member) return res.status(404).json({ error: 'Member not found' });
      res.json(member);
    } catch (error: any) {
      console.error('Update member role error:', error);
      res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
    }
  });

  // Remove member (admin only)
  router.delete('/v1/organizations/:orgId/members/:userId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId, userId: targetUserId } = req.params;
      const callerId = req.user!.id;
      await orgManager.assertAdmin(orgId, callerId);
      await orgManager.removeMember(orgId, targetUserId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Remove member error:', error);
      res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
    }
  });

  // List teams (member access)
  router.get('/v1/organizations/:orgId/teams', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId } = req.params;
      await orgManager.assertMember(orgId, req.user!.id);
      const teams = await orgManager.listTeams(orgId);
      res.json(teams);
    } catch (error: any) {
      console.error('List teams error:', error);
      res.status(error.message.includes('member') ? 403 : 500).json({ error: error.message });
    }
  });

  // Create team (admin only)
  router.post('/v1/organizations/:orgId/teams', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId } = req.params;
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      await orgManager.assertAdmin(orgId, req.user!.id);
      const team = await orgManager.createTeam(orgId, name);
      res.status(201).json(team);
    } catch (error: any) {
      console.error('Create team error:', error);
      res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
    }
  });

  // Register an org-shared MCP server (admin only)
  router.post('/v1/organizations/:orgId/mcp-servers', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId } = req.params;
      const userId = req.user!.id;
      const { name, serverType, protocol, connectionConfig, categories, credentials } = req.body;
      if (!name || !serverType || !protocol || !connectionConfig) {
        return res.status(400).json({
          error: 'Missing required fields: name, serverType, protocol, connectionConfig'
        });
      }

      await orgManager.assertAdmin(orgId, userId);
      const scope: CredentialScope = { type: 'org', orgId };
      const server = await mcpRegistry.registerServer({ scope, name, serverType, protocol, connectionConfig, categories });
      if (credentials && Object.keys(credentials).length > 0) {
        await credentialManager.storeCredentials(scope, server.id, credentials);
      }
      res.status(201).json(server);
    } catch (error: any) {
      console.error('Register org MCP server error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // List org's MCP servers (member access)
  router.get('/v1/organizations/:orgId/mcp-servers', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId } = req.params;
      const category = req.query.category as string | undefined;
      await orgManager.assertMember(orgId, req.user!.id);
      const servers = await mcpRegistry.listOrgServers(orgId, category);
      res.json(servers);
    } catch (error: any) {
      console.error('List org MCP servers error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get billing for org
  router.get('/v1/organizations/:orgId/billing', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId } = req.params;
      await orgManager.assertMember(orgId, req.user!.id);
      if (!billingManager) return res.json({ plan: 'free', subscription: null, summary: {} });
      const scope: BillingScope = { type: 'org', orgId };
      const [plan, subscription, summary] = await Promise.all([
        billingManager.getEffectivePlan(scope),
        billingManager.getSubscription(scope),
        billingManager.getUsageSummary(scope),
      ]);
      res.json({ plan, subscription, summary });
    } catch (error: any) {
      res.status(error.message.includes('member') ? 403 : 500).json({ error: error.message });
    }
  });

  // Update billing plan for org (admin only)
  router.put('/v1/organizations/:orgId/billing/plan', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orgId } = req.params;
      await orgManager.assertAdmin(orgId, req.user!.id);
      if (!billingManager) return res.status(503).json({ error: 'Billing not configured' });
      const { plan } = req.body;
      if (!plan) return res.status(400).json({ error: 'plan is required' });
      const scope: BillingScope = { type: 'org', orgId };
      const subscription = await billingManager.updatePlan(scope, plan);
      res.json(subscription);
    } catch (error: any) {
      res.status(error.message.includes('Admin') ? 403 : 500).json({ error: error.message });
    }
  });

  return router;
}
