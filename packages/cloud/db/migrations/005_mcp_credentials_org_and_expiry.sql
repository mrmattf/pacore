-- Migration 005: Add org_id and expires_at to mcp_credentials
-- Brings the live table in line with the current schema.sql definition.

ALTER TABLE mcp_credentials
  ADD COLUMN IF NOT EXISTS org_id     VARCHAR(255) REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
