import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import { P3_AUTH_TABLES, listPublicTables } from "../src/health";
import * as schema from "../src/schema";
import { hashPassword } from "../src/password";

function hashTokenSecret(publicId: string, secret: string) {
  return createHash("sha256").update(`${publicId}:${secret}`).digest("hex");
}

function secretsEqualHex(a: string, b: string) {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

describe("P3 sessions + RBAC (PGlite)", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", getMigrationsFolder());
  });

  after(async () => {
    await client.close();
  });

  it("P3 tables exist and roles/permissions are seeded", async () => {
    const tables = await listPublicTables(db);
    for (const name of P3_AUTH_TABLES) {
      assert.ok(tables.includes(name), `missing ${name}`);
    }
    const roles = await db.select().from(schema.authRoles);
    const codes = roles.map((r) => r.code).sort();
    assert.deepEqual(codes, ["cashier", "super_admin"]);

    const sa = roles.find((r) => r.code === "super_admin")!;
    const cashier = roles.find((r) => r.code === "cashier")!;
    const saPerms = await db
      .select({ code: schema.authPermissions.code })
      .from(schema.authRolePermissions)
      .innerJoin(schema.authPermissions, eq(schema.authRolePermissions.permissionId, schema.authPermissions.id))
      .where(eq(schema.authRolePermissions.roleId, sa.id));
    const cashierPerms = await db
      .select({ code: schema.authPermissions.code })
      .from(schema.authRolePermissions)
      .innerJoin(schema.authPermissions, eq(schema.authRolePermissions.permissionId, schema.authPermissions.id))
      .where(eq(schema.authRolePermissions.roleId, cashier.id));

    assert.ok(saPerms.some((p) => p.code === "dashboard:read"));
    assert.ok(saPerms.some((p) => p.code === "rbac:manage"));
    assert.ok(!cashierPerms.some((p) => p.code === "dashboard:read"));
    assert.ok(cashierPerms.some((p) => p.code === "pos:sale"));
    assert.ok(!cashierPerms.some((p) => p.code === "branches:manage"));
  });

  it("role normalization SQL maps admin → super_admin", async () => {
    await db.insert(schema.adminUsers).values({
      email: "legacy-admin@test.local",
      name: "Legacy",
      passwordHash: hashPassword("x"),
      role: "admin",
    });
    await db.execute(sql`UPDATE admin_users SET role = 'super_admin' WHERE lower(role) IN ('admin', 'hq')`);
    const row = (await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.email, "legacy-admin@test.local")))[0];
    assert.equal(row.role, "super_admin");
  });

  it("valid session accepted; expired + revoked rejected; logout idempotent", async () => {
    const customer = (await db.insert(schema.customers).values({
      telegramId: `app:998900000001`,
      firstName: "Test",
      lastName: "",
      phone: "+998 90 000 00 01",
      passwordHash: hashPassword("secret1"),
    }).returning())[0];

    const publicId = randomBytes(16).toString("hex");
    const secret = randomBytes(32).toString("hex");
    const tokenHash = hashTokenSecret(publicId, secret);
    const expiresAt = new Date(Date.now() + 60_000);

    const session = (await db.insert(schema.authSessions).values({
      publicId,
      actorType: "customer",
      actorId: customer.id,
      tokenHash,
      expiresAt,
    }).returning())[0];

    // valid
    assert.ok(secretsEqualHex(session.tokenHash, hashTokenSecret(publicId, secret)));
    assert.ok(!session.revokedAt);
    assert.ok(new Date(session.expiresAt).getTime() > Date.now());

    // expire
    await db.update(schema.authSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.authSessions.id, session.id));
    const expired = (await db.select().from(schema.authSessions).where(eq(schema.authSessions.id, session.id)))[0];
    assert.ok(new Date(expired.expiresAt).getTime() <= Date.now());

    // restore + revoke
    await db.update(schema.authSessions).set({
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    }).where(eq(schema.authSessions.id, session.id));
    const revoked = (await db.select().from(schema.authSessions).where(eq(schema.authSessions.id, session.id)))[0];
    assert.ok(revoked.revokedAt);

    // idempotent second revoke
    await db.update(schema.authSessions).set({ revokedAt: new Date() }).where(eq(schema.authSessions.id, session.id));
    const still = (await db.select().from(schema.authSessions).where(eq(schema.authSessions.id, session.id)))[0];
    assert.ok(still.revokedAt);
  });

  it("multi-device: two sessions independently revocable", async () => {
    const customer = (await db.insert(schema.customers).values({
      telegramId: `app:998900000002`,
      firstName: "Multi",
      lastName: "",
      phone: "+998 90 000 00 02",
      passwordHash: hashPassword("secret2"),
    }).returning())[0];

    async function makeSession() {
      const publicId = randomBytes(16).toString("hex");
      const secret = randomBytes(32).toString("hex");
      const row = (await db.insert(schema.authSessions).values({
        publicId,
        actorType: "customer",
        actorId: customer.id,
        tokenHash: hashTokenSecret(publicId, secret),
        expiresAt: new Date(Date.now() + 60_000),
      }).returning())[0];
      return { row, publicId, secret };
    }

    const a = await makeSession();
    const b = await makeSession();
    await db.update(schema.authSessions).set({ revokedAt: new Date() }).where(eq(schema.authSessions.id, a.row.id));
    const a2 = (await db.select().from(schema.authSessions).where(eq(schema.authSessions.id, a.row.id)))[0];
    const b2 = (await db.select().from(schema.authSessions).where(eq(schema.authSessions.id, b.row.id)))[0];
    assert.ok(a2.revokedAt);
    assert.equal(b2.revokedAt, null);
  });

  it("auth_events never required for password fields in schema", async () => {
    await db.insert(schema.authEvents).values({
      actorType: "customer",
      actorId: 1,
      eventType: "login.success",
      success: true,
      reason: "",
      meta: JSON.stringify({ note: "no secrets" }),
    });
    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'auth_events'
    `);
    const names = (Array.isArray(cols) ? cols : (cols as { rows?: unknown[] }).rows || [])
      .map((r: { column_name?: string }) => r.column_name);
    assert.ok(!names.includes("password"));
    assert.ok(!names.includes("token"));
  });
});
