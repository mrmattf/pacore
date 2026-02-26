export type OrgRole = 'admin' | 'member' | 'viewer';
export type PlanTier = 'free' | 'starter' | 'growth' | 'business' | 'enterprise';
/** @deprecated Use PlanTier */
export type OrgPlan = PlanTier;

export type BillingScope =
  | { type: 'user'; userId: string }
  | { type: 'org'; orgId: string };

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: PlanTier;
  createdAt: Date;
}

export interface OrgMember {
  id: number;
  orgId: string;
  userId: string;
  role: OrgRole;
  joinedAt: Date;
}

export interface OrgTeam {
  id: string;
  orgId: string;
  name: string;
  createdAt: Date;
}

export interface OrgWithMembers extends Organization {
  members: (OrgMember & { name?: string; email: string })[];
}
