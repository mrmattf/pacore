-- 015_fix_mcp_creds_constraint.sql
-- Ensure mcp_credentials has a unique constraint on (org_id, server_id)
-- so that ON CONFLICT (org_id, server_id) in credential-manager works correctly.
--
-- Also resets any intake tokens that were burned by the pre-fix credential error
-- (token was consumed but credential storage failed, leaving used_at set with no creds stored).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'mcp_credentials'
      AND indexdef LIKE '%org_id%server_id%'
  ) THEN
    ALTER TABLE mcp_credentials
      ADD CONSTRAINT mcp_credentials_org_server_key UNIQUE (org_id, server_id);
  END IF;
END;
$$;

-- Reset tokens whose orgs have no credentials stored (burned by the now-fixed constraint bug)
UPDATE credential_intake_tokens
SET used_at = NULL
WHERE used_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM mcp_credentials mc WHERE mc.org_id = credential_intake_tokens.org_id
  );
