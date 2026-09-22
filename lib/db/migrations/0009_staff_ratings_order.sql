-- Batch 3B: order-linked ratings (trust boundary). No employee entity invented.

ALTER TABLE staff_ratings ADD COLUMN IF NOT EXISTS order_id integer;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS staff_ratings_order_id_uidx
  ON staff_ratings (order_id)
  WHERE order_id IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS staff_ratings_customer_idx ON staff_ratings (customer_id);
