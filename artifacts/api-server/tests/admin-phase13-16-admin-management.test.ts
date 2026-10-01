/**
 * Admin Phase 13.16 — admin management backend + RBAC control plane.
 * Integration: the real Express app over a throw-away PGlite directory (migrations 0000–0011 applied,
 * no demo seed). Admins/branches are created by this test only; the directory is deleted afterwards.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const adminWeb = path.resolve(root, "../admin-web/src");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const dataDir = mkdtempSync(path.join(tmpdir(), "vm-1316-api-"));
process.env.PGLITE_DIR = dataDir;
process.env.APP_ENV = "development";
process.env.DB_DRIVER = "pglite";
process.env.ALLOW_DEMO_SEED = "0";
process.env.LOG_LEVEL = "silent";
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;

const dbm = await import("@workspace/db");
const { sql, eq } = await import("drizzle-orm");
const { default: app } = await import("../src/app");
const { issueAdminSession, signAdminToken } = await import("../src/lib/auth");
const { clearPermissionCache } = await import("../src/lib/rbac");
const { allowLegacyHmacTokens } = await import("../src/lib/securityEnv");
const { db, adminUsers, branches, auditLog, authSessions, hashPassword, verifyPassword } = dbm;

type Res = { status: number; body: any; text: string };
let server: Server;
let base = "";
const responseTexts: string[] = [];
const plaintexts: string[] = [];
const pw = (p: string) => (plaintexts.push(p), p);

function rows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as { rows?: any[] })?.rows || [];
}

async function call(method: string, url: string, token?: string | null, body?: unknown, scan = true): Promise<Res> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (scan) responseTexts.push(text);
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  return { status: r.status, body: parsed, text };
}

async function login(email: string, password: string) {
  return call("POST", "/api/admin/login", null, { email, password }, false);
}

async function createAdminRow(v: { email: string; name: string; role: string; branchId: number | null; password: string; status?: string }) {
  const [row] = await db.insert(adminUsers).values({
    email: v.email, name: v.name, role: v.role, branchId: v.branchId, passwordHash: hashPassword(pw(v.password)), status: v.status ?? "active",
  }).returning();
  return row;
}

async function adminAudit() {
  return db.select().from(auditLog).where(eq(auditLog.entity, "admin_user")).orderBy(auditLog.id);
}

async function auditCount(action: string) {
  return (await adminAudit()).filter((r) => r.action === action).length;
}

let B1 = 0;
let B2 = 0;
let hq: any;
let hqToken = "";
let cashier: any;
let cashierToken = "";

before(async () => {
  const [b1] = await db.insert(branches).values({ code: "T1316A", name: "Test filial A", address: "A ko‘chasi 1", phone: "+998 71 000-00-01", lat: 41.3, lng: 69.2 }).returning();
  const [b2] = await db.insert(branches).values({ code: "T1316B", name: "Test filial B", address: "B ko‘chasi 2", phone: "+998 71 000-00-02", lat: 41.31, lng: 69.21 }).returning();
  B1 = b1.id;
  B2 = b2.id;
  hq = await createAdminRow({ email: "hq@test.local", name: "Bosh admin", role: "super_admin", branchId: null, password: "hq-pass-1316" });
  cashier = await createAdminRow({ email: "kassa@test.local", name: "Kassir A", role: "cashier", branchId: B1, password: "kassa-1316" });
  hqToken = await issueAdminSession(hq.id);
  cashierToken = await issueAdminSession(cashier.id);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

const ENDPOINTS: Array<[string, (id: number) => string, unknown?]> = [
  ["GET", () => "/api/admin/users"],
  ["GET", (id) => `/api/admin/users/${id}`],
  ["POST", () => "/api/admin/users", { email: "x@test.local", name: "Xx", role: "cashier", branchId: 1, password: "secret12" }],
  ["PATCH", (id) => `/api/admin/users/${id}`, { name: "Yangi" }],
  ["PATCH", (id) => `/api/admin/users/${id}/status`, { status: "disabled" }],
  ["PATCH", (id) => `/api/admin/users/${id}/password`, { password: "secret12" }],
  ["GET", () => "/api/admin/rbac"],
];

describe("13.16 migration on the test database", () => {
  it("admin_users has status (default active, CHECK) and updated_at; email is DB-unique", async () => {
    const cols = rows(await db.execute(sql`SELECT column_name, column_default FROM information_schema.columns WHERE table_name = 'admin_users'`));
    assert.ok(cols.some((c) => c.column_name === "status" && /'active'/.test(String(c.column_default))));
    assert.ok(cols.some((c) => c.column_name === "updated_at"));
    assert.equal(hq.status, "active");
    await assert.rejects(db.execute(sql`UPDATE admin_users SET status = 'deleted' WHERE id = ${hq.id}`));
    await assert.rejects(db.insert(adminUsers).values({ email: "hq@test.local", name: "Dup", role: "cashier", branchId: B1, passwordHash: "x:y" }));
  });
});

describe("13.16 authorization (rbac:manage on every endpoint)", () => {
  it("no token / bad token → 401 on all endpoints", async () => {
    for (const [method, url, body] of ENDPOINTS) {
      assert.equal((await call(method, url(cashier.id), null, body)).status, 401, `${method} ${url(cashier.id)}`);
      assert.equal((await call(method, url(cashier.id), "s1.deadbeefdeadbeefdeadbeef.notarealsecretnotarealsecretnotareal", body)).status, 401);
    }
  });

  it("cashier → 403 on all endpoints and the denial is recorded with rbac:manage", async () => {
    for (const [method, url, body] of ENDPOINTS) {
      const r = await call(method, url(hq.id), cashierToken, body);
      assert.equal(r.status, 403, `${method} ${url(hq.id)}`);
      assert.equal(r.body.message, "Bu amal uchun ruxsat yo‘q");
    }
    const denied = rows(await db.execute(sql`SELECT meta FROM auth_events WHERE event_type = 'authz.denied' AND actor_id = ${cashier.id}`));
    assert.ok(denied.length >= ENDPOINTS.length);
    assert.ok(denied.every((d) => JSON.parse(d.meta).permission === "rbac:manage"));
    assert.equal((await db.select().from(adminUsers).where(eq(adminUsers.email, "x@test.local"))).length, 0);
  });

  it("super_admin → allowed", async () => {
    assert.equal((await call("GET", "/api/admin/users", hqToken)).status, 200);
    assert.equal((await call("GET", "/api/admin/rbac", hqToken)).status, 200);
  });
});

describe("13.16 list / detail", () => {
  it("list returns the safe DTO and server pagination", async () => {
    const r = await call("GET", "/api/admin/users", hqToken);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ["pagination", "users"]);
    assert.equal(r.body.pagination.total, 2);
    for (const u of r.body.users) {
      assert.deepEqual(Object.keys(u).sort(), ["branchId", "branchName", "createdAt", "email", "id", "name", "role", "status", "updatedAt"]);
    }
    const k = r.body.users.find((u: any) => u.id === cashier.id);
    assert.equal(k.branchName, "Test filial A");
    assert.equal(k.status, "active");

    const p1 = await call("GET", "/api/admin/users?limit=1&offset=0", hqToken);
    assert.equal(p1.body.users.length, 1);
    assert.deepEqual(p1.body.pagination, { limit: 1, offset: 0, total: 2, hasMore: true, nextOffset: 1 });
    const p2 = await call("GET", "/api/admin/users?limit=1&offset=1", hqToken);
    assert.deepEqual(p2.body.pagination, { limit: 1, offset: 1, total: 2, hasMore: false, nextOffset: null });
    assert.notEqual(p1.body.users[0].id, p2.body.users[0].id);
    const capped = await call("GET", "/api/admin/users?limit=500", hqToken);
    assert.equal(capped.body.pagination.limit, 50);
  });

  it("search q matches name or email, LIKE wildcards are stripped", async () => {
    assert.deepEqual((await call("GET", "/api/admin/users?q=kassir", hqToken)).body.users.map((u: any) => u.id), [cashier.id]);
    assert.deepEqual((await call("GET", "/api/admin/users?q=HQ%40TEST", hqToken)).body.users.map((u: any) => u.id), [hq.id]);
    assert.equal((await call("GET", "/api/admin/users?q=%25", hqToken)).body.pagination.total, 2);
    assert.equal((await call("GET", "/api/admin/users?q=yo%27q", hqToken)).body.pagination.total, 0);
  });

  it("role / branchId / status filters; invalid values → 422", async () => {
    assert.deepEqual((await call("GET", "/api/admin/users?role=cashier", hqToken)).body.users.map((u: any) => u.id), [cashier.id]);
    assert.deepEqual((await call("GET", "/api/admin/users?role=super_admin", hqToken)).body.users.map((u: any) => u.id), [hq.id]);
    assert.deepEqual((await call("GET", `/api/admin/users?branchId=${B1}`, hqToken)).body.users.map((u: any) => u.id), [cashier.id]);
    assert.equal((await call("GET", `/api/admin/users?branchId=${B2}`, hqToken)).body.pagination.total, 0);
    assert.equal((await call("GET", "/api/admin/users?status=active", hqToken)).body.pagination.total, 2);
    assert.equal((await call("GET", "/api/admin/users?status=disabled", hqToken)).body.pagination.total, 0);
    const badRole = await call("GET", "/api/admin/users?role=manager", hqToken);
    assert.deepEqual([badRole.status, badRole.body.code], [422, "ADMIN_ROLE_INVALID"]);
    const badStatus = await call("GET", "/api/admin/users?status=deleted", hqToken);
    assert.deepEqual([badStatus.status, badStatus.body.code], [422, "ADMIN_INVALID"]);
    const badBranch = await call("GET", "/api/admin/users?branchId=abc", hqToken);
    assert.deepEqual([badBranch.status, badBranch.body.code], [422, "ADMIN_BRANCH_INVALID"]);
  });

  it("detail adds permissions from the DB grants and session summary; unknown → 404", async () => {
    const r = await call("GET", `/api/admin/users/${cashier.id}`, hqToken);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ["isSelf", "permissions", "sessions", "user"]);
    const grants = rows(await db.execute(sql`
      SELECT p.code FROM auth_role_permissions rp JOIN auth_roles ro ON ro.id = rp.role_id JOIN auth_permissions p ON p.id = rp.permission_id
      WHERE ro.code = 'cashier' ORDER BY p.code`)).map((g) => g.code);
    assert.deepEqual(r.body.permissions, grants);
    assert.equal(r.body.permissions.includes("rbac:manage"), false);
    assert.equal(r.body.sessions.active, 1);
    assert.equal(r.body.isSelf, false);
    assert.equal((await call("GET", `/api/admin/users/${hq.id}`, hqToken)).body.isSelf, true);
    for (const id of ["999999", "abc", "0", "-1", "1e3"]) {
      const nf = await call("GET", `/api/admin/users/${id}`, hqToken);
      assert.deepEqual([nf.status, nf.body.code], [404, "ADMIN_NOT_FOUND"], id);
    }
  });
});

let created: any;

describe("13.16 create", () => {
  it("creates with normalized email, hashed password, atomic audit, 201", async () => {
    const before = await auditCount("admin.create");
    const r = await call("POST", "/api/admin/users", hqToken, {
      name: "  Yangi Kassir ", email: "  New.Cashier@Test.Local ", role: "cashier", branchId: B2, password: pw("Parol-1316-new"),
    });
    assert.equal(r.status, 201);
    created = r.body.user;
    assert.equal(created.email, "new.cashier@test.local");
    assert.equal(created.name, "Yangi Kassir");
    assert.equal(created.status, "active");
    assert.equal(created.branchName, "Test filial B");
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, created.id));
    assert.notEqual(row.passwordHash, "Parol-1316-new");
    assert.ok(verifyPassword("Parol-1316-new", row.passwordHash));
    assert.equal(await auditCount("admin.create"), before + 1);
    const audit = (await adminAudit()).filter((a) => a.action === "admin.create").at(-1)!;
    assert.equal(audit.actor, "hq@test.local");
    assert.deepEqual(JSON.parse(audit.payload), { adminId: created.id, email: created.email, role: "cashier", branchId: B2, status: "active" });
    const li = await login("new.cashier@test.local", "Parol-1316-new");
    assert.equal(li.status, 200);
  });

  it("duplicate email (any case) → 409 ADMIN_EMAIL_TAKEN, nothing written", async () => {
    const count = (await db.select().from(adminUsers)).length;
    const r = await call("POST", "/api/admin/users", hqToken, { name: "Dup", email: "NEW.CASHIER@test.local", role: "cashier", branchId: B1, password: "secret12" });
    assert.deepEqual([r.status, r.body.code], [409, "ADMIN_EMAIL_TAKEN"]);
    assert.equal((await db.select().from(adminUsers)).length, count);
  });

  it("invalid role / branch / pair / password / email → 422 with stable codes", async () => {
    const count = (await db.select().from(adminUsers)).length;
    const okBody = { name: "Valid Name", email: "valid@test.local", role: "cashier", branchId: B1, password: "secret12" };
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ role: "manager" }, "ADMIN_ROLE_INVALID"],
      [{ role: "admin" }, "ADMIN_ROLE_INVALID"],
      [{ role: "" }, "ADMIN_ROLE_INVALID"],
      [{ branchId: 999999 }, "ADMIN_BRANCH_INVALID"],
      [{ branchId: "1" }, "ADMIN_BRANCH_INVALID"],
      [{ branchId: null }, "ADMIN_BRANCH_INVALID"],
      [{ role: "super_admin", branchId: B1 }, "ADMIN_BRANCH_INVALID"],
      [{ password: "12345" }, "ADMIN_INVALID"],
      [{ password: "x".repeat(129) }, "ADMIN_INVALID"],
      [{ email: "not-an-email" }, "ADMIN_INVALID"],
      [{ name: "A" }, "ADMIN_INVALID"],
    ];
    for (const [patch, code] of cases) {
      const r = await call("POST", "/api/admin/users", hqToken, { ...okBody, ...patch });
      assert.deepEqual([r.status, r.body.code], [422, code], JSON.stringify(patch));
    }
    const noBranch = { ...okBody } as Record<string, unknown>;
    delete noBranch.branchId;
    assert.equal((await call("POST", "/api/admin/users", hqToken, noBranch)).body.code, "ADMIN_BRANCH_INVALID");
    assert.equal((await db.select().from(adminUsers)).length, count);
  });

  it("an HQ admin is created with branchId null", async () => {
    const r = await call("POST", "/api/admin/users", hqToken, { name: "Ikkinchi HQ", email: "hq2@test.local", role: "super_admin", branchId: null, password: pw("hq2-pass-1316") });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.branchId, null);
    assert.equal(r.body.user.branchName, null);
  });
});

describe("13.16 update", () => {
  it("name change → only changed fields, admin.update audit, updatedAt moves", async () => {
    const r = await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { name: "Kassir B" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.changed, ["name"]);
    assert.ok(new Date(r.body.user.updatedAt) > new Date(created.updatedAt));
    const audit = (await adminAudit()).filter((a) => a.action === "admin.update").at(-1)!;
    assert.deepEqual(JSON.parse(audit.payload).fields, ["name"]);
  });

  it("no-op patch writes nothing; status/password/unknown keys → 422", async () => {
    const before = await auditCount("admin.update");
    const r = await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { name: "Kassir B" });
    assert.deepEqual(r.body.changed, []);
    assert.equal(await auditCount("admin.update"), before);
    for (const body of [{ status: "disabled" }, { password: "secret12" }, { passwordHash: "a:b" }, { isAdmin: true }, {}]) {
      const bad = await call("PATCH", `/api/admin/users/${created.id}`, hqToken, body);
      assert.deepEqual([bad.status, bad.body.code], [422, "ADMIN_INVALID"], JSON.stringify(body));
    }
    assert.equal((await call("PATCH", "/api/admin/users/999999", hqToken, { name: "Nobody" })).status, 404);
  });

  it("email change normalizes; duplicate email → 409", async () => {
    const r = await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { email: "Kassir.B@Test.Local" });
    assert.equal(r.body.user.email, "kassir.b@test.local");
    const dup = await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { email: "KASSA@test.local" });
    assert.deepEqual([dup.status, dup.body.code], [409, "ADMIN_EMAIL_TAKEN"]);
    const audit = (await adminAudit()).filter((a) => a.action === "admin.update").at(-1)!;
    assert.equal(JSON.parse(audit.payload).previousEmail, "new.cashier@test.local");
  });

  it("branch change is validated server-side and audited", async () => {
    const r = await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { branchId: B1 });
    assert.deepEqual([r.status, r.body.changed, r.body.user.branchId], [200, ["branchId"], B1]);
    assert.equal(JSON.parse((await adminAudit()).at(-1)!.payload).previousBranchId, B2);
    assert.equal((await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { branchId: 999999 })).body.code, "ADMIN_BRANCH_INVALID");
    assert.equal((await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { branchId: null })).body.code, "ADMIN_BRANCH_INVALID");
  });

  it("role change: cashier → super_admin requires branchId null; admin.role_change audit; back again", async () => {
    const mismatched = await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { role: "super_admin" });
    assert.deepEqual([mismatched.status, mismatched.body.code], [422, "ADMIN_BRANCH_INVALID"]);
    assert.equal((await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { role: "owner" })).body.code, "ADMIN_ROLE_INVALID");
    const up = await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { role: "super_admin", branchId: null });
    assert.deepEqual([up.status, up.body.changed.sort()], [200, ["branchId", "role"]]);
    const rc = (await adminAudit()).filter((a) => a.action === "admin.role_change").at(-1)!;
    assert.deepEqual(JSON.parse(rc.payload), { adminId: created.id, email: "kassir.b@test.local", branchId: null, from: "cashier", to: "super_admin" });
    const detail = await call("GET", `/api/admin/users/${created.id}`, hqToken);
    assert.ok(detail.body.permissions.includes("rbac:manage"));
    const down = await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { role: "cashier", branchId: B2 });
    assert.equal(down.status, 200);
    assert.equal(down.body.user.role, "cashier");
  });
});

describe("13.16 status + sessions", () => {
  it("disable revokes sessions; the old token stops working; login is refused; enable restores login", async () => {
    const victim = await createAdminRow({ email: "victim@test.local", name: "Victim", role: "cashier", branchId: B1, password: "victim-1316" });
    const t1 = await issueAdminSession(victim.id);
    const t2 = await issueAdminSession(victim.id);
    assert.equal((await call("GET", "/api/admin/me", t1)).status, 200);

    const r = await call("PATCH", `/api/admin/users/${victim.id}/status`, hqToken, { status: "disabled" });
    assert.deepEqual([r.status, r.body.changed, r.body.revokedSessions, r.body.user.status], [200, true, 2, "disabled"]);
    for (const t of [t1, t2]) {
      const me = await call("GET", "/api/admin/me", t);
      assert.equal(me.status, 401);
    }
    const open = rows(await db.execute(sql`SELECT count(*)::int n FROM auth_sessions WHERE actor_type = 'admin' AND actor_id = ${victim.id} AND revoked_at IS NULL`));
    assert.equal(open[0].n, 0);
    const audit = (await adminAudit()).filter((a) => a.action === "admin.status_change").at(-1)!;
    assert.deepEqual(JSON.parse(audit.payload), { adminId: victim.id, email: "victim@test.local", role: "cashier", branchId: B1, from: "active", to: "disabled", revokedSessions: 2 });

    const li = await login("victim@test.local", "victim-1316");
    assert.deepEqual([li.status, li.body.code], [403, "ADMIN_DISABLED"]);
    assert.equal(li.body.token, undefined);
    const wrong = await login("victim@test.local", "wrong-password");
    assert.equal(wrong.status, 401);

    const again = await call("PATCH", `/api/admin/users/${victim.id}/status`, hqToken, { status: "disabled" });
    assert.deepEqual([again.status, again.body.changed], [200, false]);
    assert.equal((await call("GET", "/api/admin/users?status=disabled", hqToken)).body.users.some((u: any) => u.id === victim.id), true);

    const en = await call("PATCH", `/api/admin/users/${victim.id}/status`, hqToken, { status: "active" });
    assert.deepEqual([en.status, en.body.user.status, en.body.revokedSessions], [200, "active", 0]);
    assert.equal((await call("GET", "/api/admin/me", t1)).status, 401);
    assert.equal((await login("victim@test.local", "victim-1316")).status, 200);
    for (const body of [{ status: "deleted" }, {}, { status: true }]) {
      assert.equal((await call("PATCH", `/api/admin/users/${victim.id}/status`, hqToken, body)).status, 422);
    }
  });

  it("a disabled admin's still-valid session or legacy token is rejected by requireAdmin", async () => {
    const ghost = await createAdminRow({ email: "ghost@test.local", name: "Ghost", role: "super_admin", branchId: null, password: "ghost-1316" });
    const token = await issueAdminSession(ghost.id);
    await db.update(adminUsers).set({ status: "disabled" }).where(eq(adminUsers.id, ghost.id));
    const me = await call("GET", "/api/admin/me", token);
    assert.deepEqual([me.status, me.body.code], [401, "ADMIN_DISABLED"]);
    assert.equal((await call("GET", "/api/admin/users", token)).status, 401);
    if (allowLegacyHmacTokens()) {
      const legacy = signAdminToken(ghost.id, "super_admin", null);
      assert.equal((await call("GET", "/api/admin/me", legacy)).status, 401);
    }
  });

  it("self-protection: cannot disable self or change own role/branch; own name is editable", async () => {
    const off = await call("PATCH", `/api/admin/users/${hq.id}/status`, hqToken, { status: "disabled" });
    assert.deepEqual([off.status, off.body.code], [409, "ADMIN_SELF_PROTECTED"]);
    const role = await call("PATCH", `/api/admin/users/${hq.id}`, hqToken, { role: "cashier", branchId: B1 });
    assert.deepEqual([role.status, role.body.code], [409, "ADMIN_SELF_PROTECTED"]);
    const branch = await call("PATCH", `/api/admin/users/${hq.id}`, hqToken, { branchId: B1 });
    assert.equal(branch.status, 409);
    assert.equal((await call("PATCH", `/api/admin/users/${hq.id}`, hqToken, { name: "Bosh administrator" })).status, 200);
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, hq.id));
    assert.deepEqual([row.status, row.role, row.branchId], ["active", "super_admin", null]);
  });
});

describe("13.16 password", () => {
  it("changes only the hash, revokes target sessions, never echoes or audits the password", async () => {
    const t = await issueAdminSession(cashier.id);
    const r = await call("PATCH", `/api/admin/users/${cashier.id}/password`, hqToken, { password: pw("Yangi-parol-1316") });
    assert.equal(r.status, 200);
    assert.ok(r.body.revokedSessions >= 2);
    assert.equal((await call("GET", "/api/admin/me", t)).status, 401);
    assert.equal((await call("GET", "/api/admin/me", cashierToken)).status, 401);
    assert.equal((await login("kassa@test.local", "kassa-1316")).status, 401);
    const ok = await login("kassa@test.local", "Yangi-parol-1316");
    assert.equal(ok.status, 200);
    cashierToken = ok.body.token;
    const audit = (await adminAudit()).filter((a) => a.action === "admin.password_change").at(-1)!;
    assert.deepEqual(Object.keys(JSON.parse(audit.payload)).sort(), ["adminId", "branchId", "email", "revokedSessions", "role"]);
    for (const body of [{ password: "123" }, {}, { password: "secret12", role: "super_admin" }]) {
      assert.equal((await call("PATCH", `/api/admin/users/${cashier.id}/password`, hqToken, body)).status, 422);
    }
  });

  it("self password change keeps the current session and revokes the others", async () => {
    const other = await issueAdminSession(hq.id);
    const r = await call("PATCH", `/api/admin/users/${hq.id}/password`, hqToken, { password: pw("hq-pass-1316-b") });
    assert.equal(r.status, 200);
    assert.equal((await call("GET", "/api/admin/me", hqToken)).status, 200);
    assert.equal((await call("GET", "/api/admin/me", other)).status, 401);
  });
});

describe("13.16 RBAC control plane", () => {
  it("GET /admin/rbac returns seeded roles, all 22 permissions incl. rbac:manage, and the DB matrix", async () => {
    const r = await call("GET", "/api/admin/rbac", hqToken);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.roles.map((x: any) => [x.code, x.scope]), [["super_admin", "all"], ["cashier", "branch"]]);
    const perms = r.body.permissions.map((p: any) => p.code);
    assert.equal(perms.length, 22);
    assert.ok(perms.includes("rbac:manage"));
    const dbPerms = rows(await db.execute(sql`SELECT code FROM auth_permissions ORDER BY code`)).map((p) => p.code);
    assert.deepEqual(perms, dbPerms);
    const hqRow = r.body.matrix.find((m: any) => m.role === "super_admin");
    const cashierRow = r.body.matrix.find((m: any) => m.role === "cashier");
    assert.equal(hqRow.source, "db");
    assert.equal(hqRow.permissions.length, 22);
    assert.equal(cashierRow.permissions.length, 9);
    assert.equal(cashierRow.permissions.includes("rbac:manage"), false);
    assert.deepEqual(r.body.assignableRoles, ["super_admin", "cashier"]);
    assert.equal(r.body.managePermission, "rbac:manage");
    assert.ok(r.body.roles[0].admins.active >= 2);
  });

  it("there is no role/permission CRUD and no hard delete endpoint", async () => {
    for (const [method, url] of [["POST", "/api/admin/rbac"], ["POST", "/api/admin/roles"], ["DELETE", `/api/admin/users/${created.id}`], ["PUT", `/api/admin/users/${created.id}`]]) {
      assert.equal((await call(method, url, hqToken, method === "DELETE" ? undefined : {})).status, 404, `${method} ${url}`);
    }
    assert.equal((await db.select().from(adminUsers).where(eq(adminUsers.id, created.id))).length, 1);
  });

  it("a branch-scoped role granted rbac:manage only manages its own branch staff and never HQ", async () => {
    await db.execute(sql`INSERT INTO auth_role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM auth_roles r, auth_permissions p WHERE r.code = 'cashier' AND p.code = 'rbac:manage'`);
    clearPermissionCache();
    try {
      const list = await call("GET", "/api/admin/users", cashierToken);
      assert.equal(list.status, 200);
      assert.ok(list.body.users.length > 0);
      assert.ok(list.body.users.every((u: any) => u.branchId === B1));
      assert.equal((await call("GET", `/api/admin/users?branchId=${B2}`, cashierToken)).status, 403);
      assert.equal((await call("GET", `/api/admin/users/${hq.id}`, cashierToken)).status, 403);
      assert.equal((await call("GET", `/api/admin/users/${created.id}`, cashierToken)).status, 403);
      const hqCreate = await call("POST", "/api/admin/users", cashierToken, { name: "Sneaky", email: "sneaky@test.local", role: "super_admin", branchId: null, password: "secret12" });
      assert.deepEqual([hqCreate.status, hqCreate.body.code], [403, "ADMIN_SCOPE_FORBIDDEN"]);
      const otherBranch = await call("POST", "/api/admin/users", cashierToken, { name: "Other", email: "other@test.local", role: "cashier", branchId: B2, password: "secret12" });
      assert.equal(otherBranch.status, 403);
      assert.equal((await call("PATCH", `/api/admin/users/${hq.id}/status`, cashierToken, { status: "disabled" })).status, 403);
      assert.equal((await call("PATCH", `/api/admin/users/${created.id}`, cashierToken, { name: "Hijack" })).status, 403);
      const own = await call("POST", "/api/admin/users", cashierToken, { name: "Own", email: "own@test.local", role: "cashier", branchId: B1, password: pw("own-pass-1316") });
      assert.equal(own.status, 201);
      const moveAway = await call("PATCH", `/api/admin/users/${own.body.user.id}`, cashierToken, { branchId: B2 });
      assert.equal(moveAway.status, 403);
      assert.deepEqual((await call("GET", "/api/admin/rbac", cashierToken)).body.assignableRoles, ["cashier"]);
    } finally {
      await db.execute(sql`DELETE FROM auth_role_permissions WHERE role_id = (SELECT id FROM auth_roles WHERE code = 'cashier')
        AND permission_id = (SELECT id FROM auth_permissions WHERE code = 'rbac:manage')`);
      clearPermissionCache();
    }
    assert.equal((await call("GET", "/api/admin/users", cashierToken)).status, 403);
  });
});

describe("13.16 atomicity, errors, concurrency", () => {
  it("if the audit insert fails, the mutation rolls back and the 500 hides the DB error", async () => {
    await db.execute(sql`CREATE FUNCTION t1316_fail_audit() RETURNS trigger AS $$
      BEGIN IF NEW.action LIKE 'admin.%' AND NEW.action <> 'admin.login' THEN RAISE EXCEPTION 't1316 audit sink down'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER t1316_fail_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION t1316_fail_audit()`);
    try {
      const [beforeRow] = await db.select().from(adminUsers).where(eq(adminUsers.id, created.id));
      const upd = await call("PATCH", `/api/admin/users/${created.id}`, hqToken, { name: "Rolled back" });
      assert.deepEqual(upd.body, { message: "Ichki xatolik" });
      assert.equal(upd.status, 500);
      assert.doesNotMatch(upd.text, /t1316|audit_log|insert|Failed query|P0001/i);
      const [afterRow] = await db.select().from(adminUsers).where(eq(adminUsers.id, created.id));
      assert.deepEqual([afterRow.name, afterRow.updatedAt.getTime()], [beforeRow.name, beforeRow.updatedAt.getTime()]);

      const ins = await call("POST", "/api/admin/users", hqToken, { name: "Ghost Row", email: "ghost.row@test.local", role: "cashier", branchId: B1, password: "secret12" });
      assert.equal(ins.status, 500);
      assert.equal((await db.select().from(adminUsers).where(eq(adminUsers.email, "ghost.row@test.local"))).length, 0);

      const t = await issueAdminSession(created.id);
      const st = await call("PATCH", `/api/admin/users/${created.id}/status`, hqToken, { status: "disabled" });
      assert.equal(st.status, 500);
      const [still] = await db.select().from(adminUsers).where(eq(adminUsers.id, created.id));
      assert.equal(still.status, "active");
      assert.equal((await call("GET", "/api/admin/me", t)).status, 200);

      const pwd = await call("PATCH", `/api/admin/users/${created.id}/password`, hqToken, { password: "Rollback-1316" });
      assert.equal(pwd.status, 500);
      const [same] = await db.select().from(adminUsers).where(eq(adminUsers.id, created.id));
      assert.equal(same.passwordHash, beforeRow.passwordHash);
    } finally {
      await db.execute(sql`DROP TRIGGER t1316_fail_audit ON audit_log`);
      await db.execute(sql`DROP FUNCTION t1316_fail_audit()`);
    }
  });

  it("duplicate-email race: exactly one 201, the rest 409, one row", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
      call("POST", "/api/admin/users", hqToken, { name: `Race ${i}`, email: i % 2 ? "RACE@test.local" : "race@test.local", role: "cashier", branchId: B1, password: "secret12" })));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409, 409, 409, 409]);
    assert.ok(results.filter((r) => r.status === 409).every((r) => r.body.code === "ADMIN_EMAIL_TAKEN"));
    assert.equal((await db.select().from(adminUsers).where(eq(adminUsers.email, "race@test.local"))).length, 1);
  });

  it("concurrent disable of the same admin: one transition, one audit row", async () => {
    const target = await createAdminRow({ email: "concurrent@test.local", name: "Concurrent", role: "cashier", branchId: B2, password: "concurrent-1316" });
    const before = await auditCount("admin.status_change");
    const results = await Promise.all(Array.from({ length: 5 }, () => call("PATCH", `/api/admin/users/${target.id}/status`, hqToken, { status: "disabled" })));
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(results.filter((r) => r.body.changed).length, 1);
    assert.equal(await auditCount("admin.status_change"), before + 1);
  });

  it("concurrent role and branch updates leave a valid row and one audit row per real change", async () => {
    const target = await createAdminRow({ email: "flip@test.local", name: "Flip", role: "cashier", branchId: B1, password: "flip-1316" });
    const beforeUpd = await auditCount("admin.update");
    const branchResults = await Promise.all([B2, B1, B2, B1].map((b) => call("PATCH", `/api/admin/users/${target.id}`, hqToken, { branchId: b })));
    assert.ok(branchResults.every((r) => r.status === 200));
    const changedCount = branchResults.filter((r) => r.body.changed.length).length;
    assert.equal(await auditCount("admin.update"), beforeUpd + changedCount);
    const [afterBranch] = await db.select().from(adminUsers).where(eq(adminUsers.id, target.id));
    assert.ok([B1, B2].includes(afterBranch.branchId!));

    const beforeRole = await auditCount("admin.role_change");
    const roleResults = await Promise.all([
      call("PATCH", `/api/admin/users/${target.id}`, hqToken, { role: "super_admin", branchId: null }),
      call("PATCH", `/api/admin/users/${target.id}`, hqToken, { role: "cashier", branchId: B2 }),
      call("PATCH", `/api/admin/users/${target.id}`, hqToken, { role: "super_admin", branchId: null }),
    ]);
    assert.ok(roleResults.every((r) => r.status === 200));
    const roleChanges = roleResults.filter((r) => r.body.changed.includes("role")).length;
    assert.equal(await auditCount("admin.role_change"), beforeRole + roleChanges);
    const [final] = await db.select().from(adminUsers).where(eq(adminUsers.id, target.id));
    assert.ok((final.role === "super_admin" && final.branchId === null) || (final.role === "cashier" && final.branchId != null));
  });

  const activeHq = async () =>
    rows(await db.execute(sql`SELECT count(*)::int n FROM admin_users WHERE role IN ('super_admin','admin','hq') AND status = 'active'`))[0].n;

  /** Only hq + hq2 stay active HQ; both get fresh sessions. */
  async function twoActiveHq() {
    await db.update(adminUsers).set({ status: "active" }).where(sql`${adminUsers.id} = ${hq.id} OR ${adminUsers.email} = 'hq2@test.local'`);
    await db.update(adminUsers).set({ role: "super_admin", branchId: null }).where(sql`${adminUsers.id} = ${hq.id} OR ${adminUsers.email} = 'hq2@test.local'`);
    await db.update(adminUsers).set({ status: "disabled" })
      .where(sql`${adminUsers.role} IN ('super_admin', 'admin', 'hq') AND ${adminUsers.id} <> ${hq.id} AND ${adminUsers.email} <> 'hq2@test.local'`);
    const [hq2] = await db.select().from(adminUsers).where(eq(adminUsers.email, "hq2@test.local"));
    assert.equal(await activeHq(), 2);
    return { hq2, t1: await issueAdminSession(hq.id), t2: await issueAdminSession(hq2.id) };
  }

  /**
   * Holds the PGlite transaction mutex while both requests are in flight, so both pass
   * requireAdmin + rbac:manage before either mutation transaction starts (the real race window).
   */
  async function gatedPair(first: () => Promise<Res>, second: () => Promise<Res>) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const holding = db.transaction(async () => { await gate; });
    const pending = [first(), second()];
    await new Promise((resolve) => setTimeout(resolve, 250));
    release();
    await holding;
    return Promise.all(pending);
  }

  it("last active super_admin: cross-disable after both passed auth → one 200, one 409 ADMIN_LAST_ACTIVE_SUPER_ADMIN", async () => {
    const { hq2, t1, t2 } = await twoActiveHq();
    const [a, b] = await gatedPair(
      () => call("PATCH", `/api/admin/users/${hq2.id}/status`, t1, { status: "disabled" }),
      () => call("PATCH", `/api/admin/users/${hq.id}/status`, t2, { status: "disabled" }),
    );
    assert.deepEqual([a.status, b.status].sort(), [200, 409], JSON.stringify([a.body, b.body]));
    assert.equal([a, b].find((r) => r.status === 409)!.body.code, "ADMIN_LAST_ACTIVE_SUPER_ADMIN");
    assert.equal(await activeHq(), 1);
  });

  it("last active super_admin: cross-downgrade after both passed auth → one 200, one 409", async () => {
    const { hq2, t1, t2 } = await twoActiveHq();
    const [c, d] = await gatedPair(
      () => call("PATCH", `/api/admin/users/${hq2.id}`, t1, { role: "cashier", branchId: B1 }),
      () => call("PATCH", `/api/admin/users/${hq.id}`, t2, { role: "cashier", branchId: B1 }),
    );
    assert.deepEqual([c.status, d.status].sort(), [200, 409], JSON.stringify([c.body, d.body]));
    assert.equal([c, d].find((r) => r.status === 409)!.body.code, "ADMIN_LAST_ACTIVE_SUPER_ADMIN");
    assert.equal(await activeHq(), 1);
  });

  it("ungated cross-disable also never leaves zero active super_admins (loser gets 409 or 401)", async () => {
    const { hq2, t1, t2 } = await twoActiveHq();
    const [a, b] = await Promise.all([
      call("PATCH", `/api/admin/users/${hq2.id}/status`, t1, { status: "disabled" }),
      call("PATCH", `/api/admin/users/${hq.id}/status`, t2, { status: "disabled" }),
    ]);
    assert.equal([a, b].filter((r) => r.status === 200).length, 1);
    assert.ok([a, b].every((r) => [200, 401, 409].includes(r.status)));
    assert.equal(await activeHq(), 1);
    await twoActiveHq();
    hqToken = await issueAdminSession(hq.id);
  });
});

