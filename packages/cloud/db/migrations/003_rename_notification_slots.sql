-- Migration 003: Rename per-integration slot keys to abstract 'notification' slot key
-- Run BEFORE deploying new code that expects slotConnections.notification
--
-- Changes user_skills.configuration->slotConnections:
--   { "gorgias": "<id>" }   → { "notification": "<id>" }
--   { "zendesk": "<id>" }   → { "notification": "<id>" }
--   { "freshdesk": "<id>" } → { "notification": "<id>" }
--
-- Skills that already have a 'notification' key are left unchanged.
-- The shopify slot key is unchanged (it was never renamed).

BEGIN;

-- Gorgias → notification
UPDATE user_skills
SET configuration = jsonb_set(
  configuration,
  '{slotConnections}',
  (configuration->'slotConnections')
    - 'gorgias'
    || jsonb_build_object('notification', configuration->'slotConnections'->'gorgias')
)
WHERE (configuration->'slotConnections') ? 'gorgias'
  AND NOT (configuration->'slotConnections') ? 'notification';

-- Zendesk → notification
UPDATE user_skills
SET configuration = jsonb_set(
  configuration,
  '{slotConnections}',
  (configuration->'slotConnections')
    - 'zendesk'
    || jsonb_build_object('notification', configuration->'slotConnections'->'zendesk')
)
WHERE (configuration->'slotConnections') ? 'zendesk'
  AND NOT (configuration->'slotConnections') ? 'notification';

-- Freshdesk → notification
UPDATE user_skills
SET configuration = jsonb_set(
  configuration,
  '{slotConnections}',
  (configuration->'slotConnections')
    - 'freshdesk'
    || jsonb_build_object('notification', configuration->'slotConnections'->'freshdesk')
)
WHERE (configuration->'slotConnections') ? 'freshdesk'
  AND NOT (configuration->'slotConnections') ? 'notification';

COMMIT;
