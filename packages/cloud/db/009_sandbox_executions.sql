-- Add sandbox flag to skill_executions.
-- Sandbox executions run in dry-run mode (no real downstream API calls).
-- They don't count toward the user's monthly execution quota.
ALTER TABLE skill_executions ADD COLUMN IF NOT EXISTS sandbox BOOLEAN NOT NULL DEFAULT false;
