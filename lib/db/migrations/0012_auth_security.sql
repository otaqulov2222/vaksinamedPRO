-- Phase 13.17: case-insensitive admin email uniqueness + auth_events lookup index (additive, non-destructive).
-- Refuses to apply (no data cleanup) while emails that differ only by case exist; resolve them manually first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM admin_users GROUP BY lower(email) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'admin_users has emails that differ only by case; resolve them manually before applying 0012_auth_security';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_lower_unique ON admin_users (lower(email));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_events_actor_created_idx ON auth_events (actor_type, actor_id, created_at DESC);
