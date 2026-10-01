/**
 * Controlled migration release step — run once per release, before API / worker replicas start.
 * Never seeds, never boots the app, never prints the connection string. Status mode never writes.
 * Importing this module does not open a database (unlike the package root).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import { applyPostgresMigrationsLocked } from "./migrationLock";
import { getMigrationsFolder } from "./migrationsPath";
import { assertProductionDatabaseConfig, isPostgresUrl, resolveAppEnvironment } from "./env";
import {
  BASELINE_TABLES,
  P3_AUTH_TABLES,
  P4_INVENTORY_TABLES,
  P6_CASHBACK_TABLES,
  P7_PAYMENT_TABLES,
  P8_P10_TABLES,
  listAppliedMigrationHashes,
  listPublicTables,
} from "./health";

export const CRITICAL_TABLES = [
  ...BASELINE_TABLES,
  ...P3_AUTH_TABLES,
  ...P4_INVENTORY_TABLES,
  ...P6_CASHBACK_TABLES,
  ...P7_PAYMENT_TABLES,
  ...P8_P10_TABLES,
] as const;

type Executor = Parameters<typeof listPublicTables>[0];

export type MigrationReleaseReport = {
  mode: "status" | "apply";
  journalEntries: number;
  lastJournalTag: string | null;
  appliedCount: number;
  pendingTags: string[];
  /** Applied hashes that match no journal file — an edited or foreign migration. */
  unknownAppliedCount: number;
  missingCriticalTables: string[];
  ok: boolean;
};

/** Read-only comparison of the migrations folder against `drizzle.__drizzle_migrations`. */
export async function inspectMigrations(
  database: Executor,
  folder: string = getMigrationsFolder(),
  mode: MigrationReleaseReport["mode"] = "status",
): Promise<MigrationReleaseReport> {
  const files = readMigrationFiles({ migrationsFolder: folder });
  const journal = JSON.parse(readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  const tags = journal.entries.map((e) => e.tag);
  const applied = new Set(await listAppliedMigrationHashes(database));
  const pendingTags = files.flatMap((f, i) => (applied.has(f.hash) ? [] : [tags[i] ?? `#${i}`]));
  const known = new Set(files.map((f) => f.hash));
  const unknownAppliedCount = [...applied].filter((h) => !known.has(h)).length;
  const tables = new Set(await listPublicTables(database));
  const missingCriticalTables = CRITICAL_TABLES.filter((t) => !tables.has(t));
  return {
    mode,
    journalEntries: files.length,
    lastJournalTag: tags.at(-1) ?? null,
    appliedCount: applied.size,
    pendingTags,
    unknownAppliedCount,
    missingCriticalTables,
    ok: pendingTags.length === 0 && unknownAppliedCount === 0 && missingCriticalTables.length === 0,
  };
}

/**
 * Release step against DATABASE_URL (PostgreSQL only). `apply: false` = status only.
 * Single pooled connection under the shared migration advisory lock; TLS comes from the URL (`sslmode` / `sslrootcert`).
 */
export async function runMigrationRelease(opts: { apply: boolean }): Promise<MigrationReleaseReport> {
  const env = resolveAppEnvironment();
  assertProductionDatabaseConfig(env);
  const url = process.env.DATABASE_URL;
  if (!isPostgresUrl(url)) {
    throw new Error("[db] migration release requires DATABASE_URL=postgres://... (PGlite is not a release target).");
  }
  const folder = getMigrationsFolder();
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    if (opts.apply) await applyPostgresMigrationsLocked(pool, folder);
    return await inspectMigrations(drizzlePg(pool), folder, opts.apply ? "apply" : "status");
  } finally {
    await pool.end();
  }
}
