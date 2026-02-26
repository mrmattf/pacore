import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import { BillingScope, PlanTier } from '@pacore/core';
import { LimitKey, getPlanLimits, PLAN_DEFINITIONS, PlanDefinition } from './plan-definitions';
import { PlanLimitError } from './plan-limit-error';

export interface Subscription {
  id: string;
  userId: string | null;
  orgId: string | null;
  plan: PlanTier;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageRecord {
  skillExecutions: number;
  year: number;
  month: number;
}

export interface LimitSummaryItem {
  current: number;
  limit: number;
  percentUsed: number;
}

export type UsageSummary = Record<LimitKey, LimitSummaryItem>;

export class BillingManager {
  constructor(private db: Pool) {}

  async initialize(): Promise<void> {
    // Nothing to migrate at startup — schema.sql handles table creation
    console.log('[BillingManager] initialized');
  }

  // -----------------------------------------------------------------------
  // Plan resolution
  // -----------------------------------------------------------------------

  async getSubscription(scope: BillingScope): Promise<Subscription | null> {
    const { rows } = await this.db.query<{
      id: string;
      user_id: string | null;
      org_id: string | null;
      plan: string;
      status: string;
      current_period_start: Date | null;
      current_period_end: Date | null;
      cancel_at_period_end: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      scope.type === 'user'
        ? `SELECT * FROM subscriptions WHERE user_id = $1`
        : `SELECT * FROM subscriptions WHERE org_id = $1`,
      [scope.type === 'user' ? scope.userId : scope.orgId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      orgId: r.org_id,
      plan: r.plan as PlanTier,
      status: r.status,
      currentPeriodStart: r.current_period_start,
      currentPeriodEnd: r.current_period_end,
      cancelAtPeriodEnd: r.cancel_at_period_end,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async getEffectivePlan(scope: BillingScope): Promise<PlanTier> {
    const sub = await this.getSubscription(scope);
    return (sub?.plan as PlanTier) ?? 'free';
  }

  // -----------------------------------------------------------------------
  // Limit enforcement
  // -----------------------------------------------------------------------

  async checkLimit(scope: BillingScope, limitKey: LimitKey): Promise<void> {
    const plan = await this.getEffectivePlan(scope);
    const limits = getPlanLimits(plan);
    const limit = limits[limitKey];
    if (limit === -1) return; // unlimited

    const current = await this.getCurrentValue(scope, limitKey);
    if (current >= limit) {
      throw new PlanLimitError({ limitKey, currentPlan: plan, limit, current });
    }
  }

  async isOverLimit(scope: BillingScope, limitKey: LimitKey): Promise<boolean> {
    const plan = await this.getEffectivePlan(scope);
    const limits = getPlanLimits(plan);
    const limit = limits[limitKey];
    if (limit === -1) return false;
    const current = await this.getCurrentValue(scope, limitKey);
    return current >= limit;
  }

  private async getCurrentValue(scope: BillingScope, limitKey: LimitKey): Promise<number> {
    switch (limitKey) {
      case 'activeSkills':
        return this.countActiveSkills(scope);
      case 'orgs':
        return this.countOrgs(scope);
      case 'orgMembers':
        return this.countOrgMembers(scope);
      case 'skillExecutionsPerMonth': {
        const now = new Date();
        const usage = await this.getUsage(scope, now.getFullYear(), now.getMonth() + 1);
        return usage.skillExecutions;
      }
    }
  }

  private async countActiveSkills(scope: BillingScope): Promise<number> {
    const col = scope.type === 'user' ? 'user_id' : 'org_id';
    const id = scope.type === 'user' ? scope.userId : scope.orgId;
    const { rows } = await this.db.query(
      `SELECT COUNT(*)::int AS cnt FROM user_skills
       WHERE ${col} = $1 AND status IN ('pending', 'active')`,
      [id]
    );
    return rows[0].cnt;
  }

  private async countOrgs(scope: BillingScope): Promise<number> {
    if (scope.type !== 'user') return 0;
    const { rows } = await this.db.query(
      `SELECT COUNT(*)::int AS cnt FROM organizations WHERE owner_id = $1`,
      [scope.userId]
    );
    return rows[0].cnt;
  }

  private async countOrgMembers(scope: BillingScope): Promise<number> {
    if (scope.type !== 'org') return 0;
    const { rows } = await this.db.query(
      `SELECT COUNT(*)::int AS cnt FROM org_members WHERE org_id = $1`,
      [scope.orgId]
    );
    return rows[0].cnt;
  }

  // -----------------------------------------------------------------------
  // Usage recording
  // -----------------------------------------------------------------------

  async getUsage(scope: BillingScope, year?: number, month?: number): Promise<UsageRecord> {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;

    const col = scope.type === 'user' ? 'user_id' : 'org_id';
    const id = scope.type === 'user' ? scope.userId : scope.orgId;
    const { rows } = await this.db.query(
      `SELECT skill_executions FROM usage_records
       WHERE ${col} = $1 AND year = $2 AND month = $3`,
      [id, y, m]
    );
    return {
      skillExecutions: rows[0]?.skill_executions ?? 0,
      year: y,
      month: m,
    };
  }

  async incrementExecution(scope: BillingScope): Promise<void> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    if (scope.type === 'user') {
      await this.db.query(
        `INSERT INTO usage_records (user_id, year, month, skill_executions, updated_at)
         VALUES ($1, $2, $3, 1, NOW())
         ON CONFLICT ON CONSTRAINT usage_records_unique_user
         DO UPDATE SET skill_executions = usage_records.skill_executions + 1, updated_at = NOW()`,
        [scope.userId, year, month]
      );
    } else {
      await this.db.query(
        `INSERT INTO usage_records (org_id, year, month, skill_executions, updated_at)
         VALUES ($1, $2, $3, 1, NOW())
         ON CONFLICT ON CONSTRAINT usage_records_unique_org
         DO UPDATE SET skill_executions = usage_records.skill_executions + 1, updated_at = NOW()`,
        [scope.orgId, year, month]
      );
    }
  }

  // -----------------------------------------------------------------------
  // Plan management (pre-Stripe — any user can self-assign for dev/test)
  // -----------------------------------------------------------------------

  async updatePlan(scope: BillingScope, plan: PlanTier): Promise<Subscription> {
    const id = nanoid();
    const now = new Date();

    if (scope.type === 'user') {
      await this.db.query(
        `INSERT INTO subscriptions (id, user_id, plan, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', $4, $4)
         ON CONFLICT ON CONSTRAINT subscriptions_unique_user
         DO UPDATE SET plan = $3, updated_at = $4`,
        [id, scope.userId, plan, now]
      );
    } else {
      await this.db.query(
        `INSERT INTO subscriptions (id, org_id, plan, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', $4, $4)
         ON CONFLICT ON CONSTRAINT subscriptions_unique_org
         DO UPDATE SET plan = $3, updated_at = $4`,
        [id, scope.orgId, plan, now]
      );
      // Sync denormalized cache on organizations table
      await this.db.query(
        `UPDATE organizations SET plan = $1 WHERE id = $2`,
        [plan, scope.orgId]
      );
    }

    const sub = await this.getSubscription(scope);
    return sub!;
  }

  // -----------------------------------------------------------------------
  // Summary for billing dashboard
  // -----------------------------------------------------------------------

  async getUsageSummary(scope: BillingScope): Promise<UsageSummary> {
    const plan = await this.getEffectivePlan(scope);
    const limits = getPlanLimits(plan);
    const now = new Date();

    const [execUsage, activeSkillsCount, orgsCount, orgMembersCount] = await Promise.all([
      this.getUsage(scope, now.getFullYear(), now.getMonth() + 1),
      this.countActiveSkills(scope),
      this.countOrgs(scope),
      this.countOrgMembers(scope),
    ]);

    const mkItem = (current: number, limitKey: LimitKey): LimitSummaryItem => {
      const limit = limits[limitKey];
      return {
        current,
        limit,
        percentUsed: limit === -1 ? 0 : Math.round((current / limit) * 100),
      };
    };

    return {
      skillExecutionsPerMonth: mkItem(execUsage.skillExecutions, 'skillExecutionsPerMonth'),
      activeSkills: mkItem(activeSkillsCount, 'activeSkills'),
      orgs: mkItem(orgsCount, 'orgs'),
      orgMembers: mkItem(orgMembersCount, 'orgMembers'),
    };
  }

  // -----------------------------------------------------------------------
  // Plan catalog
  // -----------------------------------------------------------------------

  listPlans(): PlanDefinition[] {
    return PLAN_DEFINITIONS;
  }
}
