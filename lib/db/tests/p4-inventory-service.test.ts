import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

/**
 * P4.3–P4.5 reservation service tests.
 * Imports API inventory module but passes this PGlite executor explicitly.
 */
describe("P4.3–P4.5 inventory service", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let reserveStock: typeof import("../../../artifacts/api-server/src/lib/inventory").reserveStock;
  let releaseReservation: typeof import("../../../artifacts/api-server/src/lib/inventory").releaseReservation;
  let consumeReservation: typeof import("../../../artifacts/api-server/src/lib/inventory").consumeReservation;
  let branchId: number;
  let productA: number;
  let productB: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());

    const inv = await import("../../../artifacts/api-server/src/lib/inventory.ts");
    reserveStock = inv.reserveStock;
    releaseReservation = inv.releaseReservation;
    consumeReservation = inv.consumeReservation;

    await database.insert(schema.branches).values({
      code: "VM-INV",
      name: "Inv",
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
      {
        sku: "INV-A",
        nameUz: "A",
        nameRu: "A",
        category: "C",
        manufacturer: "M",
        description: "D",
        price: 1000,
      },
      {
        sku: "INV-B",
        nameUz: "B",
        nameRu: "B",
        category: "C",
        manufacturer: "M",
        description: "D",
        price: 2000,
      },
    ]);
    const branch = (await database.select().from(schema.branches).where(eq(schema.branches.code, "VM-INV")))[0];
    const products = await database.select().from(schema.products);
    branchId = branch.id;
    productA = products.find((p) => p.sku === "INV-A")!.id;
    productB = products.find((p) => p.sku === "INV-B")!.id;
    await database.insert(schema.productStocks).values([
      { productId: productA, branchId, quantity: 5 },
      { productId: productB, branchId, quantity: 3 },
    ]);
  });

  after(async () => {
    await client.close();
  });

  it("reserves stock without decreasing physical", async () => {
    const result = await reserveStock(
      {
        branchId,
        items: [{ productId: productA, quantity: 2 }],
        idempotencyKey: "res-1",
        actor: "test",
      },
      database as any,
    );
    assert.equal(result.idempotent, false);
    assert.equal(result.reservation.status, "ACTIVE");
    const stock = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productA)))[0];
    assert.equal(stock.physicalQuantity, 5);
    assert.equal(stock.reservedQuantity, 2);
    assert.equal(stock.availableQuantity, 3);
  });

  it("insufficient stock is rejected", async () => {
    await assert.rejects(
      () => reserveStock(
        { branchId, items: [{ productId: productA, quantity: 99 }], idempotencyKey: "res-fail" },
        database as any,
      ),
      (err: { code?: string; status?: number }) => err.code === "STOCK_UNAVAILABLE" || err.status === 400,
    );
  });

  it("reservation retry is idempotent", async () => {
    const first = await reserveStock(
      { branchId, items: [{ productId: productB, quantity: 1 }], idempotencyKey: "res-idem" },
      database as any,
    );
    const second = await reserveStock(
      { branchId, items: [{ productId: productB, quantity: 1 }], idempotencyKey: "res-idem" },
      database as any,
    );
    assert.equal(second.idempotent, true);
    assert.equal(second.reservation.id, first.reservation.id);
    const stock = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productB)))[0];
    assert.equal(stock.reservedQuantity, 1);
  });

  it("concurrent last-unit reservation: only one wins (checkout SoT path)", async () => {
    // Batch 3E: checkout races share this FOR UPDATE reserveStock path.
    // PGlite is single-connection — sequential contention still rejects the second reserve.
    // Real multi-connection races are covered by p13 inventory_concurrency on PostgreSQL.
    await database.insert(schema.products).values({
      sku: "INV-C",
      nameUz: "C",
      nameRu: "C",
      category: "C",
      manufacturer: "M",
      description: "D",
      price: 500,
    });
    const productC = (await database.select().from(schema.products).where(eq(schema.products.sku, "INV-C")))[0];
    await database.insert(schema.productStocks).values({ productId: productC.id, branchId, quantity: 1 });

    // PGlite single-connection: sequential contention still enforces available check.
    await reserveStock(
      { branchId, items: [{ productId: productC.id, quantity: 1 }], idempotencyKey: "race-a" },
      database as any,
    );
    await assert.rejects(
      () => reserveStock(
        { branchId, items: [{ productId: productC.id, quantity: 1 }], idempotencyKey: "race-b" },
        database as any,
      ),
      (err: { code?: string; status?: number }) => err.code === "STOCK_UNAVAILABLE" || err.status === 400,
    );
    const stock = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productC.id)))[0];
    assert.equal(stock.reservedQuantity, 1);
    assert.equal(stock.availableQuantity, 0);
  });

  it("release restores available; double release is idempotent", async () => {
    const reserved = await reserveStock(
      { branchId, items: [{ productId: productA, quantity: 1 }], idempotencyKey: "rel-1" },
      database as any,
    );
    const before = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productA)))[0];
    const first = await releaseReservation(reserved.reservation.id, { actor: "test" }, database as any);
    assert.equal(first.released, true);
    const mid = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productA)))[0];
    assert.equal(mid.reservedQuantity, before.reservedQuantity - 1);
    const second = await releaseReservation(reserved.reservation.id, { actor: "test" }, database as any);
    assert.equal(second.released, false);
    assert.equal(second.reservation.status, "CANCELLED");
  });

  it("consume decreases physical+reserved; double consume is idempotent", async () => {
    const reserved = await reserveStock(
      { branchId, items: [{ productId: productA, quantity: 1 }], idempotencyKey: "con-1" },
      database as any,
    );
    const before = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productA)))[0];
    const first = await consumeReservation(reserved.reservation.id, { actor: "test" }, database as any);
    assert.equal(first.consumed, true);
    const mid = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productA)))[0];
    assert.equal(mid.physicalQuantity, before.physicalQuantity - 1);
    assert.equal(mid.reservedQuantity, before.reservedQuantity - 1);
    const second = await consumeReservation(reserved.reservation.id, { actor: "test" }, database as any);
    assert.equal(second.consumed, false);
    assert.equal(second.reservation.status, "FULFILLED");
  });

  it("multi-item reservation locks all products", async () => {
    const result = await reserveStock(
      {
        branchId,
        items: [
          { productId: productA, quantity: 1 },
          { productId: productB, quantity: 1 },
        ],
        idempotencyKey: "multi-1",
      },
      database as any,
    );
    assert.equal(result.items.length, 2);
    assert.equal(result.reservation.status, "ACTIVE");
  });
});
