-- Phase 19: Product image URL support (additive, non-destructive).
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "image_url" text;
