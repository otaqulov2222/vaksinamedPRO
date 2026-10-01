/**
 * Admin Phase 13.18 — auth security telemetry: auth_events.ip_address / user_agent from the request.
 * Integration: the real Express app over a throw-away PGlite directory (migrations 0000–0013, no demo seed), driven by
 * raw node:http requests so every header (or its absence) is exact. Admins and events exist only in this directory.
 * Every HTTP login comes from one loopback address and the admin login limiter allows 20 per 15 min — keep the count low.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import http from "node:http";
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

const dataDir = mkdtempSync(path.join(tmpdir(), "vm-1318-api-"));
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
const { issueAdminSession } = await import("../src/lib/auth");
const { recordAuthEvent } = await import("../src/lib/authEvents");
const { normalizeIp, normalizeUserAgent, AUTH_EVENT_USER_AGENT_MAX } = await import("../src/lib/requestTelemetry");
const { userAgentSummary } = await import("../src/lib/authSecurity");
const { db, adminUsers, branches, auditLog, authEvents, hashPassword } = dbm;

type Res = { status: number; body: any; text: string };
let server: Server;
let port = 0;
const responseTexts: string[] = [];
const secrets: string[] = [];
const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const remember = <T extends string>(s: T) => (secrets.push(s), s);

function rows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as { rows?: any[] })?.rows || [];
}

/** Raw HTTP: only the headers given here are sent (no implicit User-Agent). */
function raw(method: string, url: string, opts: { headers?: Record<string, string>; body?: unknown; host?: string; port?: number; scan?: boolean } = {}): Promise<Res> {
  const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (payload !== undefined) {
    headers["content-type"] = "application/json";
    headers["content-length"] = String(Buffer.byteLength(payload));
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: opts.host ?? "127.0.0.1", port: opts.port ?? port, method, path: url, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (opts.scan !== false) responseTexts.push(text);
        let body: any = null;
        try { body = JSON.parse(text); } catch { body = null; }
        resolve({ status: res.statusCode || 0, body, text });
      });
    });
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const authed = (token: string, ua = CHROME_UA, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, "user-agent": ua, ...extra });

async function login(email: string, password: string, headers: Record<string, string>, opts: { host?: string; port?: number } = {}) {
  const r = await raw("POST", "/api/admin/login", { headers, body: { email, password }, scan: false, ...opts });
  if (r.body?.token) remember(r.body.token);
  return r;
}

async function lastEvent(eventType: string, extra?: ReturnType<typeof sql>) {
  const where = extra ? sql`event_type = ${eventType} AND ${extra}` : sql`event_type = ${eventType}`;
  return rows(await db.execute(sql`SELECT * FROM auth_events WHERE ${where} ORDER BY id DESC LIMIT 1`))[0];
}

async function maxEventId() {
  return Number(rows(await db.execute(sql`SELECT coalesce(max(id), 0)::int AS n FROM auth_events`))[0].n);
}

async function eventsSince(id: number) {
  return rows(await db.execute(sql`SELECT * FROM auth_events WHERE id > ${id} ORDER BY id`));
}

async function createAdminRow(v: { email: string; name: string; role: string; branchId: number | null; password: string }) {
  const [row] = await db.insert(adminUsers).values({
    email: v.email, name: v.name, role: v.role, branchId: v.branchId, passwordHash: hashPassword(remember(v.password)), status: "active",
  }).returning();
  return row;
}

let B1 = 0;
let hq: any;
let cashier: any;
let hqToken = "";
let cashierToken = "";
const HQ_PW = "hq-pass-1318";
const KASSA_PW = "kassa-1318";

