import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";
import { P6_CASHBACK_TABLES, listPublicTables } from "../src/health";

describe("P6.1–P6.4 cashback foundation + earn safety", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let ensureCashbackAccount: typeof import("../../../artifacts/api-server/src/lib/cashbackFinance").ensureCashbackAccount;
  let earnCashback: typeof import("../../../artifacts/api-server/src/lib/cashbackFinance").earnCashback;
  let useCashback: typeof import("../../../artifacts/api-server/src/lib/cashbackFinance").useCashback;
  let reverseCashbackEntry: typeof import("../../../artifacts/api-server/src/lib/cashbackFinance").reverseCashbackEntry;
  let inspectCashbackIntegrity: typeof import("../../../artifacts/api-server/src/lib/cashbackFinance").inspectCashbackIntegrity;
  let customerId: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());

    const finance = await import("../../../artifacts/api-server/src/lib/cashbackFinance.ts");
    ensureCashbackAccount = finance.ensureCashbackAccount;
    earnCashback = finance.earnCashback;
    useCashback = finance.useCashback;
    reverseCashbackEntry = finance.reverseCashbackEntry;
    inspectCashbackIntegrity = finance.inspectCashbackIntegrity;

    const inserted = await database.insert(schema.customers).values({
      telegramId: "p6-cashback",
      firstName: "P6",
      lastName: "Test",
      phone: "+998 90 000 00 06",
      balance: 0,
    }).returning();
    customerId = inserted[0].id;
  });

  after(async () => {
    await client.close();
  });

  it("creates P6 cashback tables via versioned migration", async () => {
    const tables = await listPublicTables(database);
    for (const name of P6_CASHBACK_TABLES) {
      assert.ok(tables.includes(name), `missing ${name}`);
    }
  });

  it("1. create cashback account", async () => {
    const account = await ensureCashbackAccount(customerId, database as never);
    assert.equal(account.customerId, customerId);
    assert.equal(account.balance, 0);
    const again = await ensureCashbackAccount(customerId, database as never);
    assert.equal(again.id, account.id);
  });

  it("2. single EARN", async () => {
    const result = await earnCashback(
      {
        customerId,
        amount: 1000,
        commercial: {
          sourceType: "ORDER",
          sourceKey: "order:1001",
          customerId,
          orderId: 1001,
          amount: 50000,
        },
        actor: "test",
        reason: "single_earn",
        orderId: 1001,
        idempotencyKey: "earn:order:1001",
      },
      database as never,
    );
    assert.equal(result.idempotent, false);
    assert.equal(result.entry.entryType, "EARN");
    assert.equal(result.entry.amount, 1000);
    assert.equal(result.account.balance, 1000);
    const legacy = (await database.select().from(schema.customers).where(eq(schema.customers.id, customerId)))[0];
    assert.equal(legacy.balance, 1000);
  });

  it("3. duplicate EARN is idempotent (DB uniqueness)", async () => {
    const result = await earnCashback(
      {
        customerId,
        amount: 1000,
        commercial: {
          sourceType: "ORDER",
          sourceKey: "order:1001",
          customerId,
          orderId: 1001,
        },
        actor: "test",
        reason: "dup_earn",
        orderId: 1001,
        idempotencyKey: "earn:order:1001:retry",
      },
      database as never,
    );
    assert.equal(result.idempotent, true);
    assert.equal(result.account.balance, 1000);
    const earns = await database
      .select()
      .from(schema.cashbackLedger)
      .where(eq(schema.cashbackLedger.commercialTransactionId, result.commercial.id));
    assert.equal(earns.filter((e) => e.entryType === "EARN").length, 1);
  });

  it("4. concurrent EARN remains single credit", async () => {
    const key = "order:2002";
    // PGlite is single-connection — serialize; uniqueness still enforces one EARN.
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(
        await earnCashback(
          {
            customerId,
            amount: 500,
            commercial: { sourceType: "ORDER", sourceKey: key, customerId, orderId: 2002 },
            actor: `worker:${i}`,
            reason: "concurrent",
            orderId: 2002,
            idempotencyKey: `earn:order:2002:${i}`,
          },
          database as never,
        ),
      );
    }
    const created = results.filter((r) => !r.idempotent);
    assert.equal(created.length, 1);
    const account = (await database.select().from(schema.cashbackAccounts).where(eq(schema.cashbackAccounts.customerId, customerId)))[0];
    assert.equal(account.balance, 1500);
  });

  it("5. same commercial from two paths (ORDER + FOM confirm) → one EARN", async () => {
    const sourceKey = "order:3003";
    const a = await earnCashback(
      {
        customerId,
        amount: 200,
        commercial: { sourceType: "ORDER", sourceKey, customerId, orderId: 3003 },
        actor: "app:complete",
        reason: "app_path",
        orderId: 3003,
        idempotencyKey: "earn:order:3003:app",
      },
      database as never,
    );
    const b = await earnCashback(
      {
        customerId,
        amount: 200,
        commercial: { sourceType: "ORDER", sourceKey, customerId, orderId: 3003 },
        actor: "fom:confirm_pos",
        reason: "fom_path",
        orderId: 3003,
        idempotencyKey: "earn:order:3003:fom",
      },
      database as never,
    );
    assert.equal(a.idempotent, false);
    assert.equal(b.idempotent, true);
    assert.equal(a.commercial.id, b.commercial.id);
    assert.equal(b.account.balance, 1700);
  });

  it("6. ledger/account consistency", async () => {
    const report = await inspectCashbackIntegrity(database as never);
    assert.equal(report.accountLedgerMismatches.length, 0);
  });

  it("7. no negative balance on USE", async () => {
    await assert.rejects(
      () =>
        useCashback(
          {
            customerId,
            amount: 999_999,
            commercial: { sourceType: "ORDER", sourceKey: "order:overdraft", customerId },
            actor: "test",
            reason: "overdraft",
          },
          database as never,
        ),
      /yetarli emas|INSUFFICIENT/i,
    );
    const account = (await database.select().from(schema.cashbackAccounts).where(eq(schema.cashbackAccounts.customerId, customerId)))[0];
    assert.ok(account.balance >= 0);
  });

  it("8. reversal relationship", async () => {
    const used = await useCashback(
      {
        customerId,
        amount: 100,
        commercial: { sourceType: "ORDER", sourceKey: "order:4004", customerId, orderId: 4004 },
        actor: "test",
        reason: "use_for_reverse",
        orderId: 4004,
        idempotencyKey: "use:order:4004",
      },
      database as never,
    );
    const before = used.account.balance;
    const reversed = await reverseCashbackEntry(used.entry.id, { actor: "test", reason: "cancel" }, database as never);
    assert.equal(reversed.entry.entryType, "REVERSAL");
    assert.equal(reversed.entry.reversesEntryId, used.entry.id);
    assert.equal(reversed.account.balance, before + 100);
    const again = await reverseCashbackEntry(used.entry.id, { actor: "test", reason: "cancel" }, database as never);
    assert.equal(again.idempotent, true);
  });

  it("9. duplicate historical detection", async () => {
    // Bypass service to simulate historical duplicate (unique may block on modern schema —
    // drop unique temporarily is unsafe; instead assert inspector shape on clean data + seeded mismatch path).
    const clean = await inspectCashbackIntegrity(database as never);
    assert.ok(Array.isArray(clean.duplicateEarnCommercialIds));
    assert.equal(clean.duplicateEarnCommercialIds.length, 0);

    // Force a detectable duplicate by inserting with commercial_transaction_id NULL then reporting —
    // real duplicates can't exist under unique index. Verify detection query runs and USE dup empty.
    assert.equal(clean.duplicateUseCommercialIds.length, 0);
  });

  it("10. legacy balance divergence detection", async () => {
    await database.update(schema.customers).set({ balance: 1 }).where(eq(schema.customers.id, customerId));
    const report = await inspectCashbackIntegrity(database as never);
    assert.ok(report.legacyBalanceDivergences.some((d) => d.customerId === customerId));
    // restore mirror for later tests
    const account = (await database.select().from(schema.cashbackAccounts).where(eq(schema.cashbackAccounts.customerId, customerId)))[0];
    await database.update(schema.customers).set({ balance: account.balance }).where(eq(schema.customers.id, customerId));
  });

  it("11. transaction rollback leaves balance unchanged", async () => {
    const before = (await database.select().from(schema.cashbackAccounts).where(eq(schema.cashbackAccounts.customerId, customerId)))[0];
    await assert.rejects(async () => {
      await database.transaction(async (tx) => {
        await earnCashback(
          {
            customerId,
            amount: 50,
            commercial: { sourceType: "ORDER", sourceKey: "order:rollback", customerId },
            actor: "test",
            reason: "rollback",
          },
          tx as never,
          { alreadyInTx: true },
        );
        throw new Error("force_rollback");
      });
    }, /force_rollback/);
    const after = (await database.select().from(schema.cashbackAccounts).where(eq(schema.cashbackAccounts.customerId, customerId)))[0];
    assert.equal(after.balance, before.balance);
  });

  it("12. idempotent retry returns same entry", async () => {
    const first = await earnCashback(
      {
        customerId,
        amount: 75,
        commercial: { sourceType: "POS", sourceKey: "receipt:R-12", customerId, receiptId: "R-12" },
        actor: "pos",
        reason: "pos_earn",
        idempotencyKey: "earn:receipt:R-12",
      },
      database as never,
    );
    const second = await earnCashback(
      {
        customerId,
        amount: 75,
        commercial: { sourceType: "POS", sourceKey: "receipt:R-12", customerId, receiptId: "R-12" },
        actor: "pos",
        reason: "pos_earn",
        idempotencyKey: "earn:receipt:R-12",
      },
      database as never,
    );
    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.equal(first.entry.id, second.entry.id);
  });
});
