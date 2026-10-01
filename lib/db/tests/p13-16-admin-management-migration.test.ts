/**
 * Phase 13.16 — 0011_admin_management migration on a clean DB and on an existing (0000–0010) DB.
 * Additive only: status (default 'active', CHECK), updated_at (backfilled from created_at), role/status index.
 */
import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import { listAppliedMigrationHashes } from "../src/health";
import * as schema from "../src/schema";
import { hashPassword } from "../src/password";

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

/** Migrations folder limited to entries with idx <= maxIdx (simulates a DB deployed before 0011). */
function folderUpTo(maxIdx: number) {
  const dir = mkdtempSync(path.join(tmpdir(), "vm-mig-"));
  temps.push(dir);
  mkdirSync(path.join(dir, "meta"));
  const entries = journal.entries.filter((e) => e.idx <= maxIdx);
  for (const e of entries) copyFileSync(path.join(folder, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
  writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  return dir;
}

async function columns(db: ReturnType<typeof drizzle>) {
  return rows(await db.execute(sql`
    SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'admin_users'
  `));
}

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("Phase 13.16 migration 0011_admin_management", () => {
  it("is the next versioned migration with no index collision", () => {
    const tags = journal.entries.map((e) => e.tag);
    assert.equal(new Set(journal.entries.map((e) => e.idx)).size, journal.entries.length);
    assert.equal(journal.entries.find((e) => e.idx === 11)?.tag, "0011_admin_management");
    assert.equal(tags.filter((t) => t.startsWith("0011_")).length, 1);
    const ddl = readFileSync(path.join(folder, "0011_admin_management.sql"), "utf8");
    assert.doesNotMatch(ddl, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });

  it("clean database: status + updated_at exist with safe defaults and CHECK", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", folder);
    const cols = await columns(db);
    const status = cols.find((c) => c.column_name === "status");
    const updated = cols.find((c) => c.column_name === "updated_at");
    assert.equal(status?.is_nullable, "NO");
    assert.match(String(status?.column_default), /'active'/);
    assert.equal(updated?.is_nullable, "NO");

    const [row] = await db.insert(schema.adminUsers).values({
      email: "fresh@test.local", name: "Fresh", passwordHash: hashPassword("x1y2z3"), role: "cashier", branchId: 1,
    }).returning();
    assert.equal(row.status, "active");
    assert.ok(row.updatedAt instanceof Date);

    await assert.rejects(
      db.execute(sql`UPDATE admin_users SET status = 'deleted' WHERE id = ${row.id}`),
      dbError(/admin_users_status_check/),
    );
    await assert.rejects(
      db.insert(schema.adminUsers).values({ email: "fresh@test.local", name: "Dup", passwordHash: "a:b", role: "cashier" }),
      dbError(/duplicate key|unique/i),
    );
    const idx = rows(await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = 'admin_users'`)).map((r) => r.indexname);
    assert.ok(idx.includes("admin_users_role_status_idx"));
    await client.close();
  });

  it("existing database (0000–0010 with admins): rows kept, active, updated_at = created_at; re-apply is a no-op", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", folderUpTo(10));
    assert.equal((await columns(db)).some((c) => c.column_name === "status"), false);

    await db.execute(sql`
      INSERT INTO admin_users (email, name, password_hash, role, branch_id, created_at) VALUES
        ('hq@legacy.local', 'HQ', 'salt:hash', 'super_admin', NULL, '2025-01-02T03:04:05Z'),
        ('kassa@legacy.local', 'Kassa', 'salt:hash', 'cashier', 7, '2025-02-03T04:05:06Z')
    `);
    const before = rows(await db.execute(sql`SELECT id, email, password_hash, role, branch_id, created_at FROM admin_users ORDER BY id`));

    await applyMigrations(db, "pglite", folder);
    const afterRows = await db.select().from(schema.adminUsers).orderBy(schema.adminUsers.id);
    assert.equal(afterRows.length, 2);
    for (const [i, row] of afterRows.entries()) {
      assert.equal(row.email, before[i].email);
      assert.equal(row.passwordHash, before[i].password_hash);
      assert.equal(row.role, before[i].role);
      assert.equal(row.status, "active");
      assert.equal(row.updatedAt.getTime(), row.createdAt.getTime());
    }

    const hashes = await listAppliedMigrationHashes(db);
    assert.equal(hashes.length, journal.entries.length);
    await applyMigrations(db, "pglite", folder);
    assert.deepEqual(await listAppliedMigrationHashes(db), hashes);

    await db.update(schema.adminUsers).set({ status: "disabled" }).where(eq(schema.adminUsers.email, "kassa@legacy.local"));
    const disabled = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.status, "disabled"));
    assert.equal(disabled.length, 1);
    await client.close();
  });
});
