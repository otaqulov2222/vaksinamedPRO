import path from "node:path";
import { mkdirSync } from "node:fs";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import * as schema from "./schema";
import { applyMigrations } from "./migrate";
import { seedDatabase } from "./seed";
import {
  assertProductionDatabaseConfig,
  resolveAppEnvironment,
  resolveDatabaseUrl,
  resolveDbDriver,
  shouldAutoSeed,
  type AppEnvironment,
  type DbDriver,
} from "./env";
import { resolvePoolConfig } from "./poolConfig";

const { Pool } = pg;

export type DatabaseInstance = {
  db: ReturnType<typeof drizzlePg> | ReturnType<typeof drizzlePglite>;
  pool: pg.Pool | null;
  driver: DbDriver;
  environment: AppEnvironment;
};

async function createDatabase(): Promise<DatabaseInstance> {
  const environment = resolveAppEnvironment();
  assertProductionDatabaseConfig(environment);
  const driver = resolveDbDriver(environment);

  if (driver === "postgres") {
    const url = resolveDatabaseUrl();
    if (!url) {
      throw new Error("[db] DATABASE_URL is required for PostgreSQL driver.");
    }
    const poolOpts = resolvePoolConfig();
    const pool = new Pool({
      connectionString: url,
      max: poolOpts.max,
      idleTimeoutMillis: poolOpts.idleTimeoutMillis,
      connectionTimeoutMillis: poolOpts.connectionTimeoutMillis,
      allowExitOnIdle: poolOpts.allowExitOnIdle,
    });
    const database = drizzlePg(pool, { schema });
    await applyMigrations(database, "postgres");
    if (shouldAutoSeed(environment, "postgres")) {
      await seedDatabase(database, { profile: "demo", environment });
    }
    return { db: database, pool, driver: "postgres", environment };
  }

  // Local demo only — not production architecture
  const dataDir = process.env.PGLITE_DIR || path.resolve(process.cwd(), ".data", "pglite");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await client.waitReady;
  const database = drizzlePglite(client, { schema });
  await applyMigrations(database, "pglite");
  if (shouldAutoSeed(environment, "pglite")) {
    await seedDatabase(database, { profile: "demo", environment });
  }
  return { db: database, pool: null, driver: "pglite", environment };
}

const instance = await createDatabase();

export const db = instance.db;
export const pool = instance.pool;
export const dbDriver = instance.driver;
export const dbEnvironment = instance.environment;
export const ready = Promise.resolve();

export * from "./schema";
export * from "./password";
export * from "./env";
export * from "./health";
export * from "./migrate";
export * from "./poolConfig";
export { getMigrationsFolder } from "./migrationsPath";
/** @deprecated Prefer versioned migrations. Kept for reference / emergency local repair. */
export { bootstrapSchema } from "./bootstrap";
