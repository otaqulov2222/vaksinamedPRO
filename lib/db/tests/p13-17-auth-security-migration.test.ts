/**
 * Phase 13.17 — 0012_auth_security: case-insensitive unique admin email + auth_events actor index.
 * Clean DB, existing DB with admins, and an existing DB with case-only duplicates (migration refuses; rows untouched).
 */
import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import { listAppliedMigrationHashes } from "../src/health";
import * as schema from "../src/schema";

const folder = getMigrationsFolder();
const journal = JSON.parse(readFileSync(path.join(folder, "meta/_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};
const temps: string[] = [];

const dbError = (pattern: RegExp) => (err: unknown) => {
  const e = err as { message?: string; cause?: { message?: string } };
  return pattern.test(`${e?.message ?? ""} ${e?.cause?.message ?? ""}`);
};

function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  return ((result as { rows?: Record<string, unknown>[] })?.rows || []);
}

function folderUpTo(maxIdx: number) {
  const dir = mkdtempSync(path.join(tmpdir(), "vm-mig-"));
  temps.push(dir);
  mkdirSync(path.join(dir, "meta"));
  const entries = journal.entries.filter((e) => e.idx <= maxIdx);
  for (const e of entries) copyFileSync(path.join(folder, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
  writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  return dir;
}

async function indexes(db: ReturnType<typeof drizzle>, table: string) {
  return rows(await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = ${table}`)).map((r) => String(r.indexname));
}

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("Phase 13.17 migration 0012_auth_security", () => {
  it("is versioned after 0011, additive, and refuses instead of cleaning duplicates", () => {
    assert.equal(new Set(journal.entries.map((e) => e.idx)).size, journal.entries.length);
    assert.equal(journal.entries.find((e) => e.idx === 12)?.tag, "0012_auth_security");
    assert.equal(journal.entries.filter((e) => e.tag.startsWith("0012_")).length, 1);
    const ddl = readFileSync(path.join(folder, "0012_auth_security.sql"), "utf8");
    assert.doesNotMatch(ddl, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i);
    assert.match(ddl, /RAISE EXCEPTION/);
    assert.match(ddl, /CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_lower_unique ON admin_users \(lower\(email\)\)/);
  });

  it("clean database: lower(email) is unique, the original unique constraint still holds", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", folder);
    assert.ok((await indexes(db, "admin_users")).includes("admin_users_email_lower_unique"));
    assert.ok((await indexes(db, "auth_events")).includes("auth_events_actor_created_idx"));

    await db.insert(schema.adminUsers).values({ email: "ops@test.local", name: "Ops", passwordHash: "a:b", role: "cashier", branchId: 1 });
    await assert.rejects(
      db.insert(schema.adminUsers).values({ email: "OPS@Test.Local", name: "Upper", passwordHash: "a:b", role: "cashier", branchId: 1 }),
      dbError(/admin_users_email_lower_unique|duplicate key|unique/i),
    );
    await assert.rejects(
      db.insert(schema.adminUsers).values({ email: "ops@test.local", name: "Same", passwordHash: "a:b", role: "cashier", branchId: 1 }),
      dbError(/duplicate key|unique/i),
    );
    await db.insert(schema.adminUsers).values({ email: "other@test.local", name: "Other", passwordHash: "a:b", role: "cashier", branchId: 1 });
    const count = rows(await db.execute(sql`SELECT count(*)::int AS n FROM admin_users`))[0].n;
    assert.equal(count, 2);
    await client.close();
  });

  it("existing database with admins (incl. a legacy mixed-case email): rows kept, index created, re-apply is a no-op", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", folderUpTo(11));
    assert.equal((await indexes(db, "admin_users")).includes("admin_users_email_lower_unique"), false);
    await db.execute(sql`
      INSERT INTO admin_users (email, name, password_hash, role, branch_id) VALUES
        ('hq@legacy.local', 'HQ', 'salt:hash', 'super_admin', NULL),
        ('Kassa@Legacy.local', 'Kassa', 'salt:hash', 'cashier', 7)
    `);
    const before = rows(await db.execute(sql`SELECT id, email, password_hash, role, branch_id, status FROM admin_users ORDER BY id`));

    await applyMigrations(db, "pglite", folder);
    const afterRows = rows(await db.execute(sql`SELECT id, email, password_hash, role, branch_id, status FROM admin_users ORDER BY id`));
    assert.deepEqual(afterRows, before);
    assert.ok((await indexes(db, "admin_users")).includes("admin_users_email_lower_unique"));
    await assert.rejects(
      db.execute(sql`INSERT INTO admin_users (email, name, password_hash, role, branch_id) VALUES ('kassa@legacy.local', 'Dup', 'a:b', 'cashier', 7)`),
      dbError(/admin_users_email_lower_unique|duplicate key|unique/i),
    );

    const hashes = await listAppliedMigrationHashes(db);
    assert.equal(hashes.length, journal.entries.length);
    await applyMigrations(db, "pglite", folder);
    assert.deepEqual(await listAppliedMigrationHashes(db), hashes);
    await client.close();
  });

  it("existing database with case-only duplicates: migration is BLOCKED, no row changed, no index", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", folderUpTo(11));
    await db.execute(sql`
      INSERT INTO admin_users (email, name, password_hash, role, branch_id) VALUES
        ('dup@legacy.local', 'Lower', 'salt:hash', 'cashier', 7),
        ('DUP@legacy.local', 'Upper', 'salt:hash', 'cashier', 7)
    `);
    const duplicates = rows(await db.execute(sql`
      SELECT lower(email) AS email, count(*)::int AS n FROM admin_users GROUP BY lower(email) HAVING count(*) > 1
    `));
    assert.deepEqual(duplicates, [{ email: "dup@legacy.local", n: 2 }]);
    const before = rows(await db.execute(sql`SELECT id, email, name FROM admin_users ORDER BY id`));
    const appliedBefore = (await listAppliedMigrationHashes(db)).length;

    await assert.rejects(applyMigrations(db, "pglite", folder), dbError(/differ only by case/));
    assert.deepEqual(rows(await db.execute(sql`SELECT id, email, name FROM admin_users ORDER BY id`)), before);
    assert.equal((await indexes(db, "admin_users")).includes("admin_users_email_lower_unique"), false);
    assert.equal((await listAppliedMigrationHashes(db)).length, appliedBefore);
    await client.close();
  });
});
