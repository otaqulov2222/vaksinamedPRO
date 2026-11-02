-- FIFO cashback grants (90-day TTL) + EXPIRE ledger type + customer birth date.
-- Existing balances are grandfathered (expires_at NULL) so live money is not suddenly burned.

ALTER TABLE cashback_ledger DROP CONSTRAINT IF EXISTS cashback_ledger_entry_type_check;
--> statement-breakpoint
ALTER TABLE cashback_ledger ADD CONSTRAINT cashback_ledger_entry_type_check
  CHECK (entry_type IN ('EARN', 'USE', 'REVERSAL', 'ADJUSTMENT', 'EXPIRE'));
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS cashback_grants (
  id serial PRIMARY KEY,
  account_id integer NOT NULL REFERENCES cashback_accounts(id),
  customer_id integer NOT NULL,
  original_amount integer NOT NULL,
  unconsumed_amount integer NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  commercial_transaction_id integer REFERENCES commercial_transactions(id),
  ledger_entry_id integer REFERENCES cashback_ledger(id),
  status text NOT NULL DEFAULT 'ACTIVE',
  meta text NOT NULL DEFAULT '{}',
  CONSTRAINT cashback_grants_original_amount_positive CHECK (original_amount > 0),
  CONSTRAINT cashback_grants_unconsumed_range CHECK (
    unconsumed_amount >= 0 AND unconsumed_amount <= original_amount
  ),
  CONSTRAINT cashback_grants_status_check CHECK (
    status IN ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVERSED')
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_cashback_grants_fifo_spend
  ON cashback_grants (account_id, expires_at ASC NULLS LAST, id ASC)
  WHERE unconsumed_amount > 0 AND status = 'ACTIVE';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_cashback_grants_expiration_sweep
  ON cashback_grants (expires_at, account_id)
  WHERE unconsumed_amount > 0 AND expires_at IS NOT NULL AND status = 'ACTIVE';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS cashback_grants_ledger_entry_uidx
  ON cashback_grants (ledger_entry_id)
  WHERE ledger_entry_id IS NOT NULL;
--> statement-breakpoint

INSERT INTO cashback_grants (
  account_id, customer_id, original_amount, unconsumed_amount, expires_at, status, meta
)
SELECT
  a.id,
  a.customer_id,
  a.balance,
  a.balance,
  NULL,
  'ACTIVE',
  '{"legacy_strategy":"variant_a_grandfathered"}'
FROM cashback_accounts a
WHERE a.balance > 0
  AND NOT EXISTS (
    SELECT 1 FROM cashback_grants g WHERE g.account_id = a.id
  );
--> statement-breakpoint

ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_date date;
--> statement-breakpoint

INSERT INTO system_settings (key, value, description)
VALUES (
  'cashback.birthday_extra_bps',
  '500',
  'Extra cashback basis points during the 7-day birthday window (500 = +5%)'
)
ON CONFLICT (key) DO NOTHING;
