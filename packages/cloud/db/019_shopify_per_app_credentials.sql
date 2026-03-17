-- Add optional per-store Shopify app credentials to credential_intake_tokens.
-- Operators may provide a custom app's clientId + clientSecret when generating
-- an intake link. These are used during the OAuth flow so one service can handle
-- multiple custom Shopify apps (one per merchant store). NULL = use platform
-- env vars (SHOPIFY_APP_CLIENT_ID / SHOPIFY_APP_CLIENT_SECRET) as fallback.
ALTER TABLE credential_intake_tokens
  ADD COLUMN IF NOT EXISTS shopify_client_id     TEXT,
  ADD COLUMN IF NOT EXISTS shopify_client_secret TEXT;
