import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { applyMigrations } from "./migrate";
import { getMigrationsFolder } from "./migrationsPath";

/** Shared by API boot and the release step so concurrent migration runs serialize. */
export const MIGRATION_ADVISORY_LOCK_KEY = 7_316_202_113;

/**
 * Session-level advisory lock on one dedicated connection; the drizzle migrator itself takes none.
 * A run that waited on the lock finds nothing pending and is a no-op.
 */
export async function applyPostgresMigrationsLocked(
  pool: pg.Pool,
  migrationsFolder: string = getMigrationsFolder(),
): Promise<{ migrationsFolder: string; driver: string }> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_ADVISORY_LOCK_KEY]);
    try {
      return await applyMigrations(drizzlePg(client), "postgres", migrationsFolder);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
