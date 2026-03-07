import { PlanTier } from '@pacore/core';

export type LimitKey = 'skillExecutionsPerMonth' | 'activeSkills' | 'orgs' | 'orgMembers';

/** Limits for each plan tier. -1 = unlimited. */
export const PLAN_LIMITS: Record<PlanTier, Record<LimitKey, number>> = {
  free: {
    skillExecutionsPerMonth: -1, // unlimited — sandbox mode, no real executions
    activeSkills: 1,
    orgs: 0,
    orgMembers: 0,
  },
  starter: {
    skillExecutionsPerMonth: 100,
    activeSkills: 1,
    orgs: 0,
    orgMembers: 0,
  },
  growth: {
    skillExecutionsPerMonth: 1_000,
    activeSkills: 5,
    orgs: 1,
    orgMembers: 10,
  },
  business: {
    skillExecutionsPerMonth: 5_000,
    activeSkills: -1,
    orgs: 3,
    orgMembers: -1,
  },
  enterprise: {
    skillExecutionsPerMonth: -1,
    activeSkills: -1,
    orgs: -1,
    orgMembers: -1,
  },
};

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceMonthly: number | null; // null = custom/contact sales
  sandboxMode: boolean;        // true = all executions run in dry-run mode
  features: string[];
}

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    tier: 'free',
    name: 'Free',
    priceMonthly: 0,
    sandboxMode: true,
    features: [
      'Sandbox mode — preview actions without real execution',
      '1 active skill',
      'Personal workspace only',
    ],
  },
  {
    tier: 'starter',
    name: 'Starter',
    priceMonthly: 79,
    sandboxMode: false,
    features: ['100 skill executions/mo', '1 active skill', 'Personal workspace only'],
  },
  {
    tier: 'growth',
    name: 'Growth',
    priceMonthly: 199,
    sandboxMode: false,
    features: ['1,000 skill executions/mo', '5 active skills', '1 organization', 'Up to 10 org members'],
  },
  {
    tier: 'business',
    name: 'Business',
    priceMonthly: 499,
    sandboxMode: false,
    features: [
      '5,000 skill executions/mo',
      'Unlimited active skills',
      '3 organizations',
      'Unlimited org members',
    ],
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    priceMonthly: null,
    sandboxMode: false,
    features: [
      'Unlimited skill executions',
      'Unlimited active skills',
      'Unlimited organizations',
      'Unlimited org members',
      'Dedicated support',
      'SLA guarantee',
    ],
  },
];

export function getPlanLimits(tier: PlanTier): Record<LimitKey, number> {
  return PLAN_LIMITS[tier] ?? PLAN_LIMITS['free'];
}

/** Returns true if the plan runs all executions in sandbox/dry-run mode. */
export function isSandboxPlan(tier: PlanTier): boolean {
  return tier === 'free';
}
