import { PlanTier } from '@pacore/core';

export type LimitKey = 'skillExecutionsPerMonth' | 'activeSkills' | 'orgs' | 'orgMembers';

/** Limits for each plan tier. -1 = unlimited.
 *  "skillExecutionsPerMonth" counts only non-skipped, non-sandbox executions
 *  (i.e. runs where the skill actually took an action). */
export const PLAN_LIMITS: Record<PlanTier, Record<LimitKey, number>> = {
  free: {
    skillExecutionsPerMonth: -1, // unlimited — sandbox mode, no real actions
    activeSkills: 1,
    orgs: 0,
    orgMembers: 0,
  },
  starter: {
    skillExecutionsPerMonth: 50,
    activeSkills: 3,
    orgs: 0,
    orgMembers: 0,
  },
  growth: {
    skillExecutionsPerMonth: 250,
    activeSkills: 10,
    orgs: 1,
    orgMembers: 10,
  },
  business: {
    skillExecutionsPerMonth: 1_000,
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
    features: ['50 skill executions/mo', '3 active skills', 'Personal workspace only'],
  },
  {
    tier: 'growth',
    name: 'Growth',
    priceMonthly: 199,
    sandboxMode: false,
    features: ['250 skill executions/mo', '10 active skills', '1 organization', 'Up to 10 org members'],
  },
  {
    tier: 'business',
    name: 'Business',
    priceMonthly: 499,
    sandboxMode: false,
    features: [
      '1,000 skill executions/mo',
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
