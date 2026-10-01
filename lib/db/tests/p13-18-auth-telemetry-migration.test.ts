/**
 * Phase 13.18 — 0013_auth_event_telemetry: nullable auth_events.ip_address / user_agent with length checks.
 * Clean DB, an existing 0012 DB with auth events (rows untouched, new columns NULL), and re-running the DDL.
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
const ddl = readFileSync(path.join(folder, "0013_auth_event_telemetry.sql"), "utf8");
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

async function telemetryColumns(db: ReturnType<typeof drizzle>) {
  return rows(await db.execute(sql`
    SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_name = 'auth_events' AND column_name IN ('ip_address', 'user_agent') ORDER BY column_name
  `));
}

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("Phase 13.18 migration 0013_auth_event_telemetry", () => {
  it("is versioned after 0012, additive and re-runnable (IF NOT EXISTS + guarded constraints)", () => {
    assert.equal(new Set(journal.entries.map((e) => e.idx)).size, journal.entries.length);
    assert.equal(journal.entries.find((e) => e.idx === 13)?.tag, "0013_auth_event_telemetry");
    assert.equal(journal.entries.filter((e) => e.tag.startsWith("0013_")).length, 1);
    assert.doesNotMatch(ddl, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b|NOT NULL|DEFAULT/i);
    assert.match(ddl, /ADD COLUMN IF NOT EXISTS ip_address text;/);
    assert.match(ddl, /ADD COLUMN IF NOT EXISTS user_agent text;/);
    assert.match(ddl, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'auth_events_ip_address_len'\)/);
    assert.match(ddl, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'auth_events_user_agent_len'\)/);
    assert.doesNotMatch(ddl, /CREATE (UNIQUE )?INDEX/i);
  });

  it("clean database: nullable text columns, NULL by default, bounded lengths", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", folder);
    assert.deepEqual(await telemetryColumns(db), [
      { column_name: "ip_address", data_type: "text", is_nullable: "YES", column_default: null },
      { column_name: "user_agent", data_type: "text", is_nullable: "YES", column_default: null },
    ]);
    const [plain] = await db.insert(schema.authEvents).values({ actorType: "admin", eventType: "login.failure" }).returning();
    assert.equal(plain.ipAddress, null);
    assert.equal(plain.userAgent, null);
    const [full] = await db.insert(schema.authEvents)
      .values({ actorType: "admin", eventType: "login.success", ipAddress: "2001:db8::1", userAgent: "u".repeat(512) })
      .returning();
    assert.equal(full.userAgent?.length, 512);
    await assert.rejects(
      db.insert(schema.authEvents).values({ actorType: "admin", eventType: "x", userAgent: "u".repeat(513) }),
      dbError(/auth_events_user_agent_len|check constraint/i),
    );
    await assert.rejects(
      db.insert(schema.authEvents).values({ actorType: "admin", eventType: "x", ipAddress: "1".repeat(46) }),
      dbError(/auth_events_ip_address_len|check constraint/i),
    );
    await client.close();
  });

  it("existing 0012 database with auth events: rows unchanged, new columns NULL, re-apply is a no-op", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", folderUpTo(12));
    assert.deepEqual(await telemetryColumns(db), []);
    await db.execute(sql`
      INSERT INTO auth_events (actor_type, actor_id, event_type, success, reason, meta, created_at) VALUES
        ('admin', 1, 'login.success', true, '', '{"role":"super_admin"}', '2026-09-30T08:00:00Z'),
        ('admin', NULL, 'login.failure', false, 'bad_credentials', '{}', '2026-09-30T08:01:00Z'),
        ('customer', 9, 'logout', true, '', '{"revoked":true}', '2026-09-30T08:02:00Z')
    `);
    const select = sql`SELECT id, actor_type, actor_id, event_type, success, reason, meta, created_at FROM auth_events ORDER BY id`;
    const before = rows(await db.execute(select));

    await applyMigrations(db, "pglite", folder);
    assert.deepEqual(rows(await db.execute(select)), before);
    const telemetry = rows(await db.execute(sql`SELECT ip_address, user_agent FROM auth_events ORDER BY id`));
    assert.deepEqual(telemetry, before.map(() => ({ ip_address: null, user_agent: null })));
    assert.equal((await telemetryColumns(db)).length, 2);

    const hashes = await listAppliedMigrationHashes(db);
    assert.equal(hashes.length, journal.entries.length);
    await applyMigrations(db, "pglite", folder);
    assert.deepEqual(await listAppliedMigrationHashes(db), hashes);
    await client.close();
  });

  it("running the 0013 statements again on a migrated database changes nothing and does not fail", async () => {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", folder);
    await db.insert(schema.authEvents).values({ actorType: "admin", eventType: "logout", ipAddress: "10.0.0.5", userAgent: "curl/8.0" });
    const constraints = async () => rows(await db.execute(sql`
      SELECT conname FROM pg_constraint WHERE conname IN ('auth_events_ip_address_len', 'auth_events_user_agent_len') ORDER BY conname
    `)).map((r) => r.conname);
    assert.deepEqual(await constraints(), ["auth_events_ip_address_len", "auth_events_user_agent_len"]);
    for (const statement of ddl.split("--> statement-breakpoint")) await client.exec(statement);
    assert.deepEqual(await constraints(), ["auth_events_ip_address_len", "auth_events_user_agent_len"]);
    const [row] = rows(await db.execute(sql`SELECT ip_address, user_agent FROM auth_events WHERE event_type = 'logout'`));
    assert.deepEqual(row, { ip_address: "10.0.0.5", user_agent: "curl/8.0" });
    await client.close();
  });
});
