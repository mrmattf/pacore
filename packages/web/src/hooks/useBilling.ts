import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';

export type PlanTier = 'free' | 'starter' | 'growth' | 'business' | 'enterprise';

export interface Subscription {
  id: string;
  userId: string | null;
  orgId: string | null;
  plan: PlanTier;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LimitSummaryItem {
  current: number;
  limit: number;
  percentUsed: number;
}

export interface UsageSummary {
  skillExecutionsPerMonth: LimitSummaryItem;
  activeSkills: LimitSummaryItem;
  orgs: LimitSummaryItem;
  orgMembers: LimitSummaryItem;
}

export interface BillingInfo {
  plan: PlanTier;
  subscription: Subscription | null;
  summary: UsageSummary;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceMonthly: number | null;
  features: string[];
}

async function apiFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

/** Hook for billing data. Pass orgId to get org billing instead of personal billing. */
export function useBilling(orgId?: string) {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore((s) => s.token);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const billingPath = orgId
        ? `/v1/organizations/${orgId}/billing`
        : '/v1/me/billing';
      const [billingData, plansData] = await Promise.all([
        apiFetch(billingPath, token),
        apiFetch('/v1/plans', token),
      ]);
      setBilling(billingData);
      setPlans(plansData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, orgId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updatePlan = async (plan: PlanTier): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    const path = orgId
      ? `/v1/organizations/${orgId}/billing/plan`
      : '/v1/me/billing/plan';
    await apiFetch(path, token, {
      method: 'PUT',
      body: JSON.stringify({ plan }),
    });
    await refresh();
  };

  return { billing, plans, loading, error, refresh, updatePlan };
}
