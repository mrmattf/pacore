-- Migration 006: Auth refresh tokens for rotating session management
-- Enables short-lived (1hr) access tokens with 30-day sliding / 1-year absolute refresh tokens.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash      TEXT PRIMARY KEY,         -- SHA-256 of the opaque 48-byte token
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,     -- absolute ceiling: 1 year from creation
  idle_expires_at TIMESTAMPTZ NOT NULL,     -- sliding window: 30 days from last use
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx  ON refresh_tokens(expires_at);
