-- Migration 004: Add external_webhook_id to skill_triggers
-- Stores the GID of the webhook registered with the source platform (e.g. Shopify GID).
-- NULL means the webhook was registered manually by the customer.
-- Required before deploying code that auto-registers Shopify webhooks.

ALTER TABLE skill_triggers
  ADD COLUMN IF NOT EXISTS external_webhook_id TEXT;
