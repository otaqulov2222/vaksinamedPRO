import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import { CRITICAL_TABLES, inspectMigrations, runMigrationRelease } from "../src/release";
import { MIGRATION_ADVISORY_LOCK_KEY } from "../src/migrationLock";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (file: string) => readFileSync(path.join(srcDir, file), "utf8");

// PGlite here only exercises the inspection logic; real-PostgreSQL behaviour is verified separately.
describe("P13.21 migration release inspection", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle>;
  const folder = getMigrationsFolder();
  const journal = JSON.parse(readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ tag: string }>;
  };

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    db = drizzle(client);
  });

  after(async () => {
    await client.close();
  });

  it("reports every journal migration as pending on an empty database (status writes nothing)", async () => {
    const report = await inspectMigrations(db, folder);
    assert.equal(report.mode, "status");
    assert.equal(report.ok, false);
    assert.equal(report.appliedCount, 0);
    assert.equal(report.journalEntries, journal.entries.length);
    assert.deepEqual(report.pendingTags, journal.entries.map((e) => e.tag));
    assert.equal(report.missingCriticalTables.length, CRITICAL_TABLES.length);
    const tables = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
    );
    assert.equal(tables.rows[0]?.n, 0);
  });

  it("reports ok once all migrations are applied", async () => {
    await applyMigrations(db, "pglite", folder);
    const report = await inspectMigrations(db, folder, "apply");
    assert.equal(report.mode, "apply");
    assert.equal(report.ok, true);
    assert.deepEqual(report.pendingTags, []);
    assert.equal(report.unknownAppliedCount, 0);
    assert.deepEqual(report.missingCriticalTables, []);
    assert.equal(report.appliedCount, journal.entries.length);
    assert.equal(report.lastJournalTag, journal.entries.at(-1)?.tag);
    assert.equal(report.lastJournalTag, "0013_auth_event_telemetry");
  });

  it("flags an applied hash that matches no migration file", async () => {
    await db.execute(sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('p13-21-foreign-hash', 1)`);
    const report = await inspectMigrations(db, folder);
    assert.equal(report.unknownAppliedCount, 1);
    assert.equal(report.ok, false);
    await db.execute(sql`DELETE FROM drizzle.__drizzle_migrations WHERE hash = 'p13-21-foreign-hash'`);
    assert.equal((await inspectMigrations(db, folder)).ok, true);
  });

  it("flags a missing critical table", async () => {
    await db.execute(sql`ALTER TABLE worker_jobs RENAME TO worker_jobs_p1321`);
    try {
      const report = await inspectMigrations(db, folder);
      assert.deepEqual(report.missingCriticalTables, ["worker_jobs"]);
      assert.equal(report.ok, false);
    } finally {
      await db.execute(sql`ALTER TABLE worker_jobs_p1321 RENAME TO worker_jobs`);
    }
  });

  it("critical table list covers auth, inventory, cashback, payment and worker tables", () => {
    for (const table of ["admin_users", "auth_sessions", "inventory_movements", "cashback_ledger", "payment_intents", "worker_jobs"]) {
      assert.ok((CRITICAL_TABLES as readonly string[]).includes(table), `missing ${table}`);
    }
  });
});

describe("P13.21 migration release guards", () => {
  it("refuses to run without a postgres DATABASE_URL (never targets PGlite)", async () => {
    const saved = { DATABASE_URL: process.env.DATABASE_URL, APP_ENV: process.env.APP_ENV, NODE_ENV: process.env.NODE_ENV };
    delete process.env.DATABASE_URL;
    process.env.APP_ENV = "development";
    process.env.NODE_ENV = "development";
    try {
      await assert.rejects(runMigrationRelease({ apply: false }), /requires DATABASE_URL=postgres/);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("release module never opens the app database, seeds, or prints the URL", () => {
    const release = read("release.ts");
    assert.doesNotMatch(release, /from "\.\/index"|from "\.\/seed"|seedDatabase/);
    assert.doesNotMatch(release, /console\.|logger/);
    assert.match(release, /max: 1/);
    assert.match(release, /assertProductionDatabaseConfig/);
  });

  it("API boot and the release step share one advisory lock around PostgreSQL migrations", () => {
    assert.ok(Number.isSafeInteger(MIGRATION_ADVISORY_LOCK_KEY));
    const lock = read("migrationLock.ts");
    assert.match(lock, /pg_advisory_lock\(\$1\)/);
    assert.match(lock, /pg_advisory_unlock\(\$1\)/);
    assert.match(lock, /pool\.connect\(\)/);
    assert.match(lock, /client\.release\(\)/);
    const index = read("index.ts");
    assert.match(index, /await applyPostgresMigrationsLocked\(pool\)/);
    assert.doesNotMatch(index, /applyMigrations\(database, "postgres"\)/);
    assert.match(read("release.ts"), /applyPostgresMigrationsLocked\(pool, folder\)/);
  });
});