before(async () => {
  const [b1] = await db.insert(branches).values({ code: "T1318A", name: "Test filial A", address: "A ko‘chasi 1", phone: "+998 71 000-00-21", lat: 41.3, lng: 69.2 }).returning();
  B1 = b1.id;
  hq = await createAdminRow({ email: "hq@test.local", name: "Bosh admin", role: "super_admin", branchId: null, password: HQ_PW });
  cashier = await createAdminRow({ email: "kassa@test.local", name: "Kassir A", role: "cashier", branchId: B1, password: KASSA_PW });
  hqToken = remember(await issueAdminSession(hq.id));
  cashierToken = remember(await issueAdminSession(cashier.id));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

describe("13.18 migration on the test database", () => {
  it("0013 applied: nullable ip_address / user_agent, no new index", async () => {
    const cols = rows(await db.execute(sql`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'auth_events' AND column_name IN ('ip_address', 'user_agent') ORDER BY column_name
    `));
    assert.deepEqual(cols, [{ column_name: "ip_address", is_nullable: "YES" }, { column_name: "user_agent", is_nullable: "YES" }]);
    const idx = rows(await db.execute(sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'auth_events'`)).map((r) => String(r.indexdef));
    assert.equal(idx.some((d) => /ip_address|user_agent/.test(d)), false);
  });

  it("events written outside a request (session issued by code) keep NULL telemetry", async () => {
    const created = await lastEvent("session.create", sql`actor_id = ${hq.id}`);
    assert.equal(created.ip_address, null);
    assert.equal(created.user_agent, null);
  });
});

describe("13.18 IP source policy", () => {
  it("no trusted proxy is configured: Express trust proxy is off and the source never sets it", () => {
    assert.equal(Boolean(app.get("trust proxy")), false);
    for (const file of ["src/app.ts", "src/index.ts", "src/lib/requestTelemetry.ts", "src/lib/authEvents.ts"]) {
      const code = read(path.join(root, file));
      assert.doesNotMatch(code, /app\.set\(\s*["']trust proxy/, file);
      assert.doesNotMatch(code, /header\(\s*["'](x-forwarded-for|x-real-ip|forwarded)["']/i, file);
    }
  });

  it("direct request: the TCP peer address is stored, forwarding headers are ignored", async () => {
    const before = await maxEventId();
    const r = await login("hq@test.local", HQ_PW, {
      "user-agent": CHROME_UA,
      "x-forwarded-for": "203.0.113.9, 198.51.100.1",
      "x-real-ip": "198.51.100.7",
      forwarded: "for=192.0.2.60;proto=https",
    });
    assert.equal(r.status, 200);
    const events = await eventsSince(before);
    const success = events.find((e) => e.event_type === "login.success");
    const created = events.find((e) => e.event_type === "session.create");
    for (const e of [success, created]) {
      assert.equal(e.actor_id, hq.id);
      assert.equal(e.ip_address, "127.0.0.1");
      assert.equal(e.user_agent, CHROME_UA);
    }
    const blob = JSON.stringify(events);
    for (const spoof of ["203.0.113.9", "198.51.100.1", "198.51.100.7", "192.0.2.60"]) assert.equal(blob.includes(spoof), false, spoof);
  });

  it("malformed forwarding headers are ignored and do not break the request", async () => {
    const before = await maxEventId();
    const r = await login("nobody@test.local", "wrong-pass", {
      "user-agent": "curl/8.4.0",
      "x-forwarded-for": "not-an-ip, <script>alert(1)</script>, 999.1.1.1",
      "x-real-ip": "::::",
      forwarded: "for=\"[bad",
    });
    assert.equal(r.status, 401);
    const [failure] = await eventsSince(before);
    assert.equal(failure.event_type, "login.failure");
    assert.equal(failure.ip_address, "127.0.0.1");
    assert.equal(failure.user_agent, "curl/8.4.0");
    assert.equal(JSON.stringify(failure).includes("script"), false);
  });

  it("IPv6: a request over ::1 stores the IPv6 address", async (t) => {
    const v6 = app.listen(0, "::1");
    const ready = await new Promise<boolean>((resolve) => {
      v6.once("listening", () => resolve(true));
      v6.once("error", () => resolve(false));
    });
    if (!ready) {
      t.skip("IPv6 loopback is not available on this machine");
      return;
    }
    try {
      const before = await maxEventId();
      const r = await login("hq@test.local", HQ_PW, { "user-agent": IPHONE_UA }, { host: "::1", port: (v6.address() as AddressInfo).port });
      assert.equal(r.status, 200);
      const success = (await eventsSince(before)).find((e) => e.event_type === "login.success");
      assert.equal(success.ip_address, "::1");
      assert.equal(success.user_agent, IPHONE_UA);
    } finally {
      await new Promise<void>((resolve) => v6.close(() => resolve()));
    }
  });

  it("normalizeIp: valid IPv4/IPv6 only, mapped IPv4 unwrapped, zone dropped, missing or malformed → null", () => {
    assert.equal(normalizeIp("10.1.2.3"), "10.1.2.3");
    assert.equal(normalizeIp("::ffff:10.1.2.3"), "10.1.2.3");
    assert.equal(normalizeIp("::FFFF:127.0.0.1"), "127.0.0.1");
    assert.equal(normalizeIp("2001:DB8::1"), "2001:db8::1");
    assert.equal(normalizeIp("fe80::1%eth0"), "fe80::1");
    assert.equal(normalizeIp(" ::1 "), "::1");
    for (const bad of [undefined, null, "", "unknown", "999.1.1.1", "1.2.3", "127.0.0.1, 10.0.0.1", "abc::xyz", 42]) {
      assert.equal(normalizeIp(bad), null, String(bad));
    }
  });
});

describe("13.18 User-Agent policy", () => {
  it("stored as sent; the API returns only a browser / OS summary, never the raw header", async () => {
    const r = await raw("GET", "/api/admin/auth-events?event=login.success&limit=50", { headers: authed(hqToken) });
    assert.equal(r.status, 200);
    const chrome = r.body.events.find((e: any) => e.adminId === hq.id && e.ip.value === "127.0.0.1" && e.userAgent.summary === "Chrome · Windows");
    assert.ok(chrome);
    assert.deepEqual(chrome.userAgent, { stored: true, summary: "Chrome · Windows", recognized: true });
    assert.equal(r.text.includes(CHROME_UA), false);
    assert.equal(r.text.includes("Mozilla/5.0"), false);
  });

  it("missing User-Agent → NULL and shown as not stored", async () => {
    const before = await maxEventId();
    const r = await login("nobody@test.local", "wrong-pass", {});
    assert.equal(r.status, 401);
    const [failure] = await eventsSince(before);
    assert.equal(failure.user_agent, null);
    assert.equal(failure.ip_address, "127.0.0.1");
    const list = await raw("GET", "/api/admin/auth-events?event=login.failure&limit=50", { headers: authed(hqToken) });
    const dto = list.body.events.find((e: any) => e.id === failure.id);
    assert.deepEqual(dto.userAgent, { stored: false, summary: null, recognized: false });
    assert.deepEqual(dto.ip, { stored: true, value: "127.0.0.1" });
  });

  it("long User-Agent: cut deterministically at 512 characters, the event is still recorded", async () => {
    const long = `Mozilla/5.0 (X11; Linux x86_64) ${"a".repeat(1500)}\tend`;
    const stored: string[] = [];
    for (let i = 0; i < 2; i++) {
      const before = await maxEventId();
      assert.equal((await login("nobody@test.local", "wrong-pass", { "user-agent": long })).status, 401);
      const [failure] = await eventsSince(before);
      stored.push(failure.user_agent);
    }
    assert.equal(stored[0].length, AUTH_EVENT_USER_AGENT_MAX);
    assert.equal(stored[0], stored[1]);
    assert.equal(stored[0], long.slice(0, 512));
  });

  it("normalizeUserAgent: control characters (incl. NUL) become spaces, empty → null, code-point safe cut", () => {
    assert.equal(normalizeUserAgent("a\u0000b\tc\u007fd"), "a b c d");
    assert.equal(normalizeUserAgent("   "), null);
    assert.equal(normalizeUserAgent(undefined), null);
    assert.equal(normalizeUserAgent(["x"]), null);
    const emoji = "😀".repeat(600);
    const cut = normalizeUserAgent(emoji)!;
    assert.equal(Array.from(cut).length, 512);
    assert.equal(cut, "😀".repeat(512));
  });

  it("userAgentSummary: recognized browser / OS, unrecognized → stored without a summary, null → not stored", () => {
    assert.deepEqual(userAgentSummary(IPHONE_UA), { stored: true, summary: "Safari · iOS", recognized: true });
    assert.deepEqual(userAgentSummary("curl/8.4.0"), { stored: true, summary: "curl", recognized: true });
    assert.deepEqual(userAgentSummary("SomeAgent/1.0"), { stored: true, summary: null, recognized: false });
    assert.deepEqual(userAgentSummary(null), { stored: false, summary: null, recognized: false });
  });
});

describe("13.18 auth event writers", () => {
  it("failed login with a known email: login.failure with telemetry, no email, no password", async () => {
    const before = await maxEventId();
    const pwTry = remember("definitely-wrong-1318");
    assert.equal((await login("hq@test.local", pwTry, { "user-agent": CHROME_UA })).status, 401);
    const [failure] = await eventsSince(before);
    assert.equal(failure.event_type, "login.failure");
    assert.equal(failure.reason, "bad_credentials");
    assert.equal(failure.actor_id, null);
    assert.equal(failure.ip_address, "127.0.0.1");
    assert.equal(failure.user_agent, CHROME_UA);
    assert.equal(JSON.stringify(failure).includes("hq@test.local"), false);
    assert.equal(JSON.stringify(failure).includes(pwTry), false);
  });

  it("failed login with an unknown email: telemetry stored, no admin, the email is not recorded", async () => {
    const before = await maxEventId();
    assert.equal((await login("ghost.1318@test.local", "whatever-1318", { "user-agent": IPHONE_UA })).status, 401);
    const [failure] = await eventsSince(before);
    assert.deepEqual([failure.event_type, failure.actor_id, failure.ip_address, failure.user_agent], ["login.failure", null, "127.0.0.1", IPHONE_UA]);
    assert.equal(JSON.stringify(failure).includes("ghost.1318"), false);
  });

  it("logout: attributed to the verified session's admin, with telemetry; an unknown token stays unattributed", async () => {
    const r = await login("kassa@test.local", KASSA_PW, { "user-agent": IPHONE_UA });
    assert.equal(r.status, 200);
    const before = await maxEventId();
    const out = await raw("POST", "/api/admin/logout", { headers: authed(r.body.token, IPHONE_UA) });
    assert.deepEqual([out.status, out.body], [200, { ok: true, revoked: true }]);
    const events = await eventsSince(before);
    const revoke = events.find((e) => e.event_type === "session.revoke");
    const logout = events.find((e) => e.event_type === "logout");
    for (const e of [revoke, logout]) assert.deepEqual([e.actor_id, e.ip_address, e.user_agent], [cashier.id, "127.0.0.1", IPHONE_UA]);
    assert.equal(JSON.stringify(events).includes(r.body.token.split(".")[2]), false);

    const before2 = await maxEventId();
    const unknown = await raw("POST", "/api/admin/logout", { headers: authed("s1.deadbeefdeadbeefdeadbeefdeadbeef.nope", "curl/8.4.0") });
    assert.deepEqual([unknown.status, unknown.body], [200, { ok: true, revoked: false }]);
    const [anon] = await eventsSince(before2);
    assert.deepEqual([anon.event_type, anon.actor_id, anon.ip_address, anon.user_agent], ["logout", null, "127.0.0.1", "curl/8.4.0"]);
  });

  it("authz.denied: telemetry of the denied request, no token or authorization header", async () => {
    const before = await maxEventId();
    const r = await raw("GET", "/api/admin/auth-events", { headers: authed(cashierToken, "Mozilla/5.0 (Linux; Android 14) Chrome/126.0 Mobile Safari/537.36", { cookie: "sid=cookie-secret-1318" }) });
    assert.equal(r.status, 403);
    const [denied] = await eventsSince(before);
    assert.deepEqual([denied.event_type, denied.actor_id, denied.ip_address], ["authz.denied", cashier.id, "127.0.0.1"]);
    assert.match(denied.user_agent, /Android 14/);
    const blob = JSON.stringify(denied);
    assert.equal(blob.includes(cashierToken), false);
    assert.equal(blob.includes(cashierToken.split(".")[1]), false);
    assert.doesNotMatch(blob, /Bearer|cookie-secret|authorization/i);
  });

  it("session revoke: the event carries the acting admin's request telemetry; the audit payload does not duplicate it", async () => {
    const victim = remember(await issueAdminSession(cashier.id));
    const [row] = await db.select().from(dbm.authSessions).where(eq(dbm.authSessions.publicId, victim.split(".")[1]));
    const before = await maxEventId();
    const r = await raw("POST", `/api/admin/users/${cashier.id}/sessions/${row.id}/revoke`, { headers: authed(hqToken, IPHONE_UA) });
    assert.equal(r.status, 200);
    assert.equal(r.body.changed, true);
    const [revoke] = await eventsSince(before);
    assert.deepEqual([revoke.event_type, revoke.reason, revoke.actor_id, revoke.ip_address, revoke.user_agent], ["session.revoke", "admin_revoke", cashier.id, "127.0.0.1", IPHONE_UA]);
    assert.equal(JSON.parse(revoke.meta).byAdminId, hq.id);
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.entity, "admin_user"), eq(auditLog.action, "admin.session_revoke"))).orderBy(sql`id DESC`).limit(1);
    assert.equal(audit.payload.includes("127.0.0.1"), false);
    assert.equal(audit.payload.includes("Mozilla"), false);
    assert.doesNotMatch(audit.payload, /ip_?address|user_?agent/i);
  });

  it("password change and disable: session.revoke events with telemetry; disabled login has the admin; enable writes no auth event", async () => {
    const pwVictim = remember(await issueAdminSession(cashier.id));
    assert.ok(pwVictim);
    let before = await maxEventId();
    const newPw = remember("kassa-new-1318");
    const pw = await raw("PATCH", `/api/admin/users/${cashier.id}/password`, { headers: authed(hqToken), body: { password: newPw } });
    assert.equal(pw.status, 200);
    const [pwEvent] = (await eventsSince(before)).filter((e) => e.event_type === "session.revoke");
    assert.deepEqual([pwEvent.reason, pwEvent.actor_id, pwEvent.ip_address, pwEvent.user_agent], ["admin_password_change", cashier.id, "127.0.0.1", CHROME_UA]);

    remember(await issueAdminSession(cashier.id));
    before = await maxEventId();
    const off = await raw("PATCH", `/api/admin/users/${cashier.id}/status`, { headers: authed(hqToken, IPHONE_UA), body: { status: "disabled" } });
    assert.equal(off.status, 200);
    const [offEvent] = (await eventsSince(before)).filter((e) => e.event_type === "session.revoke");
    assert.deepEqual([offEvent.reason, offEvent.ip_address, offEvent.user_agent], ["admin_disabled", "127.0.0.1", IPHONE_UA]);

    before = await maxEventId();
    assert.equal((await login("kassa@test.local", newPw, { "user-agent": CHROME_UA })).status, 403);
    const [disabledLogin] = await eventsSince(before);
    assert.deepEqual([disabledLogin.event_type, disabledLogin.reason, disabledLogin.actor_id, disabledLogin.ip_address], ["login.failure", "admin_disabled", cashier.id, "127.0.0.1"]);
    assert.equal(JSON.stringify(disabledLogin).includes(newPw), false);

    before = await maxEventId();
    const on = await raw("PATCH", `/api/admin/users/${cashier.id}/status`, { headers: authed(hqToken), body: { status: "active" } });
    assert.equal(on.status, 200);
    assert.deepEqual(await eventsSince(before), []);
    cashierToken = remember(await issueAdminSession(cashier.id));
  });

  it("customer events and code outside a request never get telemetry", async () => {
    const before = await maxEventId();
    const out = await raw("POST", "/api/auth/logout", { headers: { "user-agent": CHROME_UA } });
    assert.equal(out.status, 200);
    const [customerLogout] = await eventsSince(before);
    assert.deepEqual([customerLogout.actor_type, customerLogout.ip_address, customerLogout.user_agent], ["customer", null, null]);

    await recordAuthEvent({ actorType: "admin", actorId: hq.id, eventType: "logout", meta: { revoked: false } });
    const [system] = await eventsSince(before + 1);
    assert.deepEqual([system.ip_address, system.user_agent], [null, null]);
  });
});

describe("13.18 auth events API", () => {
  it("every event exposes ip { stored, value } and userAgent { stored, summary, recognized }; storage flags are true", async () => {
    await db.insert(authEvents).values({ actorType: "admin", actorId: hq.id, eventType: "login.success", meta: "{}" });
    const r = await raw("GET", "/api/admin/auth-events?limit=50", { headers: authed(hqToken) });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.stored, { ip: true, userAgent: true });
    for (const e of r.body.events) {
      assert.deepEqual(Object.keys(e).sort(), ["admin", "adminId", "createdAt", "details", "event", "id", "ip", "reason", "success", "userAgent"]);
      assert.deepEqual(Object.keys(e.ip).sort(), ["stored", "value"]);
      assert.deepEqual(Object.keys(e.userAgent).sort(), ["recognized", "stored", "summary"]);
      if (e.ip.stored) assert.ok(e.ip.value === null || normalizeIp(e.ip.value) === e.ip.value);
      else assert.equal(e.ip.value, null);
    }
    const legacy = r.body.events.find((e: any) => e.ip.stored === false && e.userAgent.stored === false && e.event === "login.success");
    assert.ok(legacy, "a row without telemetry is reported as not stored");
    for (const ua of [CHROME_UA, IPHONE_UA, "curl/8.4.0"]) assert.equal(r.text.includes(ua), false);
  });

  it("RBAC: HQ 200, cashier 403, unauthenticated 401", async () => {
    assert.equal((await raw("GET", "/api/admin/auth-events", { headers: authed(hqToken) })).status, 200);
    assert.equal((await raw("GET", "/api/admin/auth-events", { headers: authed(cashierToken) })).status, 403);
    assert.equal((await raw("GET", "/api/admin/auth-events", { headers: { "user-agent": CHROME_UA } })).status, 401);
  });
});

describe("13.18 concurrency and reliability", () => {
  it("parallel requests keep their own telemetry (no cross-request leakage)", async () => {
    const before = await maxEventId();
    const agents = ["Agent-A/1.0", "Agent-B/2.0", "Agent-C/3.0", "Agent-D/4.0"];
    const results = await Promise.all(agents.map((ua) => login("hq@test.local", HQ_PW, { "user-agent": ua })));
    assert.ok(results.every((r) => r.status === 200));
    const events = await eventsSince(before);
    const successes = events.filter((e) => e.event_type === "login.success");
    const creates = events.filter((e) => e.event_type === "session.create");
    assert.deepEqual(successes.map((e) => e.user_agent).sort(), agents);
    assert.deepEqual(creates.map((e) => e.user_agent).sort(), agents);
    const denials = await Promise.all(agents.map((ua) => raw("GET", "/api/admin/auth-events", { headers: authed(cashierToken, ua) })));
    assert.ok(denials.every((r) => r.status === 403));
    const denied = (await eventsSince(before)).filter((e) => e.event_type === "authz.denied");
    assert.deepEqual(denied.map((e) => e.user_agent).sort(), agents);
  });

  it("an auth_events insert failure keeps the existing best-effort contract: login still succeeds", async () => {
    await db.execute(sql`CREATE OR REPLACE FUNCTION t1318_fail_event() RETURNS trigger AS $$
      BEGIN IF NEW.event_type = 'login.success' AND NEW.user_agent = 'fail-sink/1.0' THEN RAISE EXCEPTION 't1318 event sink down'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER t1318_fail_event BEFORE INSERT ON auth_events FOR EACH ROW EXECUTE FUNCTION t1318_fail_event()`);
    try {
      const before = await maxEventId();
      const r = await login("hq@test.local", HQ_PW, { "user-agent": "fail-sink/1.0" });
      assert.equal(r.status, 200);
      assert.equal((await raw("GET", "/api/admin/me", { headers: authed(r.body.token) })).status, 200);
      const events = await eventsSince(before);
      assert.equal(events.some((e) => e.event_type === "login.success"), false);
      assert.ok(events.some((e) => e.event_type === "session.create" && e.user_agent === "fail-sink/1.0"));
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS t1318_fail_event ON auth_events`);
      await db.execute(sql`DROP FUNCTION IF EXISTS t1318_fail_event()`);
    }
  });
});

describe("13.18 secrets never leave the server", () => {
  it("no response carries a password, hash, token, cookie, authorization header, HMAC, OTP or secret", () => {
    const blob = responseTexts.join("\n");
    assert.doesNotMatch(blob, /passwordHash|password_hash|tokenHash|token_hash|"password"|"token"|"cookie"|"authorization"|"hmac"|"otp"|"secret"|Bearer /i);
    assert.equal(blob.includes("cookie-secret-1318"), false);
    for (const s of secrets) {
      assert.equal(blob.includes(s), false);
      if (s.startsWith("s1.")) assert.equal(blob.includes(s.split(".")[1]), false);
    }
  });

  it("no auth_events row stores a password, token, public id, cookie or authorization header", async () => {
    const blob = JSON.stringify(rows(await db.execute(sql`SELECT * FROM auth_events`)));
    assert.equal(blob.includes("cookie-secret-1318"), false);
    assert.doesNotMatch(blob, /Bearer |password_hash|token_hash/i);
    for (const s of secrets) {
      if (s.startsWith("s1.")) assert.equal(blob.includes(s.split(".")[2]), false);
      else assert.equal(blob.includes(s), false, "plaintext password");
    }
  });
});

describe("13.18 static contract", () => {
  const appSrc = read(path.join(root, "src/app.ts"));
  const telemetry = read(path.join(root, "src/lib/requestTelemetry.ts"));
  const writer = read(path.join(root, "src/lib/authEvents.ts"));
  const security = read(path.join(root, "src/lib/authSecurity.ts"));
  const route = read(path.join(root, "src/routes/adminSecurity.ts"));
  const adminRoutes = read(path.join(root, "src/routes/admin.ts"));
  const schemaSrc = read(path.join(repoRoot, "lib/db/src/schema/auth.ts"));

  it("telemetry is captured once per request, after the body parsers and before the router", () => {
    const parsers = appSrc.indexOf("app.use(express.urlencoded");
    const capture = appSrc.indexOf("app.use(requestTelemetryMiddleware)");
    const routes = appSrc.indexOf('app.use("/api", router)');
    assert.ok(parsers > 0 && capture > parsers && routes > capture);
    assert.match(telemetry, /ip: normalizeIp\(req\.ip\), userAgent: normalizeUserAgent\(req\.header\("user-agent"\)\)/);
    assert.match(telemetry, /AsyncLocalStorage/);
  });

  it("the writer adds telemetry for admin events only and keeps the best-effort contract", () => {
    assert.match(writer, /const telemetry = input\.actorType === "admin" \? currentRequestTelemetry\(\) : null;/);
    assert.match(writer, /ipAddress: telemetry\?\.ip \?\? null,/);
    assert.match(writer, /userAgent: telemetry\?\.userAgent \?\? null,/);
    assert.match(writer, /logger\.warn\(\{ eventType: input\.eventType, code:/);
    assert.doesNotMatch(writer, /logger\.\w+\(\{[^}]*\berr\b/);
  });

  it("rate-limit keys are unchanged (no new IP-derived keys)", () => {
    assert.match(adminRoutes, /key: \(req\) => `admin-login:\$\{req\.ip\}`/);
    assert.doesNotMatch(telemetry, /rateLimit/);
  });

  it("the DTO never returns the raw User-Agent; storage flags match the schema", () => {
    assert.match(schemaSrc, /ipAddress: text\("ip_address"\),/);
    assert.match(schemaSrc, /userAgent: text\("user_agent"\),/);
    assert.match(route, /AUTH_EVENT_STORAGE = \{ ip: true, userAgent: true \}/);
    const dto = security.slice(security.indexOf("export function toAuthEventDto("), security.indexOf("function browserOf("));
    assert.match(dto, /ip: \{ stored: row\.ipAddress != null, value: normalizeIp\(row\.ipAddress\) \},/);
    assert.match(dto, /userAgent: userAgentSummary\(row\.userAgent\),/);
    assert.doesNotMatch(dto, /userAgent: row\.userAgent|raw:/);
  });

  it("logout attributes the admin only from a verified, revoked session", () => {
    assert.match(adminRoutes, /actorId: result\.revoked \? result\.actorId \?\? null : null,/);
  });
});

describe("13.18 AdminAccessPage: IP + device on auth events", () => {
  const code = read(path.join(adminWeb, "pages/AdminAccessPage.tsx"));
  const css = read(path.join(adminWeb, "styles.css"));
  const docs = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
  const block = (start: string, end: string) => code.slice(code.indexOf(start), code.indexOf(end, code.indexOf(start)));

  it("events table: Vaqt · Hodisa · Natija · Admin · IP · Qurilma (page) and IP manzil · User-Agent (drawer)", () => {
    const table = block("function EventsTable(", "function DrawerTabs(");
    assert.match(table, /const ipLabel = props\.showAdmin \? "IP" : "IP manzil";/);
    assert.match(table, /const uaLabel = props\.showAdmin \? "Qurilma" : "User-Agent";/);
    assert.match(table, /<th scope="col">\{ipLabel\}<\/th>\s*<th scope="col">\{uaLabel\}<\/th>/);
    assert.match(table, /<td data-label=\{ipLabel\}>/);
    assert.match(table, /<code className="ac-code ac-ip">\{e\.ip\.value\}<\/code>/);
  });

  it("not stored is said honestly; the raw User-Agent is never parsed or rendered", () => {
    const helpers = block("function eventIpText(", "function SessionPill(");
    assert.match(helpers, /if \(!ip\.stored\) return "Saqlanmagan";/);
    assert.match(helpers, /if \(!ua\.stored\) return "Saqlanmagan";/);
    assert.match(helpers, /"Saqlangan \(aniqlanmadi\)"/);
    const parse = block("function parseEvent(", "function parseEvents(");
    assert.match(parse, /summary: typeof ua\?\.summary === "string"/);
    assert.match(parse, /\/\^\[0-9a-f:\.\]\{2,45\}\$\/i\.test\(ip\.value\)/);
    assert.doesNotMatch(parse, /userAgent\.raw|ua\?\.raw|ua\?\.value/);
    assert.ok(code.includes("bajargan adminniki"));
  });

  it("styles: IP / device cells wrap (IPv6), tokens only", () => {
    const s = css.slice(css.indexOf("/* Phase 13.18 — auth event telemetry"), css.indexOf("@media (max-width: 1280px)", css.indexOf("/* Phase 13.18 — auth event telemetry")));
    assert.ok(s.length > 100);
    assert.match(s, /\.ac-events \.ac-ip \{[^}]*overflow-wrap: anywhere;/);
    assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|gradient\(/);
  });

  it("Phase 13.18 is documented", () => {
    const a = docs.indexOf("## Phase 13.18 — Auth Security Telemetry");
    const b = docs.indexOf("## Phase 13.17 — Authentication Events + Admin Sessions");
    assert.ok(a >= 0 && b > a);
    const section = docs.slice(a, b);
    for (const item of ["Migration", "Columns", "IP source policy", "Trusted proxy", "User-Agent policy", "Event writers", "API", "Permissions", "Privacy", "Security", "Tests", "Browser QA", "Responsive", "Remaining gaps"]) {
      assert.ok(section.includes(item), item);
    }
    assert.match(section, /0013_auth_event_telemetry/);
  });
});
