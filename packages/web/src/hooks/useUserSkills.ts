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

export function useUserSkills() {
  const [userSkills, setUserSkills] = useState<UserSkill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/me/skills')
      .then(r => r.json())
      .then(setUserSkills)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { userSkills, loading };
}
