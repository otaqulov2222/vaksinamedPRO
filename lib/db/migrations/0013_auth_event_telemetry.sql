-- Phase 13.18: request telemetry for auth events (additive, non-destructive).
-- Both columns are nullable: existing rows stay NULL ("not stored"); background/system events never get a value.
ALTER TABLE auth_events ADD COLUMN IF NOT EXISTS ip_address text;
--> statement-breakpoint
ALTER TABLE auth_events ADD COLUMN IF NOT EXISTS user_agent text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_events_ip_address_len') THEN
    ALTER TABLE auth_events ADD CONSTRAINT auth_events_ip_address_len CHECK (ip_address IS NULL OR char_length(ip_address) <= 45);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_events_user_agent_len') THEN
    ALTER TABLE auth_events ADD CONSTRAINT auth_events_user_agent_len CHECK (user_agent IS NULL OR char_length(user_agent) <= 512);
  END IF;
END $$;
