import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import {
  BASELINE_TABLES,
  checkDatabaseHealth,
  listAppliedMigrationHashes,
  listPublicTables,
} from "../src/health";
import {
  assertDestructiveOperationAllowed,
  assertSafeTestDatabaseUrl,
  shouldAutoSeed,
} from "../src/env";

describe("P1 migration foundation", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle>;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    db = drizzle(client);
  });

  after(async () => {
    await client.close();
  });

  it("applies versioned migrations on a fresh database without manual SQL", async () => {
    const folder = getMigrationsFolder();
    const result = await applyMigrations(db, "pglite", folder);
    assert.equal(result.driver, "pglite");
    assert.ok(result.migrationsFolder.includes("migrations"));
  });

  it("creates expected baseline schema tables", async () => {
    const tables = await listPublicTables(db);
    for (const name of BASELINE_TABLES) {
      assert.ok(tables.includes(name), `missing table: ${name}`);
    }
  });

  it("creates P3 session/RBAC tables", async () => {
    const { P3_AUTH_TABLES } = await import("../src/health");
    const tables = await listPublicTables(db);
    for (const name of P3_AUTH_TABLES) {
      assert.ok(tables.includes(name), `missing P3 table: ${name}`);
    }
  });

  it("creates P4.1 inventory foundation tables", async () => {
    const { P4_INVENTORY_TABLES } = await import("../src/health");
    const tables = await listPublicTables(db);
    for (const name of P4_INVENTORY_TABLES) {
      assert.ok(tables.includes(name), `missing P4 table: ${name}`);
    }
  });

  it("records migration status (deterministic / inspectable)", async () => {
    const hashes = await listAppliedMigrationHashes(db);
    assert.ok(hashes.length >= 9, "expected baseline through P8–P10 delivery/FOM/workers migration hashes");
  });

  it("creates P6 cashback foundation tables", async () => {
    const { P6_CASHBACK_TABLES } = await import("../src/health");
    const tables = await listPublicTables(db);
    for (const name of P6_CASHBACK_TABLES) {
      assert.ok(tables.includes(name), `missing P6 table: ${name}`);
    }
  });

  it("creates P7 payment foundation tables", async () => {
    const { P7_PAYMENT_TABLES } = await import("../src/health");
    const tables = await listPublicTables(db);
    for (const name of P7_PAYMENT_TABLES) {
      assert.ok(tables.includes(name), `missing P7 table: ${name}`);
    }
  });

  it("creates P8–P10 delivery/FOM/worker tables", async () => {
    const { P8_P10_TABLES } = await import("../src/health");
    const tables = await listPublicTables(db);
    for (const name of P8_P10_TABLES) {
      assert.ok(tables.includes(name), `missing P8–P10 table: ${name}`);
    }
  });

  it("re-applying migrations is idempotent (deterministic)", async () => {
    const before = await listAppliedMigrationHashes(db);
    await applyMigrations(db, "pglite", getMigrationsFolder());
    const after = await listAppliedMigrationHashes(db);
    assert.deepEqual(after, before);
  });

  it("database health check reports up after migrate", async () => {
    const health = await checkDatabaseHealth(db, "pglite");
    assert.equal(health.ok, true);
    assert.equal(health.database, "up");
  });
});

describe("P1 environment safety", () => {
  it("never auto-seeds in production/test", () => {
    const prev = process.env.ALLOW_DEMO_SEED;
    try {
      delete process.env.ALLOW_DEMO_SEED;
      assert.equal(shouldAutoSeed("production", "postgres"), false);
      assert.equal(shouldAutoSeed("staging", "postgres"), false);
      assert.equal(shouldAutoSeed("test", "postgres"), false);
      assert.equal(shouldAutoSeed("test", "pglite"), false);
    } finally {
      if (prev === undefined) delete process.env.ALLOW_DEMO_SEED;
      else process.env.ALLOW_DEMO_SEED = prev;
    }
  });

  it("allows demo seed by default only for pglite development", () => {
    const prev = process.env.ALLOW_DEMO_SEED;
    try {
      delete process.env.ALLOW_DEMO_SEED;
      assert.equal(shouldAutoSeed("development", "pglite"), true);
      assert.equal(shouldAutoSeed("development", "postgres"), false);
    } finally {
      if (prev === undefined) delete process.env.ALLOW_DEMO_SEED;
      else process.env.ALLOW_DEMO_SEED = prev;
    }
  });

  it("refuses production-looking test URLs without allow flag", () => {
    assert.throws(() => assertSafeTestDatabaseUrl("postgres://u:p@host/vaksinamed_prod"));
  });

  it("accepts test-named database URLs", () => {
    assert.doesNotThrow(() => assertSafeTestDatabaseUrl("postgres://u:p@localhost:5432/vaksinamed_test"));
  });

  it("refuses destructive ops without ALLOW_DESTRUCTIVE_DB", () => {
    const prev = process.env.ALLOW_DESTRUCTIVE_DB;
    const prevNode = process.env.NODE_ENV;
    const prevApp = process.env.APP_ENV;
    try {
      delete process.env.ALLOW_DESTRUCTIVE_DB;
      process.env.NODE_ENV = "development";
      delete process.env.APP_ENV;
      assert.throws(() => assertDestructiveOperationAllowed("reset"));
    } finally {
      if (prev === undefined) delete process.env.ALLOW_DESTRUCTIVE_DB;
      else process.env.ALLOW_DESTRUCTIVE_DB = prev;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
    }
  });
});
