-- FOM ↔ catalog explicit mapping (Phase 1).
-- Unknown FOM SKU/barcode are quarantined — never invent products or write stock.
CREATE TABLE IF NOT EXISTS fom_product_links (
  id serial PRIMARY KEY,
  key_type text NOT NULL,
  external_key text NOT NULL,
  product_id integer,
  branch_id integer,
  status text NOT NULL DEFAULT 'QUARANTINE',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  meta text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fom_product_links_key_type_check CHECK (
    key_type IN ('SKU', 'BARCODE', 'GTIN', 'FOM_ID')
  ),
  CONSTRAINT fom_product_links_status_check CHECK (
    status IN ('ACTIVE', 'QUARANTINE', 'REJECTED')
  ),
  CONSTRAINT fom_product_links_active_needs_product CHECK (
    status <> 'ACTIVE' OR product_id IS NOT NULL
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS fom_product_links_key_uidx
  ON fom_product_links (key_type, external_key, COALESCE(branch_id, 0));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fom_product_links_product_idx ON fom_product_links (product_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fom_product_links_status_idx ON fom_product_links (status);
