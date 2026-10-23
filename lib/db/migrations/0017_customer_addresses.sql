-- Phase 17: Customer Saved Addresses (additive, non-destructive).
CREATE TABLE IF NOT EXISTS customer_addresses (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'home',
  title text NOT NULL DEFAULT '',
  formatted_address text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  district text,
  street text,
  house text,
  apartment text,
  entrance text,
  floor text,
  landmark text,
  courier_note text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_addresses_label_check CHECK (
    label IN ('home', 'work', 'other')
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_addresses_customer_idx ON customer_addresses (customer_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_addresses_default_idx ON customer_addresses (customer_id, is_default);
