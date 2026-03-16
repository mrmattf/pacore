-- 016_mcp_creds_unique_constraint.sql
-- Migration 015's check incorrectly matched the non-unique idx_mcp_creds_org_server index
-- and skipped adding the UNIQUE constraint. This migration drops all candidates and creates
-- a definitively named unique constraint so ON CONFLICT (org_id, server_id) works correctly.

ALTER TABLE mcp_credentials DROP CONSTRAINT IF EXISTS mcp_credentials_org_id_server_id_key;
ALTER TABLE mcp_credentials DROP CONSTRAINT IF EXISTS mcp_credentials_org_server_key;
ALTER TABLE mcp_credentials DROP CONSTRAINT IF EXISTS mcp_credentials_org_server_uniq;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'mcp_credentials'::regclass
      AND contype = 'u'
      AND conname = 'mcp_credentials_org_server_uniq'
  ) THEN
    ALTER TABLE mcp_credentials
      ADD CONSTRAINT mcp_credentials_org_server_uniq UNIQUE (org_id, server_id);
  END IF;
END;
$$;
