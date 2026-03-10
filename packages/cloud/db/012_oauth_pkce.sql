-- Migration 012: Support Authorization Code + PKCE flow (RFC 7636).
-- oauth_access_tokens.client_id was NOT NULL with FK to mcp_clients.
-- For auth-code flow tokens issued directly to users via dynamic client
-- registration, there may be no pre-registered mcp_clients row.
-- Drop the FK and make nullable so both grant types can share the table.

ALTER TABLE oauth_access_tokens
  DROP CONSTRAINT IF EXISTS oauth_access_tokens_client_id_fkey;

ALTER TABLE oauth_access_tokens
  ALTER COLUMN client_id DROP NOT NULL;
