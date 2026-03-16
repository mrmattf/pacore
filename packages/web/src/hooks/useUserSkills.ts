import { useState, useEffect } from 'react';
import { apiFetch } from '../services/auth';

export interface UserSkill {
  id: string;
  skillId: string;
  status: 'pending' | 'active' | 'paused';
  configuration: Record<string, unknown>;
  activatedAt: string | null;
  createdAt: string;
}

export function useUserSkills(orgId: string) {
  const [userSkills, setUserSkills] = useState<UserSkill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    apiFetch(`/v1/organizations/${orgId}/skills`)
      .then(r => r.json())
      .then(setUserSkills)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  return { userSkills, loading };
}
