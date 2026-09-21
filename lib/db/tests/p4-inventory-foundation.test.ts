import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import { P4_INVENTORY_TABLES, listPublicTables } from "../src/health";
import * as schema from "../src/schema";
import { seedDatabase } from "../src/seed";
import { hashPassword } from "../src/password";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("P4.1 inventory foundation", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", getMigrationsFolder());
  });

  after(async () => {
    await client.close();
  });

  it("migration creates P4.1 tables without UNIQUE(branch_id, product_id)", async () => {
    const tables = await listPublicTables(db);
    for (const name of P4_INVENTORY_TABLES) {
      assert.ok(tables.includes(name), `missing ${name}`);
    }
    const sqlText = readFileSync(
      path.join(root, "migrations", "0002_inventory_foundation.sql"),
      "utf8",
    );
    // Ensure no UNIQUE constraint/index on (branch_id, product_id) for product_stocks
    assert.doesNotMatch(
      sqlText,
      /CREATE\s+UNIQUE\s+INDEX[\s\S]{0,120}product_stocks[\s\S]{0,80}branch_id[\s\S]{0,40}product_id/i,
    );
    assert.doesNotMatch(
      sqlText,
      /product_stocks[\s\S]{0,200}UNIQUE\s*\(\s*branch_id\s*,\s*product_id\s*\)/i,
    );
    assert.match(sqlText, /product_stocks_branch_product_idx/);
    assert.match(sqlText, /CREATE INDEX IF NOT EXISTS product_stocks_branch_product_idx/);
  });

  it("backfills physical from quantity and reserved defaults to 0", async () => {
    await db.insert(schema.branches).values({
      code: "VM-P41-1",
      name: "P4.1 Test Branch",
      city: "Tashkent",
      region: "Tashkent",
      district: "Tashkent",
      address: "Test",
      phone: "+998 90 000 00 00",
      hours: "09:00 — 18:00",
      lat: 41.3,
      lng: 69.2,
    });
    await db.insert(schema.products).values({
      sku: "P41-SKU-1",
      nameUz: "Test",
      nameRu: "Test",
      category: "Test",
      manufacturer: "VM",
      description: "P4.1",
      price: 1000,
    });
    const branch = (await db.select().from(schema.branches).where(eq(schema.branches.code, "VM-P41-1")))[0];
    const product = (await db.select().from(schema.products).where(eq(schema.products.sku, "P41-SKU-1")))[0];

    // Insert with legacy quantity only — trigger mirrors to physical
    await db.insert(schema.productStocks).values({
      productId: product.id,
      branchId: branch.id,
      quantity: 42,
    });

    const row = (await db.select().from(schema.productStocks).where(eq(schema.productStocks.productId, product.id)))[0];
    assert.equal(row.quantity, 42);
    assert.equal(row.physicalQuantity, 42);
    assert.equal(row.reservedQuantity, 0);
    assert.equal(row.availableQuantity, 42);
  });

  it("rejects reserved_quantity > physical_quantity", async () => {
    const branch = (await db.select().from(schema.branches).where(eq(schema.branches.code, "VM-P41-1")))[0];
    await db.insert(schema.products).values({
      sku: "P41-SKU-2",
      nameUz: "Bad",
      nameRu: "Bad",
      category: "Test",
      manufacturer: "VM",
      description: "P4.1",
      price: 1000,
    });
    const product = (await db.select().from(schema.products).where(eq(schema.products.sku, "P41-SKU-2")))[0];
    await assert.rejects(async () => {
      await db.execute(sql`
        INSERT INTO product_stocks (product_id, branch_id, quantity, physical_quantity, reserved_quantity)
        VALUES (${product.id}, ${branch.id}, 5, 5, 9)
      `);
    });
  });

  it("available_quantity is derived (not independently writable)", async () => {
    const branch = (await db.select().from(schema.branches).where(eq(schema.branches.code, "VM-P41-1")))[0];
    await db.insert(schema.products).values({
      sku: "P41-SKU-3",
      nameUz: "Gen",
      nameRu: "Gen",
      category: "Test",
      manufacturer: "VM",
      description: "P4.1",
      price: 1000,
    });
    const product = (await db.select().from(schema.products).where(eq(schema.products.sku, "P41-SKU-3")))[0];
    await db.execute(sql`
      INSERT INTO product_stocks (product_id, branch_id, quantity, physical_quantity, reserved_quantity)
      VALUES (${product.id}, ${branch.id}, 10, 10, 3)
    `);
    const row = (await db.select().from(schema.productStocks).where(eq(schema.productStocks.productId, product.id)))[0];
    assert.equal(row.availableQuantity, 7);
    await assert.rejects(async () => {
      await db.execute(sql`
        UPDATE product_stocks SET available_quantity = 99 WHERE product_id = ${product.id}
      `);
    });
  });

  it("orders.reservation_id may be NULL; valid FK works; invalid FK fails", async () => {
    await db.insert(schema.customers).values({
      telegramId: "p41-customer",
      firstName: "P41",
      lastName: "",
      phone: "+998 90 111 11 11",
      passwordHash: hashPassword("x"),
    });
    const customer = (await db.select().from(schema.customers).where(eq(schema.customers.telegramId, "p41-customer")))[0];
    const branch = (await db.select().from(schema.branches).where(eq(schema.branches.code, "VM-P41-1")))[0];

    const order = (await db.insert(schema.orders).values({
      code: "P41-ORD-1",
      customerId: customer.id,
      branchId: branch.id,
      fulfillment: "pickup",
      status: "pending_payment",
      paymentMethod: "payme",
      subtotal: 1000,
      total: 1000,
      reservationId: null,
    }).returning())[0];
    assert.equal(order.reservationId, null);

    const reservation = (await db.insert(schema.reservations).values({
      orderId: order.id,
      customerId: customer.id,
      branchId: branch.id,
      status: "ACTIVE",
    }).returning())[0];

    await db.insert(schema.reservationItems).values({
      reservationId: reservation.id,
      productId: (await db.select().from(schema.products).where(eq(schema.products.sku, "P41-SKU-1")))[0].id,
      quantity: 2,
    });

    const linked = (await db.update(schema.orders).set({ reservationId: reservation.id }).where(eq(schema.orders.id, order.id)).returning())[0];
    assert.equal(linked.reservationId, reservation.id);

    await assert.rejects(async () => {
      await db.execute(sql`
        UPDATE orders SET reservation_id = 999999 WHERE id = ${order.id}
      `);
    });
  });

  it("inventory movements can be stored for RESERVE/RELEASE/CONSUME/ADJUSTMENT", async () => {
    const branch = (await db.select().from(schema.branches).where(eq(schema.branches.code, "VM-P41-1")))[0];
    const product = (await db.select().from(schema.products).where(eq(schema.products.sku, "P41-SKU-1")))[0];
    for (const movementType of ["RESERVE", "RELEASE", "CONSUME", "ADJUSTMENT"] as const) {
      await db.insert(schema.inventoryMovements).values({
        branchId: branch.id,
        productId: product.id,
        movementType,
        quantity: 1,
        physicalDelta: movementType === "CONSUME" || movementType === "ADJUSTMENT" ? -1 : 0,
        reservedDelta: movementType === "RESERVE" ? 1 : movementType === "RELEASE" || movementType === "CONSUME" ? -1 : 0,
        actor: "p4.1-test",
        reason: "schema foundation test",
        idempotencyKey: `p41-${movementType}-${product.id}`,
      });
    }
    const rows = await db.select().from(schema.inventoryMovements).where(eq(schema.inventoryMovements.branchId, branch.id));
    assert.ok(rows.length >= 4);
  });

  it("legacy quantity update mirrors physical via bridge trigger", async () => {
    const product = (await db.select().from(schema.products).where(eq(schema.products.sku, "P41-SKU-1")))[0];
    const before = (await db.select().from(schema.productStocks).where(eq(schema.productStocks.productId, product.id)))[0];
    await db.update(schema.productStocks).set({ quantity: before.quantity - 1 }).where(eq(schema.productStocks.id, before.id));
    const after = (await db.select().from(schema.productStocks).where(eq(schema.productStocks.id, before.id)))[0];
    assert.equal(after.quantity, before.quantity - 1);
    assert.equal(after.physicalQuantity, after.quantity);
  });
});

describe("P4.1 seed still works after foundation", () => {
  it("demo seed inserts stocks without error", async () => {
    const client = new PGlite();
    await client.waitReady;
    const database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    await seedDatabase(database, { profile: "demo", environment: "development" });
    const stocks = await database.select().from(schema.productStocks).limit(5);
    assert.ok(stocks.length > 0);
    for (const row of stocks) {
      assert.equal(row.physicalQuantity, row.quantity);
      assert.equal(row.reservedQuantity, 0);
      assert.equal(row.availableQuantity, row.physicalQuantity);
    }
    await client.close();
  });
});
