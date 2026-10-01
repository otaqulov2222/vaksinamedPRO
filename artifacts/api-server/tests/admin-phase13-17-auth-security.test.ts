/**
 * Admin Phase 13.17 — authentication events (read-only) + admin sessions (list / individual revoke).
 * Integration: the real Express app over a throw-away PGlite directory (migrations 0000–0012, no demo seed).
 * Admins, branches, sessions and the extra auth_events rows are created by this test only; the directory is deleted afterwards.
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

const dataDir = mkdtempSync(path.join(tmpdir(), "vm-1317-api-"));
process.env.PGLITE_DIR = dataDir;
process.env.APP_ENV = "development";
process.env.DB_DRIVER = "pglite";
process.env.ALLOW_DEMO_SEED = "0";
process.env.LOG_LEVEL = "silent";
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;

const dbm = await import("@workspace/db");
const { sql, eq, and } = await import("drizzle-orm");
const { default: app } = await import("../src/app");
const { issueAdminSession, signAdminToken } = await import("../src/lib/auth");
const { clearPermissionCache } = await import("../src/lib/rbac");
const { allowLegacyHmacTokens } = await import("../src/lib/securityEnv");
const { authEventDetails, sessionDevice } = await import("../src/lib/authSecurity");
const { db, adminUsers, branches, auditLog, authSessions, authEvents, hashPassword } = dbm;

type Res = { status: number; body: any; text: string };
let server: Server;
let base = "";
const responseTexts: string[] = [];
const plaintexts: string[] = [];
const issuedTokens: string[] = [];
const pw = (p: string) => (plaintexts.push(p), p);
const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function rows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as { rows?: any[] })?.rows || [];
}

async function call(method: string, url: string, token?: string | null, body?: unknown, extra: Record<string, string> = {}, scan = true): Promise<Res> {
  const headers: Record<string, string> = { ...extra };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (scan) responseTexts.push(text);
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  return { status: r.status, body: parsed, text };
}

async function session(adminId: number) {
  const token = await issueAdminSession(adminId);
  issuedTokens.push(token);
  return token;
}

function publicIdOf(token: string) {
  return token.split(".")[1];
}

async function sessionRow(token: string) {
  const [row] = await db.select().from(authSessions).where(eq(authSessions.publicId, publicIdOf(token)));
  return row;
}

async function createAdminRow(v: { email: string; name: string; role: string; branchId: number | null; password: string }) {
  const [row] = await db.insert(adminUsers).values({
    email: v.email, name: v.name, role: v.role, branchId: v.branchId, passwordHash: hashPassword(pw(v.password)), status: "active",
  }).returning();
  return row;
}

async function auditOf(action: string) {
  return db.select().from(auditLog).where(and(eq(auditLog.entity, "admin_user"), eq(auditLog.action, action))).orderBy(auditLog.id);
}

async function insertEvent(v: { actorType?: string; actorId: number | null; eventType: string; success?: boolean; reason?: string; meta?: unknown; createdAt?: string }) {
  const [row] = await db.insert(authEvents).values({
    actorType: v.actorType ?? "admin",
    actorId: v.actorId,
    eventType: v.eventType,
    success: v.success ?? true,
    reason: v.reason ?? "",
    meta: JSON.stringify(v.meta ?? {}),
    ...(v.createdAt ? { createdAt: new Date(v.createdAt) } : {}),
  }).returning();
  return row;
}

async function grantCashierRbacManage<T>(fn: () => Promise<T>): Promise<T> {
  await db.execute(sql`INSERT INTO auth_role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM auth_roles r, auth_permissions p WHERE r.code = 'cashier' AND p.code = 'rbac:manage'`);
  clearPermissionCache();
  try {
    return await fn();
  } finally {
    await db.execute(sql`DELETE FROM auth_role_permissions WHERE role_id = (SELECT id FROM auth_roles WHERE code = 'cashier')
      AND permission_id = (SELECT id FROM auth_permissions WHERE code = 'rbac:manage')`);
    clearPermissionCache();
  }
}

let B1 = 0;
let B2 = 0;
let hq: any;
let hqToken = "";
let cashier: any;
let cashierToken = "";
let cashierB2: any;

before(async () => {
  const [b1] = await db.insert(branches).values({ code: "T1317A", name: "Test filial A", address: "A ko‘chasi 1", phone: "+998 71 000-00-11", lat: 41.3, lng: 69.2 }).returning();
  const [b2] = await db.insert(branches).values({ code: "T1317B", name: "Test filial B", address: "B ko‘chasi 2", phone: "+998 71 000-00-12", lat: 41.31, lng: 69.21 }).returning();
  B1 = b1.id;
  B2 = b2.id;
  hq = await createAdminRow({ email: "hq@test.local", name: "Bosh admin", role: "super_admin", branchId: null, password: "hq-pass-1317" });
  cashier = await createAdminRow({ email: "kassa@test.local", name: "Kassir A", role: "cashier", branchId: B1, password: "kassa-1317" });
  cashierB2 = await createAdminRow({ email: "kassa.b@test.local", name: "Kassir B", role: "cashier", branchId: B2, password: "kassa-b-1317" });
  hqToken = await session(hq.id);
  cashierToken = await session(cashier.id);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

const ENDPOINTS: Array<[string, (id: number) => string]> = [
  ["GET", () => "/api/admin/auth-events"],
  ["GET", (id) => `/api/admin/users/${id}/sessions`],
  ["POST", (id) => `/api/admin/users/${id}/sessions/1/revoke`],
];

describe("13.17 migration on the test database", () => {
  it("0012 applied: lower(email) unique index + auth_events actor index", async () => {
    const idx = rows(await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename IN ('admin_users', 'auth_events')`)).map((r) => r.indexname);
    assert.ok(idx.includes("admin_users_email_lower_unique"));
    assert.ok(idx.includes("auth_events_actor_created_idx"));
  });
});

describe("13.17 authorization (rbac:manage on every endpoint)", () => {
  it("401 without / with an invalid token", async () => {
    for (const [method, url] of ENDPOINTS) {
      assert.equal((await call(method, url(cashier.id))).status, 401, `${method} ${url(cashier.id)}`);
      assert.equal((await call(method, url(cashier.id), "s1.deadbeefdeadbeefdeadbeefdeadbeef.nope")).status, 401);
    }
  });

  it("403 for a cashier (no rbac:manage) and the denial is recorded", async () => {
    const before = rows(await db.execute(sql`SELECT count(*)::int AS n FROM auth_events WHERE event_type = 'authz.denied' AND actor_id = ${cashier.id}`))[0].n;
    for (const [method, url] of ENDPOINTS) {
      const r = await call(method, url(cashier.id), cashierToken);
      assert.equal(r.status, 403, `${method} ${url(cashier.id)}`);
      assert.equal(r.body.message, "Bu amal uchun ruxsat yo‘q");
    }
    const afterN = rows(await db.execute(sql`SELECT count(*)::int AS n FROM auth_events WHERE event_type = 'authz.denied' AND actor_id = ${cashier.id}`))[0].n;
    assert.equal(afterN - before, ENDPOINTS.length);
    const [last] = rows(await db.execute(sql`SELECT meta FROM auth_events WHERE event_type = 'authz.denied' ORDER BY id DESC LIMIT 1`));
    assert.equal(JSON.parse(last.meta).permission, "rbac:manage");
  });

  it("super_admin is allowed", async () => {
    assert.equal((await call("GET", "/api/admin/auth-events", hqToken)).status, 200);
    assert.equal((await call("GET", `/api/admin/users/${cashier.id}/sessions`, hqToken)).status, 200);
  });
});

describe("13.17 auth events API", () => {
  it("list: admin events only, newest first, safe shape, storage flags are honest", async () => {
    await insertEvent({ actorType: "customer", actorId: 777, eventType: "login.success", meta: { phone: "+998 90 000 00 00" } });
    const r = await call("GET", "/api/admin/auth-events?limit=50", hqToken);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ["eventTypes", "events", "pagination", "readOnly", "stored"]);
    // Phase 13.18 (0013) added IP / User-Agent columns; their DTO shape is covered by admin-phase13-18-auth-telemetry.test.ts.
    assert.deepEqual(r.body.stored, { ip: true, userAgent: true });
    assert.ok(r.body.events.length > 0);
    for (const e of r.body.events) {
      assert.deepEqual(Object.keys(e).sort(), ["admin", "adminId", "createdAt", "details", "event", "id", "ip", "reason", "success", "userAgent"]);
      assert.notEqual(e.adminId, 777);
    }
    assert.equal(r.text.includes("+998 90 000 00 00"), false);
    const times = r.body.events.map((e: any) => [Date.parse(e.createdAt), e.id]);
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i - 1][0] > times[i][0] || (times[i - 1][0] === times[i][0] && times[i - 1][1] > times[i][1]), "ordering");
    }
    const created = r.body.events.find((e: any) => e.event === "session.create" && e.adminId === hq.id);
    assert.deepEqual(created.admin, { id: hq.id, name: "Bosh admin", email: "hq@test.local" });
    assert.ok(r.body.eventTypes.includes("session.create"));
    assert.ok(r.body.eventTypes.includes("authz.denied"));
  });

  it("server-side pagination with a max limit", async () => {
    const all = await call("GET", "/api/admin/auth-events?limit=50", hqToken);
    const total = all.body.pagination.total;
    const p1 = await call("GET", "/api/admin/auth-events?limit=2&offset=0", hqToken);
    const p2 = await call("GET", "/api/admin/auth-events?limit=2&offset=2", hqToken);
    assert.deepEqual(p1.body.pagination, { limit: 2, offset: 0, total, hasMore: total > 2, nextOffset: total > 2 ? 2 : null });
    assert.equal(p1.body.events.length, 2);
    assert.deepEqual(p2.body.events.map((e: any) => e.id), all.body.events.slice(2, 4).map((e: any) => e.id));
    assert.equal((await call("GET", "/api/admin/auth-events?limit=5000", hqToken)).body.pagination.limit, 50);
    assert.equal((await call("GET", "/api/admin/auth-events?limit=abc", hqToken)).body.pagination.limit, 25);
  });

  it("filters: adminId, event, success, dateFrom/dateTo (Asia/Tashkent days); invalid → 422", async () => {
    await insertEvent({ actorId: cashier.id, eventType: "login.failure", success: false, reason: "admin_disabled", createdAt: "2026-03-10T10:00:00Z" });
    await insertEvent({ actorId: cashier.id, eventType: "login.success", createdAt: "2026-03-11T10:00:00Z" });
    await insertEvent({ actorId: hq.id, eventType: "login.success", createdAt: "2026-03-09T19:30:00Z" });
    await insertEvent({ actorId: hq.id, eventType: "logout", createdAt: "2026-03-09T18:30:00Z" });

    const byAdmin = await call("GET", `/api/admin/auth-events?adminId=${cashier.id}&limit=50`, hqToken);
    assert.ok(byAdmin.body.events.length >= 3);
    assert.ok(byAdmin.body.events.every((e: any) => e.adminId === cashier.id));

    const failures = await call("GET", "/api/admin/auth-events?success=false&limit=50", hqToken);
    assert.ok(failures.body.events.length > 0);
    assert.ok(failures.body.events.every((e: any) => e.success === false));

    const logins = await call("GET", "/api/admin/auth-events?event=login.success&limit=50", hqToken);
    assert.ok(logins.body.events.every((e: any) => e.event === "login.success"));

    const day = await call("GET", "/api/admin/auth-events?dateFrom=2026-03-10&dateTo=2026-03-10", hqToken);
    assert.deepEqual(day.body.events.map((e: any) => [e.event, e.adminId]).sort(), [["login.failure", cashier.id], ["login.success", hq.id]].sort());
    const combined = await call("GET", `/api/admin/auth-events?adminId=${cashier.id}&success=false&dateFrom=2026-03-10&dateTo=2026-03-11`, hqToken);
    assert.deepEqual(combined.body.events.map((e: any) => e.reason), ["admin_disabled"]);

    for (const q of ["adminId=0", "adminId=abc", "event=DROP%20TABLE", "event=a.b.c", "success=yes", "dateFrom=2026-13-01", "dateTo=10.03.2026", "dateFrom=2026-03-12&dateTo=2026-03-10"]) {
      const bad = await call("GET", `/api/admin/auth-events?${q}`, hqToken);
      assert.deepEqual([bad.status, bad.body.code], [422, "AUTH_EVENT_FILTER_INVALID"], q);
    }
  });

  it("metadata is scrubbed recursively and reduced to known scalar keys — no password, token, session, cookie, HMAC, OTP", async () => {
    const meta = {
      permission: "audit:read",
      password: pw("plain-meta-pass"),
      passwordHash: "salt:abcdef",
      token: "tok-meta-1",
      accessToken: "tok-meta-2",
      refreshToken: "tok-meta-3",
      sessionPublicId: "deadbeefdeadbeefdeadbeefdeadbeef",
      cookie: "sid=meta",
      authorization: "Bearer tok-meta-4",
      hmac: "hmac-meta",
      secret: "secret-meta",
      otp: "123456",
      nested: { token: "tok-meta-5", ok: 1 },
    };
    const ev = await insertEvent({ actorId: hq.id, eventType: "authz.denied", success: false, reason: "missing_permission", meta });
    const r = await call("GET", `/api/admin/auth-events?adminId=${hq.id}&event=authz.denied&limit=50`, hqToken);
    const item = r.body.events.find((e: any) => e.id === ev.id);
    assert.deepEqual(item.details, { permission: "audit:read" });
    for (const needle of ["plain-meta-pass", "salt:abcdef", "tok-meta", "deadbeefdeadbeef", "sid=meta", "hmac-meta", "secret-meta", "123456", "nested"]) {
      assert.equal(r.text.includes(needle), false, needle);
    }
    assert.deepEqual(authEventDetails("not json"), {});
    assert.deepEqual(authEventDetails(JSON.stringify({ count: 2, byAdminId: 5, sessionId: 9 })), { count: 2, byAdminId: 5 });
  });

  it("branch scope: a branch-scoped manager only sees its own branch staff; HQ and other branches are hidden or 403", async () => {
    await insertEvent({ actorId: cashierB2.id, eventType: "login.success" });
    await insertEvent({ actorId: null, eventType: "login.failure", success: false, reason: "bad_credentials" });
    await grantCashierRbacManage(async () => {
      const r = await call("GET", "/api/admin/auth-events?limit=50", cashierToken);
      assert.equal(r.status, 200);
      assert.ok(r.body.events.length > 0);
      assert.ok(r.body.events.every((e: any) => e.adminId === cashier.id), JSON.stringify(r.body.events.map((e: any) => e.adminId)));
      assert.equal(r.body.pagination.total, r.body.events.length);
      const hqFilter = await call("GET", `/api/admin/auth-events?adminId=${hq.id}`, cashierToken);
      assert.deepEqual([hqFilter.status, hqFilter.body.code], [403, "ADMIN_SCOPE_FORBIDDEN"]);
      assert.equal((await call("GET", `/api/admin/auth-events?adminId=${cashierB2.id}`, cashierToken)).status, 403);
      assert.deepEqual([(await call("GET", "/api/admin/auth-events?adminId=999999", cashierToken)).status], [404]);
    });
    const hqView = await call("GET", "/api/admin/auth-events?success=false&event=login.failure&limit=50", hqToken);
    assert.ok(hqView.body.events.some((e: any) => e.adminId === null && e.admin === null && e.reason === "bad_credentials"));
  });
});

describe("13.17 admin sessions API", () => {
  let s1 = "";
  let s2 = "";
  let s3 = "";

  before(async () => {
    s1 = await session(cashier.id);
    s2 = await session(cashier.id);
    s3 = await session(cashier.id);
  });

  it("list: newest first, safe shape (numeric id, never public id / hash), device only when stored", async () => {
    const login = await call("POST", "/api/admin/login", null, { email: "kassa@test.local", password: "kassa-1317" }, { "user-agent": CHROME_UA }, false);
    assert.equal(login.status, 200);
    issuedTokens.push(login.body.token);
    const r = await call("GET", `/api/admin/users/${cashier.id}/sessions?limit=50`, hqToken);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ["currentKnown", "pagination", "sessions", "stored", "summary"]);
    assert.deepEqual(r.body.stored, { ip: false, userAgent: true, deviceLabel: true });
    for (const s of r.body.sessions) {
      assert.deepEqual(Object.keys(s).sort(), ["createdAt", "current", "device", "expiresAt", "id", "lastSeenAt", "revokedAt", "status"]);
      assert.equal(typeof s.id, "number");
    }
    const ids = r.body.sessions.map((s: any) => s.id);
    assert.deepEqual(ids, [...ids].sort((a: number, b: number) => b - a));
    const newest = r.body.sessions[0];
    assert.deepEqual(newest.device, { label: null, browser: "Chrome", os: "Windows", recognized: true });
    assert.equal(r.body.sessions.find((s: any) => s.id === ids.at(-1)).device, null);
    for (const t of issuedTokens) {
      assert.equal(r.text.includes(publicIdOf(t)), false);
      assert.equal(r.text.includes(t), false);
    }
    assert.doesNotMatch(r.text, /tokenHash|token_hash|publicId|public_id|Mozilla|AppleWebKit/);
    assert.deepEqual(sessionDevice({ deviceLabel: "", userAgent: "" }), null);
    assert.deepEqual(sessionDevice({ deviceLabel: "", userAgent: "weird-client/1" }), { label: null, browser: null, os: null, recognized: false });
  });

  it("current session is flagged only for the caller's own bearer session", async () => {
    const own = await call("GET", `/api/admin/users/${hq.id}/sessions?limit=50`, hqToken);
    assert.equal(own.body.currentKnown, true);
    const current = own.body.sessions.filter((s: any) => s.current);
    assert.equal(current.length, 1);
    assert.equal(current[0].id, (await sessionRow(hqToken)).id);
    const other = await call("GET", `/api/admin/users/${cashier.id}/sessions?limit=50`, hqToken);
    assert.ok(other.body.sessions.every((s: any) => s.current === false));
    if (allowLegacyHmacTokens()) {
      const legacy = await call("GET", `/api/admin/users/${hq.id}/sessions`, signAdminToken(hq.id, "super_admin", null));
      assert.equal(legacy.body.currentKnown, false);
      assert.ok(legacy.body.sessions.every((s: any) => s.current === false));
    }
  });

  it("status comes from the server: active / expired / revoked, with server-side status filter and summary", async () => {
    await db.update(authSessions).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(authSessions.publicId, publicIdOf(s2)));
    await db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.publicId, publicIdOf(s3)));
    const all = await call("GET", `/api/admin/users/${cashier.id}/sessions?limit=50`, hqToken);
    const byId = new Map(all.body.sessions.map((s: any) => [s.id, s]));
    assert.equal((byId.get((await sessionRow(s1)).id) as any).status, "active");
    assert.equal((byId.get((await sessionRow(s2)).id) as any).status, "expired");
    const revokedRow = byId.get((await sessionRow(s3)).id) as any;
    assert.equal(revokedRow.status, "revoked");
    assert.ok(revokedRow.revokedAt);
    const counts = { active: 0, expired: 0, revoked: 0 } as Record<string, number>;
    for (const s of all.body.sessions) counts[s.status] += 1;
    assert.deepEqual(all.body.summary, counts);
    for (const status of ["active", "expired", "revoked"]) {
      const f = await call("GET", `/api/admin/users/${cashier.id}/sessions?status=${status}&limit=50`, hqToken);
      assert.equal(f.body.sessions.length, counts[status]);
      assert.ok(f.body.sessions.every((s: any) => s.status === status));
      assert.equal(f.body.pagination.total, counts[status]);
    }
    const bad = await call("GET", `/api/admin/users/${cashier.id}/sessions?status=deleted`, hqToken);
    assert.deepEqual([bad.status, bad.body.code], [422, "SESSION_FILTER_INVALID"]);
    const page = await call("GET", `/api/admin/users/${cashier.id}/sessions?limit=2&offset=1`, hqToken);
    assert.deepEqual(page.body.sessions.map((s: any) => s.id), all.body.sessions.slice(1, 3).map((s: any) => s.id));
    assert.equal(page.body.pagination.offset, 1);
  });

  it("404 for a missing admin / malformed id; branch-scoped manager cannot list HQ or other-branch sessions", async () => {
    for (const id of ["999999", "abc", "0"]) {
      const r = await call("GET", `/api/admin/users/${id}/sessions`, hqToken);
      assert.deepEqual([r.status, r.body.code], [404, "ADMIN_NOT_FOUND"], id);
    }
    await grantCashierRbacManage(async () => {
      assert.equal((await call("GET", `/api/admin/users/${cashier.id}/sessions`, cashierToken)).status, 200);
      assert.deepEqual((await call("GET", `/api/admin/users/${hq.id}/sessions`, cashierToken)).body.code, "ADMIN_SCOPE_FORBIDDEN");
      assert.equal((await call("GET", `/api/admin/users/${cashierB2.id}/sessions`, cashierToken)).status, 403);
    });
  });

  it("revoke: the session stops working, audit row + auth event; no token in either", async () => {
    const target = await sessionRow(s1);
    assert.equal((await call("GET", "/api/admin/me", s1)).status, 200);
    const auditBefore = (await auditOf("admin.session_revoke")).length;
    const r = await call("POST", `/api/admin/users/${cashier.id}/sessions/${target.id}/revoke`, hqToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.changed, true);
    assert.equal(r.body.endedCurrent, false);
    assert.equal(r.body.session.id, target.id);
    assert.equal(r.body.session.status, "revoked");
    assert.equal((await call("GET", "/api/admin/me", s1)).status, 401);
    const audits = await auditOf("admin.session_revoke");
    assert.equal(audits.length, auditBefore + 1);
    const payload = JSON.parse(audits.at(-1)!.payload);
    assert.deepEqual(payload, { adminId: cashier.id, email: "kassa@test.local", sessionId: target.id, sessionStatus: "active", current: false });
    assert.equal(audits.at(-1)!.actor, "hq@test.local");
    const [ev] = rows(await db.execute(sql`SELECT * FROM auth_events WHERE event_type = 'session.revoke' AND reason = 'admin_revoke' ORDER BY id DESC LIMIT 1`));
    assert.equal(ev.actor_id, cashier.id);
    assert.deepEqual(JSON.parse(ev.meta), { sessionId: target.id, byAdminId: hq.id });
    for (const blob of [audits.at(-1)!.payload, ev.meta]) {
      assert.equal(blob.includes(target.publicId), false);
      assert.equal(blob.includes(target.tokenHash), false);
    }
  });

  it("already revoked → 200 changed:false (idempotent), no second audit row", async () => {
    const target = await sessionRow(s1);
    const n = (await auditOf("admin.session_revoke")).length;
    const r = await call("POST", `/api/admin/users/${cashier.id}/sessions/${target.id}/revoke`, hqToken);
    assert.deepEqual([r.status, r.body.changed, r.body.session.status], [200, false, "revoked"]);
    assert.equal((await auditOf("admin.session_revoke")).length, n);
  });

  it("wrong admin, customer session, missing or malformed session id → 404 SESSION_NOT_FOUND", async () => {
    const hqSession = await sessionRow(hqToken);
    const wrong = await call("POST", `/api/admin/users/${cashier.id}/sessions/${hqSession.id}/revoke`, hqToken);
    assert.deepEqual([wrong.status, wrong.body.code], [404, "SESSION_NOT_FOUND"]);
    assert.equal((await sessionRow(hqToken)).revokedAt, null);
    const [customerSession] = await db.insert(authSessions).values({
      publicId: "c".repeat(32), actorType: "customer", actorId: cashier.id, tokenHash: "x", expiresAt: new Date(Date.now() + 3_600_000),
    }).returning();
    const cust = await call("POST", `/api/admin/users/${cashier.id}/sessions/${customerSession.id}/revoke`, hqToken);
    assert.deepEqual([cust.status, cust.body.code], [404, "SESSION_NOT_FOUND"]);
    for (const sid of ["999999", "abc", "0", "-3"]) {
      const r = await call("POST", `/api/admin/users/${cashier.id}/sessions/${sid}/revoke`, hqToken);
      assert.deepEqual([r.status, r.body.code], [404, "SESSION_NOT_FOUND"], sid);
    }
    const noAdmin = await call("POST", `/api/admin/users/999999/sessions/${hqSession.id}/revoke`, hqToken);
    assert.deepEqual([noAdmin.status, noAdmin.body.code], [404, "ADMIN_NOT_FOUND"]);
  });

  it("wrong branch: a branch-scoped manager cannot revoke HQ or other-branch sessions", async () => {
    const otherToken = await session(cashierB2.id);
    const other = await sessionRow(otherToken);
    const hqSession = await sessionRow(hqToken);
    await grantCashierRbacManage(async () => {
      const a = await call("POST", `/api/admin/users/${cashierB2.id}/sessions/${other.id}/revoke`, cashierToken);
      assert.deepEqual([a.status, a.body.code], [403, "ADMIN_SCOPE_FORBIDDEN"]);
      const b = await call("POST", `/api/admin/users/${hq.id}/sessions/${hqSession.id}/revoke`, cashierToken);
      assert.deepEqual([b.status, b.body.code], [403, "ADMIN_SCOPE_FORBIDDEN"]);
    });
    assert.equal((await sessionRow(otherToken)).revokedAt, null);
    assert.equal((await sessionRow(hqToken)).revokedAt, null);
  });

  it("revoking your own current session ends it (endedCurrent) — same effect as logout", async () => {
    const mine = await session(hq.id);
    const row = await sessionRow(mine);
    const r = await call("POST", `/api/admin/users/${hq.id}/sessions/${row.id}/revoke`, mine);
    assert.deepEqual([r.status, r.body.changed, r.body.endedCurrent, r.body.session.current], [200, true, true, true]);
    assert.equal((await call("GET", "/api/admin/me", mine)).status, 401);
    assert.equal(JSON.parse((await auditOf("admin.session_revoke")).at(-1)!.payload).current, true);
    assert.equal((await call("GET", "/api/admin/me", hqToken)).status, 200);
  });

  it("if the audit insert fails, the revoke rolls back and the 500 hides the DB error", async () => {
    const victim = await session(cashier.id);
    const row = await sessionRow(victim);
    await db.execute(sql`CREATE FUNCTION t1317_fail_audit() RETURNS trigger AS $$
      BEGIN IF NEW.action = 'admin.session_revoke' THEN RAISE EXCEPTION 't1317 audit sink down'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER t1317_fail_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION t1317_fail_audit()`);
    try {
      const r = await call("POST", `/api/admin/users/${cashier.id}/sessions/${row.id}/revoke`, hqToken);
      assert.equal(r.status, 500);
      assert.deepEqual(r.body, { message: "Ichki xatolik" });
      assert.equal((await sessionRow(victim)).revokedAt, null);
      assert.equal((await call("GET", "/api/admin/me", victim)).status, 200);
    } finally {
      await db.execute(sql`DROP TRIGGER t1317_fail_audit ON audit_log`);
      await db.execute(sql`DROP FUNCTION t1317_fail_audit()`);
    }
  });
});

describe("13.17 revoke concurrency", () => {
  it("same session revoked in parallel: exactly one changed, one audit row", async () => {
    const t = await session(cashier.id);
    const row = await sessionRow(t);
    const n = (await auditOf("admin.session_revoke")).length;
    const results = await Promise.all(Array.from({ length: 5 }, () => call("POST", `/api/admin/users/${cashier.id}/sessions/${row.id}/revoke`, hqToken)));
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(results.filter((r) => r.body.changed === true).length, 1);
    assert.equal((await auditOf("admin.session_revoke")).length, n + 1);
  });

  it("different sessions revoked in parallel: each revoked once", async () => {
    const tokens = await Promise.all([session(cashier.id), session(cashier.id), session(cashier.id)]);
    const ids = await Promise.all(tokens.map(async (t) => (await sessionRow(t)).id));
    const n = (await auditOf("admin.session_revoke")).length;
    const results = await Promise.all(ids.map((id) => call("POST", `/api/admin/users/${cashier.id}/sessions/${id}/revoke`, hqToken)));
    assert.ok(results.every((r) => r.status === 200 && r.body.changed === true));
    assert.equal((await auditOf("admin.session_revoke")).length, n + 3);
    for (const t of tokens) assert.ok((await sessionRow(t)).revokedAt);
  });

  it("an already revoked session revoked in parallel: all changed:false, no audit", async () => {
    const t = await session(cashier.id);
    const row = await sessionRow(t);
    await db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, row.id));
    const n = (await auditOf("admin.session_revoke")).length;
    const results = await Promise.all(Array.from({ length: 3 }, () => call("POST", `/api/admin/users/${cashier.id}/sessions/${row.id}/revoke`, hqToken)));
    assert.ok(results.every((r) => r.status === 200 && r.body.changed === false));
    assert.equal((await auditOf("admin.session_revoke")).length, n);
  });

  it("revoke racing a disable: the session always ends revoked and the admin disabled", async () => {
    const victim = await createAdminRow({ email: "race.revoke@test.local", name: "Race", role: "cashier", branchId: B1, password: "race-1317" });
    const t = await session(victim.id);
    const row = await sessionRow(t);
    const [revoke, disable] = await Promise.all([
      call("POST", `/api/admin/users/${victim.id}/sessions/${row.id}/revoke`, hqToken),
      call("PATCH", `/api/admin/users/${victim.id}/status`, hqToken, { status: "disabled" }),
    ]);
    assert.equal(revoke.status, 200);
    assert.equal(disable.status, 200);
    assert.ok((await sessionRow(t)).revokedAt);
    assert.equal(disable.body.user.status, "disabled");
    assert.equal(disable.body.revokedSessions, revoke.body.changed ? 0 : 1);
    assert.equal(Number(revoke.body.changed) + disable.body.revokedSessions, 1);
  });
});

describe("13.17 auth security (Phase 13.16 behaviour preserved)", () => {
  it("disable: every session listed as revoked, revoke is a no-op, login 403, surviving token 401, failures visible in auth events", async () => {
    const victim = await createAdminRow({ email: "disable.me@test.local", name: "Disable Me", role: "cashier", branchId: B1, password: pw("disable-1317") });
    const t1 = await session(victim.id);
    await session(victim.id);
    const off = await call("PATCH", `/api/admin/users/${victim.id}/status`, hqToken, { status: "disabled" });
    assert.deepEqual([off.status, off.body.revokedSessions], [200, 2]);
    const list = await call("GET", `/api/admin/users/${victim.id}/sessions`, hqToken);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.summary, { active: 0, expired: 0, revoked: 2 });
    const again = await call("POST", `/api/admin/users/${victim.id}/sessions/${(await sessionRow(t1)).id}/revoke`, hqToken);
    assert.equal(again.body.changed, false);

    const login = await call("POST", "/api/admin/login", null, { email: "disable.me@test.local", password: "disable-1317" }, {}, false);
    assert.deepEqual([login.status, login.body.code], [403, "ADMIN_DISABLED"]);
    await db.update(authSessions).set({ revokedAt: null }).where(eq(authSessions.publicId, publicIdOf(t1)));
    const me = await call("GET", "/api/admin/me", t1);
    assert.deepEqual([me.status, me.body.code], [401, "ADMIN_DISABLED"]);

    const events = await call("GET", `/api/admin/auth-events?adminId=${victim.id}&limit=50`, hqToken);
    const kinds = events.body.events.map((e: any) => `${e.event}:${e.reason ?? ""}:${e.success}`);
    assert.ok(kinds.includes("login.failure:admin_disabled:false"), kinds.join());
    assert.ok(kinds.includes("authz.denied:admin_disabled:false"), kinds.join());
    assert.ok(kinds.includes("session.revoke:admin_disabled:true"), kinds.join());
    const revokeEvent = events.body.events.find((e: any) => e.event === "session.revoke");
    assert.deepEqual(revokeEvent.details, { count: 2, byAdminId: hq.id });
  });

  it("password change: target sessions revoked; self change keeps only the current session", async () => {
    const victim = await createAdminRow({ email: "pw.target@test.local", name: "Pw Target", role: "cashier", branchId: B1, password: "pw-target-1317" });
    await session(victim.id);
    await session(victim.id);
    const r = await call("PATCH", `/api/admin/users/${victim.id}/password`, hqToken, { password: pw("new-pass-1317") });
    assert.deepEqual([r.status, r.body.revokedSessions], [200, 2]);
    assert.equal((await call("GET", `/api/admin/users/${victim.id}/sessions`, hqToken)).body.summary.active, 0);

    const extra = await session(hq.id);
    const self = await call("PATCH", `/api/admin/users/${hq.id}/password`, hqToken, { password: pw("hq-pass-1317-b") });
    assert.equal(self.status, 200);
    const mine = await call("GET", `/api/admin/users/${hq.id}/sessions?status=active&limit=50`, hqToken);
    assert.equal(mine.body.sessions.length, 1);
    assert.equal(mine.body.sessions[0].current, true);
    assert.equal((await call("GET", "/api/admin/me", extra)).status, 401);
  });
});

describe("13.17 case-insensitive admin email", () => {
  it("create normalizes the email; an upper/lower-case duplicate → 409", async () => {
    const created = await call("POST", "/api/admin/users", hqToken, { name: "Yangi Kassir", email: "New.Kassir@Test.Local", role: "cashier", branchId: B1, password: pw("new-kassir-1317") });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.email, "new.kassir@test.local");
    for (const email of ["NEW.KASSIR@test.local", "new.kassir@TEST.LOCAL", "  New.Kassir@test.local "]) {
      const dup = await call("POST", "/api/admin/users", hqToken, { name: "Dup", email, role: "cashier", branchId: B1, password: "dup-pass-1317" });
      assert.deepEqual([dup.status, dup.body.code], [409, "ADMIN_EMAIL_TAKEN"], email);
    }
    const patch = await call("PATCH", `/api/admin/users/${cashier.id}`, hqToken, { email: "HQ@TEST.LOCAL" });
    assert.deepEqual([patch.status, patch.body.code], [409, "ADMIN_EMAIL_TAKEN"]);
  });

  it("the DB rejects a case-only duplicate even when the API is bypassed (legacy mixed-case row)", async () => {
    await assert.rejects(db.insert(adminUsers).values({ email: "KASSA@test.local", name: "Bypass", role: "cashier", branchId: B1, passwordHash: "a:b" }));
    const [legacy] = await db.insert(adminUsers).values({ email: "Legacy.Mixed@test.local", name: "Legacy", role: "cashier", branchId: B1, passwordHash: "a:b" }).returning();
    const dup = await call("POST", "/api/admin/users", hqToken, { name: "Dup", email: "legacy.mixed@test.local", role: "cashier", branchId: B1, password: "dup-pass-1317" });
    assert.deepEqual([dup.status, dup.body.code], [409, "ADMIN_EMAIL_TAKEN"]);
    await db.update(adminUsers).set({ status: "disabled" }).where(eq(adminUsers.id, legacy.id));
  });

  it("no case-only duplicates exist after all of the above", async () => {
    const dups = rows(await db.execute(sql`SELECT lower(email) AS e FROM admin_users GROUP BY lower(email) HAVING count(*) > 1`));
    assert.deepEqual(dups, []);
  });
});

describe("13.17 secrets never leave the server", () => {
  it("no response carries a session token, public id, token hash, password or hash", async () => {
    const all = responseTexts.join("\n");
    for (const t of issuedTokens) {
      assert.equal(all.includes(t), false);
    }
    const stored = rows(await db.execute(sql`SELECT public_id, token_hash FROM auth_sessions WHERE actor_type = 'admin'`));
    assert.ok(stored.length > 5);
    for (const h of stored) {
      assert.equal(all.includes(h.public_id), false, "public id leaked");
      assert.equal(all.includes(h.token_hash), false, "token hash leaked");
    }
    for (const p of plaintexts) assert.equal(all.includes(p), false, "plaintext password leaked");
    assert.doesNotMatch(all, /passwordHash|password_hash|tokenHash|token_hash|"cookie"|"hmac"|"otp"|"authorization"/i);
  });

  it("admin.session_revoke audit rows never store a token, public id or hash", async () => {
    const blob = (await auditOf("admin.session_revoke")).map((a) => a.payload).join("\n");
    assert.doesNotMatch(blob, /token|password|secret|publicId|public_id|hash/i);
    for (const t of issuedTokens) assert.equal(blob.includes(publicIdOf(t)), false);
  });
});

describe("13.17 static contract", () => {
  const route = read(path.join(root, "src/routes/adminSecurity.ts"));
  const lib = read(path.join(root, "src/lib/authSecurity.ts"));
  const index = read(path.join(root, "src/routes/index.ts"));
  const authEventsLib = read(path.join(root, "src/lib/authEvents.ts"));
  const migration = read(path.join(repoRoot, "lib/db/migrations/0012_auth_security.sql"));
  const authSchema = read(path.join(repoRoot, "lib/db/src/schema/auth.ts"));

  it("every handler starts with requireRbacManager; exactly three routes; router registered", () => {
    const handlers = [...route.matchAll(/router\.(get|post|patch|put|delete)\("([^"]+)", async \(req, res, next\) => \{\n {2}try \{\n {4}const actor = await requireRbacManager\(req\);/g)].map((m) => `${m[1]} ${m[2]}`);
    const declared = [...route.matchAll(/router\.(get|post|patch|put|delete)\("([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(handlers, declared);
    assert.deepEqual(declared.sort(), ["get /admin/auth-events", "get /admin/users/:id/sessions", "post /admin/users/:id/sessions/:sessionId/revoke"]);
    assert.match(index, /router\.use\(adminSecurityRouter\);/);
    assert.doesNotMatch(route, /\.delete\(|DELETE FROM/);
  });

  it("revoke: one transaction with the admin row lock, session row lock, guarded update and audit; auth event after commit", () => {
    const revoke = route.slice(route.indexOf('router.post("/admin/users/:id/sessions/:sessionId/revoke"'));
    assert.equal((route.match(/await db\.transaction\(/g) || []).length, 1);
    assert.match(revoke, /const target = await lockTarget\(tx, id\);/);
    assert.match(revoke, /\.limit\(1\)\s*\.for\("update"\)/);
    assert.match(revoke, /\.where\(and\(eq\(authSessions\.id, session\.id\), isNull\(authSessions\.revokedAt\)\)\)/);
    assert.match(revoke, /await writeAudit\(tx, actor, "admin\.session_revoke"/);
    assert.ok(revoke.indexOf("recordAuthEvent(") > revoke.indexOf("});\n\n    const endedCurrent"));
    assert.doesNotMatch(route, /await db\.(insert|update)\(/);
  });

  it("auth events are admin-only, read-only and not audited; storage flags match the real schema", () => {
    assert.match(route, /const filters: SQL\[\] = \[eq\(authEvents\.actorType, "admin"\)\];/);
    assert.doesNotMatch(route.slice(route.indexOf('router.get("/admin/auth-events"'), route.indexOf('router.get("/admin/users/:id/sessions"')), /writeAudit|recordAuthEvent/);
    const events = authSchema.slice(authSchema.indexOf('pgTable("auth_events"'), authSchema.indexOf("export type AuthSession"));
    // Phase 13.18 (0013): exactly two nullable telemetry columns, the flags follow the schema.
    assert.match(events, /ipAddress: text\("ip_address"\),/);
    assert.match(events, /userAgent: text\("user_agent"\),/);
    assert.equal((events.match(/\bip\b|ipAddress|userAgent|user_agent|ip_address/g) || []).length, 4);
    assert.match(route, /AUTH_EVENT_STORAGE = \{ ip: true, userAgent: true \}/);
    const sessions = authSchema.slice(authSchema.indexOf('pgTable("auth_sessions"'), authSchema.indexOf('pgTable("auth_roles"'));
    assert.match(sessions, /userAgent: text\("user_agent"\)/);
    assert.match(sessions, /deviceLabel: text\("device_label"\)/);
    assert.doesNotMatch(sessions, /\bip: /);
    assert.match(route, /SESSION_STORAGE = \{ ip: false, userAgent: true, deviceLabel: true \}/);
  });

  it("DTOs are explicit allow-lists: session id is numeric, public id / hash / raw meta never leave", () => {
    const sessionDto = lib.slice(lib.indexOf("export function toSessionDto"));
    assert.doesNotMatch(sessionDto, /publicId:|tokenHash|userAgent:|\.\.\.row/);
    assert.match(sessionDto, /current: currentPublicId != null && row\.publicId === currentPublicId/);
    const eventDto = lib.slice(lib.indexOf("export function toAuthEventDto"), lib.indexOf("function browserOf"));
    assert.doesNotMatch(eventDto, /meta:|\.\.\.row/);
    assert.match(eventDto, /details: authEventDetails\(row\.meta\)/);
    assert.match(lib, /const meta = sanitizeAuditPayload\(rawMeta\);/);
    assert.match(lib, /EVENT_DETAIL_KEYS = \["permission", "role", "resourceBranchId", "count", "revoked", "byAdminId", "expiresAt"\]/);
    assert.match(authEventsLib, /lower\.includes\("password"\)/);
  });

  it("migration 0012 is additive and guarded; the API checks duplicates with lower(email)", () => {
    assert.doesNotMatch(migration, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i);
    assert.match(migration, /GROUP BY lower\(email\) HAVING count\(\*\) > 1/);
    assert.match(read(path.join(root, "src/routes/adminUsers.ts")), /return sql`lower\(\$\{adminUsers\.email\}\) = \$\{normalized\}`;/);
  });
});

describe("13.17 AdminAccessPage: sessions + auth events", () => {
  const page = read(path.join(adminWeb, "pages/AdminAccessPage.tsx"));
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const css = read(path.join(adminWeb, "styles.css"));
  const docs = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
  const block = (start: string, end: string) => {
    const a = code.indexOf(start);
    assert.ok(a >= 0, start);
    const b = code.indexOf(end, a + start.length);
    assert.ok(b > a, end);
    return code.slice(a, b);
  };

  it("drawer tabs Profil / Sessiyalar / Auth hodisalari are keyboard-accessible WAI-ARIA tabs", () => {
    assert.match(code, /\{ id: "profile", label: "Profil" \},\s*\{ id: "sessions", label: "Sessiyalar" \},\s*\{ id: "events", label: "Auth hodisalari" \}/);
    const tabs = block("function DrawerTabs(", "export function AdminAccessPage(");
    assert.match(tabs, /role="tablist"/);
    assert.match(tabs, /role="tab"/);
    assert.match(tabs, /aria-controls=\{`ac-tabpanel-\$\{t\.id\}`\}/);
    assert.match(tabs, /aria-selected=\{props\.active === t\.id\}/);
    assert.match(tabs, /tabIndex=\{props\.active === t\.id \? 0 : -1\}/);
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) assert.ok(tabs.includes(`"${key}"`), key);
    for (const id of ["profile", "sessions", "events"]) {
      assert.match(code, new RegExp(`role="tabpanel" id="ac-tabpanel-${id}" aria-labelledby="ac-tab-${id}"`), id);
    }
    assert.match(block("function openView(", "function closePanel("), /setDrawerTab\("profile"\);/);
  });

  it("sessions: server pagination + status filter, race guard, status/current/expiry straight from the server", () => {
    const load = block("async function loadSessions(", "async function loadAdminEvents(");
    assert.match(load, /const seq = \+\+sessionsSeq\.current;/);
    assert.match(load, /if \(seq !== sessionsSeq\.current\) return;/);
    assert.match(load, /new URLSearchParams\(\{ limit: String\(DRAWER_PAGE_SIZE\), offset: String\(sessionOffset\) \}\)/);
    assert.match(load, /params\.set\("status", sessionStatus\)/);
    assert.match(load, /request\(`\/api\/admin\/users\/\$\{id\}\/sessions\?\$\{params\.toString\(\)\}`, token\)/);
    assert.match(code, /setSessionOffset\(0\); setSessionStatus\(e\.target\.value\);/);
    for (const h of ["Holat", "Qurilma", "Yaratilgan", "Oxirgi faollik", "Tugash vaqti", "Amal"]) assert.ok(code.includes(`<th scope="col">${h}</th>`), h);
    assert.match(code, /\{s\.current \? <StatusBadge tone="info">Joriy sessiya<\/StatusBadge> : null\}/);
    assert.match(code, /status: s\.status === "revoked" \? "revoked" : s\.status === "expired" \? "expired" : "active"/);
    assert.doesNotMatch(code, /Date\.now\(\)|new Date\(\)/);
    assert.match(code, /if \(!device\) return "Saqlanmagan";/);
    const parse = block("function parseSession(", "function parseSessions(");
    assert.doesNotMatch(parse, /\bip\b|publicId|userAgent|token/i);
  });

  it("revoke goes through ConfirmDialog (focus-trapped), only for active sessions, then reloads; current-session revoke reloads into the session state", () => {
    assert.match(code, /\{s\.status === "active" \? \(\s*<button className="btn-tertiary ac-danger" type="button" disabled=\{revoking\} onClick=\{\(\) => setRevokeTarget\(s\)\}>/);
    assert.match(code, /<ConfirmDialog\s+open=\{Boolean\(revokeTarget\) && Boolean\(detail\)\}/);
    assert.match(code, /onConfirm=\{\(\) => void revokeSession\(\)\}/);
    assert.ok(code.includes("Bu sizning joriy sessiyangiz — tasdiqlasangiz tizimdan chiqasiz."));
    const revoke = block("async function revokeSession(", "const viewing =");
    assert.match(revoke, /\/sessions\/\$\{revokeTarget\.id\}\/revoke`, token, \{ method: "POST" \}\)/);
    assert.match(revoke, /if \(result\.endedCurrent\) \{[\s\S]*?await load\(\);/);
    assert.match(revoke, /await Promise\.all\(\[loadSessions\(adminId\), loadDetail\(adminId\), loadEvents\(\)\]\);/);
    assert.match(code, /onClick=\{\(\) => \{ void load\(\); void loadEvents\(\); \}\}/);
    assert.match(revoke, /setSessionsFeedback\(\{ tone: "warn", text: mutationError\(err\) \}\)/);
    assert.doesNotMatch(code, /\bconfirm\(|window\.confirm/);
  });

  it("auth events: server filters (Hodisa, Natija, Sana, Admin) + pagination, race guard, no client-side filtering", () => {
    const params = block("function eventParams(", "function deviceText(");
    for (const key of ["adminId", "event", "success", "dateFrom", "dateTo"]) assert.match(params, new RegExp(`params\\.set\\("${key}", f\\.${key}\\)`), key);
    const load = block("async function loadEvents(", "function setEventFilter(");
    assert.match(load, /const seq = \+\+eventsSeq\.current;/);
    assert.match(load, /if \(seq !== eventsSeq\.current\) return;/);
    assert.match(load, /request\(`\/api\/admin\/auth-events\?\$\{eventParams\(eventFilters, EVENTS_PAGE_SIZE, eventOffset\)\.toString\(\)\}`, token\)/);
    assert.match(block("async function loadAdminEvents(", "async function loadEvents("), /adminId: String\(id\)/);
    assert.match(block("function setEventFilter(", "function setAdminEventFilter("), /setEventOffset\(0\);/);
    for (const label of ["Hodisa", "Natija", "Sanadan", "Sanagacha", "Admin"]) assert.ok(code.includes(`<FilterField label="${label}">`), label);
    assert.match(code, /\(events\?\.eventTypes \|\| \[\]\)\.map/);
    assert.doesNotMatch(code, /events\.events\.filter|adminEvents\.events\.filter/);
    for (const h of ["Vaqt", "Hodisa", "Natija", "Admin"]) assert.ok(code.includes(`<th scope="col">${h}</th>`), h);
    assert.match(code, /<StatusBadge tone="ok">Muvaffaqiyatli<\/StatusBadge> : <StatusBadge tone="danger">Rad etilgan<\/StatusBadge>/);
  });

  it("no invented IP / device on events and no raw metadata JSON; unknown codes shown raw", () => {
    // Phase 13.18: IP / device columns exist, but values come only from the API's ip / userAgent fields.
    assert.doesNotMatch(code, /<th scope="col">IP[^<]*<\/th>/);
    assert.ok(code.includes('<th scope="col">{ipLabel}</th>'));
    assert.match(block("function EventsTable(", "function DrawerTabs("), /e\.ip\.value/);
    assert.doesNotMatch(code, /navigator\.userAgent|e\.userAgent\.raw|e\.ip\.raw/);
    assert.ok(code.includes("IP manzil va qurilma kirish hodisalarida saqlanmaydi"));
    assert.doesNotMatch(code, /JSON\.stringify\((e|event)\.details|\.meta\b/);
    assert.match(code, /EVENT_LABELS\[e\.event\] \|\| e\.event/);
    assert.match(code, /REASON_LABELS\[e\.reason\] \|\| e\.reason/);
    const parse = block("function parseEvent(", "function parseEvents(");
    assert.match(parse, /typeof v === "string" \|\| typeof v === "number" \|\| typeof v === "boolean"/);
  });

  it("security-view errors use the spec copy", () => {
    const copy = block("const SECURITY_ERROR_COPY", "const EVENT_LABELS");
    assert.match(copy, /session: "Seans tugagan\. Qayta kiring\."/);
    assert.match(copy, /forbidden: "Bu ma'lumotlarni ko‘rish uchun ruxsatingiz yo‘q\."/);
    assert.match(copy, /notfound: "Ma'lumot topilmadi\."/);
    assert.match(copy, /failed: "Serverda xatolik yuz berdi\."/);
    assert.match(copy, /network: "Server bilan aloqa o‘rnatilmadi\."/);
    for (const c of ["SESSION_NOT_FOUND", "SESSION_FILTER_INVALID", "AUTH_EVENT_FILTER_INVALID"]) {
      assert.match(block("const MUTATION_COPY", "const SECURITY_ERROR_COPY"), new RegExp(`${c}: "`), c);
    }
  });

  it("styles: drawer tables are cards at every width, tabs scroll horizontally, tokens only", () => {
    const ac = css.slice(css.indexOf("/* Phase 13.17 — drawer tabs"), css.indexOf("@media (max-width: 1280px)", css.indexOf("/* Phase 13.17 — drawer tabs")));
    assert.ok(ac.length > 500);
    assert.match(ac, /\.ac-tabs \{ flex-wrap: nowrap; overflow-x: auto;/);
    // A scroll container inside the overflowing .drawer-body grid collapses to 0 height without this.
    assert.match(ac, /\.ac-tabs \{[^}]*overflow-y: hidden; height: max-content;/);
    assert.match(ac, /\.ac-tabpanel \.ac-table \.table thead \{\s*position: absolute;/);
    assert.match(ac, /content: attr\(data-label\);/);
    assert.match(ac, /\.ac-tabs \.tab:focus-visible \{ outline: 2px solid var\(--vm-brand\)/);
    assert.doesNotMatch(ac, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|gradient\(/);
  });

  it("Phase 13.17 is documented", () => {
    const a = docs.indexOf("## Phase 13.17 — Authentication Events + Admin Sessions");
    const b = docs.indexOf("## Phase 13.16 — Admin Management Backend + RBAC Control Plane");
    assert.ok(a >= 0 && b > a);
    const section = docs.slice(a, b);
    for (const item of ["auth_events contract", "Session contract", "APIs", "Permissions", "Branch scope", "Filters", "Pagination", "Revoke", "Audit", "Disabled admin", "Email index", "Security", "Tests", "Browser QA", "Remaining gaps", "Changed files"]) {
      assert.ok(section.includes(item), item);
    }
    assert.match(section, /0012_auth_security/);
    assert.match(section, /admin\.session_revoke/);
  });
});
