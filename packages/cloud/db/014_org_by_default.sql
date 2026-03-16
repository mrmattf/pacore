-- 014_org_by_default.sql
-- Eliminates personal (user_id) scope from all data tables.
-- All data is wiped (clean-slate migration — single dev environment).
-- After this runs, re-invite users via /v1/admin/invite — each gets an auto-created org.

-- Wipe all user data
TRUNCATE conversations, usage_records, subscriptions, skill_executions,
         skill_triggers, user_skills, integration_connections,
         mcp_credentials, mcp_servers, users, organizations, org_members CASCADE;

-- Drop XOR check constraints
ALTER TABLE user_skills             DROP CONSTRAINT IF EXISTS user_skills_scope;
ALTER TABLE mcp_servers             DROP CONSTRAINT IF EXISTS mcp_servers_scope;
ALTER TABLE subscriptions           DROP CONSTRAINT IF EXISTS subscriptions_scope;
ALTER TABLE subscriptions           DROP CONSTRAINT IF EXISTS subscriptions_unique_user;
ALTER TABLE usage_records           DROP CONSTRAINT IF EXISTS usage_records_scope;
ALTER TABLE usage_records           DROP CONSTRAINT IF EXISTS usage_records_unique_user;
ALTER TABLE integration_connections DROP CONSTRAINT IF EXISTS integration_connections_scope;
ALTER TABLE mcp_credentials         DROP CONSTRAINT IF EXISTS mcp_credentials_user_id_server_id_key;

-- Drop user_id columns from all dual-scope tables
ALTER TABLE user_skills             DROP COLUMN IF EXISTS user_id;
ALTER TABLE mcp_servers             DROP COLUMN IF EXISTS user_id;
ALTER TABLE mcp_credentials         DROP COLUMN IF EXISTS user_id;
ALTER TABLE subscriptions           DROP COLUMN IF EXISTS user_id;
ALTER TABLE usage_records           DROP COLUMN IF EXISTS user_id;
ALTER TABLE integration_connections DROP COLUMN IF EXISTS user_id;

-- Set org_id NOT NULL now that it's the only scope
ALTER TABLE user_skills             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE integration_connections ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE subscriptions           ALTER COLUMN org_id SET NOT NULL;

-- conversations: add org_id NOT NULL (user_id stays — it's the author of each message)
-- Table is empty from TRUNCATE above so NOT NULL is safe immediately
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS org_id VARCHAR(255) REFERENCES organizations(id) NOT NULL;

-- Drop now-unused indexes
DROP INDEX IF EXISTS idx_user_skills_user;
DROP INDEX IF EXISTS idx_subscriptions_user;
DROP INDEX IF EXISTS idx_usage_records_user;
DROP INDEX IF EXISTS idx_mcp_servers_user;
DROP INDEX IF EXISTS idx_mcp_creds_user_server;
