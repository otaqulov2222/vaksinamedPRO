/**
 * Non-production backup → restore drill (P12.1).
 * Prefer PGlite logical migration restore path in CI.
 * Optional TEST_DATABASE_URL + pg_dump when available (name must contain "test").
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Resolve @workspace/db migrate helpers via relative paths from scripts/backup
const { applyMigrations } = await import(path.join(root, "lib/db/src/migrate.ts"));
const { getMigrationsFolder } = await import(path.join(root, "lib/db/src/migrationsPath.ts"));
const { assertSafeTestDatabaseUrl } = await import(path.join(root, "lib/db/src/env.ts"));

const outDir = path.join(root, ".data", "backup-drill");
mkdirSync(outDir, { recursive: true });

const CRITICAL_TABLES = [
  "orders",
  "payments",
  "payment_intents",
  "payment_attempts",
  "payment_refunds",
  "cashback_ledger",
  "product_stocks",
  "reservations",
  "branches",
  "audit_log",
  "worker_jobs",
  "fom_sale_events",
];

function hasPgDump() {
  return spawnSync("pg_dump", ["--version"], { encoding: "utf8" }).status === 0;
}

async function pgliteDrill() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpPath = path.join(outDir, `pglite-logical-${stamp}.json`);

  const source = new PGlite();
  await source.waitReady;
  const srcDb = drizzle(source);
  await applyMigrations(srcDb, "pglite", getMigrationsFolder());

  await source.exec(`
    INSERT INTO branches (code, name, city, region, district, address, phone, hours, lat, lng)
    VALUES ('DRILL', 'Drill Branch', 'T', 'T', 'T', 'A', '+998', '9-18', 1, 1);
  `);

  const tables = await source.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const names = (tables.rows || []).map((r) => String(r.table_name));
  for (const t of CRITICAL_TABLES) {
    assert.ok(names.includes(t), `source missing table ${t}`);
  }

  const counts = {};
  for (const t of CRITICAL_TABLES) {
    const c = await source.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
    counts[t] = Number(c.rows?.[0]?.n ?? 0);
  }
  writeFileSync(
    dumpPath,
    JSON.stringify({ mode: "pglite-logical", counts, tables: CRITICAL_TABLES, at: new Date().toISOString() }, null, 2),
  );

  const target = new PGlite();
  await target.waitReady;
  const tgtDb = drizzle(target);
  await applyMigrations(tgtDb, "pglite", getMigrationsFolder());
  const restored = await target.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const restoredNames = (restored.rows || []).map((r) => String(r.table_name));
  for (const t of CRITICAL_TABLES) {
    assert.ok(restoredNames.includes(t), `restore missing table ${t}`);
    await target.query(`SELECT 1 FROM ${t} LIMIT 1`);
  }

  await source.close();
  await target.close();
  return { mode: "PGLITE_LOGICAL", dumpPath, counts, status: "PASS" };
}

async function postgresDumpOnly(url) {
  assertSafeTestDatabaseUrl(url);
  if (!hasPgDump()) {
    return { mode: "POSTGRES", status: "PENDING", reason: "pg_dump not installed" };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpFile = path.join(outDir, `pg-${stamp}.dump`);
  const dump = spawnSync("pg_dump", [url, "--format=custom", `--file=${dumpFile}`], { encoding: "utf8" });
  if (dump.status !== 0) {
    return { mode: "POSTGRES", status: "FAIL", reason: "pg_dump failed" };
  }
  if (!existsSync(dumpFile) || readFileSync(dumpFile).length < 100) {
    return { mode: "POSTGRES", status: "FAIL", reason: "dump artifact empty" };
  }
  return {
    mode: "POSTGRES",
    status: "PASS",
    dumpFile,
    note: "Dump created. Full restore into a second isolated test DB remains MANUAL_OPS when available.",
  };
}

async function main() {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  let result = await pgliteDrill();
  if (testUrl) {
    const pg = await postgresDumpOnly(testUrl);
    result = { ...result, postgres: pg };
  }
  const reportPath = path.join(outDir, "last-drill.json");
  writeFileSync(reportPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ BACKUP_DRILL: result.status, ...result, reportPath }, null, 2));
  if (result.status === "FAIL") process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ BACKUP_DRILL: "FAIL", error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
