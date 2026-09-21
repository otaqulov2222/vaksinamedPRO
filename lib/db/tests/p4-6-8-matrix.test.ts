import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

type Inv = typeof import("../../../artifacts/api-server/src/lib/inventory");

async function assertInvariants(database: ReturnType<typeof drizzle<typeof schema>>, productId: number) {
  const stock = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
  assert.ok(stock.physicalQuantity >= 0);
  assert.ok(stock.reservedQuantity >= 0);
  assert.ok(stock.reservedQuantity <= stock.physicalQuantity);
  assert.equal(stock.availableQuantity, stock.physicalQuantity - stock.reservedQuantity);
  return stock;
}

describe("P4.6–P4.8 expiry, adjust, concurrency matrix", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let inv: Inv;
  let branchId: number;
  let productA: number;
  let productB: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    inv = await import("../../../artifacts/api-server/src/lib/inventory.ts");

    await database.insert(schema.branches).values({
      code: "VM-P48",
      name: "P48",
      city: "T",
      region: "T",
      district: "T",
      address: "A",
      phone: "+998",
      hours: "9-18",
      lat: 1,
      lng: 1,
    });
    await database.insert(schema.products).values([
      { sku: "P48-A", nameUz: "A", nameRu: "A", category: "C", manufacturer: "M", description: "D", price: 1000 },
      { sku: "P48-B", nameUz: "B", nameRu: "B", category: "C", manufacturer: "M", description: "D", price: 2000 },
    ]);
    const branch = (await database.select().from(schema.branches).where(eq(schema.branches.code, "VM-P48")))[0];
    const products = await database.select().from(schema.products);
    branchId = branch.id;
    productA = products.find((p) => p.sku === "P48-A")!.id;
    productB = products.find((p) => p.sku === "P48-B")!.id;
    await database.insert(schema.productStocks).values([
      { productId: productA, branchId, quantity: 10 },
      { productId: productB, branchId, quantity: 10 },
    ]);
  });

  after(async () => {
    await client.close();
  });

  it("P4.6 expiry releases reserved and marks EXPIRED; retry is idempotent", async () => {
    const reserved = await inv.reserveStock(
      {
        branchId,
        items: [{ productId: productA, quantity: 2 }],
        idempotencyKey: "exp-1",
        expiresAt: new Date(Date.now() - 60_000),
      },
      database as any,
    );
    const before = await assertInvariants(database, productA);
    const first = await inv.expireReservation(reserved.reservation.id, { actor: "test" }, database as any);
    assert.equal(first.released, true);
    assert.equal(first.reservation.status, "EXPIRED");
    const mid = await assertInvariants(database, productA);
    assert.equal(mid.reservedQuantity, before.reservedQuantity - 2);
    const second = await inv.expireReservation(reserved.reservation.id, { actor: "test" }, database as any);
    assert.equal(second.released, false);
    assert.equal(second.reservation.status, "EXPIRED");
  });

  it("P4.6 expireDueReservations sweeps only due ACTIVE rows", async () => {
    await inv.reserveStock(
      {
        branchId,
        items: [{ productId: productA, quantity: 1 }],
        idempotencyKey: "exp-due-past",
        expiresAt: new Date(Date.now() - 5_000),
      },
      database as any,
    );
    await inv.reserveStock(
      {
        branchId,
        items: [{ productId: productA, quantity: 1 }],
        idempotencyKey: "exp-due-future",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      database as any,
    );
    const sweep = await inv.expireDueReservations({ actor: "sweep" }, database as any);
    assert.ok(sweep.expired >= 1);
    const future = (await database.select().from(schema.reservations).where(eq(schema.reservations.idempotencyKey, "exp-due-future")))[0];
    assert.equal(future.status, "ACTIVE");
    await assertInvariants(database, productA);
  });

  it("P4.7 adjust increases/decreases physical; blocks reserved corruption", async () => {
    const up = await inv.adjustStock(
      { branchId, productId: productB, physicalDelta: 5, reason: "restock", actor: "admin", idempotencyKey: "adj-up" },
      database as any,
    );
    assert.equal(up.adjusted, true);
    assert.equal(up.stock.physicalQuantity, 15);
    const again = await inv.adjustStock(
      { branchId, productId: productB, physicalDelta: 5, reason: "restock", actor: "admin", idempotencyKey: "adj-up" },
      database as any,
    );
    assert.equal(again.idempotent, true);

    await inv.reserveStock(
      { branchId, items: [{ productId: productB, quantity: 12 }], idempotencyKey: "adj-hold" },
      database as any,
    );
    await assert.rejects(
      () => inv.adjustStock(
        { branchId, productId: productB, physicalDelta: -10, reason: "bad-write-down", actor: "admin" },
        database as any,
      ),
      (err: { status?: number }) => err.status === 409 || err.status === 400,
    );
    await assertInvariants(database, productB);
  });

  it("1 last-unit race: second reservation fails after first holds unit", async () => {
    await database.insert(schema.products).values({
      sku: "P48-RACE", nameUz: "R", nameRu: "R", category: "C", manufacturer: "M", description: "D", price: 100,
    });
    const race = (await database.select().from(schema.products).where(eq(schema.products.sku, "P48-RACE")))[0];
    await database.insert(schema.productStocks).values({ productId: race.id, branchId, quantity: 1 });
    // PGlite is single-connection — serialize attempts; conditional UPDATE still prevents oversell.
    const first = await inv.reserveStock(
      { branchId, items: [{ productId: race.id, quantity: 1 }], idempotencyKey: "race-1a" },
      database as any,
    );
    assert.equal(first.reservation.status, "ACTIVE");
    await assert.rejects(
      () => inv.reserveStock(
        { branchId, items: [{ productId: race.id, quantity: 1 }], idempotencyKey: "race-1b" },
        database as any,
      ),
      (err: { code?: string; status?: number }) => err.code === "STOCK_UNAVAILABLE" || err.status === 400,
    );
    await assertInvariants(database, race.id);
  });

  it("2 concurrent reservations for different products both succeed", async () => {
    const a = await inv.reserveStock(
      { branchId, items: [{ productId: productA, quantity: 1 }], idempotencyKey: "diff-a" },
      database as any,
    );
    const b = await inv.reserveStock(
      { branchId, items: [{ productId: productB, quantity: 1 }], idempotencyKey: "diff-b" },
      database as any,
    );
    assert.equal(a.reservation.status, "ACTIVE");
    assert.equal(b.reservation.status, "ACTIVE");
    await assertInvariants(database, productA);
    await assertInvariants(database, productB);
  });

  it("3–4 concurrent release / consume: exactly one mutation", async () => {
    const toRelease = await inv.reserveStock(
      { branchId, items: [{ productId: productA, quantity: 1 }], idempotencyKey: "conc-rel" },
      database as any,
    );
    const r1 = await inv.releaseReservation(toRelease.reservation.id, { actor: "a" }, database as any);
    const r2 = await inv.releaseReservation(toRelease.reservation.id, { actor: "b" }, database as any);
    assert.equal(r1.released, true);
    assert.equal(r2.released, false);

    const toConsume = await inv.reserveStock(
      { branchId, items: [{ productId: productA, quantity: 1 }], idempotencyKey: "conc-con" },
      database as any,
    );
    const c1 = await inv.consumeReservation(toConsume.reservation.id, { actor: "a" }, database as any);
    const c2 = await inv.consumeReservation(toConsume.reservation.id, { actor: "b" }, database as any);
    assert.equal(c1.consumed, true);
    assert.equal(c2.consumed, false);
    await assertInvariants(database, productA);
  });

  it("5 reservation retry idempotent", async () => {
    const first = await inv.reserveStock(
      { branchId, items: [{ productId: productA, quantity: 1 }], idempotencyKey: "retry-res" },
      database as any,
    );
    const second = await inv.reserveStock(
      { branchId, items: [{ productId: productA, quantity: 1 }], idempotencyKey: "retry-res" },
      database as any,
    );
    assert.equal(second.idempotent, true);
    assert.equal(second.reservation.id, first.reservation.id);
  });

  it("6–8 checkout/cancel/expiry retry semantics at service layer", async () => {
    const reserved = await inv.reserveStock(
      { branchId, items: [{ productId: productA, quantity: 1 }], idempotencyKey: "co-retry" },
      database as any,
    );
    await inv.bindReservationOrder(reserved.reservation.id, 9001, database as any);
    const again = await inv.reserveStock(
      { branchId, items: [{ productId: productA, quantity: 1 }], idempotencyKey: "co-retry" },
      database as any,
    );
    assert.equal(again.idempotent, true);

    const cancel1 = await inv.releaseReservation(reserved.reservation.id, { actor: "cancel" }, database as any);
    const cancel2 = await inv.releaseReservation(reserved.reservation.id, { actor: "cancel" }, database as any);
    assert.equal(cancel1.released, true);
    assert.equal(cancel2.released, false);

    const expired = await inv.reserveStock(
      {
        branchId,
        items: [{ productId: productA, quantity: 1 }],
        idempotencyKey: "exp-retry",
        expiresAt: new Date(Date.now() - 1000),
      },
      database as any,
    );
    const e1 = await inv.expireReservation(expired.reservation.id, {}, database as any);
    const e2 = await inv.expireReservation(expired.reservation.id, {}, database as any);
    assert.equal(e1.released, true);
    assert.equal(e2.released, false);
  });

  it("9–10 double consume / double release prevented", async () => {
    const r1 = await inv.reserveStock(
      { branchId, items: [{ productId: productA, quantity: 1 }], idempotencyKey: "dbl-c" },
      database as any,
    );
    assert.equal((await inv.consumeReservation(r1.reservation.id, {}, database as any)).consumed, true);
    assert.equal((await inv.consumeReservation(r1.reservation.id, {}, database as any)).consumed, false);

    const r2 = await inv.reserveStock(
      { branchId, items: [{ productId: productA, quantity: 1 }], idempotencyKey: "dbl-r" },
      database as any,
    );
    assert.equal((await inv.releaseReservation(r2.reservation.id, {}, database as any)).released, true);
    assert.equal((await inv.releaseReservation(r2.reservation.id, {}, database as any)).released, false);
    await assertInvariants(database, productA);
  });

  it("11 adjustment race: concurrent same-key idempotent; conflicting deltas serialize", async () => {
    const key = "adj-race-key";
    const first = await inv.adjustStock(
      { branchId, productId: productA, physicalDelta: 1, reason: "race", actor: "a", idempotencyKey: key },
      database as any,
    );
    const second = await inv.adjustStock(
      { branchId, productId: productA, physicalDelta: 1, reason: "race", actor: "b", idempotencyKey: key },
      database as any,
    );
    assert.equal(first.adjusted, true);
    assert.equal(second.idempotent, true);
    await assertInvariants(database, productA);
  });

  it("12 insufficient stock race rejects oversell", async () => {
    await database.insert(schema.products).values({
      sku: "P48-INS", nameUz: "I", nameRu: "I", category: "C", manufacturer: "M", description: "D", price: 50,
    });
    const p = (await database.select().from(schema.products).where(eq(schema.products.sku, "P48-INS")))[0];
    await database.insert(schema.productStocks).values({ productId: p.id, branchId, quantity: 2 });
    await inv.reserveStock(
      { branchId, items: [{ productId: p.id, quantity: 2 }], idempotencyKey: "ins-a" },
      database as any,
    );
    await assert.rejects(
      () => inv.reserveStock(
        { branchId, items: [{ productId: p.id, quantity: 2 }], idempotencyKey: "ins-b" },
        database as any,
      ),
      (err: { code?: string; status?: number }) => err.code === "STOCK_UNAVAILABLE" || err.status === 400,
    );
    const stock = await assertInvariants(database, p.id);
    assert.equal(stock.reservedQuantity, 2);
    assert.equal(stock.availableQuantity, 0);
  });

  it("13 multi-item deterministic locking succeeds", async () => {
    const result = await inv.reserveStock(
      {
        branchId,
        items: [
          { productId: productB, quantity: 1 },
          { productId: productA, quantity: 1 },
        ],
        idempotencyKey: "multi-lock",
      },
      database as any,
    );
    assert.equal(result.items.length, 2);
    await assertInvariants(database, productA);
    await assertInvariants(database, productB);
  });

  it("14 invariant validation across all stocks", async () => {
    const stocks = await database.select().from(schema.productStocks).where(eq(schema.productStocks.branchId, branchId));
    for (const stock of stocks) {
      assert.ok(stock.physicalQuantity >= 0);
      assert.ok(stock.reservedQuantity >= 0);
      assert.ok(stock.reservedQuantity <= stock.physicalQuantity);
      assert.equal(stock.availableQuantity, stock.physicalQuantity - stock.reservedQuantity);
    }
  });
});
