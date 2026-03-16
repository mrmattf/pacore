-- Migration 013: Operator Platform
-- Adds operator role, operator-customer relationships, credential intake tokens,
-- customer profiles with management mode, and skills assessment reports.

-- Operator flag on users (mirrors existing is_admin pattern)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_operator BOOLEAN NOT NULL DEFAULT false;

-- Operator → Customer org relationship (operators are NOT org members)
CREATE TABLE IF NOT EXISTS operator_customers (
  id           VARCHAR(255) PRIMARY KEY,
  operator_id  VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operator_id, org_id)
);
CREATE INDEX IF NOT EXISTS operator_customers_operator_id_idx ON operator_customers(operator_id);
CREATE INDEX IF NOT EXISTS operator_customers_org_id_idx ON operator_customers(org_id);

-- Customer profile: management mode, onboarding state, operator notes
CREATE TABLE IF NOT EXISTS customer_profiles (
  org_id           VARCHAR(255) PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  management_mode  VARCHAR(20)  NOT NULL DEFAULT 'concierge'
                   CHECK (management_mode IN ('concierge', 'self_managed')),
  onboarded_at     TIMESTAMPTZ,
  notes            TEXT,          -- operator-private notes
  handoff_notes    TEXT,          -- surfaced to customer on self-managed transition
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One-time credential intake tokens (raw token never stored — only SHA-256 hash)
CREATE TABLE IF NOT EXISTS credential_intake_tokens (
  id           VARCHAR(255) PRIMARY KEY,
  token_hash   VARCHAR(255) NOT NULL UNIQUE,
  operator_id  VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opened_at    TIMESTAMPTZ,   -- set on first GET (link clicked); NULL = not yet opened
  used_at      TIMESTAMPTZ,   -- set on successful POST (credentials submitted); NULL = not submitted
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS credential_intake_tokens_token_hash_idx ON credential_intake_tokens(token_hash);
CREATE INDEX IF NOT EXISTS credential_intake_tokens_operator_id_idx ON credential_intake_tokens(operator_id);
CREATE INDEX IF NOT EXISTS credential_intake_tokens_org_id_idx ON credential_intake_tokens(org_id);

-- Skills assessment reports (JSONB blob, ADR-017 compatible schema)
CREATE TABLE IF NOT EXISTS org_assessment_reports (
  id             VARCHAR(255) PRIMARY KEY,
  org_id         VARCHAR(255) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  operator_id    VARCHAR(255) NOT NULL REFERENCES users(id),
  schema_version VARCHAR(20)  NOT NULL DEFAULT '1.0',
  report         JSONB        NOT NULL,
  recommendation VARCHAR(50),   -- 'self_managed' | 'concierge_starter' | 'concierge_standard' | 'concierge_growth'
  reviewed_at    TIMESTAMPTZ,
  shared_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS org_assessment_reports_org_id_idx ON org_assessment_reports(org_id, created_at DESC);
