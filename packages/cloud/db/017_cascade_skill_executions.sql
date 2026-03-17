-- Skill executions are owned by the user_skill — cascade delete when a skill is removed.
-- Replaces the existing restrictive FK that blocks deletion when execution history exists.

ALTER TABLE skill_executions
  DROP CONSTRAINT IF EXISTS skill_executions_user_skill_id_fkey;

ALTER TABLE skill_executions
  ADD CONSTRAINT skill_executions_user_skill_id_fkey
  FOREIGN KEY (user_skill_id) REFERENCES user_skills(id) ON DELETE CASCADE;
