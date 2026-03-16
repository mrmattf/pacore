import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';

export interface SkillDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  configSchema: Record<string, unknown>;
  requiredCapabilities: string[];
  triggerType: 'webhook' | 'scheduled' | 'manual';
  toolChain: string;
}

export interface UserSkill {
  id: string;
  orgId: string;
  skillId: string;
  configuration: Record<string, unknown>;
  status: 'pending' | 'active' | 'paused';
  activatedAt: string | null;
  createdAt: string;
}

export interface SkillTrigger {
  id: string;
  userSkillId: string;
  triggerType: string;
  endpointToken: string;
  verificationConfig: { type: string; [key: string]: unknown };
  status: 'active' | 'disabled';
  createdAt: string;
}

export interface SkillExecution {
  id: string;
  userSkillId: string;
  triggerId: string | null;
  status: 'running' | 'completed' | 'failed';
  payload: unknown;
  result: unknown;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function apiFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { ...authHeaders(token), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

/** Hook to work with the skills catalog + org skill activations. */
export function useSkills(orgId: string) {
  const [catalog, setCatalog] = useState<SkillDefinition[]>([]);
  const [mySkills, setMySkills] = useState<UserSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const token = useAuthStore((s) => s.token);

  const base = `/v1/organizations/${orgId}/skills`;

  const refresh = useCallback(async () => {
    if (!token || !orgId) return;
    setLoading(true);
    try {
      const [cat, mine] = await Promise.all([
        apiFetch('/v1/skills', token),
        apiFetch(base, token),
      ]);
      setCatalog(cat);
      setMySkills(mine);
    } catch (e) {
      console.error('Failed to load skills:', e);
    } finally {
      setLoading(false);
    }
  }, [token, orgId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activateSkill = async (skillId: string): Promise<UserSkill> => {
    if (!token) throw new Error('Not authenticated');
    const result = await apiFetch(`${base}/${skillId}/activate`, token, { method: 'POST' });
    await refresh();
    return result;
  };

  const configureSkill = async (
    userSkillId: string,
    configuration: Record<string, unknown>
  ): Promise<UserSkill> => {
    if (!token) throw new Error('Not authenticated');
    const result = await apiFetch(`${base}/${userSkillId}/configure`, token, {
      method: 'PUT',
      body: JSON.stringify(configuration),
    });
    await refresh();
    return result;
  };

  const deleteSkill = async (userSkillId: string): Promise<void> => {
    if (!token) throw new Error('Not authenticated');
    await apiFetch(`${base}/${userSkillId}`, token, { method: 'DELETE' });
    await refresh();
  };

  const createTrigger = async (userSkillId: string): Promise<SkillTrigger> => {
    if (!token) throw new Error('Not authenticated');
    return apiFetch(`${base}/${userSkillId}/triggers`, token, { method: 'POST', body: '{}' });
  };

  const getTriggers = async (userSkillId: string): Promise<SkillTrigger[]> => {
    if (!token) throw new Error('Not authenticated');
    return apiFetch(`${base}/${userSkillId}/triggers`, token);
  };

  const getExecutions = async (userSkillId: string): Promise<SkillExecution[]> => {
    if (!token) throw new Error('Not authenticated');
    return apiFetch(`${base}/${userSkillId}/executions`, token);
  };

  return {
    catalog,
    mySkills,
    loading,
    refresh,
    activateSkill,
    configureSkill,
    deleteSkill,
    createTrigger,
    getTriggers,
    getExecutions,
  };
}
