-- P4.1: inventory database foundation (additive, non-destructive)
-- Does NOT add UNIQUE(branch_id, product_id) — that is P4.2
-- Does NOT change checkout/POS/FOM writers — that is P4.5+

-- ---------------------------------------------------------------------------
-- product_stocks: physical / reserved / derived available
-- ---------------------------------------------------------------------------
ALTER TABLE product_stocks ADD COLUMN IF NOT EXISTS physical_quantity integer;
--> statement-breakpoint
ALTER TABLE product_stocks ADD COLUMN IF NOT EXISTS reserved_quantity integer;
--> statement-breakpoint
UPDATE product_stocks
SET physical_quantity = quantity
WHERE physical_quantity IS NULL;
--> statement-breakpoint
UPDATE product_stocks
SET reserved_quantity = 0
WHERE reserved_quantity IS NULL;
--> statement-breakpoint
ALTER TABLE product_stocks ALTER COLUMN physical_quantity SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE product_stocks ALTER COLUMN reserved_quantity SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE product_stocks ALTER COLUMN physical_quantity SET NOT NULL;
--> statement-breakpoint
ALTER TABLE product_stocks ALTER COLUMN reserved_quantity SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_stocks_physical_nonneg'
  ) THEN
    ALTER TABLE product_stocks
      ADD CONSTRAINT product_stocks_physical_nonneg CHECK (physical_quantity >= 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_stocks_reserved_nonneg'
  ) THEN
    ALTER TABLE product_stocks
      ADD CONSTRAINT product_stocks_reserved_nonneg CHECK (reserved_quantity >= 0);
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_stocks_reserved_lte_physical'
  ) THEN
    ALTER TABLE product_stocks
      ADD CONSTRAINT product_stocks_reserved_lte_physical
      CHECK (reserved_quantity <= physical_quantity);
  END IF;
END $$;
--> statement-breakpoint
-- STORED generated available — not independently writable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_stocks' AND column_name = 'available_quantity'
  ) THEN
    ALTER TABLE product_stocks
      ADD COLUMN available_quantity integer
      GENERATED ALWAYS AS (physical_quantity - reserved_quantity) STORED;
  END IF;
END $$;
--> statement-breakpoint
-- Interim bridge: legacy quantity writers stay authoritative until P4.5;
-- keep quantity and physical_quantity mirrored (single interim authority pair).
CREATE OR REPLACE FUNCTION product_stocks_qty_physical_bridge()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.physical_quantity = 0 AND NEW.quantity <> 0 THEN
      NEW.physical_quantity := NEW.quantity;
    ELSIF NEW.quantity = 0 AND NEW.physical_quantity <> 0 THEN
      NEW.quantity := NEW.physical_quantity;
    ELSIF NEW.quantity IS DISTINCT FROM NEW.physical_quantity THEN
      NEW.physical_quantity := NEW.quantity;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.quantity IS DISTINCT FROM OLD.quantity
     AND NEW.physical_quantity IS NOT DISTINCT FROM OLD.physical_quantity THEN
    NEW.physical_quantity := NEW.quantity;
  ELSIF NEW.physical_quantity IS DISTINCT FROM OLD.physical_quantity
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN
    NEW.quantity := NEW.physical_quantity;
  ELSIF NEW.quantity IS DISTINCT FROM OLD.quantity
     AND NEW.physical_quantity IS DISTINCT FROM OLD.physical_quantity THEN
    NEW.physical_quantity := NEW.quantity;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS product_stocks_qty_physical_bridge_trg ON product_stocks;
--> statement-breakpoint
CREATE TRIGGER product_stocks_qty_physical_bridge_trg
  BEFORE INSERT OR UPDATE ON product_stocks
  FOR EACH ROW
  EXECUTE FUNCTION product_stocks_qty_physical_bridge();
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS product_stocks_branch_product_idx
  ON product_stocks (branch_id, product_id);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- reservations (authority) — lifecycle transitions deferred to later P4 steps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id serial PRIMARY KEY,
  order_id integer,
  customer_id integer,
  branch_id integer NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  expires_at timestamptz,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservations_status_check CHECK (
    status IN ('ACTIVE', 'EXPIRED', 'CANCELLED', 'FULFILLED')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS reservations_idempotency_key_uidx
  ON reservations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS reservations_active_order_uidx
  ON reservations (order_id)
  WHERE status = 'ACTIVE' AND order_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservations_order_idx ON reservations (order_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservations_customer_idx ON reservations (customer_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservations_branch_status_idx ON reservations (branch_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservations_expires_idx ON reservations (expires_at)
  WHERE expires_at IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS reservation_items (
  id serial PRIMARY KEY,
  reservation_id integer NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  product_id integer NOT NULL,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_items_quantity_positive CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservation_items_reservation_idx
  ON reservation_items (reservation_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reservation_items_product_idx
  ON reservation_items (product_id);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- inventory_movements (audit foundation — writers deferred)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id serial PRIMARY KEY,
  branch_id integer NOT NULL,
  product_id integer NOT NULL,
  movement_type text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  physical_delta integer NOT NULL DEFAULT 0,
  reserved_delta integer NOT NULL DEFAULT 0,
  reservation_id integer REFERENCES reservations(id) ON DELETE SET NULL,
  order_id integer,
  actor text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  idempotency_key text,
  meta text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_type_check CHECK (
    movement_type IN ('RESERVE', 'RELEASE', 'CONSUME', 'ADJUSTMENT')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_idempotency_key_uidx
  ON inventory_movements (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS inventory_movements_stock_idx
  ON inventory_movements (branch_id, product_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS inventory_movements_reservation_idx
  ON inventory_movements (reservation_id)
  WHERE reservation_id IS NOT NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- orders.reservation_id — nullable link; no backfill of reservations
-- ---------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_id integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_reservation_id_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_reservation_id_fkey
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS orders_reservation_id_idx
  ON orders (reservation_id)
  WHERE reservation_id IS NOT NULL;
