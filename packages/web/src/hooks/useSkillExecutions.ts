import { useState, useEffect } from 'react';
import { apiFetch } from '../services/auth';

export interface ExecutionStep {
  name: string;
  status: 'ok' | 'skipped' | 'sandbox' | 'error';
  summary: string;
  detail?: unknown;
  duration_ms?: number;
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
  skillTypeId: string | null;
  sandbox: boolean;
  /** null while running; true = no action taken (free); false = action taken (billable) */
  skipped: boolean | null;
}

export function useSkillExecutions(limit = 20) {
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/v1/me/skill-executions?limit=${limit}`);
      const data = await res.json();
      setExecutions(data);
    } catch {
      setError('Failed to load execution history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  return { executions, loading, error, refresh: load };
}
