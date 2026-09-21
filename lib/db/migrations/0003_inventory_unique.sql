-- P4.2: deterministic duplicate merge + UNIQUE(branch_id, product_id)
-- Additive / non-destructive except merging duplicate stock rows into survivor (lowest id).

-- Clamp reserved after potential bad rows before merge
UPDATE product_stocks
SET reserved_quantity = physical_quantity
WHERE reserved_quantity > physical_quantity;
--> statement-breakpoint

-- Merge duplicates: survivor = MIN(id); physical/reserved/quantity = SUM
WITH dups AS (
  SELECT
    branch_id,
    product_id,
    MIN(id) AS survivor_id,
    SUM(physical_quantity)::integer AS sum_physical,
    SUM(reserved_quantity)::integer AS sum_reserved,
    SUM(quantity)::integer AS sum_quantity
  FROM product_stocks
  GROUP BY branch_id, product_id
  HAVING COUNT(*) > 1
)
UPDATE product_stocks AS ps
SET
  physical_quantity = d.sum_physical,
  reserved_quantity = LEAST(d.sum_reserved, d.sum_physical),
  quantity = d.sum_physical
FROM dups AS d
WHERE ps.id = d.survivor_id;
--> statement-breakpoint

-- Delete absorbed duplicate rows (not the survivor)
DELETE FROM product_stocks AS ps
USING (
  SELECT branch_id, product_id, MIN(id) AS survivor_id
  FROM product_stocks
  GROUP BY branch_id, product_id
  HAVING COUNT(*) > 1
) AS d
WHERE ps.branch_id = d.branch_id
  AND ps.product_id = d.product_id
  AND ps.id <> d.survivor_id;
--> statement-breakpoint

-- Replace non-unique helper index with UNIQUE constraint index
DROP INDEX IF EXISTS product_stocks_branch_product_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS product_stocks_branch_product_uidx
  ON product_stocks (branch_id, product_id);
