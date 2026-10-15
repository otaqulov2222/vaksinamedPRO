-- Phase 14: Soliq OFD virtual kassa fiscal cheques and product MXIK classification (additive, non-destructive).
ALTER TABLE products ADD COLUMN IF NOT EXISTS mxik_code text NOT NULL DEFAULT '02106001001000000';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN IF NOT EXISTS package_code text NOT NULL DEFAULT '796';
--> statement-breakpoint
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_percent integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS fiscal_cheques (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id integer,
  receipt_number text NOT NULL UNIQUE,
  fiscal_sign text NOT NULL,
  terminal_id text NOT NULL DEFAULT 'VK_VAKSINAMED_01',
  qr_url text NOT NULL,
  status text NOT NULL DEFAULT 'REGISTERED',
  provider text NOT NULL DEFAULT 'soliq_ofd',
  total_amount integer NOT NULL,
  vat_amount integer NOT NULL DEFAULT 0,
  discount_amount integer NOT NULL DEFAULT 0,
  items_payload text NOT NULL DEFAULT '[]',
  raw_response text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_cheques_status_check CHECK (
    status IN ('REGISTERED', 'REFUNDED', 'FAILED')
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fiscal_cheques_order_idx ON fiscal_cheques (order_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fiscal_cheques_receipt_idx ON fiscal_cheques (receipt_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fiscal_cheques_created_idx ON fiscal_cheques (created_at DESC);
