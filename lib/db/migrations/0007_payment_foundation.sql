-- P7.1: payment intents / attempts / captures / refunds / webhook events (additive)
-- Legacy `payments` table retained for API compatibility; linked via payment_intent_id.
-- No invented PSP fields. Currency explicit (default UZS). Integer money only.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'UZS';
--> statement-breakpoint
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_intent_id integer;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_intents (
  id serial PRIMARY KEY,
  order_id integer NOT NULL,
  provider text NOT NULL,
  branch_id integer NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'UZS',
  status text NOT NULL DEFAULT 'CREATED',
  idempotency_key text,
  merchant_id text NOT NULL DEFAULT '',
  legacy_payment_id integer,
  meta text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_intents_amount_positive CHECK (amount > 0),
  CONSTRAINT payment_intents_status_check CHECK (
    status IN (
      'CREATED',
      'REQUIRES_PAYMENT',
      'PROCESSING',
      'PAID',
      'FAILED',
      'CANCELLED',
      'EXPIRED',
      'REFUNDED',
      'PARTIALLY_REFUNDED'
    )
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_idempotency_uidx
  ON payment_intents (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_order_paid_uidx
  ON payment_intents (order_id)
  WHERE status = 'PAID';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_intents_order_idx
  ON payment_intents (order_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_intents_status_idx
  ON payment_intents (status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_attempts (
  id serial PRIMARY KEY,
  intent_id integer NOT NULL REFERENCES payment_intents(id),
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'STARTED',
  idempotency_key text,
  external_ref text NOT NULL DEFAULT '',
  actor text NOT NULL DEFAULT '',
  error_code text NOT NULL DEFAULT '',
  meta text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_attempts_status_check CHECK (
    status IN ('STARTED', 'PROCESSING', 'SUCCEEDED', 'FAILED')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_idempotency_uidx
  ON payment_attempts (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_attempts_intent_idx
  ON payment_attempts (intent_id, created_at DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_captures (
  id serial PRIMARY KEY,
  intent_id integer NOT NULL REFERENCES payment_intents(id),
  order_id integer NOT NULL,
  attempt_id integer REFERENCES payment_attempts(id),
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'UZS',
  actor text NOT NULL DEFAULT '',
  meta text NOT NULL DEFAULT '{}',
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_captures_amount_positive CHECK (amount > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payment_captures_intent_uidx
  ON payment_captures (intent_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payment_captures_order_uidx
  ON payment_captures (order_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_refunds (
  id serial PRIMARY KEY,
  capture_id integer NOT NULL REFERENCES payment_captures(id),
  intent_id integer NOT NULL REFERENCES payment_intents(id),
  order_id integer NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'UZS',
  status text NOT NULL DEFAULT 'PENDING',
  idempotency_key text,
  provider_refund_id text NOT NULL DEFAULT '',
  actor text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  meta text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_refunds_amount_positive CHECK (amount > 0),
  CONSTRAINT payment_refunds_status_check CHECK (
    status IN ('PENDING', 'SUCCEEDED', 'FAILED')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_idempotency_uidx
  ON payment_refunds (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_refunds_capture_idx
  ON payment_refunds (capture_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id serial PRIMARY KEY,
  provider text NOT NULL,
  external_event_id text NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED',
  payload text NOT NULL DEFAULT '{}',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '',
  intent_id integer,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT payment_webhook_events_status_check CHECK (
    status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_provider_event_uidx
  ON payment_webhook_events (provider, external_event_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_webhook_events_status_idx
  ON payment_webhook_events (status, received_at DESC);
