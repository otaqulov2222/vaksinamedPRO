import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { count, eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";
import {
  assertStagingCatalogSeedAllowed,
  isStagingCatalogSeedAllowed,
  seedStagingCatalog,
  STAGING_CATALOG_PRODUCTS,
} from "../src/stagingCatalogSeed";

describe("Staging Catalog Seed — Strict Isolation & Idempotency", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  const origAppEnv = process.env.APP_ENV;
  const origSeedFlag = process.env.STAGING_DEMO_CATALOG_SEED_ENABLED;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", getMigrationsFolder());
  });

  after(async () => {
    process.env.APP_ENV = origAppEnv;
    process.env.STAGING_DEMO_CATALOG_SEED_ENABLED = origSeedFlag;
    await client.close();
  });

  afterEach(() => {
    process.env.APP_ENV = origAppEnv;
    process.env.STAGING_DEMO_CATALOG_SEED_ENABLED = origSeedFlag;
  });

  describe("1. Environment & Flag Guard Gates", () => {
    it("refuses execution if APP_ENV is not staging (e.g. production, test, development)", () => {
      process.env.STAGING_DEMO_CATALOG_SEED_ENABLED = "true";

      for (const env of ["production", "test", "development", ""]) {
        process.env.APP_ENV = env;
        assert.equal(isStagingCatalogSeedAllowed(), false);
        assert.throws(
          () => assertStagingCatalogSeedAllowed(),
          /\[staging-catalog-seed\] Refusing execution: APP_ENV must be "staging"/,
        );
      }
    });

    it("refuses execution if STAGING_DEMO_CATALOG_SEED_ENABLED is false, 0, or missing", () => {
      process.env.APP_ENV = "staging";

      for (const flag of ["false", "0", "no", "", undefined]) {
        process.env.STAGING_DEMO_CATALOG_SEED_ENABLED = flag;
        assert.equal(isStagingCatalogSeedAllowed(), false);
        assert.throws(
          () => assertStagingCatalogSeedAllowed(),
          /\[staging-catalog-seed\] Refusing execution: STAGING_DEMO_CATALOG_SEED_ENABLED must be "true"/,
        );
      }
    });

    it("allows execution only when BOTH APP_ENV=staging and flag=true (or 1)", () => {
      process.env.APP_ENV = "staging";
      process.env.STAGING_DEMO_CATALOG_SEED_ENABLED = "true";
      assert.equal(isStagingCatalogSeedAllowed(), true);
      assert.doesNotThrow(() => assertStagingCatalogSeedAllowed());

      process.env.STAGING_DEMO_CATALOG_SEED_ENABLED = "1";
      assert.equal(isStagingCatalogSeedAllowed(), true);
      assert.doesNotThrow(() => assertStagingCatalogSeedAllowed());
    });
  });

  describe("2. Database Seeding & Data Validation", () => {
    it("successfully seeds branches, demo products, and product stocks", async () => {
      process.env.APP_ENV = "staging";
      process.env.STAGING_DEMO_CATALOG_SEED_ENABLED = "true";

      // Pre-check: catalog tables are initially empty
      const [initialB] = await db.select({ count: count() }).from(schema.branches);
      const [initialP] = await db.select({ count: count() }).from(schema.products);
      const [initialS] = await db.select({ count: count() }).from(schema.productStocks);
      assert.equal(Number(initialB?.count || 0), 0);
      assert.equal(Number(initialP?.count || 0), 0);
      assert.equal(Number(initialS?.count || 0), 0);

      // Execute seeding
      const result = await seedStagingCatalog(db);

      assert.equal(result.ok, true);
      assert.ok(result.branchesInserted > 50, "Should insert official branches");
      assert.equal(result.productsInserted, STAGING_CATALOG_PRODUCTS.length);
      assert.equal(result.stocksInserted, result.branchesInserted * result.productsInserted);

      // Verify row counts in database
      const [afterB] = await db.select({ count: count() }).from(schema.branches);
      const [afterP] = await db.select({ count: count() }).from(schema.products);
      const [afterS] = await db.select({ count: count() }).from(schema.productStocks);

      assert.equal(Number(afterB?.count), result.branchesTotal);
      assert.equal(Number(afterP?.count), result.productsTotal);
      assert.equal(Number(afterS?.count), result.stocksTotal);

      // Verify demo product annotation
      const loadedProducts = await db.select().from(schema.products);
      for (const p of loadedProducts) {
        assert.ok(
          p.description.includes("[TEST / DEMO]"),
          `Product ${p.sku} must have [TEST / DEMO] in description`,
        );
        assert.ok(p.price > 0, "Price must be positive");
      }

      // Verify stock rules and trigger/generated column invariants
      const sampleStocks = await db.select().from(schema.productStocks).limit(50);
      for (const s of sampleStocks) {
        assert.ok(s.physicalQuantity > 0, "Physical quantity must be positive");
        assert.equal(s.quantity, s.physicalQuantity, "Legacy quantity must mirror physical_quantity");
        assert.equal(s.reservedQuantity, 0, "Reserved quantity must be 0 initially");
        assert.equal(s.availableQuantity, s.physicalQuantity, "Available quantity must equal physical - reserved");
      }
    });

    it("is strictly idempotent: second execution inserts 0 rows and leaves state unchanged", async () => {
      process.env.APP_ENV = "staging";
      process.env.STAGING_DEMO_CATALOG_SEED_ENABLED = "true";

      const [countBBefore] = await db.select({ count: count() }).from(schema.branches);
      const [countPBefore] = await db.select({ count: count() }).from(schema.products);
      const [countSBefore] = await db.select({ count: count() }).from(schema.productStocks);

      // Re-run seed
      const rerunResult = await seedStagingCatalog(db);

      assert.equal(rerunResult.ok, true);
      assert.equal(rerunResult.branchesInserted, 0, "No duplicate branches inserted");
      assert.equal(rerunResult.productsInserted, 0, "No duplicate products inserted");
      assert.equal(rerunResult.stocksInserted, 0, "No duplicate stocks inserted");

      const [countBAfter] = await db.select({ count: count() }).from(schema.branches);
      const [countPAfter] = await db.select({ count: count() }).from(schema.products);
      const [countSAfter] = await db.select({ count: count() }).from(schema.productStocks);

      assert.equal(Number(countBAfter?.count), Number(countBBefore?.count));
      assert.equal(Number(countPAfter?.count), Number(countPBefore?.count));
      assert.equal(Number(countSAfter?.count), Number(countSBefore?.count));
    });

    it("is non-destructive: existing custom rows are strictly preserved and not overwritten", async () => {
      process.env.APP_ENV = "staging";
      process.env.STAGING_DEMO_CATALOG_SEED_ENABLED = "true";

      // Insert pre-existing custom branch
      await db.insert(schema.branches).values({
        code: "VM-CUSTOM-REAL",
        name: "Existing Real Branch In Staging",
        city: "Toshkent",
        region: "Toshkent shahri",
        address: "Navoiy ko'chasi 1",
        phone: "+998 71 200 00 00",
        lat: 41.31,
        lng: 69.24,
      });

      // Insert pre-existing custom product
      await db.insert(schema.products).values({
        sku: "VM-EXISTING-REAL",
        nameUz: "Existing Real Medicine",
        nameRu: "Существующее Лекарство",
        category: "Vitaminlar",
        manufacturer: "Real Pharma",
        description: "Pre-existing real medicine description",
        price: 999000,
      });

      // Run staging seed again
      await seedStagingCatalog(db);

      // Verify custom branch was untouched
      const customBranch = (await db.select().from(schema.branches).where(eq(schema.branches.code, "VM-CUSTOM-REAL")))[0];
      assert.ok(customBranch);
      assert.equal(customBranch.name, "Existing Real Branch In Staging");

      // Verify custom product was untouched
      const customProduct = (await db.select().from(schema.products).where(eq(schema.products.sku, "VM-EXISTING-REAL")))[0];
      assert.ok(customProduct);
      assert.equal(customProduct.nameUz, "Existing Real Medicine");
      assert.equal(customProduct.price, 999000);
      assert.equal(customProduct.description, "Pre-existing real medicine description");
    });
  });

  describe("3. Financial & Accounting Isolation", () => {
    it("never writes to customers, admin_users, orders, cashback, payments or accounting tables", async () => {
      // Assert all non-catalog sensitive tables are completely untouched (0 rows)
      const [cCount] = await db.select({ count: count() }).from(schema.customers);
      const [aCount] = await db.select({ count: count() }).from(schema.adminUsers);
      const [oCount] = await db.select({ count: count() }).from(schema.orders);
      const [oiCount] = await db.select({ count: count() }).from(schema.orderItems);
      const [cbAccCount] = await db.select({ count: count() }).from(schema.cashbackAccounts);
      const [cbLedgerCount] = await db.select({ count: count() }).from(schema.cashbackLedger);
      const [commTxCount] = await db.select({ count: count() }).from(schema.commercialTransactions);
      const [payIntentCount] = await db.select({ count: count() }).from(schema.paymentIntents);
      const [resCount] = await db.select({ count: count() }).from(schema.reservations);
      const [invMovCount] = await db.select({ count: count() }).from(schema.inventoryMovements);

      assert.equal(Number(cCount?.count), 0, "customers table must remain untouched");
      assert.equal(Number(aCount?.count), 0, "admin_users table must remain untouched");
      assert.equal(Number(oCount?.count), 0, "orders table must remain untouched");
      assert.equal(Number(oiCount?.count), 0, "order_items table must remain untouched");
      assert.equal(Number(cbAccCount?.count), 0, "cashback_accounts table must remain untouched");
      assert.equal(Number(cbLedgerCount?.count), 0, "cashback_ledger table must remain untouched");
      assert.equal(Number(commTxCount?.count), 0, "commercial_transactions table must remain untouched");
      assert.equal(Number(payIntentCount?.count), 0, "payment_intents table must remain untouched");
      assert.equal(Number(resCount?.count), 0, "reservations table must remain untouched");
      assert.equal(Number(invMovCount?.count), 0, "inventory_movements table must remain untouched");
    });
  });
});
