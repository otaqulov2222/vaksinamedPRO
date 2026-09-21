import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { getMigrationsFolder } from "./migrationsPath";

type AnyDb = {
  execute: (...args: never[]) => Promise<unknown>;
};

/**
 * Apply ordered versioned migrations.
 * Does not use drizzle-kit push / push --force.
 */
export async function applyMigrations(
  database: AnyDb,
  driver: "postgres" | "pglite",
  migrationsFolder: string = getMigrationsFolder(),
): Promise<{ migrationsFolder: string; driver: string }> {
  if (driver === "postgres") {
    await migratePg(database as Parameters<typeof migratePg>[0], { migrationsFolder });
  } else {
    await migratePglite(database as Parameters<typeof migratePglite>[0], { migrationsFolder });
  }
  return { migrationsFolder, driver };
}
