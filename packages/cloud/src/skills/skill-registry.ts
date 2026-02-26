import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import { BillingScope, SkillDefinition, UserSkill, SkillTrigger, SkillExecution, SkillStatus, WebhookVerification } from '@pacore/core';
import { randomBytes } from 'crypto';
import { BillingManager } from '../billing';

export type SkillScope =
  | { type: 'user'; userId: string }
  | { type: 'org';  orgId: string };

export class SkillRegistry {
  // In-memory catalog of platform-defined skills
  private catalog = new Map<string, SkillDefinition>();

  constructor(private db: Pool, private billingManager?: BillingManager) {}

  // ---- Catalog management ----

  registerSkill(definition: SkillDefinition): void {
    this.catalog.set(definition.id, definition);
  }

  /** Upsert all registered skill definitions into the `skills` table so FK constraints are satisfied. */
  async initialize(): Promise<void> {
    for (const def of this.catalog.values()) {
      await this.db.query(
        `INSERT INTO skills (id, name, version, description, config_schema, required_capabilities, trigger_type, tool_chain)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name                  = EXCLUDED.name,
           version               = EXCLUDED.version,
           description           = EXCLUDED.description,
           config_schema         = EXCLUDED.config_schema,
           required_capabilities = EXCLUDED.required_capabilities,
           trigger_type          = EXCLUDED.trigger_type,
           tool_chain            = EXCLUDED.tool_chain`,
        [
          def.id,
          def.name,
          def.version,
          def.description ?? null,
          JSON.stringify(def.configSchema ?? {}),
          def.requiredCapabilities ?? [],
          def.triggerType ?? null,
          def.toolChain,
        ]
      );
    }
  }

  listSkills(): SkillDefinition[] {
    return Array.from(this.catalog.values());
  }

  getSkillDefinition(skillId: string): SkillDefinition | null {
    return this.catalog.get(skillId) ?? null;
  }

  // ---- Activation ----

