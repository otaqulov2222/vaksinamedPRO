import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { count, eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";
import {
  assertJunkCatalogCleanupAllowed,
  cleanupJunkCatalog,
  junkCatalogReason,
  isProtectedCatalogSku,
} from "../src/junkCatalogCleanup";
import { STAGING_CATALOG_PRODUCTS } from "../src/stagingCatalogSeed";

describe("Junk catalog cleanup", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  const origAppEnv = process.env.APP_ENV;
  const origFlag = process.env.STAGING_JUNK_CATALOG_CLEANUP_ENABLED;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", getMigrationsFolder());
  });

  after(async () => {
    process.env.APP_ENV = origAppEnv;
    process.env.STAGING_JUNK_CATALOG_CLEANUP_ENABLED = origFlag;
    await client.close();
  });

  afterEach(() => {
    process.env.APP_ENV = origAppEnv;
    process.env.STAGING_JUNK_CATALOG_CLEANUP_ENABLED = origFlag;
  });

  function allowCleanup() {
    process.env.APP_ENV = "staging";
    process.env.STAGING_JUNK_CATALOG_CLEANUP_ENABLED = "true";
  }

  it("never classifies official staging demo SKUs as junk", () => {
    for (const p of STAGING_CATALOG_PRODUCTS) {
      assert.equal(isProtectedCatalogSku(p.sku), true);
      assert.equal(junkCatalogReason(p.sku, p.nameUz), null);
    }
  });

  it("matches live junk SKUs from 2026-11-02 staging", () => {
    assert.equal(junkCatalogReason("test", "test"), "sku_or_name_test");
    assert.equal(junkCatalogReason("safdfcxadfad", "test dmidrol"), "keyboard_mash_sku");
    assert.equal(
      junkCatalogReason("TEST-MED-1793174487", "D-Pantenol Regeneratsiya Kremi 50g"),
      "test_med_prefix",
    );
    assert.equal(junkCatalogReason("VM-TEST-1396", "Aflubin tomchi 20ml (1396)"), "vm_test_prefix");
    assert.equal(junkCatalogReason("VM-D3-60", "Vitamin D3 2000 IU (Demo)"), null);
    assert.equal(junkCatalogReason("VM-PARA", "Paratsetamol 500 mg (Demo)"), null);
  });

  it("refuses production and missing flag", () => {
    process.env.STAGING_JUNK_CATALOG_CLEANUP_ENABLED = "true";
    process.env.APP_ENV = "production";
    assert.throws(() => assertJunkCatalogCleanupAllowed(), /APP_ENV must be "staging"/);

    process.env.APP_ENV = "staging";
    process.env.STAGING_JUNK_CATALOG_CLEANUP_ENABLED = "false";
    assert.throws(() => assertJunkCatalogCleanupAllowed(), /STAGING_JUNK_CATALOG_CLEANUP_ENABLED/);
  });

  it("dry-run lists junk and apply deletes only unreferenced junk", async () => {
    allowCleanup();

    await db.insert(schema.products).values([
      {
        sku: "VM-D3-60",
        nameUz: "Vitamin D3 2000 IU (Demo)",
        nameRu: "D3",
        category: "Vitaminlar",
        manufacturer: "Solgar (Demo)",
        description: "[TEST / DEMO]",
        price: 89000,
      },
      {
        sku: "test",
        nameUz: "test",
        nameRu: "test",
        category: "Vitaminlar",
        manufacturer: "x",
        description: "junk",
        price: 12000,
      },
      {
        sku: "TEST-MED-1",
        nameUz: "D-Pantenol",
        nameRu: "D-Pantenol",
        category: "Teri parvarishi",
        manufacturer: "x",
        description: "junk",
        price: 25000,
      },
    ]);

    const d3 = (await db.select().from(schema.products).where(eq(schema.products.sku, "VM-D3-60")))[0];
    const junk = (await db.select().from(schema.products).where(eq(schema.products.sku, "test")))[0];
    await db.insert(schema.productStocks).values([
      { productId: d3.id, branchId: 1, quantity: 10, physicalQuantity: 10, reservedQuantity: 0 },
      { productId: junk.id, branchId: 1, quantity: 3, physicalQuantity: 3, reservedQuantity: 0 },
    ]);

    const planned = await cleanupJunkCatalog(db, "dry-run");
    assert.equal(planned.matched, 2);
    assert.equal(planned.deleted, 0);
    const [beforeCount] = await db.select({ count: count() }).from(schema.products);
    assert.equal(Number(beforeCount.count), 3);

    const applied = await cleanupJunkCatalog(db, "apply");
    assert.equal(applied.deleted, 2);
    assert.equal(applied.skippedBlocked, 0);

    const remaining = await db.select().from(schema.products);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].sku, "VM-D3-60");
    const stocks = await db.select().from(schema.productStocks);
    assert.equal(stocks.length, 1);
    assert.equal(stocks[0].productId, remaining[0].id);
  });

  it("skips junk SKU that is referenced by an order", async () => {
    allowCleanup();

    const inserted = await db.insert(schema.products).values({
      sku: "VM-TEST-9999",
      nameUz: "Aflubin test",
      nameRu: "Aflubin",
      category: "Shamollash",
      manufacturer: "x",
      description: "junk",
      price: 42000,
    }).returning();
    const productId = inserted[0].id;

    const order = await db.insert(schema.orders).values({
      code: "VM-JUNK-1",
      customerId: 1,
      branchId: 1,
      fulfillment: "pickup",
      status: "completed",
      paymentMethod: "cash",
      subtotal: 42000,
      total: 42000,
    }).returning();

    await db.insert(schema.orderItems).values({
      orderId: order[0].id,
      productId,
      title: "Aflubin test",
      price: 42000,
      quantity: 1,
    });

    const result = await cleanupJunkCatalog(db, "apply");
    assert.equal(result.deleted, 0);
    assert.equal(result.skippedBlocked, 1);
    assert.equal(result.candidates[0].blockedBy, "order");

    const still = (await db.select().from(schema.products).where(eq(schema.products.sku, "VM-TEST-9999")))[0];
    assert.ok(still);
  });
});
