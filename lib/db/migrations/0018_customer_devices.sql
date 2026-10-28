-- Phase 18: Customer Device Push Tokens (additive, non-destructive).
CREATE TABLE IF NOT EXISTS customer_devices (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web',
  endpoint text,
  auth_key text,
  p256dh_key text,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_devices_platform_check CHECK (
    platform IN ('web', 'android', 'ios')
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_devices_customer_idx ON customer_devices (customer_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_devices_token_idx ON customer_devices (token);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_devices_active_idx ON customer_devices (customer_id, is_active);
