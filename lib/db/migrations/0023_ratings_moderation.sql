-- Staff ratings moderation (hide / restore) — HQ ratings:moderate
ALTER TABLE staff_ratings ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
--> statement-breakpoint
ALTER TABLE staff_ratings ADD COLUMN IF NOT EXISTS hidden_by text;
--> statement-breakpoint
ALTER TABLE staff_ratings ADD COLUMN IF NOT EXISTS moderation_note text NOT NULL DEFAULT '';
