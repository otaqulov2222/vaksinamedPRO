-- P1 baseline: current intended schema (from bootstrap.ts + Drizzle schema).
-- Does NOT implement Q1–Q24 domain redesigns.
-- Known gaps documented in docs/PHASE_3_3_P1_DATABASE_FOUNDATION.md

CREATE TABLE IF NOT EXISTS customers (
  id serial PRIMARY KEY,
  telegram_id text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  password_hash text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'uz',
  tier text NOT NULL DEFAULT 'Gold',
  balance integer NOT NULL DEFAULT 0,
  purchases_count integer NOT NULL DEFAULT 0,
  total_purchases integer NOT NULL DEFAULT 0,
  saved_amount integer NOT NULL DEFAULT 0,
  redeemed_rewards text NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_otps (
  id serial PRIMARY KEY,
  phone text NOT NULL,
  code text NOT NULL,
  purpose text NOT NULL DEFAULT 'login',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_otps_phone_idx ON auth_otps (phone);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_otps_expires_idx ON auth_otps (expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS pos_sales (
  id serial PRIMARY KEY,
  receipt_id text NOT NULL UNIQUE,
  customer_id integer NOT NULL,
  branch_id integer NOT NULL,
  staff_id integer,
  amount integer NOT NULL,
  cashback_used integer NOT NULL DEFAULT 0,
  cashback_earned integer NOT NULL DEFAULT 0,
  payable integer NOT NULL,
  rate_bps integer NOT NULL DEFAULT 500,
  status text NOT NULL DEFAULT 'completed',
  actor text NOT NULL DEFAULT 'kassa',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pos_sales_customer_idx ON pos_sales (customer_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pos_sales_branch_created_idx ON pos_sales (branch_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS branches (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  city text NOT NULL DEFAULT 'Toshkent',
  region text NOT NULL DEFAULT 'Toshkent shahri',
  district text NOT NULL DEFAULT '',
  address text NOT NULL,
  phone text NOT NULL,
  hours text NOT NULL DEFAULT '08:00 — 22:00',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  is_open boolean NOT NULL DEFAULT true,
  is_24h boolean NOT NULL DEFAULT false,
  payme_merchant_id text NOT NULL DEFAULT '',
  payme_key text NOT NULL DEFAULT '',
  click_merchant_id text NOT NULL DEFAULT '',
  click_service_id text NOT NULL DEFAULT '',
  click_secret text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS products (
  id serial PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  name_uz text NOT NULL,
  name_ru text NOT NULL,
  category text NOT NULL,
  manufacturer text NOT NULL,
  description text NOT NULL,
  unit text NOT NULL DEFAULT 'quti',
  price integer NOT NULL,
  icon text NOT NULL DEFAULT 'pill',
  analog_group text NOT NULL DEFAULT '',
  requires_prescription boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS product_stocks (
  id serial PRIMARY KEY,
  product_id integer NOT NULL,
  branch_id integer NOT NULL,
  quantity integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rewards (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text NOT NULL,
  points integer NOT NULL,
  icon text NOT NULL,
  accent text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS promos (
  id serial PRIMARY KEY,
  title text NOT NULL,
  subtitle text NOT NULL,
  tag text NOT NULL,
  icon text NOT NULL,
  background text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS carts (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL UNIQUE,
  branch_id integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cart_items (
  id serial PRIMARY KEY,
  cart_id integer NOT NULL,
  product_id integer NOT NULL,
  quantity integer NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS orders (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  customer_id integer NOT NULL,
  branch_id integer NOT NULL,
  fulfillment text NOT NULL,
  status text NOT NULL,
  payment_method text NOT NULL,
  subtotal integer NOT NULL,
  delivery_fee integer NOT NULL DEFAULT 0,
  cashback_used integer NOT NULL DEFAULT 0,
  cashback_earned integer NOT NULL DEFAULT 0,
  total integer NOT NULL,
  address text NOT NULL DEFAULT '',
  comment text NOT NULL DEFAULT '',
  reserved_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS order_items (
  id serial PRIMARY KEY,
  order_id integer NOT NULL,
  product_id integer NOT NULL,
  title text NOT NULL,
  price integer NOT NULL,
  quantity integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS payments (
  id serial PRIMARY KEY,
  order_id integer NOT NULL,
  provider text NOT NULL,
  branch_id integer NOT NULL,
  merchant_id text NOT NULL DEFAULT '',
  external_id text NOT NULL DEFAULT '',
  status text NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS deliveries (
  id serial PRIMARY KEY,
  order_id integer NOT NULL UNIQUE,
  address text NOT NULL,
  time_window text NOT NULL DEFAULT 'Bugun 10:00 — 18:00',
  status text NOT NULL DEFAULT 'pending',
  courier_name text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL,
  order_id integer,
  external_id text NOT NULL,
  date text NOT NULL,
  title text NOT NULL,
  branch text NOT NULL,
  amount integer NOT NULL,
  cashback integer NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS loyalty_ledger_external_idx ON loyalty_ledger (external_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS loyalty_ledger_customer_idx ON loyalty_ledger (customer_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS staff_ratings (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL,
  branch_id integer NOT NULL,
  employee_name text NOT NULL,
  rating integer NOT NULL,
  tags text NOT NULL DEFAULT '[]',
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admin_users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL,
  branch_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_log (
  id serial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  payload text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
