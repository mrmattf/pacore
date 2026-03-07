-- Migration 008: Invite-only user management
-- Adds must_change_password flag for temp-password invites
-- and is_admin flag for future admin role support.

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
