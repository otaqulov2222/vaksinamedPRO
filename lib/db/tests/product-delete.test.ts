import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";
import { deleteUnusedProduct } from "../src/productDelete";

describe("Product delete (unused SKU only)", () => {
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

  it("deletes an unused product together with stock rows", async () => {
    const [product] = await db.insert(schema.products).values({
      sku: "VM-DEL-1",
      nameUz: "Test o‘chirish",
      nameRu: "Test",
      category: "Vitaminlar",
      manufacturer: "x",
      description: "junk",
      price: 1000,
    }).returning();
    await db.insert(schema.productStocks).values({
      productId: product.id,
      branchId: 1,
      quantity: 4,
      physicalQuantity: 4,
      reservedQuantity: 0,
    });

    const result = await deleteUnusedProduct(db, product.id);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.sku, "VM-DEL-1");

    const leftover = await db.select().from(schema.products).where(eq(schema.products.id, product.id));
    assert.equal(leftover.length, 0);
    const stocks = await db.select().from(schema.productStocks).where(eq(schema.productStocks.productId, product.id));
    assert.equal(stocks.length, 0);
  });

  it("refuses delete when the product is on an order", async () => {
    const [product] = await db.insert(schema.products).values({
      sku: "VM-DEL-ORD",
      nameUz: "Bronlangan",
      nameRu: "Bron",
      category: "Vitaminlar",
      manufacturer: "x",
      description: "keep",
      price: 2000,
    }).returning();
    const [order] = await db.insert(schema.orders).values({
      code: "VM-DEL-KEEP",
      customerId: 1,
      branchId: 1,
      fulfillment: "pickup",
      status: "completed",
      paymentMethod: "cash",
      subtotal: 2000,
      total: 2000,
    }).returning();
    await db.insert(schema.orderItems).values({
      orderId: order.id,
      productId: product.id,
      title: "Bronlangan",
      price: 2000,
      quantity: 1,
    });

    const result = await deleteUnusedProduct(db, product.id);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "PRODUCT_IN_USE");
      assert.equal(result.blockedBy, "order");
    }
    const still = await db.select().from(schema.products).where(eq(schema.products.id, product.id));
    assert.equal(still.length, 1);
  });

  it("returns NOT_FOUND for a missing id", async () => {
    const result = await deleteUnusedProduct(db, 9_999_999);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "NOT_FOUND");
  });
});
