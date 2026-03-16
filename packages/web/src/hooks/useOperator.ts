import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../services/auth';
import { useAuthStore } from '../store/authStore';

export interface OperatorCustomer {
  id: string;
  name: string;
  slug: string;
  management_mode: 'concierge' | 'self_managed';
  onboarded_at: string | null;
  last_execution_at: string | null;
  executions_this_month: number;
  pending_credentials: number;
}

export interface IntakeToken {
  id: string;
  opened_at: string | null;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface AssessmentReport {
  id: string;
  report: Record<string, any>;
  recommendation: string | null;
  schema_version: string;
  reviewed_at: string | null;
  shared_at: string | null;
  created_at: string;
}

export function useOperatorCustomers() {
  const [customers, setCustomers] = useState<OperatorCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore((s) => s.token);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/v1/operator/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to load customers');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  return { customers, loading, error, refresh };
}

export async function createCustomer(orgName: string, mode: 'concierge' | 'self_managed' = 'concierge') {
  const res = await apiFetch('/v1/operator/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgName, mode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to create customer');
  }
  return res.json();
}

export async function generateIntakeToken(orgId: string): Promise<{ id: string; url: string; expiresAt: string; emailTemplate: string }> {
  const res = await apiFetch(`/v1/operator/customers/${orgId}/intake-tokens`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to generate intake token');
  }
  return res.json();
}

export async function listIntakeTokens(orgId: string): Promise<IntakeToken[]> {
  const res = await apiFetch(`/v1/operator/customers/${orgId}/intake-tokens`);
  if (!res.ok) throw new Error('Failed to load intake tokens');
  const data = await res.json();
  return data.tokens;
}

export async function updateMode(
  orgId: string,
  mode: 'concierge' | 'self_managed',
  handoffNotes?: string,
): Promise<void> {
  const res = await apiFetch(`/v1/operator/customers/${orgId}/mode`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, handoff_notes: handoffNotes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to update mode');
  }
}

export async function storeAssessment(
  orgId: string,
  report: Record<string, any>,
  recommendation?: string,
): Promise<{ id: string; sectionsParsed: string[] }> {
  const res = await apiFetch(`/v1/operator/customers/${orgId}/assessment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report, recommendation }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to save assessment');
  }
  return res.json();
}

export async function fetchAssessment(orgId: string): Promise<AssessmentReport> {
  const res = await apiFetch(`/v1/operator/customers/${orgId}/assessment`);
  if (!res.ok) throw new Error('No assessment found');
  const data = await res.json();
  return data.report;
}
