-- Migration 007: Per-user MCP client credentials and OAuth access tokens.
-- Enables per-user client_id + client_secret pairs for Claude Desktop and other
-- external MCP clients using the OAuth 2.0 Client Credentials grant.

CREATE TABLE IF NOT EXISTS mcp_clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id        UUID REFERENCES organizations(id) ON DELETE SET NULL,
  name          TEXT NOT NULL DEFAULT 'Claude Desktop',
  client_id     TEXT NOT NULL UNIQUE,     -- "mcp_" + 8 random bytes hex
  secret_hash   TEXT NOT NULL,            -- SHA-256 of the client_secret (never stored plaintext)
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  token_hash  TEXT PRIMARY KEY,           -- SHA-256 of the opaque 32-byte token
  client_id   TEXT NOT NULL REFERENCES mcp_clients(client_id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,       -- 1 hour from issuance
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mcp_clients_user_id_idx        ON mcp_clients(user_id);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_expires_idx ON oauth_access_tokens(expires_at);
