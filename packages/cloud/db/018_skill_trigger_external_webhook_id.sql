-- Add external_webhook_id to skill_triggers so deregistration can call the source platform.
-- Without this column, deregisterAndDeleteTrigger skips the Shopify API call and webhooks
-- accumulate in the store on every pause/resume cycle.
ALTER TABLE skill_triggers
  ADD COLUMN IF NOT EXISTS external_webhook_id TEXT;
