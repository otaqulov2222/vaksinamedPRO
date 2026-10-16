-- Phase 15: Medication schedule reminders, adherence logs and auto-refill engine (additive, non-destructive).
CREATE TABLE IF NOT EXISTS medication_reminders (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  medicine_name text NOT NULL,
  product_id integer REFERENCES products(id) ON DELETE SET NULL,
  dosage text NOT NULL DEFAULT '1 tabletka',
  meal_relation text NOT NULL DEFAULT 'after_meal',
  intake_times text NOT NULL DEFAULT '["08:00"]',
  start_date text NOT NULL,
  end_date text,
  duration_days integer,
  current_stock integer NOT NULL DEFAULT 30,
  package_size integer NOT NULL DEFAULT 30,
  low_stock_threshold integer NOT NULL DEFAULT 5,
  refill_reminder_enabled boolean NOT NULL DEFAULT true,
  member_tag text NOT NULL DEFAULT 'myself',
  custom_member_name text,
  instructions text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medication_reminders_meal_relation_check CHECK (
    meal_relation IN ('before_meal', 'with_meal', 'after_meal', 'independent')
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS medication_reminders_customer_idx ON medication_reminders (customer_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS medication_reminders_active_idx ON medication_reminders (customer_id, is_active);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS medication_logs (
  id serial PRIMARY KEY,
  reminder_id integer NOT NULL REFERENCES medication_reminders(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  scheduled_date text NOT NULL,
  scheduled_time text NOT NULL,
  status text NOT NULL,
  action_time timestamptz NOT NULL DEFAULT now(),
  notes text,
  CONSTRAINT medication_logs_status_check CHECK (
    status IN ('taken', 'skipped', 'snoozed')
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS medication_logs_reminder_idx ON medication_logs (reminder_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS medication_logs_customer_date_idx ON medication_logs (customer_id, scheduled_date);
