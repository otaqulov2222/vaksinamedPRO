/**
 * Admin Phase 13.19 — deployment proxy / trusted proxy security.
 * The repository defines no trusted-proxy topology (no proxy addresses / CIDRs, no hop count, no env setting), so
 * `trust proxy` stays off and boot refuses to enable it. These tests prove that forwarding headers cannot move the
 * client identity used by rate limiting and admin auth telemetry. There is no trusted-chain test because no real
 * proxy contract exists to test against.
 * Integration: the real Express app over a throw-away PGlite directory; raw node:http so every header is exact.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import http from "node:http";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const dataDir = mkdtempSync(path.join(tmpdir(), "vm-1319-api-"));
process.env.PGLITE_DIR = dataDir;
process.env.APP_ENV = "development";
process.env.DB_DRIVER = "pglite";
process.env.ALLOW_DEMO_SEED = "0";
process.env.LOG_LEVEL = "silent";
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;

const dbm = await import("@workspace/db");
const { sql } = await import("drizzle-orm");
const { default: express } = await import("express");
const { default: app } = await import("../src/app");
const { issueAdminSession } = await import("../src/lib/auth");
const { rateLimit, MemoryRateLimitBackend, toStorageKey } = await import("../src/lib/rateLimit");
const { normalizeIp, requestTelemetryMiddleware, currentRequestTelemetry, assertNoProxyTrust } = await import("../src/lib/requestTelemetry");
const { db, adminUsers, branches, hashPassword } = dbm;

type Res = { status: number; body: any; text: string; headers: http.IncomingHttpHeaders };
let server: Server;
let port = 0;
const responseTexts: string[] = [];
const secrets: string[] = [];
const remember = <T extends string>(s: T) => (secrets.push(s), s);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SPOOFS = ["203.0.113.9", "198.51.100.1", "198.51.100.7", "192.0.2.60", "2001:db8::bad"];

function rows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as { rows?: any[] })?.rows || [];
}

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
        resolve({ status: res.statusCode || 0, body, text, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function maxEventId() {
  return Number(rows(await db.execute(sql`SELECT coalesce(max(id), 0)::int AS n FROM auth_events`))[0].n);
}
async function eventsSince(id: number) {
  return rows(await db.execute(sql`SELECT * FROM auth_events WHERE id > ${id} ORDER BY id`));
}
const failedLogin = (headers: Record<string, string>, opts: { host?: string; port?: number } = {}) =>
  raw("POST", "/api/admin/login", { headers: { "user-agent": UA, ...headers }, body: { email: "nobody-1319@test.local", password: "wrong-1319" }, scan: false, ...opts });

async function listenOn(target: express.Express | typeof app, host: string): Promise<{ server: Server; port: number } | null> {
  const s = target.listen(0, host);
  const ok = await new Promise<boolean>((resolve) => {
    s.once("listening", () => resolve(true));
    s.once("error", () => resolve(false));
  });
  if (!ok) return null;
  return { server: s, port: (s.address() as AddressInfo).port };
}
const close = (s: Server) => new Promise<void>((resolve) => s.close(() => resolve()));

let hqToken = "";
let cashierToken = "";

before(async () => {
  const [b1] = await db.insert(branches).values({ code: "T1319A", name: "Test filial A", address: "A ko‘chasi 1", phone: "+998 71 000-00-31", lat: 41.3, lng: 69.2 }).returning();
  const [hq] = await db.insert(adminUsers).values({ email: "hq@test.local", name: "Bosh admin", role: "super_admin", branchId: null, passwordHash: hashPassword(remember("hq-pass-1319")), status: "active" }).returning();
  const [cashier] = await db.insert(adminUsers).values({ email: "kassa@test.local", name: "Kassir A", role: "cashier", branchId: b1.id, passwordHash: hashPassword(remember("kassa-1319")), status: "active" }).returning();
  hqToken = remember(await issueAdminSession(hq.id));
  cashierToken = remember(await issueAdminSession(cashier.id));
  const s = await listenOn(app, "127.0.0.1");
  server = s!.server;
  port = s!.port;
});

after(async () => {
  await close(server);
  rmSync(dataDir, { recursive: true, force: true });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.ts$/.test(name) ? [p] : [];
  });
}

describe("13.19 trust proxy audit", () => {
  const files = sourceFiles(path.join(root, "src"));

  it("trust proxy is off at runtime and nothing in the API source enables it", () => {
    assert.ok(files.length > 20);
    assert.equal(app.get("trust proxy"), false);
    for (const f of files) {
      const code = read(f);
      assert.doesNotMatch(code, /\.set\(\s*["']trust proxy["']/, f);
      assert.doesNotMatch(code, /\.enable\(\s*["']trust proxy["']/, f);
    }
  });

  it("no code reads forwarding headers or req.ips; req.ip is the only client address source", () => {
    for (const f of files) {
      const code = read(f);
      assert.doesNotMatch(code, /["'`](x-forwarded-[a-z]+|x-real-ip|x-client-ip|cf-connecting-ip|true-client-ip|forwarded)["'`]/i, f);
      assert.doesNotMatch(code, /(header|get)\(\s*["'](x-forwarded-[a-z]+|x-real-ip|forwarded)["']/i, f);
      assert.doesNotMatch(code, /headers\[\s*["'](x-forwarded-[a-z]+|x-real-ip|forwarded)["']\s*\]/i, f);
      assert.doesNotMatch(code, /\breq\.ips\b/, f);
      assert.doesNotMatch(code, /req\.(protocol|hostname|secure)\b/, f);
    }
  });

  it("boot refuses trust proxy without a configuration: assertNoProxyTrust runs before listen", () => {
    const index = read(path.join(root, "src/index.ts"));
    const guard = index.indexOf("assertNoProxyTrust(app);");
    assert.ok(guard > 0);
    assert.ok(guard < index.indexOf("app.listen("));
    assert.match(index, /trustProxy: Boolean\(app\.get\("trust proxy"\)\)/);
    assert.doesNotThrow(() => assertNoProxyTrust(app));
    assert.doesNotThrow(() => assertNoProxyTrust(express()));
    for (const value of [true, 1, "loopback", "10.0.0.0/8", ["127.0.0.1"]]) {
      const probe = express();
      probe.set("trust proxy", value);
      assert.throws(() => assertNoProxyTrust(probe), /no trusted-proxy configuration exists/, String(value));
    }
    const off = express();
    off.set("trust proxy", false);
    assert.doesNotThrow(() => assertNoProxyTrust(off));
  });

  it("no trusted-proxy environment setting exists to be honoured", () => {
    const env = read(path.join(repoRoot, ".env.example"));
    assert.doesNotMatch(env, /^\s*#?\s*(TRUST_PROXY|TRUSTED_PROXIES|TRUSTED_PROXY_[A-Z_]+|PROXY_[A-Z_]+)=/m);
    assert.match(env, /there is NO trusted-proxy setting/);
    for (const f of files) assert.doesNotMatch(read(f), /process\.env\.(TRUST_PROXY|TRUSTED_PROX)/, f);
  });

  it("rate-limit keys are unchanged: every limiter is keyed by req.ip and stored hashed", () => {
    const expected: Array<[string, RegExp]> = [
      ["src/routes/admin.ts", /key: \(req\) => `admin-login:\$\{req\.ip\}`/],
      ["src/routes/auth.ts", /key: \(req\) => `otp:\$\{req\.ip\}:\$\{String\(req\.body\?\.phone \|\| ""\)\}`/],
      ["src/routes/auth.ts", /key: \(req\) => `auth:\$\{req\.ip\}`/],
      ["src/routes/orders.ts", /key: \(req\) => `order-create:\$\{req\.ip\}:/],
      ["src/routes/loyalty.ts", /key: \(req\) => `cashback-history:\$\{req\.ip\}:/],
      ["src/routes/loyalty.ts", /key: \(req\) => `loyalty-redeem:\$\{req\.ip\}`/],
      ["src/routes/pos.ts", /key: \(req\) => `pos-scan:\$\{req\.ip\}`/],
      ["src/routes/pos.ts", /key: \(req\) => `pos-sale:\$\{req\.ip\}`/],
      ["src/routes/pos.ts", /key: \(req\) => `pos-card:\$\{req\.ip\}`/],
      ["src/lib/rateLimit.ts", /options\.key\?\.\(req\) \|\| `\$\{req\.ip \|\| "unknown"\}:\$\{req\.path\}`/],
    ];
    for (const [file, re] of expected) assert.match(read(path.join(root, file)), re, `${file} ${re}`);
    assert.match(toStorageKey("admin-login:127.0.0.1"), /^rl:v1:[0-9a-f]{40}$/);
    assert.equal(toStorageKey("admin-login:127.0.0.1").includes("127.0.0.1"), false);
  });
});

describe("13.19 spoofed forwarding headers are ignored (auth telemetry)", () => {
  const cases: Array<[string, Record<string, string>]> = [
    ["direct request (no forwarding headers)", {}],
    ["spoofed X-Forwarded-For", { "x-forwarded-for": "203.0.113.9, 198.51.100.1" }],
    ["spoofed X-Real-IP", { "x-real-ip": "198.51.100.7" }],
    ["spoofed Forwarded", { forwarded: "for=192.0.2.60;proto=https;by=203.0.113.43" }],
    ["spoofed IPv6 + loopback claims", { "x-forwarded-for": "2001:db8::bad, 127.0.0.1", "x-real-ip": "::1", forwarded: 'for="[2001:db8::bad]:4711"' }],
    ["malformed values", { "x-forwarded-for": "not-an-ip, <script>, 999.1.1.1, , ,", "x-real-ip": "::::", forwarded: 'for="[bad' }],
  ];
  for (const [title, headers] of cases) {
    it(`${title}: the event IP is the TCP peer`, async () => {
      const before = await maxEventId();
      const r = await failedLogin(headers);
      assert.equal(r.status, 401);
      const events = await eventsSince(before);
      assert.equal(events.length, 1);
      assert.deepEqual([events[0].event_type, events[0].actor_id, events[0].ip_address, events[0].user_agent], ["login.failure", null, "127.0.0.1", UA]);
      const blob = JSON.stringify(events);
      for (const spoof of [...SPOOFS, "script", "999.1.1.1"]) assert.equal(blob.includes(spoof), false, spoof);
    });
  }

  it("IPv6 peer: a request over ::1 stores ::1 and ignores an IPv4 forwarding claim", async (t) => {
    const v6 = await listenOn(app, "::1");
    if (!v6) return t.skip("IPv6 loopback unavailable on this host");
    try {
      const before = await maxEventId();
      const r = await failedLogin({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.7" }, { host: "::1", port: v6.port });
      assert.equal(r.status, 401);
      const [e] = await eventsSince(before);
      assert.equal(e.ip_address, "::1");
    } finally {
      await close(v6.server);
    }
  });

  it("customer events stay without telemetry even with forwarding headers", async () => {
    const before = await maxEventId();
    const r = await raw("POST", "/api/auth/logout", { headers: { "user-agent": UA, "x-forwarded-for": "203.0.113.9" } });
    assert.equal(r.status, 200);
    const [e] = await eventsSince(before);
    assert.deepEqual([e.actor_type, e.ip_address, e.user_agent], ["customer", null, null]);
  });

  it("normalizeIp: header-shaped and malformed values are rejected, real addresses normalized", () => {
    assert.equal(normalizeIp("10.0.0.1"), "10.0.0.1");
    assert.equal(normalizeIp(" 10.0.0.1 "), "10.0.0.1");
    assert.equal(normalizeIp("::FFFF:10.0.0.1"), "10.0.0.1");
    assert.equal(normalizeIp("2001:DB8::1"), "2001:db8::1");
    assert.equal(normalizeIp("fe80::1%eth0"), "fe80::1");
    for (const bad of ["203.0.113.9, 198.51.100.1", "for=192.0.2.60", "[::1]", "[::1]:443", "10.0.0.1:5000", "unknown", "", " ", "::::", "999.1.1.1", "1.2.3", "localhost", null, undefined, 42]) {
      assert.equal(normalizeIp(bad), null, String(bad));
    }
  });
});

describe("13.19 rate-limit identity", () => {
  function probeApp() {
    const backend = new MemoryRateLimitBackend();
    const probe = express();
    probe.use(requestTelemetryMiddleware);
    probe.get(
      "/probe",
      rateLimit({ windowMs: 60_000, max: 3, backend, key: (req) => `probe:${req.ip}` }),
      (req, res) => res.json({ reqIp: req.ip, telemetryIp: currentRequestTelemetry()?.ip ?? null }),
    );
    return probe;
  }
  const spoofHeaders = [
    { "x-forwarded-for": "203.0.113.1" },
    { "x-real-ip": "203.0.113.2" },
    { forwarded: "for=203.0.113.3" },
    { "x-forwarded-for": "203.0.113.4, 198.51.100.4", "x-real-ip": "203.0.113.5", forwarded: "for=203.0.113.6" },
  ];

  for (const [family, host, expected] of [["IPv4", "127.0.0.1", "127.0.0.1"], ["IPv6", "::1", "::1"]] as const) {
    it(`${family}: the limiter key and the telemetry IP are the same peer; rotating spoofed headers share one bucket`, async (t) => {
      const s = await listenOn(probeApp(), host);
      if (!s) return t.skip(`${family} loopback unavailable on this host`);
      try {
        const statuses: number[] = [];
        for (const headers of spoofHeaders) {
          const r = await raw("GET", "/probe", { headers, host, port: s.port, scan: false });
          statuses.push(r.status);
          if (r.status === 200) {
            assert.equal(normalizeIp(r.body.reqIp), expected);
            assert.equal(r.body.telemetryIp, expected);
          }
        }
        assert.deepEqual(statuses, [200, 200, 200, 429]);
      } finally {
        await close(s.server);
      }
    });
  }

  it("the real admin login limiter cannot be bypassed by rotating forwarding headers", async () => {
    const before = await maxEventId();
    const first = await failedLogin({ "x-forwarded-for": "198.51.100.200" });
    assert.equal(first.status, 401);
    let remaining = Number(first.headers["x-ratelimit-remaining"]);
    assert.equal(first.headers["x-ratelimit-limit"], "20");
    assert.ok(Number.isInteger(remaining) && remaining >= 0 && remaining < 20);
    let sent = 1;
    for (let i = 0; remaining > 0; i += 1) {
      const variant = [
        { "x-forwarded-for": `198.51.100.${i + 1}` },
        { "x-real-ip": `203.0.113.${i + 1}` },
        { forwarded: `for=192.0.2.${i + 1}` },
      ][i % 3];
      const r = await failedLogin(variant);
      sent += 1;
      assert.equal(r.status, 401);
      assert.equal(Number(r.headers["x-ratelimit-remaining"]), remaining - 1, "every spoofed request hits the same bucket");
      remaining -= 1;
    }
    const blocked = await failedLogin({ "x-forwarded-for": "198.51.100.250", "x-real-ip": "203.0.113.250", forwarded: "for=192.0.2.250" });
    assert.equal(blocked.status, 429);
    const events = (await eventsSince(before)).filter((e) => e.event_type === "login.failure");
    assert.equal(events.length, sent);
    assert.ok(events.every((e) => e.ip_address === "127.0.0.1"));
  });
});

describe("13.19 existing authorization and secrets", () => {
  it("401 / 403 / 200 are unchanged by forwarding headers; the API reports the peer IP only", async () => {
    const spoof = { "user-agent": UA, "x-forwarded-for": "127.0.0.1", "x-real-ip": "10.0.0.1", forwarded: "for=10.0.0.2" };
    assert.equal((await raw("GET", "/api/admin/auth-events", { headers: spoof })).status, 401);
    assert.equal((await raw("GET", "/api/admin/auth-events", { headers: { ...spoof, authorization: `Bearer ${cashierToken}` } })).status, 403);
    const ok = await raw("GET", "/api/admin/auth-events?limit=50", { headers: { ...spoof, authorization: `Bearer ${hqToken}` } });
    assert.equal(ok.status, 200);
    const ips = new Set(ok.body.events.filter((e: any) => e.ip.stored).map((e: any) => e.ip.value));
    assert.ok(ips.size >= 1);
    for (const ip of ips) assert.ok(ip === "127.0.0.1" || ip === "::1", String(ip));
    for (const s of [...SPOOFS, "10.0.0.1", "10.0.0.2"]) assert.equal(ok.text.includes(s), false, s);
  });

  it("no response or auth_events row carries a password, hash, token, cookie or authorization header", async () => {
    const blob = responseTexts.join("\n");
    for (const s of secrets) assert.equal(blob.includes(s), false);
    assert.doesNotMatch(blob, /passwordHash|password_hash|tokenHash|token_hash|"authorization"|"cookie"|Bearer /i);
    const stored = JSON.stringify(rows(await db.execute(sql`SELECT * FROM auth_events`)));
    for (const s of secrets) {
      const secretPart = s.split(".")[2] || s;
      assert.equal(stored.includes(secretPart), false);
    }
    assert.equal(stored.includes("wrong-1319"), false);
    assert.equal(stored.includes("nobody-1319@test.local"), false);
  });
});

describe("13.19 documentation", () => {
  it("the decision record says trust proxy stays off and lists the open operational decisions", () => {
    const docs = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
    const a = docs.indexOf("## Phase 13.19 — Deployment Proxy + Trusted Proxy Security");
    const b = docs.indexOf("## Phase 13.18 — Auth Security Telemetry");
    assert.ok(a >= 0 && b > a);
    const section = docs.slice(a, b);
    for (const item of ["Audit", "trust proxy", "intentionally left disabled", "Rate-limit", "auth_sessions", "auth_events", "No migration", "Spoofing", "Decision record", "Tests", "Browser QA", "Remaining gaps"]) {
      assert.ok(section.includes(item), item);
    }
    const matrix = read(path.join(repoRoot, "docs/PRODUCTION_GAP_MATRIX.md"));
    assert.match(matrix, /\| O-6 \| Trusted proxy topology[^\n]*\*\*OPS_REQUIRED\*\*/);
    const blueprint = read(path.join(repoRoot, "docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md"));
    assert.match(blueprint, /## Phase 13\.19 addendum — Trusted proxy/);
  });
});
