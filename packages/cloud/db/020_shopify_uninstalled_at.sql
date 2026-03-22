-- Track when a Shopify app was uninstalled from a store.
-- Distinguishes merchant-initiated uninstall from operator-initiated deactivation.
-- Used by the app/uninstalled webhook handler.
ALTER TABLE integration_connections
  ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ;
