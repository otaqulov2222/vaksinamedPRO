-- P8 delivery + P9 FOM events + P10 worker jobs (additive only)

-- Deliveries: extend without dropping legacy columns
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS courier_id integer;
--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS courier_branch_id integer;
--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'internal';
--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS provider_ref text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'internal_courier';
--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS picked_up_at timestamptz;
--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS out_at timestamptz;
--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS meta text NOT NULL DEFAULT '{}';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS delivery_status_history (
  id serial PRIMARY KEY,
  delivery_id integer NOT NULL REFERENCES deliveries(id),
  order_id integer NOT NULL,
  from_status text NOT NULL DEFAULT '',
  to_status text NOT NULL,
  actor text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'system',
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS delivery_status_history_delivery_idx
  ON delivery_status_history (delivery_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS deliveries_status_idx ON deliveries (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS deliveries_courier_idx ON deliveries (courier_id)
  WHERE courier_id IS NOT NULL;
--> statement-breakpoint

-- P9: FOM sale event idempotency (receipt-level). Inventory writer remains OFF.
CREATE TABLE IF NOT EXISTS fom_sale_events (
  id serial PRIMARY KEY,
  receipt_id text NOT NULL,
  branch_id integer,
  order_id integer,
  mode text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PROCESSED',
  payload text NOT NULL DEFAULT '{}',
  result_meta text NOT NULL DEFAULT '{}',
  actor text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fom_sale_events_status_check CHECK (
    status IN ('PROCESSED', 'FAILED', 'IGNORED')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS fom_sale_events_receipt_uidx
  ON fom_sale_events (receipt_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fom_sale_events_branch_idx
  ON fom_sale_events (branch_id, created_at DESC);
--> statement-breakpoint

-- P10: PostgreSQL-backed worker jobs (BullMQ/Redis not present — do not invent Redis queue)
CREATE TABLE IF NOT EXISTS worker_jobs (
  id serial PRIMARY KEY,
  job_type text NOT NULL,
  entity_key text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text NOT NULL DEFAULT '',
  last_error text NOT NULL DEFAULT '',
  payload text NOT NULL DEFAULT '{}',
  result text NOT NULL DEFAULT '{}',
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_jobs_status_check CHECK (
    status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS worker_jobs_idempotency_uidx
  ON worker_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS worker_jobs_due_idx
  ON worker_jobs (status, run_after)
  WHERE status IN ('PENDING', 'FAILED');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS worker_jobs_type_idx
  ON worker_jobs (job_type, created_at DESC);