describe("13.16 secrets never leave the server", () => {
  it("no response body carried a password, hash, session secret or token hash", async () => {
    const hashes = (await db.select({ h: adminUsers.passwordHash }).from(adminUsers)).map((r) => r.h).filter((h) => h.includes(":"));
    const tokenHashes = (await db.select({ h: authSessions.tokenHash }).from(authSessions)).map((r) => r.h);
    const all = responseTexts.join("\n");
    assert.ok(responseTexts.length > 100);
    assert.doesNotMatch(all, /passwordHash|password_hash|tokenHash|token_hash|"token"|"password"|s1\.[0-9a-f]{32}\./);
    for (const p of plaintexts) assert.equal(all.includes(p), false, "plaintext password leaked");
    for (const h of hashes) assert.equal(all.includes(h.split(":")[1]), false, "hash leaked");
    for (const h of tokenHashes) assert.equal(all.includes(h), false, "token hash leaked");
  });

  it("no admin_user audit row or auth event stores a password, hash or token", async () => {
    const audits = (await adminAudit()).map((a) => a.payload).join("\n");
    const events = rows(await db.execute(sql`SELECT meta FROM auth_events`)).map((e) => e.meta).join("\n");
    for (const blob of [audits, events]) {
      assert.doesNotMatch(blob, /password|passwordHash|token|secret/i);
      for (const p of plaintexts) assert.equal(blob.includes(p), false);
    }
    const actions = new Set((await adminAudit()).map((a) => a.action));
    for (const a of ["admin.create", "admin.update", "admin.role_change", "admin.status_change", "admin.password_change"]) assert.ok(actions.has(a), a);
  });
});

