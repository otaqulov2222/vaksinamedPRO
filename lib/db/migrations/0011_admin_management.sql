-- Phase 13.16: admin account lifecycle (additive, non-destructive).
-- Existing admins stay active; updated_at starts from created_at. No row is deleted.

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
UPDATE admin_users SET updated_at = created_at;
--> statement-breakpoint
ALTER TABLE admin_users ADD CONSTRAINT admin_users_status_check CHECK (status IN ('active', 'disabled'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admin_users_role_status_idx ON admin_users (role, status);
