-- Add idempotency_key to skill_executions for deduplication.
-- Key is SHA-256 of the webhook payload, scoped to (user_skill_id, idempotency_key).
-- Partial index excludes failed rows so a failed execution can be re-run if the webhook fires again.
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS skill_executions_dedup_idx
  ON skill_executions (user_skill_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status != 'failed';
