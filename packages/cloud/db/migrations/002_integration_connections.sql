-- Migration 002: Integration Connections + Skill Template Requests
-- Adds account-level named credential sets for the SkillTemplate slot architecture.
-- Credentials are stored in mcp_credentials keyed by the connection UUID.
-- Also removes the FK on mcp_credentials.server_id to allow connection UUIDs as keys.

-- ============================================================
-- Drop FK constraint on mcp_credentials.server_id
-- This allows CredentialManager to key credentials by any string
-- (MCP server id OR integration connection UUID) without requiring
-- a corresponding row in mcp_servers.
-- ============================================================

ALTER TABLE mcp_credentials
  DROP CONSTRAINT IF EXISTS mcp_credentials_server_id_fkey;

-- ============================================================
-- INTEGRATION CONNECTIONS
-- One row per named connection (e.g. "Acme Store" for shopify).
-- Credentials are NOT stored here — they live in mcp_credentials
-- keyed by this row's id (UUID).
-- Scoped to user or org (same pattern as user_skills).
-- ============================================================

CREATE TABLE IF NOT EXISTS integration_connections (
  id              VARCHAR(255) PRIMARY KEY,
  user_id         VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
  org_id          VARCHAR(255) REFERENCES organizations(id) ON DELETE CASCADE,
  integration_key VARCHAR(100) NOT NULL,   -- 'shopify' | 'gorgias' | 'zendesk' | 'freshdesk'
  display_name    VARCHAR(255) NOT NULL,   -- user-chosen: 'Acme Store', 'Main Zendesk'
  status          VARCHAR(50)  NOT NULL DEFAULT 'active',  -- 'active' | 'expired' | 'error'
  last_tested_at  TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  CONSTRAINT integration_connections_scope CHECK (
    (user_id IS NOT NULL AND org_id IS NULL) OR
    (user_id IS NULL     AND org_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_user
  ON integration_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_integration_connections_org
  ON integration_connections(org_id);

CREATE INDEX IF NOT EXISTS idx_integration_connections_user_key
  ON integration_connections(user_id, integration_key);

-- ============================================================
-- SKILL TEMPLATE REQUESTS
-- Tracks community requests for integration combos not yet built
-- (e.g., "WooCommerce → Zendesk"). Used for the "coming soon"
-- cards on TemplatePickerPage with upvote functionality.
-- ============================================================

CREATE TABLE IF NOT EXISTS skill_template_requests (
  id                VARCHAR(255) PRIMARY KEY,
  skill_type_id     VARCHAR(255) NOT NULL,   -- 'backorder-notification'
  integration_combo VARCHAR(500) NOT NULL,   -- 'woocommerce_zendesk'
  description       TEXT,
  vote_count        INTEGER      NOT NULL DEFAULT 1,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW(),
  UNIQUE (skill_type_id, integration_combo)
);

-- Track which users have voted to prevent duplicate votes
CREATE TABLE IF NOT EXISTS skill_template_request_votes (
  request_id VARCHAR(255) NOT NULL REFERENCES skill_template_requests(id) ON DELETE CASCADE,
  user_id    VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voted_at   TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_template_requests_type
  ON skill_template_requests(skill_type_id);
