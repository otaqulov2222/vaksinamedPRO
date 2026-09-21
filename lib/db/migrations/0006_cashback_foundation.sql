-- P6.1: cashback accounts + ledger + commercial transactions (additive)
-- customers.balance remains as legacy mirror only — not financial SoT.

CREATE TABLE IF NOT EXISTS commercial_transactions (
  id serial PRIMARY KEY,
  source_type text NOT NULL,
  source_key text NOT NULL,
  customer_id integer NOT NULL,
  order_id integer,
  receipt_id text,
  amount integer NOT NULL DEFAULT 0,
  meta text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_transactions_source_type_check CHECK (
    source_type IN ('ORDER', 'POS', 'FOM_POS', 'SYSTEM')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS commercial_transactions_source_uidx
  ON commercial_transactions (source_type, source_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS commercial_transactions_customer_idx
  ON commercial_transactions (customer_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS commercial_transactions_order_idx
  ON commercial_transactions (order_id)
  WHERE order_id IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS cashback_accounts (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL,
  balance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashback_accounts_balance_nonneg CHECK (balance >= 0),
  CONSTRAINT cashback_accounts_customer_uidx UNIQUE (customer_id)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS cashback_ledger (
  id serial PRIMARY KEY,
  account_id integer NOT NULL REFERENCES cashback_accounts(id),
  customer_id integer NOT NULL,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  commercial_transaction_id integer REFERENCES commercial_transactions(id),
  order_id integer,
  reverses_entry_id integer REFERENCES cashback_ledger(id),
  idempotency_key text,
  actor text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  meta text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashback_ledger_entry_type_check CHECK (
    entry_type IN ('EARN', 'USE', 'REVERSAL', 'ADJUSTMENT')
  ),
  CONSTRAINT cashback_ledger_amount_positive CHECK (amount > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS cashback_ledger_earn_commercial_uidx
  ON cashback_ledger (commercial_transaction_id)
  WHERE entry_type = 'EARN' AND commercial_transaction_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS cashback_ledger_use_commercial_uidx
  ON cashback_ledger (commercial_transaction_id)
  WHERE entry_type = 'USE' AND commercial_transaction_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS cashback_ledger_reversal_uidx
  ON cashback_ledger (reverses_entry_id)
  WHERE entry_type = 'REVERSAL' AND reverses_entry_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS cashback_ledger_idempotency_uidx
  ON cashback_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cashback_ledger_account_created_idx
  ON cashback_ledger (account_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cashback_ledger_customer_created_idx
  ON cashback_ledger (customer_id, created_at DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO system_settings (key, value, description)
VALUES (
  'cashback.max_spend_ratio',
  '0.30',
  'Maximum fraction of eligible goods amount payable with cashback (server-authoritative)'
)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

-- Opening accounts from legacy customers.balance (demo/local safe; auditable ADJUSTMENT)
INSERT INTO cashback_accounts (customer_id, balance, created_at, updated_at)
SELECT c.id, GREATEST(0, c.balance), now(), now()
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM cashback_accounts a WHERE a.customer_id = c.id
);
--> statement-breakpoint

INSERT INTO commercial_transactions (source_type, source_key, customer_id, amount, meta)
SELECT
  'SYSTEM',
  'opening:customer:' || a.customer_id::text,
  a.customer_id,
  a.balance,
  '{"reason":"legacy_balance_opening"}'
FROM cashback_accounts a
WHERE a.balance > 0
  AND NOT EXISTS (
    SELECT 1 FROM commercial_transactions ct
    WHERE ct.source_type = 'SYSTEM'
      AND ct.source_key = 'opening:customer:' || a.customer_id::text
  );
--> statement-breakpoint

INSERT INTO cashback_ledger (
  account_id, customer_id, entry_type, amount,
  commercial_transaction_id, actor, reason, idempotency_key, meta
)
SELECT
  a.id,
  a.customer_id,
  'ADJUSTMENT',
  a.balance,
  ct.id,
  'migration:0006',
  'legacy_balance_opening',
  'opening:customer:' || a.customer_id::text,
  '{"source":"customers.balance"}'
FROM cashback_accounts a
JOIN commercial_transactions ct
  ON ct.source_type = 'SYSTEM'
 AND ct.source_key = 'opening:customer:' || a.customer_id::text
WHERE a.balance > 0
  AND NOT EXISTS (
    SELECT 1 FROM cashback_ledger l
    WHERE l.idempotency_key = 'opening:customer:' || a.customer_id::text
  );