  async activateSkill(scope: SkillScope, skillId: string): Promise<UserSkill> {
    if (!this.catalog.has(skillId)) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const id = nanoid();
    const userId = scope.type === 'user' ? scope.userId : null;
    const orgId  = scope.type === 'org'  ? scope.orgId  : null;

    const result = await this.db.query(
      `INSERT INTO user_skills (id, user_id, org_id, skill_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [id, userId, orgId, skillId]
    );

    return this.rowToUserSkill(result.rows[0]);
  }

  async getUserSkill(userSkillId: string): Promise<UserSkill | null> {
    const result = await this.db.query(
      'SELECT * FROM user_skills WHERE id = $1',
      [userSkillId]
    );
    return result.rows[0] ? this.rowToUserSkill(result.rows[0]) : null;
  }

  async listUserSkills(userId: string): Promise<UserSkill[]> {
    const result = await this.db.query(
      'SELECT * FROM user_skills WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows.map(this.rowToUserSkill);
  }

  async listOrgSkills(orgId: string): Promise<UserSkill[]> {
    const result = await this.db.query(
      'SELECT * FROM user_skills WHERE org_id = $1 ORDER BY created_at DESC',
      [orgId]
    );
    return result.rows.map(this.rowToUserSkill);
  }

  async configureSkill(userSkillId: string, configuration: Record<string, unknown>): Promise<UserSkill> {
    const result = await this.db.query(
      `UPDATE user_skills
       SET configuration = $2, status = 'active', activated_at = COALESCE(activated_at, NOW())
       WHERE id = $1
       RETURNING *`,
      [userSkillId, JSON.stringify(configuration)]
    );
    if (result.rows.length === 0) throw new Error('UserSkill not found');
    return this.rowToUserSkill(result.rows[0]);
  }

  async updateSkillStatus(userSkillId: string, status: SkillStatus): Promise<void> {
    await this.db.query(
      'UPDATE user_skills SET status = $2 WHERE id = $1',
      [userSkillId, status]
    );
  }

  async deleteUserSkill(userSkillId: string): Promise<void> {
    await this.db.query('DELETE FROM user_skills WHERE id = $1', [userSkillId]);
  }

  // ---- Triggers ----

  async createWebhookTrigger(
    userSkillId: string,
    verification: WebhookVerification = { type: 'none' }
  ): Promise<SkillTrigger> {
    const id = nanoid();
    const token = randomBytes(32).toString('hex');

    const result = await this.db.query(
      `INSERT INTO skill_triggers (id, user_skill_id, trigger_type, endpoint_token, verification_config)
       VALUES ($1, $2, 'webhook', $3, $4)
       RETURNING *`,
      [id, userSkillId, token, JSON.stringify(verification)]
    );

    return this.rowToTrigger(result.rows[0]);
  }

  async getTriggerByToken(token: string): Promise<SkillTrigger | null> {
    const result = await this.db.query(
      'SELECT * FROM skill_triggers WHERE endpoint_token = $1 AND status = $2',
      [token, 'active']
    );
    return result.rows[0] ? this.rowToTrigger(result.rows[0]) : null;
  }

  async listTriggersForSkill(userSkillId: string): Promise<SkillTrigger[]> {
    const result = await this.db.query(
      'SELECT * FROM skill_triggers WHERE user_skill_id = $1',
      [userSkillId]
    );
    return result.rows.map(this.rowToTrigger);
  }

  async updateTriggerVerification(triggerId: string, verification: WebhookVerification): Promise<void> {
    await this.db.query(
      'UPDATE skill_triggers SET verification_config = $2 WHERE id = $1',
      [triggerId, JSON.stringify(verification)]
    );
  }

  // ---- Execution records ----

  async createExecution(
    userSkillId: string,
    triggerId: string | null,
    payload: unknown
  ): Promise<SkillExecution> {
    // Resolve billing scope from the user_skill row and increment usage counter
    if (this.billingManager) {
      const scopeRow = await this.db.query<{ user_id: string | null; org_id: string | null }>(
        'SELECT user_id, org_id FROM user_skills WHERE id = $1',
        [userSkillId]
      );
      if (scopeRow.rows.length > 0) {
        const { user_id, org_id } = scopeRow.rows[0];
        const scope: BillingScope = org_id
          ? { type: 'org', orgId: org_id }
          : { type: 'user', userId: user_id! };
        await this.billingManager.incrementExecution(scope);
      }
    }

    const id = nanoid();
    const result = await this.db.query(
      `INSERT INTO skill_executions (id, user_skill_id, trigger_id, status, payload)
       VALUES ($1, $2, $3, 'running', $4)
       RETURNING *`,
      [id, userSkillId, triggerId, JSON.stringify(payload)]
    );
    return this.rowToExecution(result.rows[0]);
  }

  async completeExecution(executionId: string, result: unknown): Promise<void> {
    await this.db.query(
      `UPDATE skill_executions
       SET status = 'completed', result = $2, completed_at = NOW()
       WHERE id = $1`,
      [executionId, JSON.stringify(result)]
    );
  }

  async failExecution(executionId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE skill_executions
       SET status = 'failed', error = $2, completed_at = NOW()
       WHERE id = $1`,
      [executionId, error]
    );
  }

  async listExecutions(userSkillId: string, limit = 50): Promise<SkillExecution[]> {
    const result = await this.db.query(
      'SELECT * FROM skill_executions WHERE user_skill_id = $1 ORDER BY started_at DESC LIMIT $2',
      [userSkillId, limit]
    );
    return result.rows.map(this.rowToExecution);
  }

  // ---- Mappers ----

  private rowToUserSkill(row: Record<string, unknown>): UserSkill {
    return {
      id: row.id as string,
      userId: (row.user_id as string | null) ?? null,
      orgId:  (row.org_id  as string | null) ?? null,
      skillId: row.skill_id as string,
      configuration: (row.configuration as Record<string, unknown>) ?? {},
      status: row.status as SkillStatus,
      activatedAt: row.activated_at ? new Date(row.activated_at as string) : null,
      createdAt: new Date(row.created_at as string),
    };
  }

  private rowToTrigger(row: Record<string, unknown>): SkillTrigger {
    return {
      id: row.id as string,
      userSkillId: row.user_skill_id as string,
      triggerType: row.trigger_type as SkillTrigger['triggerType'],
      endpointToken: row.endpoint_token as string,
      verificationConfig: row.verification_config as WebhookVerification,
      status: row.status as SkillTrigger['status'],
      createdAt: new Date(row.created_at as string),
    };
  }

  private rowToExecution(row: Record<string, unknown>): SkillExecution {
    return {
      id: row.id as string,
      userSkillId: row.user_skill_id as string,
      triggerId: (row.trigger_id as string | null) ?? null,
      status: row.status as SkillExecution['status'],
      payload: row.payload,
      result: row.result,
      error: (row.error as string | null) ?? null,
      startedAt: new Date(row.started_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    };
  }
}
