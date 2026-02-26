import { PlanTier } from '@pacore/core';
import { LimitKey } from './plan-definitions';

export class PlanLimitError extends Error {
  readonly limitKey: LimitKey;
  readonly currentPlan: PlanTier;
  readonly limit: number;
  readonly current: number;

  constructor(opts: {
    limitKey: LimitKey;
    currentPlan: PlanTier;
    limit: number;
    current: number;
  }) {
    super(
      `Plan limit reached: ${opts.limitKey} (${opts.current}/${opts.limit}) on ${opts.currentPlan} plan`
    );
    this.name = 'PlanLimitError';
    this.limitKey = opts.limitKey;
    this.currentPlan = opts.currentPlan;
    this.limit = opts.limit;
    this.current = opts.current;
  }
}
