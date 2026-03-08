-- Add skipped column to skill_executions.
-- NULL = still running, TRUE = chain completed with no action, FALSE = action was taken (billable).
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS skipped BOOLEAN;
