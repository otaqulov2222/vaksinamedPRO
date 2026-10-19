-- Phase 16: Family Health Profile & Caregiver Alerts (additive, non-destructive).
CREATE TABLE IF NOT EXISTS family_members (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  relationship text NOT NULL DEFAULT 'other',
  birth_date text,
  phone text,
  chronic_conditions text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  notify_caregiver boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_members_relationship_check CHECK (
    relationship IN ('father', 'mother', 'child', 'spouse', 'other')
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS family_members_customer_idx ON family_members (customer_id);
--> statement-breakpoint
ALTER TABLE medication_reminders ADD COLUMN IF NOT EXISTS family_member_id integer REFERENCES family_members(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS medication_reminders_family_member_idx ON medication_reminders (family_member_id);
