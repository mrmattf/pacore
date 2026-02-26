-- PA Core - Green-field database schema
-- Organizational model: Personal + Org (Model 4)
-- Every resource is scoped to either a user (personal) OR an org (shared), never both.

-- ============================================================
-- IDENTITY
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(255) PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          VARCHAR(255),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
  id          VARCHAR(255) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) UNIQUE NOT NULL,
  owner_id    VARCHAR(255) NOT NULL REFERENCES users(id),
  plan        VARCHAR(50)  NOT NULL DEFAULT 'free',  -- 'free' | 'pro' | 'enterprise'
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_members (
  id        SERIAL PRIMARY KEY,
  org_id    VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   VARCHAR(255) NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role      VARCHAR(50)  NOT NULL DEFAULT 'member',  -- 'admin' | 'member' | 'viewer'
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS org_teams (
  id         VARCHAR(255) PRIMARY KEY,
  org_id     VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_team_members (
  team_id VARCHAR(255) NOT NULL REFERENCES org_teams(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

-- ============================================================
-- MCP / INTEGRATIONS
-- ============================================================

-- MCP servers scoped to user (personal) OR org (shared), or platform-owned (no user/org)
CREATE TABLE IF NOT EXISTS mcp_servers (
  id                VARCHAR(255) PRIMARY KEY,
  user_id           VARCHAR(255) REFERENCES users(id),
  org_id            VARCHAR(255) REFERENCES organizations(id),
  name              VARCHAR(255) NOT NULL,
  server_type       VARCHAR(50)  NOT NULL,  -- 'cloud' | 'edge' | 'platform'
  protocol          VARCHAR(50)  NOT NULL DEFAULT 'http',  -- 'http' | 'websocket' | 'stdio'
  connection_config JSONB        NOT NULL DEFAULT '{}',
  capabilities      JSONB,
  categories        TEXT[]       DEFAULT '{}',
  created_at        TIMESTAMP DEFAULT NOW(),
  CONSTRAINT mcp_servers_scope CHECK (
    (server_type = 'platform') OR
    (user_id IS NOT NULL AND org_id IS NULL) OR
    (user_id IS NULL     AND org_id IS NOT NULL)
  )
);

-- Encrypted credentials for MCP servers, scoped to user or org
CREATE TABLE IF NOT EXISTS mcp_credentials (
  id             SERIAL PRIMARY KEY,
  user_id        VARCHAR(255) REFERENCES users(id),
  org_id         VARCHAR(255) REFERENCES organizations(id),
  server_id      VARCHAR(255) NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  encrypted_data TEXT        NOT NULL,
  iv             TEXT        NOT NULL,
  auth_tag       TEXT        NOT NULL,
  expires_at     TIMESTAMP,              -- for OAuth tokens that expire
  updated_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, server_id),
  UNIQUE (org_id,  server_id)
);

-- ============================================================
-- SKILLS
-- ============================================================

-- Platform-defined skill catalog (written by us, activated by customers)
CREATE TABLE IF NOT EXISTS skills (
  id                    VARCHAR(255) PRIMARY KEY,
  name                  VARCHAR(255) NOT NULL,
  version               VARCHAR(50)  NOT NULL,
  description           TEXT,
  config_schema         JSONB        NOT NULL DEFAULT '{}',
  required_capabilities TEXT[]       DEFAULT '{}',
  trigger_type          VARCHAR(50),     -- 'webhook' | 'scheduled' | 'manual'
  tool_chain            VARCHAR(255) NOT NULL,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- A customer's activation of a skill (personal or org-level)
CREATE TABLE IF NOT EXISTS user_skills (
  id            VARCHAR(255) PRIMARY KEY,
  user_id       VARCHAR(255) REFERENCES users(id),
  org_id        VARCHAR(255) REFERENCES organizations(id),
  skill_id      VARCHAR(255) NOT NULL REFERENCES skills(id),
  configuration JSONB        NOT NULL DEFAULT '{}',
  status        VARCHAR(50)  NOT NULL DEFAULT 'pending',  -- 'pending' | 'active' | 'paused'
  activated_at  TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  CONSTRAINT user_skills_scope CHECK (
    (user_id IS NOT NULL AND org_id IS NULL) OR
    (user_id IS NULL     AND org_id IS NOT NULL)
  )
);

-- Webhook endpoints for triggering skills from external systems
CREATE TABLE IF NOT EXISTS skill_triggers (
  id                  VARCHAR(255) PRIMARY KEY,
  user_skill_id       VARCHAR(255) NOT NULL REFERENCES user_skills(id) ON DELETE CASCADE,
  trigger_type        VARCHAR(50)  NOT NULL DEFAULT 'webhook',
  endpoint_token      VARCHAR(255) UNIQUE NOT NULL,
  -- Pluggable verification: not all external systems use HMAC.
  -- The token itself (32-byte random) is baseline security.
  -- verification_config examples:
  --   { "type": "none" }
  --   { "type": "hmac_sha256", "header": "X-Shopify-Hmac-SHA256", "secret": "..." }
  --   { "type": "hmac_sha256_v0", "header": "X-Slack-Signature", "secret": "..." }
  --   { "type": "google_oidc", "audience": "https://..." }
  verification_config JSONB        NOT NULL DEFAULT '{"type":"none"}',
  status              VARCHAR(50)  NOT NULL DEFAULT 'active',
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Execution log for every skill run
CREATE TABLE IF NOT EXISTS skill_executions (
  id            VARCHAR(255) PRIMARY KEY,
  user_skill_id VARCHAR(255) NOT NULL REFERENCES user_skills(id),
  trigger_id    VARCHAR(255)          REFERENCES skill_triggers(id),
  status        VARCHAR(50)  NOT NULL,  -- 'running' | 'completed' | 'failed'
  payload       JSONB,
  result        JSONB,
  error         TEXT,
  started_at    TIMESTAMP DEFAULT NOW(),
  completed_at  TIMESTAMP
);

-- ============================================================
-- BILLING
-- ============================================================

-- One subscription row per user or org (source of truth for plan tier)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                        VARCHAR(255) PRIMARY KEY,
  user_id                   VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  org_id                    VARCHAR(255) REFERENCES organizations(id) ON DELETE CASCADE,
  plan                      VARCHAR(50)  NOT NULL DEFAULT 'free',
  status                    VARCHAR(50)  NOT NULL DEFAULT 'active',
    -- 'active' | 'past_due' | 'cancelled' | 'trialing'
  -- Stripe columns — NULL until payment processor is wired in a follow-on sprint
  stripe_customer_id        VARCHAR(255),
  stripe_subscription_id    VARCHAR(255),
  stripe_price_id           VARCHAR(255),
  current_period_start      TIMESTAMP,
  current_period_end        TIMESTAMP,
  cancel_at_period_end      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  CONSTRAINT subscriptions_scope CHECK (
    (user_id IS NOT NULL AND org_id IS NULL) OR
    (user_id IS NULL AND org_id IS NOT NULL)
  ),
  CONSTRAINT subscriptions_unique_user UNIQUE (user_id),
  CONSTRAINT subscriptions_unique_org  UNIQUE (org_id)
);

-- Monthly usage rollup — one row per (scope, year, month) for fast limit checks
CREATE TABLE IF NOT EXISTS usage_records (
  id               SERIAL PRIMARY KEY,
  user_id          VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  org_id           VARCHAR(255) REFERENCES organizations(id) ON DELETE CASCADE,
  year             SMALLINT NOT NULL,
  month            SMALLINT NOT NULL,
  skill_executions INTEGER  NOT NULL DEFAULT 0,
  updated_at       TIMESTAMP DEFAULT NOW(),
  CONSTRAINT usage_records_scope CHECK (
    (user_id IS NOT NULL AND org_id IS NULL) OR
    (user_id IS NULL AND org_id IS NOT NULL)
  ),
  CONSTRAINT usage_records_unique_user UNIQUE (user_id, year, month),
  CONSTRAINT usage_records_unique_org  UNIQUE (org_id,  year, month)
);

-- ============================================================
-- CONVERSATIONS / MEMORY
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id         VARCHAR(255) PRIMARY KEY,
  user_id    VARCHAR(255) NOT NULL REFERENCES users(id),
  org_id     VARCHAR(255) REFERENCES organizations(id),
  title      VARCHAR(500),
  model      VARCHAR(255),
  tags       TEXT[]    DEFAULT '{}',
  category   VARCHAR(255),
  metadata   JSONB     DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id              VARCHAR(255) PRIMARY KEY,
  conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            VARCHAR(50)  NOT NULL,  -- 'user' | 'assistant' | 'system'
  content         TEXT         NOT NULL,
  tokens_used     INTEGER,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_user      ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org       ON subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_user      ON usage_records(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_usage_records_org       ON usage_records(org_id,  year, month);
CREATE INDEX IF NOT EXISTS idx_org_members_org         ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user        ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_user        ON mcp_servers(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_org         ON mcp_servers(org_id);
CREATE INDEX IF NOT EXISTS idx_mcp_creds_user_server   ON mcp_credentials(user_id, server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_creds_org_server    ON mcp_credentials(org_id, server_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_user        ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_org         ON user_skills(org_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill       ON user_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_skill  ON skill_executions(user_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_triggers_token    ON skill_triggers(endpoint_token);
CREATE INDEX IF NOT EXISTS idx_conversations_user      ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation   ON messages(conversation_id);
