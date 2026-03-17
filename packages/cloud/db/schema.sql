-- PA Core - Green-field database schema
-- Organizational model: Org-by-Default (every user is in an org from signup)
-- Every resource is scoped to an org.

-- ============================================================
-- IDENTITY
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(255) PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          VARCHAR(255),
  is_operator   BOOLEAN NOT NULL DEFAULT false,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
  id          VARCHAR(255) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) UNIQUE NOT NULL,
  owner_id    VARCHAR(255) NOT NULL REFERENCES users(id),
  plan        VARCHAR(50)  NOT NULL DEFAULT 'free',
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

-- MCP servers scoped to org, or platform-owned (no org)
CREATE TABLE IF NOT EXISTS mcp_servers (
  id                VARCHAR(255) PRIMARY KEY,
  org_id            VARCHAR(255) REFERENCES organizations(id),
  name              VARCHAR(255) NOT NULL,
  server_type       VARCHAR(50)  NOT NULL,  -- 'cloud' | 'edge' | 'platform'
  protocol          VARCHAR(50)  NOT NULL DEFAULT 'http',
  connection_config JSONB        NOT NULL DEFAULT '{}',
  capabilities      JSONB,
  categories        TEXT[]       DEFAULT '{}',
  created_at        TIMESTAMP DEFAULT NOW()
);

-- Encrypted credentials for MCP servers, scoped to org
CREATE TABLE IF NOT EXISTS mcp_credentials (
  id             SERIAL PRIMARY KEY,
  org_id         VARCHAR(255) REFERENCES organizations(id),
  server_id      VARCHAR(255) NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  encrypted_data TEXT        NOT NULL,
  iv             TEXT        NOT NULL,
  auth_tag       TEXT        NOT NULL,
  expires_at     TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE (org_id, server_id)
);

-- ============================================================
-- SKILLS
-- ============================================================

-- Platform-defined skill catalog
CREATE TABLE IF NOT EXISTS skills (
  id                    VARCHAR(255) PRIMARY KEY,
  name                  VARCHAR(255) NOT NULL,
  version               VARCHAR(50)  NOT NULL,
  description           TEXT,
  config_schema         JSONB        NOT NULL DEFAULT '{}',
  required_capabilities TEXT[]       DEFAULT '{}',
  trigger_type          VARCHAR(50),
  tool_chain            VARCHAR(255) NOT NULL,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- A customer's activation of a skill (always org-level)
CREATE TABLE IF NOT EXISTS user_skills (
  id            VARCHAR(255) PRIMARY KEY,
  org_id        VARCHAR(255) NOT NULL REFERENCES organizations(id),
  skill_id      VARCHAR(255) NOT NULL REFERENCES skills(id),
  configuration JSONB        NOT NULL DEFAULT '{}',
  status        VARCHAR(50)  NOT NULL DEFAULT 'pending',
  activated_at  TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Webhook endpoints for triggering skills
CREATE TABLE IF NOT EXISTS skill_triggers (
  id                  VARCHAR(255) PRIMARY KEY,
  user_skill_id       VARCHAR(255) NOT NULL REFERENCES user_skills(id) ON DELETE CASCADE,
  trigger_type        VARCHAR(50)  NOT NULL DEFAULT 'webhook',
  endpoint_token      VARCHAR(255) UNIQUE NOT NULL,
  verification_config JSONB        NOT NULL DEFAULT '{"type":"none"}',
  status              VARCHAR(50)  NOT NULL DEFAULT 'active',
  external_webhook_id TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Execution log
CREATE TABLE IF NOT EXISTS skill_executions (
  id            VARCHAR(255) PRIMARY KEY,
  user_skill_id VARCHAR(255) NOT NULL REFERENCES user_skills(id),
  trigger_id    VARCHAR(255)          REFERENCES skill_triggers(id),
  status        VARCHAR(50)  NOT NULL,
  payload       JSONB,
  result        JSONB,
  error         TEXT,
  sandbox       BOOLEAN NOT NULL DEFAULT false,
  skipped       BOOLEAN NOT NULL DEFAULT false,
  started_at    TIMESTAMP DEFAULT NOW(),
  completed_at  TIMESTAMP
);

-- ============================================================
-- BILLING
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id                        VARCHAR(255) PRIMARY KEY,
  org_id                    VARCHAR(255) REFERENCES organizations(id) ON DELETE CASCADE,
  plan                      VARCHAR(50)  NOT NULL DEFAULT 'free',
  status                    VARCHAR(50)  NOT NULL DEFAULT 'active',
  stripe_customer_id        VARCHAR(255),
  stripe_subscription_id    VARCHAR(255),
  stripe_price_id           VARCHAR(255),
  current_period_start      TIMESTAMP,
  current_period_end        TIMESTAMP,
  cancel_at_period_end      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  CONSTRAINT subscriptions_unique_org UNIQUE (org_id)
);

CREATE TABLE IF NOT EXISTS usage_records (
  id               SERIAL PRIMARY KEY,
  org_id           VARCHAR(255) REFERENCES organizations(id) ON DELETE CASCADE,
  year             SMALLINT NOT NULL,
  month            SMALLINT NOT NULL,
  skill_executions INTEGER  NOT NULL DEFAULT 0,
  updated_at       TIMESTAMP DEFAULT NOW(),
  CONSTRAINT usage_records_unique_org UNIQUE (org_id, year, month)
);

-- ============================================================
-- CONVERSATIONS / MEMORY
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id         VARCHAR(255) PRIMARY KEY,
  user_id    VARCHAR(255) NOT NULL REFERENCES users(id),
  org_id     VARCHAR(255) NOT NULL REFERENCES organizations(id),
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
  role            VARCHAR(50)  NOT NULL,
  content         TEXT         NOT NULL,
  tokens_used     INTEGER,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INTEGRATION CONNECTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS integration_connections (
  id              VARCHAR(255) PRIMARY KEY,
  org_id          VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_key VARCHAR(255) NOT NULL,
  display_name    VARCHAR(255) NOT NULL,
  encrypted_creds TEXT        NOT NULL,
  iv              TEXT        NOT NULL,
  auth_tag        TEXT        NOT NULL,
  status          VARCHAR(50)  NOT NULL DEFAULT 'active',
  last_tested_at  TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_org       ON subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_org       ON usage_records(org_id, year, month);
CREATE INDEX IF NOT EXISTS idx_org_members_org         ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user        ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_org         ON mcp_servers(org_id);
CREATE INDEX IF NOT EXISTS idx_mcp_creds_org_server    ON mcp_credentials(org_id, server_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_org         ON user_skills(org_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill       ON user_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_executions_skill  ON skill_executions(user_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_triggers_token    ON skill_triggers(endpoint_token);
CREATE INDEX IF NOT EXISTS idx_conversations_user      ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org       ON conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation   ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_org ON integration_connections(org_id);
