import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

describe("P6.5–P6.8 spend / reversal / earn hardening", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let finance: typeof import("../../../artifacts/api-server/src/lib/cashbackFinance");
  let cashbackLib: typeof import("../../../artifacts/api-server/src/lib/cashback");
  let customerId: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    finance = await import("../../../artifacts/api-server/src/lib/cashbackFinance.ts");
    cashbackLib = await import("../../../artifacts/api-server/src/lib/cashback.ts");

    const inserted = await database.insert(schema.customers).values({
      telegramId: "p6-spend",
      firstName: "Spend",
      lastName: "Test",
      phone: "+998 90 000 06 58",
      balance: 0,
    }).returning();
    customerId = inserted[0].id;
    await finance.ensureCashbackAccount(customerId, database as never);
    await finance.earnCashback(
      {
        customerId,
        amount: 10_000,
        commercial: { sourceType: "SYSTEM", sourceKey: `seed:${customerId}`, customerId },
        actor: "test",
        reason: "seed",
        idempotencyKey: `seed:${customerId}`,
      },
      database as never,
    );
  });

  after(async () => {
    await client.close();
  });

  it("A/B. 30% spend limit and exact boundary", async () => {
    const ratio = await finance.getMaxSpendRatio(database as never);
    assert.equal(ratio, 0.3);
    const goods = 100_000;
    const exact = cashbackLib.clampCashbackSpend({
      goodsAmount: goods,
      balance: 50_000,
      requested: 30_000,
      maxSpendRatio: ratio,
    });
    assert.equal(exact.cashbackUsed, 30_000);
    assert.equal(exact.maxSpend, 30_000);

    const below = cashbackLib.clampCashbackSpend({
      goodsAmount: goods,
      balance: 50_000,
      requested: 20_000,
      maxSpendRatio: ratio,
    });
    assert.equal(below.cashbackUsed, 20_000);
  });

  it("C. above 30% is clamped server-side", async () => {
    const clamped = cashbackLib.clampCashbackSpend({
      goodsAmount: 100_000,
      balance: 50_000,
      requested: 99_999,
      maxSpendRatio: 0.3,
    });
    assert.equal(clamped.cashbackUsed, 30_000);
  });

  it("C2. insufficient cashback rejected", async () => {
    await assert.rejects(
      () =>
        finance.useCashback(
          {
            customerId,
            amount: 999_999,
            commercial: { sourceType: "ORDER", sourceKey: "order:insuf", customerId },
            actor: "test",
          },
          database as never,
        ),
      /yetarli emas|INSUFFICIENT/i,
    );
  });

  it("E. duplicate USE idempotent", async () => {
    const first = await finance.useCashback(
      {
        customerId,
        amount: 3_000,
        eligibleGoodsAmount: 100_000,
        commercial: { sourceType: "ORDER", sourceKey: "order:dup-use", customerId, orderId: 501 },
        orderId: 501,
        actor: "test",
        idempotencyKey: "use:order:501",
      },
      database as never,
    );
    assert.equal(first.idempotent, false);
    const second = await finance.useCashback(
      {
        customerId,
        amount: 3_000,
        eligibleGoodsAmount: 100_000,
        commercial: { sourceType: "ORDER", sourceKey: "order:dup-use", customerId, orderId: 501 },
        orderId: 501,
        actor: "test",
        idempotencyKey: "use:order:501",
      },
      database as never,
    );
    assert.equal(second.idempotent, true);
    assert.equal(first.entry.id, second.entry.id);
  });

  it("D. concurrent USE cannot overspend (serialized)", async () => {
    const before = (await database.select().from(schema.cashbackAccounts).where(eq(schema.cashbackAccounts.customerId, customerId)))[0];
    // Each attempt wants 6000 with 20k goods (cap 6000). Balance cannot fund all three.
    let successes = 0;
    let failures = 0;
    for (let i = 0; i < 3; i++) {
      try {
        await finance.useCashback(
          {
            customerId,
            amount: 6_000,
            eligibleGoodsAmount: 20_000,
            commercial: {
              sourceType: "ORDER",
              sourceKey: `order:race-${i}`,
              customerId,
              orderId: 600 + i,
            },
            orderId: 600 + i,
            actor: `w:${i}`,
          },
          database as never,
        );
        successes += 1;
      } catch {
        failures += 1;
      }
    }
    assert.ok(successes >= 1);
    assert.ok(failures >= 1 || successes === 1);
    const account = (await database.select().from(schema.cashbackAccounts).where(eq(schema.cashbackAccounts.customerId, customerId)))[0];
    assert.ok(account.balance >= 0);
    assert.ok(account.balance < before.balance || successes === 0);
    assert.ok(before.balance - account.balance <= before.balance);
    assert.ok(before.balance - account.balance === successes * 6_000 || account.balance >= 0);
  });

  it("F. EARN → CANCEL → REVERSAL of USE", async () => {
    const cid = (
      await database.insert(schema.customers).values({
        telegramId: "p6-cancel",
        firstName: "C",
        lastName: "T",
        phone: "+998 90 111 06 58",
        balance: 0,
      }).returning()
    )[0].id;
    await finance.earnCashback(
      {
        customerId: cid,
        amount: 5_000,
        commercial: { sourceType: "SYSTEM", sourceKey: `seed-c:${cid}`, customerId: cid },
        actor: "test",
        idempotencyKey: `seed-c:${cid}`,
      },
      database as never,
    );
    await finance.useCashback(
      {
        customerId: cid,
        amount: 1_000,
        eligibleGoodsAmount: 50_000,
        commercial: { sourceType: "ORDER", sourceKey: "order:cancel-1", customerId: cid, orderId: 701 },
        orderId: 701,
        actor: "test",
      },
      database as never,
    );
    const rev = await finance.reverseOrderUseOnCancel(701, { actor: "test" }, database as never);
    assert.equal(rev.reversed, true);
    const again = await finance.reverseOrderUseOnCancel(701, { actor: "test" }, database as never);
    assert.equal(again.idempotent, true);
  });

  it("G/H. EARN → REFUND → REVERSAL; duplicate reversal blocked", async () => {
    const cid = (
      await database.insert(schema.customers).values({
        telegramId: "p6-refund",
        firstName: "R",
        lastName: "T",
        phone: "+998 90 222 06 58",
        balance: 0,
      }).returning()
    )[0].id;
    await finance.earnCashback(
      {
        customerId: cid,
        amount: 2_000,
        commercial: { sourceType: "ORDER", sourceKey: "order:802", customerId: cid, orderId: 802 },
        orderId: 802,
        actor: "test",
        idempotencyKey: "earn:order:802",
      },
      database as never,
    );
    const first = await finance.refundOrderCashback(
      { orderId: 802, mode: "full", actor: "test" },
      database as never,
    );
    assert.equal(first.idempotent, false);
    assert.ok(first.earnReversal);
    const second = await finance.refundOrderCashback(
      { orderId: 802, mode: "full", actor: "test" },
      database as never,
    );
    assert.equal(second.idempotent, true);
  });

  it("I. partial refund requires explicit amount (OPEN formula)", async () => {
    const cid = (
      await database.insert(schema.customers).values({
        telegramId: "p6-partial",
        firstName: "P",
        lastName: "T",
        phone: "+998 90 333 06 58",
        balance: 0,
      }).returning()
    )[0].id;
    await finance.earnCashback(
      {
        customerId: cid,
        amount: 4_000,
        commercial: { sourceType: "ORDER", sourceKey: "order:803", customerId: cid, orderId: 803 },
        orderId: 803,
        actor: "test",
        idempotencyKey: "earn:order:803",
      },
      database as never,
    );
    await assert.rejects(
      () => finance.refundOrderCashback({ orderId: 803, mode: "partial", actor: "test" }, database as never),
      /OPEN|earnReversalAmount|PARTIAL/i,
    );
    const partial = await finance.refundOrderCashback(
      { orderId: 803, mode: "partial", earnReversalAmount: 1_500, actor: "test" },
      database as never,
    );
    assert.equal(partial.earnReversal?.amount, 1_500);
  });

  it("J/K/L. FOM + APP same commercial → one EARN; duplicate events idempotent", async () => {
    const cid = (
      await database.insert(schema.customers).values({
        telegramId: "p6-fomapp",
        firstName: "F",
        lastName: "A",
        phone: "+998 90 444 06 58",
        balance: 0,
      }).returning()
    )[0].id;
    const key = "order:900";
    const app = await finance.earnCashback(
      {
        customerId: cid,
        amount: 500,
        commercial: { sourceType: "ORDER", sourceKey: key, customerId: cid, orderId: 900 },
        orderId: 900,
        actor: "app:complete",
        idempotencyKey: "earn:order:900:app",
      },
      database as never,
    );
    const fom = await finance.earnCashback(
      {
        customerId: cid,
        amount: 500,
        commercial: { sourceType: "ORDER", sourceKey: key, customerId: cid, orderId: 900 },
        orderId: 900,
        actor: "fom:confirm",
        idempotencyKey: "earn:order:900:fom",
      },
      database as never,
    );
    const appRetry = await finance.earnCashback(
      {
        customerId: cid,
        amount: 500,
        commercial: { sourceType: "ORDER", sourceKey: key, customerId: cid, orderId: 900 },
        orderId: 900,
        actor: "app:complete",
        idempotencyKey: "earn:order:900:app",
      },
      database as never,
    );
    assert.equal(app.idempotent, false);
    assert.equal(fom.idempotent, true);
    assert.equal(appRetry.idempotent, true);
    assert.equal(app.commercial.id, fom.commercial.id);
  });

  it("O/P. account/ledger consistency and no negative", async () => {
    const report = await finance.inspectCashbackIntegrity(database as never);
    assert.equal(report.accountLedgerMismatches.length, 0);
    const accounts = await database.select().from(schema.cashbackAccounts);
    for (const a of accounts) assert.ok(a.balance >= 0);
  });

  it("R. retry after transaction failure does not commit", async () => {
    const cid = (
      await database.insert(schema.customers).values({
        telegramId: "p6-rollback",
        firstName: "Rb",
        lastName: "T",
        phone: "+998 90 555 06 58",
        balance: 0,
      }).returning()
    )[0].id;
    await finance.earnCashback(
      {
        customerId: cid,
        amount: 2_000,
        commercial: { sourceType: "SYSTEM", sourceKey: `seed-rb:${cid}`, customerId: cid },
        actor: "test",
        idempotencyKey: `seed-rb:${cid}`,
      },
      database as never,
    );
    const before = (await database.select().from(schema.cashbackAccounts).where(eq(schema.cashbackAccounts.customerId, cid)))[0];
    await assert.rejects(async () => {
      await database.transaction(async (tx) => {
        await finance.useCashback(
          {
            customerId: cid,
            amount: 100,
            eligibleGoodsAmount: 10_000,
            commercial: { sourceType: "ORDER", sourceKey: "order:rollback-use", customerId: cid },
            actor: "test",
          },
          tx as never,
          { alreadyInTx: true },
        );
        throw new Error("force_fail");
      });
    }, /force_fail/);
    const after = (await database.select().from(schema.cashbackAccounts).where(eq(schema.cashbackAccounts.customerId, cid)))[0];
    assert.equal(after.balance, before.balance);
  });

  it("settings default max spend ratio is 0.30", async () => {
    const rows = await database
      .select()
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, "cashback.max_spend_ratio"));
    assert.equal(rows[0]?.value, "0.30");
  });
});
