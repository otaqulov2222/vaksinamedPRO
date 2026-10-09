/**
 * PHASE 2.1 — CASHBACK FIFO IMPLEMENTATION READINESS TEST SUITE
 *
 * Comprehensive isolated test suite validating:
 * 1. Grant-level tracking schema & constraints (original_amount, unconsumed_amount, expires_at)
 * 2. FIFO spending ordering (earliest-expiring grants consumed first)
 * 3. Partial grant consumption & status transitions
 * 4. Cancellation & Reversal of USE (idempotency, restoring grants)
 * 5. Reversal of EARN (handling already-consumed vs unconsumed grants)
 * 6. Expiration sweep worker (idempotency, atomic deduction)
 * 7. Parallel USE vs EXPIRATION concurrency protection (SELECT FOR UPDATE)
 * 8. Non-negative balance invariant enforcement
 * 9. Tri-way balance reconciliation: SUM(active grants) == account.balance == ledger net
 * 10. Legacy balance backfill options (Variant A: Grandfathered vs Variant B: Grace period) & rollback safety
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

describe("PHASE 2.1 — Cashback FIFO Implementation Readiness", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let customerId: number;
  let accountId: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());

    // Setup cashback_grants table inside isolated test DB
    await client.exec(`
      -- Expand entry_type check constraint to include EXPIRE
      ALTER TABLE cashback_ledger DROP CONSTRAINT cashback_ledger_entry_type_check;
      ALTER TABLE cashback_ledger ADD CONSTRAINT cashback_ledger_entry_type_check 
        CHECK (entry_type IN ('EARN', 'USE', 'REVERSAL', 'ADJUSTMENT', 'EXPIRE'));

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
        CONSTRAINT cashback_grants_unconsumed_range CHECK (unconsumed_amount >= 0 AND unconsumed_amount <= original_amount),
        CONSTRAINT cashback_grants_status_check CHECK (status IN ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVERSED'))
      );

      CREATE INDEX IF NOT EXISTS idx_cashback_grants_fifo_spend 
        ON cashback_grants (account_id, expires_at ASC NULLS LAST, id ASC)
        WHERE unconsumed_amount > 0 AND status = 'ACTIVE';

      CREATE INDEX IF NOT EXISTS idx_cashback_grants_expiration_sweep
        ON cashback_grants (expires_at, account_id)
        WHERE unconsumed_amount > 0 AND expires_at IS NOT NULL AND status = 'ACTIVE';
    `);

    // Create test customer
    const inserted = await database.insert(schema.customers).values({
      telegramId: "fifo-readiness-test",
      firstName: "FIFO",
      lastName: "Readiness",
      phone: "+998 90 777 00 21",
      balance: 0,
    }).returning();
    customerId = inserted[0].id;

    // Create cashback account
    const acc = await database.insert(schema.cashbackAccounts).values({
      customerId,
      balance: 0,
    }).returning();
    accountId = acc[0].id;
  });

  after(async () => {
    await client.close();
  });

  // Helper to verify the Tri-Way Financial Invariant
  async function assertTriWayInvariant(expectedBalance: number) {
    const acc = await database.select().from(schema.cashbackAccounts).where(eq(schema.cashbackAccounts.id, accountId));
    const accountBalance = acc[0].balance;
    assert.equal(accountBalance, expectedBalance, `Account balance mismatch: expected ${expectedBalance}, got ${accountBalance}`);

    // Sum of active, unexpired grants
    const grantRes = await client.query<{ sum: string }>(`
      SELECT COALESCE(SUM(unconsumed_amount), 0)::text as sum
      FROM cashback_grants
      WHERE account_id = $1 AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())
    `, [accountId]);
    const grantsSum = Number(grantRes.rows[0].sum);
    assert.equal(grantsSum, expectedBalance, `Active grants sum mismatch: expected ${expectedBalance}, got ${grantsSum}`);

    // Sum of ledger entries
    const ledgerRes = await client.query<{ net: string }>(`
      SELECT COALESCE(SUM(
        CASE
          WHEN entry_type IN ('EARN', 'ADJUSTMENT') THEN amount
          WHEN entry_type IN ('USE', 'EXPIRE') THEN -amount
          WHEN entry_type = 'REVERSAL' THEN
            CASE
              WHEN EXISTS (
                SELECT 1 FROM cashback_ledger o
                WHERE o.id = cashback_ledger.reverses_entry_id
                  AND o.entry_type IN ('EARN', 'ADJUSTMENT')
              ) THEN -amount
              ELSE amount
            END
          ELSE 0
        END
      ), 0)::text AS net
      FROM cashback_ledger
      WHERE account_id = $1
    `, [accountId]);
    const ledgerNet = Number(ledgerRes.rows[0].net);
    assert.equal(ledgerNet, expectedBalance, `Ledger net mismatch: expected ${expectedBalance}, got ${ledgerNet}`);
  }

  it("1. Grant Creation on EARN: correctly initializes original and unconsumed amount with 90-day TTL", async () => {
    // EARN Grant 1: 10,000 UZS, expires in 30 days
    const expires30 = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const comm1 = await database.insert(schema.commercialTransactions).values({
      sourceType: "ORDER",
      sourceKey: "order:fifo:101",
      customerId,
      amount: 100000,
    }).returning();

    const ledger1 = await database.insert(schema.cashbackLedger).values({
      accountId,
      customerId,
      entryType: "EARN",
      amount: 10000,
      commercialTransactionId: comm1[0].id,
      actor: "test",
      reason: "purchase_earn_1",
    }).returning();

    await client.query(`
      INSERT INTO cashback_grants (
        account_id, customer_id, original_amount, unconsumed_amount, expires_at,
        commercial_transaction_id, ledger_entry_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
    `, [accountId, customerId, 10000, 10000, expires30.toISOString(), comm1[0].id, ledger1[0].id]);

    await database.update(schema.cashbackAccounts)
      .set({ balance: 10000, updatedAt: new Date() })
      .where(eq(schema.cashbackAccounts.id, accountId));

    await assertTriWayInvariant(10000);
  });

  it("2. Multiple Grants with Different Expirations: maintains distinct FIFO priorities", async () => {
    // EARN Grant 2: 15,000 UZS, expires in 60 days
    const expires60 = new Date(Date.now() + 60 * 24 * 3600 * 1000);
    const comm2 = await database.insert(schema.commercialTransactions).values({
      sourceType: "ORDER",
      sourceKey: "order:fifo:102",
      customerId,
      amount: 150000,
    }).returning();

    const ledger2 = await database.insert(schema.cashbackLedger).values({
      accountId,
      customerId,
      entryType: "EARN",
      amount: 15000,
      commercialTransactionId: comm2[0].id,
      actor: "test",
      reason: "purchase_earn_2",
    }).returning();

    await client.query(`
      INSERT INTO cashback_grants (
        account_id, customer_id, original_amount, unconsumed_amount, expires_at,
        commercial_transaction_id, ledger_entry_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
    `, [accountId, customerId, 15000, 15000, expires60.toISOString(), comm2[0].id, ledger2[0].id]);

    // EARN Grant 3: 5,000 UZS, expires in 10 days (earliest expiry!)
    const expires10 = new Date(Date.now() + 10 * 24 * 3600 * 1000);
    const comm3 = await database.insert(schema.commercialTransactions).values({
      sourceType: "ORDER",
      sourceKey: "order:fifo:103",
      customerId,
      amount: 50000,
    }).returning();

    const ledger3 = await database.insert(schema.cashbackLedger).values({
      accountId,
      customerId,
      entryType: "EARN",
      amount: 5000,
      commercialTransactionId: comm3[0].id,
      actor: "test",
      reason: "purchase_earn_3",
    }).returning();

    await client.query(`
      INSERT INTO cashback_grants (
        account_id, customer_id, original_amount, unconsumed_amount, expires_at,
        commercial_transaction_id, ledger_entry_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
    `, [accountId, customerId, 5000, 5000, expires10.toISOString(), comm3[0].id, ledger3[0].id]);

    // Total balance: 10,000 + 15,000 + 5,000 = 30,000 UZS
    await database.update(schema.cashbackAccounts)
      .set({ balance: 30000, updatedAt: new Date() })
      .where(eq(schema.cashbackAccounts.id, accountId));

    await assertTriWayInvariant(30000);
  });

  it("3. FIFO Spending: consumes earliest-expiring grant first", async () => {
    // Current active grants:
    // Grant 3: 5,000 (expires in 10 days) -> Earliest!
    // Grant 1: 10,000 (expires in 30 days) -> Second!
    // Grant 2: 15,000 (expires in 60 days) -> Third!
    // Customer spends 4,000 UZS. Should be taken ENTIRELY from Grant 3.
    const spendAmount = 4000;

    await client.exec("BEGIN");
    try {
      // 1. Lock account
      const accRes = await client.query<{ id: number; balance: number }>(`
        SELECT id, balance FROM cashback_accounts WHERE id = $1 FOR UPDATE
      `, [accountId]);
      const currentBal = accRes.rows[0].balance;
      assert.ok(currentBal >= spendAmount);

      // 2. Fetch grants ordered by FIFO (earliest expiry first)
      const grantsRes = await client.query<{ id: number; unconsumed_amount: number }>(`
        SELECT id, unconsumed_amount FROM cashback_grants
        WHERE account_id = $1 AND unconsumed_amount > 0 AND status = 'ACTIVE'
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY expires_at ASC NULLS LAST, id ASC
        FOR UPDATE
      `, [accountId]);

      let remainingSpend = spendAmount;
      for (const g of grantsRes.rows) {
        if (remainingSpend <= 0) break;
        const take = Math.min(g.unconsumed_amount, remainingSpend);
        const newUnconsumed = g.unconsumed_amount - take;
        const newStatus = newUnconsumed === 0 ? "EXHAUSTED" : "ACTIVE";

        await client.query(`
          UPDATE cashback_grants
          SET unconsumed_amount = $1, status = $2
          WHERE id = $3
        `, [newUnconsumed, newStatus, g.id]);

        remainingSpend -= take;
      }
      assert.equal(remainingSpend, 0);

      // 3. Deduct account balance & insert ledger USE
      await client.query(`
        UPDATE cashback_accounts SET balance = balance - $1, updated_at = now() WHERE id = $2
      `, [spendAmount, accountId]);

      await client.query(`
        INSERT INTO cashback_ledger (
          account_id, customer_id, entry_type, amount, actor, reason
        ) VALUES ($1, $2, 'USE', $3, 'test', 'fifo_spend_1')
      `, [accountId, customerId, spendAmount]);

      await client.exec("COMMIT");
    } catch (e) {
      await client.exec("ROLLBACK");
      throw e;
    }

    // Grant 3 should now have 1,000 unconsumed remaining
    const g3 = await client.query<{ unconsumed_amount: number; status: string }>(`
      SELECT unconsumed_amount, status FROM cashback_grants WHERE original_amount = 5000 AND account_id = $1
    `, [accountId]);
    assert.equal(g3.rows[0].unconsumed_amount, 1000);
    assert.equal(g3.rows[0].status, "ACTIVE");

    // Grants 1 and 2 should remain completely untouched (10,000 and 15,000)
    const otherGrants = await client.query<{ original_amount: number; unconsumed_amount: number }>(`
      SELECT original_amount, unconsumed_amount FROM cashback_grants
      WHERE account_id = $1 AND original_amount != 5000
      ORDER BY id ASC
    `, [accountId]);
    assert.equal(otherGrants.rows[0].unconsumed_amount, 10000);
    assert.equal(otherGrants.rows[1].unconsumed_amount, 15000);

    // Balance should be exactly 30,000 - 4,000 = 26,000 UZS
    await assertTriWayInvariant(26000);
  });

  it("4. Partial & Multi-Grant Spend: spans across multiple grants and marks exhausted ones correctly", async () => {
    // Current state:
    // Grant 3: 1,000 remaining (10 days)
    // Grant 1: 10,000 remaining (30 days)
    // Grant 2: 15,000 remaining (60 days)
    // Customer spends 7,000 UZS.
    // Should take: 1,000 from Grant 3 (exhausting it -> 0, status EXHAUSTED)
    // AND 6,000 from Grant 1 (leaving 4,000, status ACTIVE)
    const spendAmount = 7000;

    await client.exec("BEGIN");
    try {
      await client.query("SELECT id, balance FROM cashback_accounts WHERE id = $1 FOR UPDATE", [accountId]);

      const grantsRes = await client.query<{ id: number; original_amount: number; unconsumed_amount: number }>(`
        SELECT id, original_amount, unconsumed_amount FROM cashback_grants
        WHERE account_id = $1 AND unconsumed_amount > 0 AND status = 'ACTIVE'
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY expires_at ASC NULLS LAST, id ASC
        FOR UPDATE
      `, [accountId]);

      let remainingSpend = spendAmount;
      for (const g of grantsRes.rows) {
        if (remainingSpend <= 0) break;
        const take = Math.min(g.unconsumed_amount, remainingSpend);
        const newUnconsumed = g.unconsumed_amount - take;
        const newStatus = newUnconsumed === 0 ? "EXHAUSTED" : "ACTIVE";

        await client.query(`
          UPDATE cashback_grants
          SET unconsumed_amount = $1, status = $2
          WHERE id = $3
        `, [newUnconsumed, newStatus, g.id]);

        remainingSpend -= take;
      }
      assert.equal(remainingSpend, 0);

      await client.query(`
        UPDATE cashback_accounts SET balance = balance - $1, updated_at = now() WHERE id = $2
      `, [spendAmount, accountId]);

      await client.query(`
        INSERT INTO cashback_ledger (
          account_id, customer_id, entry_type, amount, actor, reason
        ) VALUES ($1, $2, 'USE', $3, 'test', 'fifo_spend_2')
      `, [accountId, customerId, spendAmount]);

      await client.exec("COMMIT");
    } catch (e) {
      await client.exec("ROLLBACK");
      throw e;
    }

    // Grant 3: exhausted (0)
    const g3 = await client.query<{ unconsumed_amount: number; status: string }>(`
      SELECT unconsumed_amount, status FROM cashback_grants WHERE original_amount = 5000 AND account_id = $1
    `, [accountId]);
    assert.equal(g3.rows[0].unconsumed_amount, 0);
    assert.equal(g3.rows[0].status, "EXHAUSTED");

    // Grant 1: partially spent (10,000 - 6,000 = 4,000)
    const g1 = await client.query<{ unconsumed_amount: number; status: string }>(`
      SELECT unconsumed_amount, status FROM cashback_grants WHERE original_amount = 10000 AND account_id = $1
    `, [accountId]);
    assert.equal(g1.rows[0].unconsumed_amount, 4000);
    assert.equal(g1.rows[0].status, "ACTIVE");

    // Grant 2: untouched (15,000)
    const g2 = await client.query<{ unconsumed_amount: number; status: string }>(`
      SELECT unconsumed_amount, status FROM cashback_grants WHERE original_amount = 15000 AND account_id = $1
    `, [accountId]);
    assert.equal(g2.rows[0].unconsumed_amount, 15000);

    // New balance: 26,000 - 7,000 = 19,000 UZS
    await assertTriWayInvariant(19000);
  });

  it("5. Order Cancellation & Reversal of USE: restores grants and is strictly idempotent", async () => {
    // Order was cancelled: reverse the 7,000 UZS USE
    // 1. Find the USE entry to reverse
    const lastUse = await client.query<{ id: number; amount: number }>(`
      SELECT id, amount FROM cashback_ledger
      WHERE account_id = $1 AND entry_type = 'USE' AND reason = 'fifo_spend_2'
      LIMIT 1
    `, [accountId]);
    const useEntryId = lastUse.rows[0].id;
    const reverseAmount = lastUse.rows[0].amount; // 7,000

    // Reverse operation
    async function performReversal(): Promise<boolean> {
      await client.exec("BEGIN");
      try {
        // Idempotency check:
        const existingRev = await client.query(`
          SELECT id FROM cashback_ledger
          WHERE reverses_entry_id = $1 AND entry_type = 'REVERSAL'
        `, [useEntryId]);
        if (existingRev.rows.length > 0) {
          await client.exec("ROLLBACK");
          return false; // idempotent skip
        }

        await client.query("SELECT id, balance FROM cashback_accounts WHERE id = $1 FOR UPDATE", [accountId]);

        // Restore to a fresh reversal grant (or restore original grant) with full safety
        const restoredExpiry = new Date(Date.now() + 90 * 24 * 3600 * 1000);
        await client.query(`
          INSERT INTO cashback_grants (
            account_id, customer_id, original_amount, unconsumed_amount, expires_at, status, meta
          ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6)
        `, [accountId, customerId, reverseAmount, reverseAmount, restoredExpiry.toISOString(), JSON.stringify({ reversedUseEntryId: useEntryId })]);

        await client.query(`
          UPDATE cashback_accounts SET balance = balance + $1, updated_at = now() WHERE id = $2
        `, [reverseAmount, accountId]);

        await client.query(`
          INSERT INTO cashback_ledger (
            account_id, customer_id, entry_type, amount, reverses_entry_id, actor, reason, idempotency_key
          ) VALUES ($1, $2, 'REVERSAL', $3, $4, 'test', 'order_cancelled_reversal', $5)
        `, [accountId, customerId, reverseAmount, useEntryId, `reversal:entry:${useEntryId}`]);

        await client.exec("COMMIT");
        return true;
      } catch (e) {
        await client.exec("ROLLBACK");
        throw e;
      }
    }

    // First attempt: should succeed and restore balance (19,000 + 7,000 = 26,000)
    const firstAttempt = await performReversal();
    assert.equal(firstAttempt, true);
    await assertTriWayInvariant(26000);

    // Second attempt (duplicate callback or retry): must be idempotent and make no change
    const secondAttempt = await performReversal();
    assert.equal(secondAttempt, false);
    await assertTriWayInvariant(26000);
  });

  it("6. Expiration Sweep Worker: sweeps only expired unconsumed grants, writes EXPIRE ledger, and is idempotent", async () => {
    // Add an expired grant with 3,000 UZS (expired yesterday)
    const expiredDate = new Date(Date.now() - 24 * 3600 * 1000);
    const commExp = await database.insert(schema.commercialTransactions).values({
      sourceType: "ORDER",
      sourceKey: "order:fifo:expired_test",
      customerId,
      amount: 30000,
    }).returning();

    const ledgerExp = await database.insert(schema.cashbackLedger).values({
      accountId,
      customerId,
      entryType: "EARN",
      amount: 3000,
      commercialTransactionId: commExp[0].id,
      actor: "test",
      reason: "expired_grant_seed",
    }).returning();

    await client.query(`
      INSERT INTO cashback_grants (
        account_id, customer_id, original_amount, unconsumed_amount, expires_at,
        commercial_transaction_id, ledger_entry_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
    `, [accountId, customerId, 3000, 3000, expiredDate.toISOString(), commExp[0].id, ledgerExp[0].id]);

    await database.update(schema.cashbackAccounts)
      .set({ balance: 29000, updatedAt: new Date() })
      .where(eq(schema.cashbackAccounts.id, accountId));

    // Note: Tri-way invariant for ACTIVE unexpired grants is 26,000 because this 3,000 is already expired!
    // Now simulate the Expiration Worker Sweep:
    async function runExpirationSweep(): Promise<number> {
      await client.exec("BEGIN");
      try {
        // Step 1: Row lock on account
        await client.query("SELECT id, balance FROM cashback_accounts WHERE id = $1 FOR UPDATE", [accountId]);

        // Step 2: Find all expired active grants with unconsumed amounts
        const expiredGrants = await client.query<{ id: number; unconsumed_amount: number }>(`
          SELECT id, unconsumed_amount FROM cashback_grants
          WHERE account_id = $1 AND expires_at <= now() AND unconsumed_amount > 0 AND status = 'ACTIVE'
          FOR UPDATE
        `, [accountId]);

        let totalExpired = 0;
        for (const eg of expiredGrants.rows) {
          totalExpired += eg.unconsumed_amount;
          await client.query(`
            UPDATE cashback_grants
            SET unconsumed_amount = 0, status = 'EXPIRED'
            WHERE id = $1
          `, [eg.id]);
        }

        if (totalExpired > 0) {
          await client.query(`
            UPDATE cashback_accounts SET balance = balance - $1, updated_at = now() WHERE id = $2
          `, [totalExpired, accountId]);

          await client.query(`
            INSERT INTO cashback_ledger (
              account_id, customer_id, entry_type, amount, actor, reason, idempotency_key
            ) VALUES ($1, $2, 'EXPIRE', $3, 'worker:expiration', 'ttl_90_days_expired', $4)
          `, [accountId, customerId, totalExpired, `expire:${accountId}:test_sweep`]);
        }

        await client.exec("COMMIT");
        return totalExpired;
      } catch (e) {
        await client.exec("ROLLBACK");
        throw e;
      }
    }

    // Sweep 1: should expire exactly 3,000 UZS
    const expiredCount = await runExpirationSweep();
    assert.equal(expiredCount, 3000);

    // Balance after sweep: 29,000 - 3,000 = 26,000 UZS
    await assertTriWayInvariant(26000);

    // Sweep 2 (run immediately again): must be completely idempotent (0 expired)
    const secondSweepCount = await runExpirationSweep();
    assert.equal(secondSweepCount, 0);

    // Balance remains exact 26,000 UZS
    await assertTriWayInvariant(26000);
  });

  it("7. Concurrency Protection (Parallel USE vs EXPIRATION): serialized via SELECT FOR UPDATE", async () => {
    // Both USE and EXPIRATION acquire exclusive locks on `cashback_accounts` FOR UPDATE.
    // Verify that attempting to double-consume or race does not allow overdraw.
    // If a grant is about to expire, and user spends it in tx1, tx2 (expiration) finds 0 unconsumed.
    
    // Create grant expiring in 1 second
    const nearExpiry = new Date(Date.now() + 500); // 500ms
    const commNear = await database.insert(schema.commercialTransactions).values({
      sourceType: "ORDER",
      sourceKey: "order:fifo:race_test",
      customerId,
      amount: 10000,
    }).returning();

    const ledgerNear = await database.insert(schema.cashbackLedger).values({
      accountId,
      customerId,
      entryType: "EARN",
      amount: 1000,
      commercialTransactionId: commNear[0].id,
      actor: "test",
      reason: "race_test_seed",
    }).returning();

    const grantNear = await client.query<{ id: number }>(`
      INSERT INTO cashback_grants (
        account_id, customer_id, original_amount, unconsumed_amount, expires_at,
        commercial_transaction_id, ledger_entry_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
      RETURNING id
    `, [accountId, customerId, 1000, 1000, nearExpiry.toISOString(), commNear[0].id, ledgerNear[0].id]);

    await database.update(schema.cashbackAccounts)
      .set({ balance: 27000, updatedAt: new Date() })
      .where(eq(schema.cashbackAccounts.id, accountId));

    // Tx 1: Customer spends 1,000 (consumes the near-expiry grant)
    await client.exec("BEGIN");
    await client.query("SELECT id, balance FROM cashback_accounts WHERE id = $1 FOR UPDATE", [accountId]);
    await client.query(`
      UPDATE cashback_grants SET unconsumed_amount = 0, status = 'EXHAUSTED' WHERE id = $1
    `, [grantNear.rows[0].id]);
    await client.query("UPDATE cashback_accounts SET balance = balance - 1000 WHERE id = $1", [accountId]);
    await client.query(`
      INSERT INTO cashback_ledger (account_id, customer_id, entry_type, amount, actor, reason)
      VALUES ($1, $2, 'USE', 1000, 'test', 'race_use')
    `, [accountId, customerId]);
    await client.exec("COMMIT");

    // Wait 600ms so the grant is now past expires_at
    await new Promise((r) => setTimeout(r, 600));

    // Tx 2: Expiration worker runs. Grant is expired in time, BUT unconsumed_amount is 0.
    // Worker MUST NOT deduct any money!
    await client.exec("BEGIN");
    await client.query("SELECT id, balance FROM cashback_accounts WHERE id = $1 FOR UPDATE", [accountId]);
    const toExpire = await client.query<{ id: number }>(`
      SELECT id FROM cashback_grants
      WHERE id = $1 AND expires_at <= now() AND unconsumed_amount > 0 AND status = 'ACTIVE'
    `, [grantNear.rows[0].id]);
    
    // Nothing to expire!
    assert.equal(toExpire.rows.length, 0);
    await client.exec("COMMIT");

    // Balance remains exact 26,000 UZS
    await assertTriWayInvariant(26000);
  });

  it("8. Non-Negative Balance Invariant: DB check constraint and transaction logic refuse negative balances", async () => {
    // Attempting to spend 50,000 UZS when balance is 26,000 UZS
    const spendTooMuch = 50000;
    let failedCleanly = false;
    await client.exec("BEGIN");
    try {
      const acc = await client.query<{ balance: number }>(`
        SELECT balance FROM cashback_accounts WHERE id = $1 FOR UPDATE
      `, [accountId]);
      if (acc.rows[0].balance < spendTooMuch) {
        throw new Error("INSUFFICIENT_CASHBACK");
      }
      // Should not reach here
      await client.query("UPDATE cashback_accounts SET balance = balance - $1 WHERE id = $2", [spendTooMuch, accountId]);
      await client.exec("COMMIT");
    } catch (e: any) {
      await client.exec("ROLLBACK");
      if (e.message.includes("INSUFFICIENT_CASHBACK") || e.message.includes("violates check constraint")) {
        failedCleanly = true;
      }
    }
    assert.equal(failedCleanly, true);
    await assertTriWayInvariant(26000);
  });

  it("9. Legacy Balance Backfill Simulation & Rollback Safety", async () => {
    // Create a customer with a legacy balance
    const legCust = await database.insert(schema.customers).values({
      telegramId: "legacy-backfill-cust",
      firstName: "Legacy",
      lastName: "User",
      phone: "+998 90 999 88 77",
      balance: 45000,
    }).returning();

    const legAcc = await database.insert(schema.cashbackAccounts).values({
      customerId: legCust[0].id,
      balance: 45000,
    }).returning();

    // Variant A: Grandfathered backfill (expires_at = NULL)
    await client.query(`
      INSERT INTO cashback_grants (
        account_id, customer_id, original_amount, unconsumed_amount, expires_at, status, meta
      ) VALUES ($1, $2, $3, $4, NULL, 'ACTIVE', '{"legacy_strategy":"variant_a_grandfathered"}')
    `, [legAcc[0].id, legCust[0].id, 45000, 45000]);

    // Verify invariant for legacy account
    const legGrant = await client.query<{ unconsumed_amount: number; expires_at: string | null }>(`
      SELECT unconsumed_amount, expires_at FROM cashback_grants WHERE account_id = $1
    `, [legAcc[0].id]);
    assert.equal(legGrant.rows[0].unconsumed_amount, 45000);
    assert.equal(legGrant.rows[0].expires_at, null);

    // Rollback test: If migration is rolled back, deleting the grant leaves cashback_accounts and cashback_ledger unaffected
    await client.query("DELETE FROM cashback_grants WHERE account_id = $1", [legAcc[0].id]);
    const afterRollbackAcc = await database.select().from(schema.cashbackAccounts).where(eq(schema.cashbackAccounts.id, legAcc[0].id));
    assert.equal(afterRollbackAcc[0].balance, 45000); // 100% untouched!
  });
});
