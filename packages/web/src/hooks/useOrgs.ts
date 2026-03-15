import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../services/auth';
import { useAuthStore } from '../store/authStore';

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: string;
  createdAt: string;
}

export function useOrgs() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore((s) => s.token);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/v1/organizations');
      if (res.ok) {
        setOrgs(await res.json());
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Failed to load organizations');
      }
    } catch {
      setError('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  return { orgs, loading, error, refresh };
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: 'admin' | 'member' | 'viewer';
  joinedAt: string;
  name?: string;
  email: string;
}

export interface OrgWithMembers extends OrgSummary {
  members: OrgMember[];
}

export async function fetchOrgWithMembers(orgId: string): Promise<OrgWithMembers> {
  const res = await apiFetch(`/v1/organizations/${orgId}`);
  if (!res.ok) throw new Error('Failed to load organization');
  return res.json();
}

export async function createOrg(name: string): Promise<OrgSummary> {
  const res = await apiFetch('/v1/organizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create organization' }));
    throw new Error(err.error || 'Failed to create organization');
  }
  return res.json();
}

export async function addOrgMember(orgId: string, userId: string, role: string): Promise<OrgMember> {
  const res = await apiFetch(`/v1/organizations/${orgId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to add member' }));
    throw new Error(err.error || 'Failed to add member');
  }
  return res.json();
}

export async function updateMemberRole(orgId: string, userId: string, role: string): Promise<OrgMember> {
  const res = await apiFetch(`/v1/organizations/${orgId}/members/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update role' }));
    throw new Error(err.error || 'Failed to update role');
  }
  return res.json();
}

export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  const res = await apiFetch(`/v1/organizations/${orgId}/members/${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to remove member' }));
    throw new Error(err.error || 'Failed to remove member');
  }
}
