/**
 * Ops hardening — read-only integrity checker behavior (MATCH / DRIFT / never auto-repair).
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

describe("Cashback integrity ops hardening", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let earnCashback: typeof import("../../../artifacts/api-server/src/lib/cashbackFinance").earnCashback;
  let runCashbackIntegrityCheck: typeof import("../../../artifacts/api-server/src/lib/cashbackIntegrity").runCashbackIntegrityCheck;
  let customerId: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());

    const finance = await import("../../../artifacts/api-server/src/lib/cashbackFinance.ts");
    const integrity = await import("../../../artifacts/api-server/src/lib/cashbackIntegrity.ts");
    earnCashback = finance.earnCashback;
    runCashbackIntegrityCheck = integrity.runCashbackIntegrityCheck;

    const inserted = await database.insert(schema.customers).values({
      telegramId: "ops-integrity",
      firstName: "Ops",
      lastName: "Integrity",
      phone: "+998 90 000 00 99",
      balance: 0,
    }).returning();
    customerId = inserted[0].id;
  });

  after(async () => {
    await client.close();
  });

  it("C. integrity MATCH when ledger net equals account balance", async () => {
    await earnCashback(
      {
        customerId,
        amount: 500,
        commercial: {
          sourceType: "SYSTEM",
          sourceKey: `ops-match:${customerId}`,
          customerId,
          amount: 500,
        },
        actor: "test",
        reason: "ops_match",
        idempotencyKey: `ops-match:${customerId}`,
      },
      database as never,
    );

    const report = await runCashbackIntegrityCheck(database as never, { emitAlerts: false });
    assert.equal(report.status, "MATCH");
    assert.equal(report.driftCount, 0);
    assert.equal(report.autoRepaired, false);
    assert.ok(report.matchCount >= 1);
  });

  it("D/E. integrity DRIFT detected and never auto-repairs", async () => {
    const before = (
      await database
        .select()
        .from(schema.cashbackAccounts)
        .where(eq(schema.cashbackAccounts.customerId, customerId))
    )[0];
    assert.ok(before);

    // Force drift without going through engine (simulates corruption / bad write).
    await database
      .update(schema.cashbackAccounts)
      .set({ balance: before.balance + 777 })
      .where(eq(schema.cashbackAccounts.id, before.id));

    const report = await runCashbackIntegrityCheck(database as never, { emitAlerts: false });
    assert.equal(report.status, "DRIFT");
    assert.ok(report.driftCount >= 1);
    assert.equal(report.autoRepaired, false);
    assert.ok(report.drifts.some((d) => d.customerId === customerId));

    const after = (
      await database
        .select()
        .from(schema.cashbackAccounts)
        .where(eq(schema.cashbackAccounts.customerId, customerId))
    )[0];
    // Checker must not have rewritten the drifted balance back.
    assert.equal(after.balance, before.balance + 777);

    // Restore for cleanliness (manual — not the checker).
    await database
      .update(schema.cashbackAccounts)
      .set({ balance: before.balance })
      .where(eq(schema.cashbackAccounts.id, before.id));
    await database
      .update(schema.customers)
      .set({ balance: before.balance })
      .where(eq(schema.customers.id, customerId));

    // Silence unused sql import if tree-shaken — keep for future raw checks.
    void sql;
  });
});
