/**
 * Inspect migration journal + applied hashes (when DB reachable).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getMigrationsFolder } from "../migrationsPath";
import { isPostgresUrl } from "../env";
import { listAppliedMigrationHashes } from "../health";

const folder = getMigrationsFolder();
const journal = JSON.parse(readFileSync(path.join(folder, "meta", "_journal.json"), "utf8"));

console.log(JSON.stringify({
  migrationsFolder: folder,
  journalEntries: journal.entries?.map((e: { idx: number; tag: string; when: number }) => ({
    idx: e.idx,
    tag: e.tag,
    when: e.when,
  })),
}, null, 2));

const url = process.env.DATABASE_URL;
if (isPostgresUrl(url)) {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzlePg(pool);
  try {
    const hashes = await listAppliedMigrationHashes(db);
    console.log(JSON.stringify({ appliedHashes: hashes }, null, 2));
  } finally {
    await pool.end();
  }
} else {
  console.log(JSON.stringify({
    appliedHashes: null,
    note: "Set DATABASE_URL to inspect applied migrations on a live Postgres database.",
  }, null, 2));
}
