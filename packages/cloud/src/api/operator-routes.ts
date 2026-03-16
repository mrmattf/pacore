import { Response, Router } from 'express';
import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import { createHash, randomBytes } from 'crypto';
import { OperatorRequest, requireOperator, assertOperatorOwnsOrg, assertOperatorWriteAccess } from './operator-guards';
import { OrgManager } from '../organizations/org-manager';
import { SkillRegistry } from '../skills/skill-registry';
import { CredentialManager } from '../mcp/credential-manager';

// ADR-017 assessment schema sections
const ASSESSMENT_SECTIONS = ['current_exposure', 'skills_match', 'skill_gap', 'roi_projection'] as const;

function validateAssessmentReport(report: any): string[] {
  const missing: string[] = [];
  for (const section of ASSESSMENT_SECTIONS) {
    if (!report[section]) missing.push(section);
  }
  return missing;
}

export function createOperatorRoutes(
  db: Pool,
  credentialManager: CredentialManager,
  orgManager: OrgManager,
  skillRegistry: SkillRegistry,
): Router {
  const router = Router();
  router.use(requireOperator);

  // ---------------------------------------------------------------------------
  // GET /v1/operator/customers — list this operator's customers
  // ---------------------------------------------------------------------------
  router.get('/customers', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const result = await db.query(
        `SELECT
           o.id, o.name, o.slug,
           cp.management_mode, cp.onboarded_at,
           (SELECT MAX(se.executed_at) FROM skill_executions se WHERE se.org_id = o.id) AS last_execution_at,
           (SELECT COUNT(*) FROM skill_executions se
            WHERE se.org_id = o.id
              AND se.executed_at >= date_trunc('month', NOW()))::int AS executions_this_month,
           (SELECT COUNT(*) FROM credential_intake_tokens cit
            WHERE cit.org_id = o.id AND cit.used_at IS NOT NULL AND cp.onboarded_at IS NULL)::int AS pending_credentials
         FROM operator_customers oc
         JOIN organizations o ON o.id = oc.org_id
         LEFT JOIN customer_profiles cp ON cp.org_id = o.id
         WHERE oc.operator_id = $1
         ORDER BY o.name ASC`,
        [operatorId],
      );
      res.json({ customers: result.rows });
    } catch (error: any) {
      console.error('List operator customers error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /v1/operator/customers — create org + link to operator
  // Body: { orgName, mode?: 'concierge' | 'self_managed' }
  // ---------------------------------------------------------------------------
  router.post('/customers', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const { orgName, mode = 'concierge' } = req.body;
      if (!orgName) return res.status(400).json({ error: 'orgName is required' });
      if (!['concierge', 'self_managed'].includes(mode)) {
        return res.status(400).json({ error: 'mode must be concierge or self_managed' });
      }

      // Create a slug from the org name
      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + nanoid(4);

      // Use operator as org owner so they have admin rights on the org
      const org = await orgManager.createOrg(operatorId, orgName, slug, 'free');

      // Link operator → customer
      const linkId = nanoid();
      await db.query(
        `INSERT INTO operator_customers (id, operator_id, org_id) VALUES ($1, $2, $3)`,
        [linkId, operatorId, org.id],
      );

      // Create customer profile
      await db.query(
        `INSERT INTO customer_profiles (org_id, management_mode) VALUES ($1, $2)`,
        [org.id, mode],
      );

      res.status(201).json({ success: true, org, managementMode: mode });
    } catch (error: any) {
      console.error('Create customer error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /v1/operator/customers/:orgId — org detail
  // ---------------------------------------------------------------------------
  router.get('/customers/:orgId', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const { orgId } = req.params;
      if (!await assertOperatorOwnsOrg(operatorId, orgId, db, res)) return;

      const [orgResult, profileResult, memberResult] = await Promise.all([
        db.query('SELECT id, name, slug, plan FROM organizations WHERE id = $1', [orgId]),
        db.query('SELECT management_mode, onboarded_at, handoff_notes FROM customer_profiles WHERE org_id = $1', [orgId]),
        db.query(
          `SELECT u.id, u.email, u.name, om.role FROM org_members om
           JOIN users u ON u.id = om.user_id WHERE om.org_id = $1`,
          [orgId],
        ),
      ]);

      if (!orgResult.rows[0]) return res.status(404).json({ error: 'Organization not found' });

      const execResult = await db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE executed_at >= date_trunc('month', NOW()))::int AS this_month,
                MAX(executed_at) AS last_at
         FROM skill_executions WHERE org_id = $1`,
        [orgId],
      );

      res.json({
        org: orgResult.rows[0],
        profile: profileResult.rows[0] || { management_mode: 'concierge', onboarded_at: null },
        members: memberResult.rows,
        executions: execResult.rows[0],
      });
    } catch (error: any) {
      console.error('Get customer detail error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /v1/operator/customers/:orgId/mode — change management mode
  // Body: { mode: 'concierge' | 'self_managed', handoff_notes?: string }
  // ---------------------------------------------------------------------------
  router.put('/customers/:orgId/mode', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const { orgId } = req.params;
      if (!await assertOperatorOwnsOrg(operatorId, orgId, db, res)) return;

      const { mode, handoff_notes } = req.body;
      if (!['concierge', 'self_managed'].includes(mode)) {
        return res.status(400).json({ error: 'mode must be concierge or self_managed' });
      }

      await db.query(
        `UPDATE customer_profiles
         SET management_mode = $1, handoff_notes = $2, updated_at = NOW()
         WHERE org_id = $3`,
        [mode, handoff_notes || null, orgId],
      );

      res.json({ success: true, managementMode: mode });
    } catch (error: any) {
      console.error('Update mode error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /v1/operator/customers/:orgId/operator-contact — returns operator info
  // Used by customer-facing badge on SkillsPage
  // ---------------------------------------------------------------------------
  router.get('/customers/:orgId/operator-contact', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const { orgId } = req.params;
      if (!await assertOperatorOwnsOrg(operatorId, orgId, db, res)) return;

      const result = await db.query(
        'SELECT id, email, name FROM users WHERE id = $1',
        [operatorId],
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Operator not found' });

      res.json({ operatorName: result.rows[0].name, operatorEmail: result.rows[0].email });
    } catch (error: any) {
      console.error('Get operator contact error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /v1/operator/customers/:orgId/intake-tokens — generate intake URL token
  // ---------------------------------------------------------------------------
  router.post('/customers/:orgId/intake-tokens', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const { orgId } = req.params;
      if (!await assertOperatorOwnsOrg(operatorId, orgId, db, res)) return;

      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const tokenId = nanoid();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.query(
        `INSERT INTO credential_intake_tokens (id, token_hash, operator_id, org_id, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [tokenId, tokenHash, operatorId, orgId, expiresAt],
      );

      // Get org name for the email template
      const orgResult = await db.query('SELECT name FROM organizations WHERE id = $1', [orgId]);
      const orgName = orgResult.rows[0]?.name || 'your account';

      const intakeUrl = `https://app.clarissi.com/onboard/${rawToken}`;

      res.status(201).json({
        id: tokenId,
        url: intakeUrl,
        expiresAt,
        emailTemplate: `Subject: Connect your accounts to Clarissi — ${orgName}\n\nHi there,\n\nTo get started please click the link below to connect your Shopify and Gorgias accounts. This is a one-time step — it takes about 15 minutes.\n\n${intakeUrl}\n\nThis link expires in 7 days. If you have any questions during setup, just reply to this email.\n\nTalk soon`,
      });
    } catch (error: any) {
      console.error('Generate intake token error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /v1/operator/customers/:orgId/intake-tokens — list tokens + status
  // ---------------------------------------------------------------------------
  router.get('/customers/:orgId/intake-tokens', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const { orgId } = req.params;
      if (!await assertOperatorOwnsOrg(operatorId, orgId, db, res)) return;

      const result = await db.query(
        `SELECT id, opened_at, used_at, expires_at, created_at
         FROM credential_intake_tokens
         WHERE operator_id = $1 AND org_id = $2
         ORDER BY created_at DESC`,
        [operatorId, orgId],
      );

      res.json({ tokens: result.rows });
    } catch (error: any) {
      console.error('List intake tokens error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /v1/operator/customers/:orgId/assessment — upload assessment report
  // Body: { report: object, recommendation?: string }
  // ---------------------------------------------------------------------------
  router.post('/customers/:orgId/assessment', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const { orgId } = req.params;
      if (!await assertOperatorOwnsOrg(operatorId, orgId, db, res)) return;

      const { report, recommendation } = req.body;
      if (!report || typeof report !== 'object') {
        return res.status(400).json({ error: 'report is required and must be an object' });
      }

      const missingSection = validateAssessmentReport(report);
      if (missingSection.length > 0) {
        return res.status(400).json({
          error: 'Report is missing required sections',
          missingSections: missingSection,
          requiredSections: ASSESSMENT_SECTIONS,
        });
      }

      if (recommendation && !['self_managed', 'concierge_starter', 'concierge_standard', 'concierge_growth'].includes(recommendation)) {
        return res.status(400).json({ error: 'Invalid recommendation value' });
      }

      const reportId = nanoid();
      await db.query(
        `INSERT INTO org_assessment_reports (id, org_id, operator_id, report, recommendation)
         VALUES ($1, $2, $3, $4, $5)`,
        [reportId, orgId, operatorId, JSON.stringify(report), recommendation || null],
      );

      res.status(201).json({
        id: reportId,
        sectionsParsed: ASSESSMENT_SECTIONS.filter(s => report[s]),
      });
    } catch (error: any) {
      console.error('Upload assessment error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /v1/operator/customers/:orgId/assessment — get latest assessment report
  // ---------------------------------------------------------------------------
  router.get('/customers/:orgId/assessment', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const { orgId } = req.params;
      if (!await assertOperatorOwnsOrg(operatorId, orgId, db, res)) return;

      const result = await db.query(
        `SELECT id, report, recommendation, schema_version, reviewed_at, shared_at, created_at
         FROM org_assessment_reports WHERE org_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [orgId],
      );

      if (!result.rows[0]) return res.status(404).json({ error: 'No assessment report found' });
      res.json({ report: result.rows[0] });
    } catch (error: any) {
      console.error('Get assessment error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /v1/operator/customers/:orgId/skills — operator view of customer skills
  // ---------------------------------------------------------------------------
  router.get('/customers/:orgId/skills', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const { orgId } = req.params;
      if (!await assertOperatorOwnsOrg(operatorId, orgId, db, res)) return;

      const skills = await skillRegistry.listOrgSkills(orgId);
      res.json({ skills });
    } catch (error: any) {
      console.error('Get customer skills error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /v1/operator/customers/:orgId/skills/:skillId/activate
  // ---------------------------------------------------------------------------
  router.post('/customers/:orgId/skills/:skillId/activate', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const { orgId, skillId } = req.params;
      if (!await assertOperatorWriteAccess(operatorId, orgId, db, res)) return;

      const skill = await skillRegistry.activateSkill({ type: 'org', orgId }, skillId);
      res.status(201).json({ skill });
    } catch (error: any) {
      console.error('Activate skill error:', error);
      res.status(error.message?.includes('not found') ? 404 : 500).json({ error: error.message });
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /v1/operator/customers/:orgId/skills/:userSkillId/configure
  // ---------------------------------------------------------------------------
  router.put('/customers/:orgId/skills/:userSkillId/configure', async (req: OperatorRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const { orgId, userSkillId } = req.params;
      if (!await assertOperatorWriteAccess(operatorId, orgId, db, res)) return;

      const { config } = req.body;
      await skillRegistry.configureSkill(userSkillId, config || {});
      res.json({ success: true });
    } catch (error: any) {
      console.error('Configure skill error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// GET /v1/organizations/:orgId/operator-contact — customer-facing endpoint
// Returns operator info if this org has an assigned operator in concierge mode
// ---------------------------------------------------------------------------
export function createOrgOperatorContactRoute(db: Pool): Router {
  const router = Router();

  router.get('/:orgId/operator-contact', async (req: OperatorRequest, res: Response) => {
    try {
      const { orgId } = req.params;
      const userId = req.user!.id;

      // Verify the requesting user is a member of the org
      const memberResult = await db.query(
        'SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2',
        [orgId, userId],
      );
      if (!memberResult.rows[0]) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const result = await db.query(
        `SELECT u.name AS operator_name, u.email AS operator_email,
                cp.management_mode, cp.handoff_notes
         FROM operator_customers oc
         JOIN users u ON u.id = oc.operator_id
         LEFT JOIN customer_profiles cp ON cp.org_id = oc.org_id
         WHERE oc.org_id = $1
         LIMIT 1`,
        [orgId],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'No operator assigned' });
      }

      const row = result.rows[0];
      res.json({
        operatorName: row.operator_name,
        operatorEmail: row.operator_email,
        managementMode: row.management_mode,
        handoffNotes: row.handoff_notes,
      });
    } catch (error: any) {
      console.error('Get org operator contact error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