describe("13.16 static contract", () => {
  const route = read(path.join(root, "src/routes/adminUsers.ts"));
  const lib = read(path.join(root, "src/lib/adminUsers.ts"));
  const auth = read(path.join(root, "src/lib/auth.ts"));
  const index = read(path.join(root, "src/routes/index.ts"));
  const appTs = read(path.join(root, "src/app.ts"));
  const migration = read(path.join(repoRoot, "lib/db/migrations/0011_admin_management.sql"));

  it("every handler starts with requireRbacManager (requireAdmin + rbac:manage); router is registered", () => {
    const handlers = [...route.matchAll(/router\.(get|post|patch|put|delete)\("([^"]+)", async \(req, res, next\) => \{\n {2}try \{\n {4}const actor = await requireRbacManager\(req\);/g)].map((m) => `${m[1]} ${m[2]}`);
    const declared = [...route.matchAll(/router\.(get|post|patch|put|delete)\("([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(handlers, declared);
    assert.deepEqual(declared.sort(), [
      "get /admin/rbac", "get /admin/users", "get /admin/users/:id",
      "patch /admin/users/:id", "patch /admin/users/:id/password", "patch /admin/users/:id/status", "post /admin/users",
    ]);
    assert.match(route, /await requireAdmin\(req\);\n {2}await requirePermission\(actor, RBAC_MANAGE_PERMISSION\);/);
    assert.match(route, /RBAC_MANAGE_PERMISSION = "rbac:manage"/);
    assert.match(index, /router\.use\(adminUsersRouter\);/);
  });

  it("mutations run inside db.transaction with the advisory lock, row lock and audit insert", () => {
    assert.equal((route.match(/await db\.transaction\(/g) || []).length, 4);
    assert.equal((route.match(/await lockAdminMutations\(tx\);/g) || []).length, 4);
    assert.match(route, /pg_advisory_xact_lock/);
    assert.match(route, /\.limit\(1\)\.for\("update"\)/);
    assert.doesNotMatch(route, /\.delete\(adminUsers\)|DELETE FROM admin_users/);
    assert.doesNotMatch(route, /recordAuthEvent[\s\S]{0,40}tx|await db\.(insert|update)\(/);
  });

  it("DTO is an explicit allow-list and passwords are only hashed", () => {
    const dto = lib.slice(lib.indexOf("export function toAdminUserDto"), lib.indexOf("export function normalizeAdminEmail"));
    assert.doesNotMatch(dto, /passwordHash|\.\.\.row/);
    assert.match(route, /const passwordHash = hashPassword\(/);
    assert.doesNotMatch(route, /passwordHash: input\.password|passwordHash: body\.password/);
    assert.match(lib, /ADMIN_PASSWORD_MIN = 6/);
  });

  it("auth chain rejects disabled admins on both token paths and at login", () => {
    assert.match(auth, /return activeAdminOrThrow\(session\.actorId\);/);
    assert.match(auth, /return activeAdminOrThrow\(parsed\.userId\);/);
    assert.match(auth, /if \(user\.status !== ADMIN_ACTIVE_STATUS\)/);
    assert.match(auth, /status: 403, code: "ADMIN_DISABLED"/);
  });

  it("the error handler never forwards status-less (DB) messages or SQLSTATE codes", () => {
    assert.match(appTs, /message: handled \? error\.message \|\| "Ichki xatolik" : "Ichki xatolik"/);
    assert.match(appTs, /\/\^\[0-9A-Z\]\{5\}\$\//);
  });

  it("migration 0011 is additive", () => {
    assert.match(migration, /ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'/);
    assert.match(migration, /CONSTRAINT admin_users_status_check CHECK \(status IN \('active', 'disabled'\)\)/);
    assert.doesNotMatch(migration, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i);
  });
});

describe("13.16 AdminAccessPage over the real API", () => {
  const page = read(path.join(adminWeb, "pages/AdminAccessPage.tsx"));
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const docs = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
  const css = read(path.join(adminWeb, "styles.css"));
  const block = (start: string, end: string) => {
    const a = code.indexOf(start);
    assert.ok(a >= 0, start);
    const b = code.indexOf(end, a + start.length);
    assert.ok(b > a, end);
    return code.slice(a, b);
  };

  it("list: server pagination, search and role/branch/status filters reset the offset", () => {
    const load = block("async function load()", "async function loadDetail(");
    assert.match(load, /new URLSearchParams\(\{ limit: String\(PAGE_SIZE\), offset: String\(offset\) \}\)/);
    for (const key of ["q", "role", "branchId", "status"]) assert.match(load, new RegExp(`params\\.set\\("${key}", filters\\.${key}\\)`));
    assert.match(code, /const PAGE_SIZE = 25;/);
    assert.match(code, /<PaginationBar[\s\S]*?offset=\{page\.offset\}[\s\S]*?hasMore=\{page\.hasMore\}/);
    assert.match(code, /onNext=\{\(\) => setOffset\(page\.offset \+ page\.limit\)\}/);
    assert.match(block("function setFilter(", "function resetFilters("), /setOffset\(0\);/);
    assert.match(block("function applySearch(", "function setFilter("), /setOffset\(0\);/);
    for (const label of ["Qidiruv", "Rol", "Filial", "Holat"]) assert.ok(code.includes(`<FilterField label="${label}"`), label);
    assert.match(code, /<option value="active">Faol<\/option>\s*<option value="disabled">Faolsiz<\/option>/);
  });

  it("loading / error / empty / list states are distinct", () => {
    assert.match(code, /<LoadingBlock rows=\{5\} label="Administratorlar yuklanmoqda…" \/>/);
    assert.match(code, /<ErrorState message=\{error\.message\}/);
    assert.match(code, /hasFilters \? "Mos administrator topilmadi" : "Administratorlar yo‘q"/);
    assert.match(code, /<LoadingBlock rows=\{4\} label="Administrator ma'lumotlari yuklanmoqda…" \/>/);
    assert.match(code, /<ErrorState message=\{detailError\.message\}/);
  });

  it("create form: Ism, Email, Rol, Filial, Parol (show/hide); success closes, reloads, banners; no optimistic row", () => {
    for (const label of ["Ism *", "Email *", "Rol *", "Parol *"]) assert.ok(code.includes(label), label);
    assert.match(code, /<span className="filter-label">Filial\{isHqRole\(form\.role\) \? "" : " \*"\}<\/span>/);
    assert.match(code, /type=\{showPassword \? "text" : "password"\}/);
    assert.match(code, /aria-label=\{showPassword \? "Parolni yashirish" : "Parolni ko‘rsatish"\}/);
    const create = block("async function submitCreate(", "async function submitEdit(");
    assert.match(create, /method: "POST"/);
    assert.match(create, /setPanel\(null\);\s*setForm\(emptyForm\);/);
    assert.match(create, /setNotice\(\{ tone: "ok", text: `Administrator qo‘shildi/);
    assert.match(create, /await load\(\);/);
    assert.equal((code.match(/setRows\(/g) || []).length, 1);
    assert.match(block("async function load()", "async function loadDetail("), /setRows\(\(list\.users/);
  });

  it("edit form sends only changed fields and reloads list + detail", () => {
    const edit = block("async function submitEdit(", "async function submitPassword(");
    assert.match(edit, /const changes: Record<string, unknown> = \{\};/);
    for (const f of ["name", "email", "role", "branchId"]) assert.match(edit, new RegExp(`changes\\.${f} = `));
    assert.match(edit, /if \(!Object\.keys\(changes\)\.length\) return setFormMsg\("O‘zgarish yo‘q\."\);/);
    assert.match(edit, /method: "PATCH", body: JSON\.stringify\(changes\)/);
    assert.match(edit, /await Promise\.all\(\[load\(\), loadDetail\(detail\.user\.id\)\]\);/);
    assert.doesNotMatch(edit, /password|status:/);
  });

  it("disable goes through ConfirmDialog with the spec copy; enable is direct; both reload", () => {
    assert.match(code, /<ConfirmDialog\s+open=\{confirmDisable && Boolean\(detail\)\}/);
    assert.ok(code.includes("Bu administratorning tizimga kirishi to‘xtatiladi."));
    assert.match(code, /onConfirm=\{\(\) => void changeStatus\("disabled"\)\}/);
    assert.match(code, /onClick=\{\(\) => void changeStatus\("active"\)\}/);
    assert.match(code, /onClick=\{\(\) => setConfirmDisable\(true\)\}/);
    const status = block("async function changeStatus(", "const rowKeys");
    assert.match(status, /\/status`, token, \{\s*method: "PATCH",\s*body: JSON\.stringify\(\{ status \}\)/);
    assert.match(status, /await Promise\.all\(\[load\(\), loadDetail\(detail\.user\.id\)\]\);/);
    assert.doesNotMatch(code, /\bconfirm\(|window\.confirm/);
    assert.match(code, /detail\.isSelf \? null : \(/);
  });

  it("password change uses the dedicated endpoint and clears the field; the password is never rendered from data", () => {
    const pwd = block("async function submitPassword(", "async function changeStatus(");
    assert.match(pwd, /\/password`, token, \{\s*method: "PATCH",\s*body: JSON\.stringify\(\{ password: form\.password \}\)/);
    assert.match(pwd, /setForm\(emptyForm\);/);
    assert.doesNotMatch(code, /(row|detail\.user|user)\.password/);
    assert.doesNotMatch(page, /passwordHash|tokenHash|accessToken|refreshToken/);
  });

  it("RBAC matrix is Role × Permission × Scope from GET /api/admin/rbac; labels are display-only", () => {
    assert.match(code, /request\("\/api\/admin\/rbac", token\)/);
    assert.match(code, /new Map\(\(rbac\?\.matrix \|\| \[\]\)\.map\(\(m\) => \[m\.role, new Set\(m\.permissions\)\] as const\)\)/);
    assert.match(code, /<th scope="col">Ruxsat<\/th>\s*\{roles\.map\(\(r\) => <th key=\{r\.code\} scope="col">/);
    assert.match(code, /<th scope="col">Doira<\/th>/);
    assert.match(code, /r\.scope === "all" \? "Barcha" : "Filial"/);
    assert.match(code, /const formRoles = \(rbac\?\.assignableRoles \|\| \[\]\)/);
  });

  it("mutation errors map stable server codes to fixed copy", () => {
    const copy = block("const MUTATION_COPY", "const ROLE_LABELS");
    for (const c of ["ADMIN_EMAIL_TAKEN", "ADMIN_ROLE_INVALID", "ADMIN_BRANCH_INVALID", "ADMIN_INVALID", "ADMIN_SELF_PROTECTED", "ADMIN_LAST_ACTIVE_SUPER_ADMIN", "ADMIN_NOT_FOUND", "ADMIN_SCOPE_FORBIDDEN"]) {
      assert.match(copy, new RegExp(`${c}: "`), c);
    }
  });

  it("styles: new controls use tokens; 390px stacks header actions and drawer actions", () => {
    const ac = css.slice(css.indexOf("/* ——— Admins / RBAC console — Phase 13.16"), css.indexOf("/* ——— Dashboard — Phase 13.0"));
    for (const cls of [".ac-pw-toggle", ".ac-filters", ".ac-pager", ".ac-drawer-actions", ".ac-danger", ".ac-actions"]) assert.ok(ac.includes(cls), cls);
    assert.doesNotMatch(ac, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    const small = ac.slice(ac.indexOf("@media (max-width: 560px)"));
    assert.match(small, /\.ac-actions > button \{ flex: 1 1 auto; \}/);
    assert.match(small, /\.ac-drawer-actions > button \{ flex: 1 1 100%; \}/);
  });

  it("Phase 13.16 is documented", () => {
    const a = docs.indexOf("## Phase 13.16 — Admin Management Backend + RBAC Control Plane");
    const b = docs.indexOf("## Phase 13.15 — Admin Users / RBAC");
    assert.ok(a >= 0 && b > a);
    const section = docs.slice(a, b);
    for (const item of ["Migration", "CRUD", "Status", "RBAC API", "Permissions", "Role model", "Branch scope", "Audit", "Password security", "Sessions", "Concurrency", "Tests", "Browser QA", "Remaining gaps"]) {
      assert.ok(section.includes(item), item);
    }
    assert.match(section, /0011_admin_management/);
    assert.match(section, /ADMIN_LAST_ACTIVE_SUPER_ADMIN/);
  });
});
