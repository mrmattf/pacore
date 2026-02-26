import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import { Organization, OrgMember, OrgRole, OrgTeam, OrgWithMembers, PlanTier } from '@pacore/core';

export class OrgManager {
  constructor(private db: Pool) {}

  async initialize(): Promise<void> {
    // Tables are created by schema.sql — nothing to do at runtime
  }

  // ---- Organizations ----

  async createOrg(
    ownerId: string,
    name: string,
    slug: string,
    plan: PlanTier = 'free'
  ): Promise<Organization> {
    const id = nanoid();
    const result = await this.db.query<{
      id: string; name: string; slug: string; owner_id: string; plan: string; created_at: Date;
    }>(
      `INSERT INTO organizations (id, name, slug, owner_id, plan)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, name, slug, ownerId, plan]
    );
    // Owner is automatically a member with admin role
    await this.addMember(id, ownerId, 'admin');
    return this.mapOrg(result.rows[0]);
  }

  async getOrg(orgId: string): Promise<Organization | null> {
    const result = await this.db.query(
      'SELECT * FROM organizations WHERE id = $1',
      [orgId]
    );
    return result.rows[0] ? this.mapOrg(result.rows[0]) : null;
  }

  async getOrgWithMembers(orgId: string): Promise<OrgWithMembers | null> {
    const org = await this.getOrg(orgId);
    if (!org) return null;

    const members = await this.db.query<{
      id: number; org_id: string; user_id: string; role: string; joined_at: Date;
      name: string | null; email: string;
    }>(
      `SELECT om.*, u.name, u.email
       FROM org_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.org_id = $1
       ORDER BY om.joined_at`,
      [orgId]
    );

    return {
      ...org,
      members: members.rows.map(r => ({
        id: r.id,
        orgId: r.org_id,
        userId: r.user_id,
        role: r.role as OrgRole,
        joinedAt: r.joined_at,
        name: r.name ?? undefined,
        email: r.email,
      })),
    };
  }

  async listUserOrgs(userId: string): Promise<Organization[]> {
    const result = await this.db.query(
      `SELECT o.*
       FROM organizations o
       JOIN org_members om ON om.org_id = o.id
       WHERE om.user_id = $1
       ORDER BY o.created_at`,
      [userId]
    );
    return result.rows.map(this.mapOrg);
  }

  // ---- Membership ----

  async addMember(orgId: string, userId: string, role: OrgRole = 'member'): Promise<OrgMember> {
    const result = await this.db.query<{
      id: number; org_id: string; user_id: string; role: string; joined_at: Date;
    }>(
      `INSERT INTO org_members (org_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [orgId, userId, role]
    );
    return this.mapMember(result.rows[0]);
  }

  async updateMemberRole(orgId: string, userId: string, role: OrgRole): Promise<OrgMember | null> {
    const result = await this.db.query(
      `UPDATE org_members SET role = $3
       WHERE org_id = $1 AND user_id = $2
       RETURNING *`,
      [orgId, userId, role]
    );
    return result.rows[0] ? this.mapMember(result.rows[0]) : null;
  }

  async removeMember(orgId: string, userId: string): Promise<void> {
    await this.db.query(
      'DELETE FROM org_members WHERE org_id = $1 AND user_id = $2',
      [orgId, userId]
    );
  }

  async getMemberRole(orgId: string, userId: string): Promise<OrgRole | null> {
    const result = await this.db.query(
      'SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2',
      [orgId, userId]
    );
    return result.rows[0]?.role ?? null;
  }

  async assertMember(orgId: string, userId: string): Promise<OrgRole> {
    const role = await this.getMemberRole(orgId, userId);
    if (!role) throw new Error('Not a member of this organization');
    return role;
  }

  async assertAdmin(orgId: string, userId: string): Promise<void> {
    const role = await this.getMemberRole(orgId, userId);
    if (role !== 'admin') throw new Error('Admin access required');
  }

  // ---- Teams ----

  async createTeam(orgId: string, name: string): Promise<OrgTeam> {
    const id = nanoid();
    const result = await this.db.query(
      'INSERT INTO org_teams (id, org_id, name) VALUES ($1, $2, $3) RETURNING *',
      [id, orgId, name]
    );
    return this.mapTeam(result.rows[0]);
  }

  async listTeams(orgId: string): Promise<OrgTeam[]> {
    const result = await this.db.query(
      'SELECT * FROM org_teams WHERE org_id = $1 ORDER BY name',
      [orgId]
    );
    return result.rows.map(this.mapTeam);
  }

  // ---- Slug helpers ----

  async isSlugAvailable(slug: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM organizations WHERE slug = $1',
      [slug]
    );
    return result.rows.length === 0;
  }

  static toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  // ---- Mappers ----

  private mapOrg(row: Record<string, unknown>): Organization {
    return {
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      ownerId: row.owner_id as string,
      plan: row.plan as PlanTier,
      createdAt: row.created_at as Date,
    };
  }

  private mapMember(row: Record<string, unknown>): OrgMember {
    return {
      id: row.id as number,
      orgId: row.org_id as string,
      userId: row.user_id as string,
      role: row.role as OrgRole,
      joinedAt: row.joined_at as Date,
    };
  }

  private mapTeam(row: Record<string, unknown>): OrgTeam {
    return {
      id: row.id as string,
      orgId: row.org_id as string,
      name: row.name as string,
      createdAt: row.created_at as Date,
    };
  }
}
