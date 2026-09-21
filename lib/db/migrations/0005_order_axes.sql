-- P5.1: three-axis order foundation (additive; keep legacy orders.status)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reservation_status text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_idempotency_key text;
--> statement-breakpoint

-- Deterministic backfill from legacy status + payments + reservations (no invented FAILED/REFUNDED)
UPDATE orders AS o
SET
  fulfillment_status = CASE o.status
    WHEN 'pending_payment' THEN 'CREATED'
    WHEN 'reserved' THEN 'CONFIRMED'
    WHEN 'awaiting_delivery' THEN 'CONFIRMED'
    WHEN 'paid' THEN 'CONFIRMED'
    WHEN 'completed' THEN 'COMPLETED'
    WHEN 'cancelled' THEN 'CANCELLED'
    ELSE 'CREATED'
  END,
  payment_status = CASE
    WHEN o.status = 'pending_payment' THEN 'PENDING'
    WHEN o.status = 'paid' THEN 'PAID'
    WHEN EXISTS (
      SELECT 1 FROM payments p
      WHERE p.order_id = o.id AND p.status = 'paid'
    ) THEN 'PAID'
    WHEN o.status = 'completed' AND o.payment_method IN ('pay_at_branch', 'cod') THEN 'PAID'
    ELSE 'PENDING'
  END,
  reservation_status = CASE
    WHEN o.reservation_id IS NULL THEN 'NONE'
    WHEN EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = o.reservation_id AND r.status = 'ACTIVE'
    ) THEN 'ACTIVE'
    WHEN EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = o.reservation_id AND r.status = 'FULFILLED'
    ) THEN 'FULFILLED'
    WHEN EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = o.reservation_id AND r.status = 'CANCELLED'
    ) THEN 'CANCELLED'
    WHEN EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = o.reservation_id AND r.status = 'EXPIRED'
    ) THEN 'EXPIRED'
    ELSE 'NONE'
  END
WHERE o.fulfillment_status IS NULL
   OR o.payment_status IS NULL
   OR o.reservation_status IS NULL;
--> statement-breakpoint

UPDATE orders
SET
  fulfillment_status = COALESCE(fulfillment_status, 'CREATED'),
  payment_status = COALESCE(payment_status, 'PENDING'),
  reservation_status = COALESCE(reservation_status, 'NONE')
WHERE fulfillment_status IS NULL
   OR payment_status IS NULL
   OR reservation_status IS NULL;
--> statement-breakpoint

ALTER TABLE orders ALTER COLUMN fulfillment_status SET DEFAULT 'CREATED';
--> statement-breakpoint
ALTER TABLE orders ALTER COLUMN payment_status SET DEFAULT 'PENDING';
--> statement-breakpoint
ALTER TABLE orders ALTER COLUMN reservation_status SET DEFAULT 'NONE';
--> statement-breakpoint
ALTER TABLE orders ALTER COLUMN fulfillment_status SET NOT NULL;
--> statement-breakpoint
ALTER TABLE orders ALTER COLUMN payment_status SET NOT NULL;
--> statement-breakpoint
ALTER TABLE orders ALTER COLUMN reservation_status SET NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_fulfillment_status_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_status_check CHECK (
      fulfillment_status IN (
        'CREATED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP',
        'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'
      )
    );
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_status_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (
      payment_status IN (
        'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'
      )
    );
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_reservation_status_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_reservation_status_check CHECK (
      reservation_status IN (
        'NONE', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'FULFILLED'
      )
    );
  END IF;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_idempotency_key_uidx
  ON orders (checkout_idempotency_key)
  WHERE checkout_idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS orders_customer_created_idx
  ON orders (customer_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS orders_branch_fulfillment_idx
  ON orders (branch_id, fulfillment_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS orders_payment_status_idx
  ON orders (payment_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS orders_reservation_status_idx
  ON orders (reservation_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS orders_reservation_id_idx
  ON orders (reservation_id)
  WHERE reservation_id IS NOT NULL;
