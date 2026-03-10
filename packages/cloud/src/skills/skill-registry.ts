import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import { BillingScope, SkillDefinition, UserSkill, SkillTrigger, SkillExecution, SkillStatus, WebhookVerification } from '@pacore/core';
import { randomBytes } from 'crypto';
import { BillingManager } from '../billing';

export type SkillScope =
  | { type: 'user'; userId: string }
  | { type: 'org';  orgId: string };

function isSkippedResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return true;
  const r = result as { actions?: unknown[]; skipped?: boolean };
  // LowStockChainResult has no top-level actions array — use the explicit skipped flag instead.
  // skipped=true → skip billing; skipped=undefined → chain completed with notifications → bill.
  if (!Array.isArray(r.actions)) {
    return r.skipped === true;
  }
  // All other chains (backorder, high-risk, delivery-exception, dedup) use a top-level actions array.
  if (r.actions.length === 0) return true;
  return r.actions.every(a => a === 'skip');
}

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

  async findPendingSkill(userId: string, skillId: string): Promise<UserSkill | null> {
    const result = await this.db.query(
      `SELECT * FROM user_skills WHERE user_id = $1 AND skill_id = $2 AND status = 'pending' LIMIT 1`,
      [userId, skillId]
    );
    return result.rows[0] ? this.rowToUserSkill(result.rows[0]) : null;
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

  async configureSkill(userSkillId: string, configuration: Record<string, unknown>, activate = false): Promise<UserSkill> {
    const result = await this.db.query(
      activate
        ? `UPDATE user_skills
           SET configuration = $2, status = 'active', activated_at = COALESCE(activated_at, NOW())
           WHERE id = $1
           RETURNING *`
        : `UPDATE user_skills
           SET configuration = $2
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

  async getTrigger(triggerId: string): Promise<SkillTrigger | null> {
    const result = await this.db.query(
      'SELECT * FROM skill_triggers WHERE id = $1',
      [triggerId]
    );
    return result.rows[0] ? this.rowToTrigger(result.rows[0]) : null;
  }

  /** Stores the external webhook GID after registering with the source platform (e.g. Shopify). */
  async setTriggerExternalWebhookId(triggerId: string, externalWebhookId: string): Promise<void> {
    await this.db.query(
      'UPDATE skill_triggers SET external_webhook_id = $2 WHERE id = $1',
      [triggerId, externalWebhookId]
    );
  }

  async deleteTrigger(triggerId: string): Promise<void> {
    await this.db.query('DELETE FROM skill_triggers WHERE id = $1', [triggerId]);
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
    payload: unknown,
    opts: { sandbox?: boolean } = {}
  ): Promise<SkillExecution> {
    const sandbox = opts.sandbox ?? false;
    const id = nanoid();
    const result = await this.db.query(
      `INSERT INTO skill_executions (id, user_skill_id, trigger_id, status, payload, sandbox)
       VALUES ($1, $2, $3, 'running', $4, $5)
       RETURNING *`,
      [id, userSkillId, triggerId, JSON.stringify(payload), sandbox]
    );
    return this.rowToExecution(result.rows[0]);
  }

  async completeExecution(executionId: string, result: unknown): Promise<void> {
    const skipped = isSkippedResult(result);

    await this.db.query(
      `UPDATE skill_executions
       SET status = 'completed', result = $2, completed_at = NOW(), skipped = $3
       WHERE id = $1`,
      [executionId, JSON.stringify(result), skipped]
    );

    // Increment billing only for real, non-skipped executions
    if (this.billingManager && !skipped) {
      const row = await this.db.query<{ user_id: string | null; org_id: string | null; sandbox: boolean }>(
        `SELECT us.user_id, us.org_id, se.sandbox
         FROM skill_executions se
         JOIN user_skills us ON se.user_skill_id = us.id
         WHERE se.id = $1`,
        [executionId]
      );
      if (row.rows.length > 0 && !row.rows[0].sandbox) {
        const { user_id, org_id } = row.rows[0];
        const scope: BillingScope = org_id
          ? { type: 'org', orgId: org_id }
          : { type: 'user', userId: user_id! };
        await this.billingManager.incrementExecution(scope);
      }
    }
  }

  async failExecution(executionId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE skill_executions
       SET status = 'failed', error = $2, completed_at = NOW(), skipped = true
       WHERE id = $1`,
      [executionId, error]
    );
  }

  /** Returns an existing execution for the given (userSkillId, idempotencyKey) pair, or null if none exists. */
  async findExecutionByIdempotencyKey(
    userSkillId: string,
    idempotencyKey: string
  ): Promise<Pick<SkillExecution, 'id' | 'status'> | null> {
    const result = await this.db.query<{ id: string; status: string }>(
      `SELECT id, status FROM skill_executions
       WHERE user_skill_id = $1 AND idempotency_key = $2
       ORDER BY started_at DESC LIMIT 1`,
      [userSkillId, idempotencyKey]
    );
    if (!result.rows[0]) return null;
    return { id: result.rows[0].id, status: result.rows[0].status as SkillExecution['status'] };
  }

  /** Sets the idempotency key on an execution record after the chain starts. */
  async setIdempotencyKey(executionId: string, idempotencyKey: string): Promise<void> {
    await this.db.query(
      'UPDATE skill_executions SET idempotency_key = $2 WHERE id = $1',
      [executionId, idempotencyKey]
    );
  }

  async listExecutions(userSkillId: string, limit = 50): Promise<SkillExecution[]> {
    const result = await this.db.query(
      'SELECT * FROM skill_executions WHERE user_skill_id = $1 ORDER BY started_at DESC LIMIT $2',
      [userSkillId, limit]
    );
    return result.rows.map(this.rowToExecution);
  }

  async listAllUserExecutions(userId: string, limit = 20): Promise<(SkillExecution & { skillTypeId: string | null })[]> {
    const result = await this.db.query(
      `SELECT se.*, us.configuration->>'skillTypeId' as skill_type_id
       FROM skill_executions se
       JOIN user_skills us ON se.user_skill_id = us.id
       WHERE us.user_id = $1
       ORDER BY se.started_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return result.rows.map(row => ({
      ...this.rowToExecution(row),
      skillTypeId: (row.skill_type_id as string | null) ?? null,
    }));
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
      externalWebhookId: (row.external_webhook_id as string | null) ?? null,
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
      sandbox: (row.sandbox as boolean) ?? false,
      skipped: row.skipped !== null && row.skipped !== undefined ? Boolean(row.skipped) : null,
    };
  }
}
