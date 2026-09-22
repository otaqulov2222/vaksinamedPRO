-- Batch 3G — catalog pagination / filter indexes
-- product_stocks (branch_id, product_id) unique already exists (0003).

CREATE INDEX IF NOT EXISTS products_category_idx
  ON products (category);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS products_name_uz_idx
  ON products (name_uz);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS products_category_id_idx
  ON products (category, id);
