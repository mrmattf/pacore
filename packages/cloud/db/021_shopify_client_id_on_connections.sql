-- Track which Shopify app client ID is associated with each connection.
-- NULL = Clarissi platform unlisted app (credentials from env vars).
-- Non-NULL = operator-supplied custom/unlisted app (credentials stored per-connection).
-- Used by lifecycle webhooks (app/uninstalled, shop/redact) to scope HMAC secret lookup.
ALTER TABLE integration_connections
  ADD COLUMN IF NOT EXISTS shopify_client_id TEXT;
