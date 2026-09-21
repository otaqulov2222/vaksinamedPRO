/**
 * Apply versioned migrations to DATABASE_URL (Postgres) or PGlite demo.
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --filter @workspace/db migrate
 *   DB_DRIVER=pglite pnpm --filter @workspace/db migrate
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { applyMigrations } from "../migrate";
import { assertProductionDatabaseConfig, isPostgresUrl, resolveAppEnvironment, resolveDbDriver } from "../env";
import { getMigrationsFolder } from "../migrationsPath";
import { listAppliedMigrationHashes, listPublicTables } from "../health";

const env = resolveAppEnvironment();
assertProductionDatabaseConfig(env);
const driver = resolveDbDriver(env);
const folder = getMigrationsFolder();

async function main() {
  if (driver === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!isPostgresUrl(url)) {
      throw new Error("DATABASE_URL=postgres://... is required for migrate (postgres driver).");
    }
    const pool = new pg.Pool({ connectionString: url });
    const db = drizzlePg(pool);
    try {
      const result = await applyMigrations(db, "postgres", folder);
      const tables = await listPublicTables(db);
      const hashes = await listAppliedMigrationHashes(db);
      console.log(JSON.stringify({ ok: true, ...result, tables: tables.length, migrationsApplied: hashes.length }, null, 2));
    } finally {
      await pool.end();
    }
    return;
  }

  const dataDir = process.env.PGLITE_DIR || path.resolve(process.cwd(), ".data", "pglite-migrate");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await client.waitReady;
  const db = drizzlePglite(client);
  const result = await applyMigrations(db, "pglite", folder);
  const tables = await listPublicTables(db);
  const hashes = await listAppliedMigrationHashes(db);
  console.log(JSON.stringify({ ok: true, ...result, tables: tables.length, migrationsApplied: hashes.length }, null, 2));
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
