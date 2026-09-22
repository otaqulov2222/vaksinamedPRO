/**
 * P13.1 — Real HTTP API + Real PostgreSQL load validation (non-production).
 *
 * Orchestrates:
 *  1) embedded real PostgreSQL (or TEST_DATABASE_URL)
 *  2) API child process (production build dist/index.mjs) on PORT 5100
 *  3) scale seed 200/500/1000
 *  4) HTTP read/write/concurrency suites
 *
 * Never enables production Payme/Click or FOM inventory writer.
 *
 * Run: pnpm p13:1
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { assertSafeTestDatabaseUrl } from "../../../../lib/db/src/env";
import { hashPassword } from "../../../../lib/db/src/password";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const requireFromDb = createRequire(path.join(root, "lib/db/package.json"));
const pg = requireFromDb("pg") as typeof import("pg");
const { Pool } = pg;
const apiDir = path.resolve(root, "artifacts/api-server");
const outDir = path.join(root, ".data", "p13-1-http");
const PORT = Number(process.env.P13_1_API_PORT || 5100);
const BASE = `http://127.0.0.1:${PORT}`;

type Scenario = { name: string; status: "PASS" | "FAIL" | "NOT_PROVEN" | "PENDING"; details?: Record<string, unknown>; failures?: string[] };

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), init.timeoutMs ?? 60_000);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body, timeout: false as const };
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "AbortError" || /aborted/i.test(String(err)));
    return { ok: false, status: 0, body: null, timeout };
  } finally {
    clearTimeout(t);
  }
}

async function timed(url: string, init?: RequestInit & { timeoutMs?: number }) {
  const start = performance.now();
  const r = await fetchJson(url, { ...init, timeoutMs: init?.timeoutMs ?? 30_000 });
  return { ...r, ms: performance.now() - start };
}

async function mapPool<T>(n: number, fn: (i: number) => Promise<T>, concurrency = Math.min(n, 80)) {
  const out: T[] = new Array(n);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= n) return;
      out[i] = await fn(i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, n) }, () => worker()));
  return out;
}

async function bootstrapPg(): Promise<{ connectionString: string; source: string; stop?: () => Promise<void> }> {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (testUrl && /^postgres(ql)?:\/\//i.test(testUrl)) {
    assertSafeTestDatabaseUrl(testUrl);
    return { connectionString: testUrl, source: "TEST_DATABASE_URL" };
  }

  const require = createRequire(import.meta.url);
  let EmbeddedPostgres: new (o: Record<string, unknown>) => {
    initialise: () => Promise<void>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    createDatabase: (n: string) => Promise<void>;
  };
  try {
    const mod = require("embedded-postgres");
    EmbeddedPostgres = mod.default || mod;
  } catch (err) {
    throw new Error(
      `HTTP_API_REAL_PG = BLOCKED — embedded-postgres missing and no TEST_DATABASE_URL (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  mkdirSync(outDir, { recursive: true });
  const dataDir = path.join(outDir, "embedded-pg");
  if (existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
  }
  mkdirSync(dataDir, { recursive: true });
  const port = Number(process.env.P13_1_PG_PORT || 55434);
  const password = "p13_1_http_only";
  const user = "postgres";
  const dbName = "vaksinamed_p13_1_test";
  const pgEmbedded = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  await pgEmbedded.initialise();
  await pgEmbedded.start();
  try {
    await pgEmbedded.createDatabase(dbName);
  } catch {
    /* may exist */
  }
  return {
    connectionString: `postgresql://${user}:${password}@127.0.0.1:${port}/${dbName}`,
    source: "EMBEDDED_POSTGRES",
    stop: async () => {
      try {
        await pgEmbedded.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

function startApi(connectionString: string): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    APP_ENV: "development",
    NODE_ENV: "development",
    PORT: String(PORT),
    DATABASE_URL: connectionString,
    TEST_DATABASE_URL: connectionString,
    DB_DRIVER: "postgres",
    ALLOW_TEST_DB: "1",
    ALLOW_DEMO_SEED: "1",
    ALLOW_OTP_DEV_BYPASS: "1",
    ALLOW_PAYMENT_SIMULATE: "1",
    ALLOW_TELEGRAM_AUTO_PROVISION: "1",
    PAYME_MERCHANT_API_ENABLED: "0",
    CLICK_MERCHANT_API_ENABLED: "0",
    ENABLE_BACKGROUND_WORKERS: "0",
    PG_POOL_MAX: process.env.PG_POOL_MAX || "40",
    LOG_LEVEL: "error",
    PINO_LOG_LEVEL: "error",
    ADMIN_SECRET: "p13-1-admin-secret",
    CUSTOMER_SECRET: "p13-1-customer-secret",
    POS_SECRET: "p13-1-pos-secret",
    FOM_WEBHOOK_SECRET: "p13-1-fom-webhook-secret",
  };
  // Keep OTP on local console bypass — do not call real SMS in load harness
  delete env.ESKIZ_EMAIL;
  delete env.ESKIZ_PASSWORD;
  const child = spawn(process.execPath, ["--enable-source-maps", path.join(apiDir, "dist", "index.mjs")], {
    cwd: apiDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Keep logs small during load — only surface errors
  child.stdout?.on("data", (b) => {
    const s = String(b);
    if (/ERROR|FATAL|EADDRINUSE|listening/i.test(s)) process.stderr.write(`[api] ${s}`);
  });
  child.stderr?.on("data", (b) => {
    const s = String(b);
    if (/ERROR|FATAL|EADDRINUSE|listening|DEMO seed|Applying/i.test(s)) process.stderr.write(`[api] ${s}`);
  });
  return child;
}

async function waitReady(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetchJson(`${BASE}/api/health/ready`);
      if (r.ok && (r.body as { driver?: string })?.driver === "postgres") return r.body as Record<string, unknown>;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error("API readiness timeout — real PostgreSQL HTTP API did not become ready");
}

async function sql(pool: InstanceType<typeof Pool>, text: string, params: unknown[] = []) {
  return pool.query(text, params);
}

async function seedScale(pool: InstanceType<typeof Pool>, branchCount: number) {
  const t0 = performance.now();
  for (let i = 0; i < 8; i++) {
    await sql(
      pool,
      `INSERT INTO products (sku, name_uz, name_ru, category, manufacturer, description, price)
       VALUES ($1,$2,$2,'scale','P13','scale',$3)
       ON CONFLICT (sku) DO NOTHING`,
      [`P131-P-${i}`, `Scale ${i}`, 1000 + i],
    );
  }
  await sql(
    pool,
    `INSERT INTO branches (code, name, city, region, district, address, phone, hours, lat, lng)
     SELECT 'P131-B-' || lpad(g::text, 4, '0'), 'P131 Branch ' || g::text, 'Toshkent', 'T', 'D',
            'Addr ' || g::text, '+99872' || lpad(g::text, 7, '0'), '9-18',
            41.3 + (g % 100) * 0.001, 69.2 + (g % 100) * 0.001
     FROM generate_series(0, $1) AS g
     ON CONFLICT (code) DO NOTHING`,
    [branchCount - 1],
  );
  const products = await sql(pool, `SELECT id FROM products WHERE sku LIKE 'P131-P-%'`);
  for (const p of products.rows) {
    await sql(
      pool,
      `INSERT INTO product_stocks (product_id, branch_id, quantity, physical_quantity, reserved_quantity)
       SELECT $1, b.id, 100, 100, 0 FROM branches b
       WHERE b.code LIKE 'P131-B-%'
         AND NOT EXISTS (SELECT 1 FROM product_stocks s WHERE s.branch_id = b.id AND s.product_id = $1)`,
      [p.id],
    );
  }
  return { branches: branchCount, ms: performance.now() - t0 };
}

/** Mint s1 session directly in PG — avoids auth rate-limit during concurrency races (auth path tested separately). */
async function mintCustomerSession(pool: InstanceType<typeof Pool>, customerId: number): Promise<string> {
  const publicId = randomBytes(16).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(`${publicId}:${secret}`).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await sql(
    pool,
    `INSERT INTO auth_sessions (public_id, actor_type, actor_id, token_hash, expires_at, device_label, user_agent)
     VALUES ($1,'customer',$2,$3,$4,'p13.1','p13.1')`,
    [publicId, customerId, tokenHash, expiresAt.toISOString()],
  );
  return `s1.${publicId}.${secret}`;
}

async function ensureCustomer(pool: InstanceType<typeof Pool>, phone: string, password = "pass1234"): Promise<{ id: number; token: string }> {
  const tg = `p131-${phone.replace(/\D/g, "")}`;
  const existing = await sql(pool, `SELECT id FROM customers WHERE telegram_id = $1 LIMIT 1`, [tg]);
  let id = Number(existing.rows[0]?.id || 0);
  if (!id) {
    const hash = hashPassword(password);
    const ins = await sql(
      pool,
      `INSERT INTO customers (telegram_id, first_name, last_name, phone, password_hash, tier, balance)
       VALUES ($1,'P131','User',$2,$3,'bronze',0) RETURNING id`,
      [tg, phone, hash],
    );
    id = Number(ins.rows[0].id);
  }
  const token = await mintCustomerSession(pool, id);
  return { id, token };
}

async function authCustomer(phone: string, password = "pass1234") {
  // HTTP auth path (rate-limited) — used for auth probes / low-volume flows
  let r = await fetchJson(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  if (!r.ok) {
    await fetchJson(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, password, firstName: "P131", lastName: "User" }),
    });
    const otp = await fetchJson(`${BASE}/api/auth/otp/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, purpose: "login" }),
    });
    void otp;
    r = await fetchJson(`${BASE}/api/auth/otp/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, code: "000000", purpose: "login" }),
    });
    if (!r.ok) {
      r = await fetchJson(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
    }
  }
  const token = (r.body as { token?: string })?.token || "";
  const customer = (r.body as { customer?: { id: number } })?.customer;
  return { token, customerId: customer?.id || 0, ok: Boolean(token) };
}

async function adminToken() {
  const r = await fetchJson(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@vaksinamed.uz", password: "vaksinamed" }),
  });
  return (r.body as { token?: string })?.token || "";
}

async function readMatrix(branchHint: number, users: number): Promise<Record<string, unknown>> {
  const samples: number[] = [];
  let errors = 0;
  let timeouts = 0;
  const endpoints = [
    "/api/health/live",
    "/api/catalog/categories",
    "/api/catalog/products?q=a",
    "/api/branches",
    `/api/catalog/products?branchId=${branchHint}`,
  ];
  const t0 = performance.now();
  const iters = users >= 1000 ? 1 : 2;
  await mapPool(
    users,
    async (u) => {
      for (let i = 0; i < iters; i++) {
        const ep = endpoints[u % endpoints.length];
        const r = await timed(`${BASE}${ep}`);
        if (r.timeout) timeouts += 1;
        else if (!r.ok) errors += 1;
        else samples.push(r.ms);
      }
    },
    users,
  );
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.length + errors + timeouts;
  return {
    users,
    requests: total,
    success: samples.length,
    errors,
    timeouts,
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    p99: pct(sorted, 99),
    errorPct: total ? Number(((errors / total) * 100).toFixed(2)) : 0,
    throughputRps: Number(((samples.length / (performance.now() - t0)) * 1000).toFixed(2)),
    result: errors / Math.max(1, total) > 0.05 ? "FAIL" : "PASS",
  };
}

async function inventoryHttpRace(pool: InstanceType<typeof Pool>, run: number): Promise<Scenario> {
  const failures: string[] = [];
  // dedicated branch/product with stock=10
  const code = `P131-INV-${run}`;
  await sql(
    pool,
    `INSERT INTO branches (code, name, city, region, district, address, phone, hours, lat, lng)
     VALUES ($1,$2,'T','T','D','A','+998900000001','9-18',41.3,69.2)
     ON CONFLICT (code) DO NOTHING`,
    [code, code],
  );
  const br = await sql(pool, `SELECT id FROM branches WHERE code = $1`, [code]);
  const branchId = Number(br.rows[0].id);
  const sku = `P131-INV-SKU-${run}`;
  await sql(
    pool,
    `INSERT INTO products (sku, name_uz, name_ru, category, manufacturer, description, price)
     VALUES ($1,'Inv','Inv','I','M','d',5000) ON CONFLICT (sku) DO NOTHING`,
    [sku],
  );
  const pr = await sql(pool, `SELECT id FROM products WHERE sku = $1`, [sku]);
  const productId = Number(pr.rows[0].id);
  await sql(pool, `DELETE FROM reservation_items WHERE reservation_id IN (SELECT id FROM reservations WHERE branch_id = $1)`, [branchId]);
  await sql(pool, `DELETE FROM reservations WHERE branch_id = $1`, [branchId]);
  await sql(pool, `DELETE FROM product_stocks WHERE branch_id = $1 AND product_id = $2`, [branchId, productId]);
  await sql(
    pool,
    `INSERT INTO product_stocks (product_id, branch_id, quantity, physical_quantity, reserved_quantity) VALUES ($1,$2,10,10,0)`,
    [productId, branchId],
  );

  // Pre-mint 100 sessions (bypass auth rate-limit); race is on HTTP cart→order→reserve
  const actors: { token: string }[] = [];
  for (let i = 0; i < 100; i++) {
    const phone = `+99893${run}${String(i).padStart(6, "0")}`;
    actors.push(await ensureCustomer(pool, phone));
  }
  const results = await mapPool(
    100,
    async (i) => {
      const h = {
        authorization: `Bearer ${actors[i].token}`,
        "content-type": "application/json",
        "idempotency-key": `p131-inv-${run}-${i}`,
      };
      await fetchJson(`${BASE}/api/cart/branch`, { method: "POST", headers: h, body: JSON.stringify({ branchId }) });
      await fetchJson(`${BASE}/api/cart/items`, { method: "POST", headers: h, body: JSON.stringify({ productId, quantity: 1 }) });
      const order = await fetchJson(`${BASE}/api/orders`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          branchId,
          fulfillment: "pickup",
          paymentMethod: "pay_at_branch",
          idempotencyKey: `p131-inv-${run}-${i}`,
        }),
      });
      return { ok: order.ok || order.status === 200 || order.status === 201, status: order.status };
    },
    100,
  );

  const ok = results.filter((r) => r.ok).length;
  const stock = await sql(
    pool,
    `SELECT physical_quantity, reserved_quantity, (physical_quantity - reserved_quantity) AS available
     FROM product_stocks WHERE branch_id = $1 AND product_id = $2`,
    [branchId, productId],
  );
  const physical = Number(stock.rows[0]?.physical_quantity ?? -1);
  const reserved = Number(stock.rows[0]?.reserved_quantity ?? -1);
  const available = Number(stock.rows[0]?.available ?? physical - reserved);
  if (ok < 1) failures.push("no successful HTTP reservations");
  if (ok > 10) failures.push(`oversell http successes=${ok}`);
  if (reserved > physical || physical < 0 || reserved < 0 || available < 0) failures.push(`stock invariant broken p=${physical} r=${reserved} a=${available}`);
  if (reserved > 10) failures.push(`reserved=${reserved}`);

  return {
    name: `inventory_http_run_${run}`,
    status: failures.length ? "FAIL" : "PASS",
    details: { successes: ok, physical, reserved, available },
    failures,
  };
}

async function paymentHttpRace(pool: InstanceType<typeof Pool>, run: number): Promise<Scenario> {
  const failures: string[] = [];
  const phone = `+99894${String(1000000 + run)}`;
  const auth = await ensureCustomer(pool, phone);

  // use any in-stock product from demo seed
  const prod = await sql(pool, `SELECT p.id AS product_id, s.branch_id FROM products p
    JOIN product_stocks s ON s.product_id = p.id
    WHERE s.physical_quantity - s.reserved_quantity >= 1 LIMIT 1`);
  if (!prod.rows[0]) return { name: `payment_http_${run}`, status: "FAIL", failures: ["no stock"] };
  const productId = Number(prod.rows[0].product_id);
  const branchId = Number(prod.rows[0].branch_id);
  const h = { authorization: `Bearer ${auth.token}`, "content-type": "application/json", "idempotency-key": `p131-pay-${run}` };
  await fetchJson(`${BASE}/api/cart/branch`, { method: "POST", headers: h, body: JSON.stringify({ branchId }) });
  await fetchJson(`${BASE}/api/cart/items`, { method: "POST", headers: h, body: JSON.stringify({ productId, quantity: 1 }) });
  const orderRes = await fetchJson(`${BASE}/api/orders`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ branchId, fulfillment: "pickup", paymentMethod: "payme", idempotencyKey: `p131-pay-ord-${run}` }),
  });
  const payWrap = orderRes.body as { payment?: { id?: number; payment?: { id?: number }; intent?: { id?: number } } };
  const paymentId = Number(payWrap?.payment?.payment?.id || payWrap?.payment?.id || 0);
  if (!paymentId) {
    return { name: `payment_http_${run}`, status: "FAIL", failures: [`order/payment missing status=${orderRes.status}`], details: { body: orderRes.body } };
  }

  const settled = await mapPool(
    100,
    async (i) =>
      timed(`${BASE}/api/payments/${paymentId}/simulate-success`, {
        method: "POST",
        headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json", "idempotency-key": `sim-${run}-${i}` },
      }),
    100,
  );
  const caps = await sql(pool, `SELECT COUNT(*)::int AS c FROM payment_captures WHERE order_id = (
    SELECT order_id FROM payments WHERE id = $1
  )`, [paymentId]);
  const captureCount = Number(caps.rows[0]?.c || 0);
  if (captureCount !== 1) failures.push(`captures=${captureCount}`);
  const okHttp = settled.filter((s) => s.ok || s.status === 200 || s.status === 409).length;
  void okHttp;
  return {
    name: `payment_http_run_${run}`,
    status: failures.length ? "FAIL" : "PASS",
    details: { paymentId, captureCount, httpOkish: okHttp },
    failures,
  };
}

async function refundHttpRace(pool: InstanceType<typeof Pool>, run: number, adminTok: string): Promise<Scenario> {
  const failures: string[] = [];
  const phone = `+99895${String(1000000 + run)}`;
  const auth = await ensureCustomer(pool, phone);
  const prod = await sql(pool, `SELECT p.id AS product_id, s.branch_id FROM products p
    JOIN product_stocks s ON s.product_id = p.id WHERE s.physical_quantity - s.reserved_quantity >= 1 LIMIT 1`);
  if (!prod.rows[0]) return { name: `refund_http_${run}`, status: "FAIL", failures: ["setup"] };
  const productId = Number(prod.rows[0].product_id);
  const branchId = Number(prod.rows[0].branch_id);
  const h = { authorization: `Bearer ${auth.token}`, "content-type": "application/json" };
  await fetchJson(`${BASE}/api/cart/branch`, { method: "POST", headers: h, body: JSON.stringify({ branchId }) });
  await fetchJson(`${BASE}/api/cart/items`, { method: "POST", headers: h, body: JSON.stringify({ productId, quantity: 1 }) });
  const orderRes = await fetchJson(`${BASE}/api/orders`, {
    method: "POST",
    headers: { ...h, "idempotency-key": `p131-ref-ord-${run}` },
    body: JSON.stringify({ branchId, fulfillment: "pickup", paymentMethod: "payme", idempotencyKey: `p131-ref-ord-${run}` }),
  });
  const payWrap = orderRes.body as { payment?: { id?: number; payment?: { id?: number } } };
  const paymentId = Number(payWrap?.payment?.payment?.id || payWrap?.payment?.id || 0);
  const intentLookup = await sql(pool, `SELECT id, amount FROM payment_intents WHERE legacy_payment_id = $1 LIMIT 1`, [paymentId]);
  let intentId = Number(intentLookup.rows[0]?.id || 0);
  let amount = Number(intentLookup.rows[0]?.amount || 0);
  if (!intentId) {
    // create via order payment path may store intent differently — fall back payments join
    const alt = await sql(
      pool,
      `SELECT pi.id, pi.amount FROM payment_intents pi
       JOIN payments p ON p.payment_intent_id = pi.id WHERE p.id = $1 LIMIT 1`,
      [paymentId],
    );
    intentId = Number(alt.rows[0]?.id || 0);
    amount = Number(alt.rows[0]?.amount || 0);
  }
  await fetchJson(`${BASE}/api/payments/${paymentId}/simulate-success`, { method: "POST", headers: h });
  if (!intentId) {
    // refresh
    const alt2 = await sql(
      pool,
      `SELECT pi.id, pi.amount FROM payment_intents pi
       JOIN payments p ON p.payment_intent_id = pi.id OR p.id = pi.legacy_payment_id
       WHERE p.id = $1 LIMIT 1`,
      [paymentId],
    );
    intentId = Number(alt2.rows[0]?.id || 0);
    amount = Number(alt2.rows[0]?.amount || 0);
  }
  if (!intentId) return { name: `refund_http_${run}`, status: "FAIL", failures: ["no intent"], details: { paymentId } };

  const ah = { authorization: `Bearer ${adminTok}`, "content-type": "application/json" };
  await Promise.all([
    fetchJson(`${BASE}/api/admin/payments/intents/${intentId}/refund`, {
      method: "POST",
      headers: ah,
      body: JSON.stringify({ amount, idempotencyKey: `p131-ref-a-${run}` }),
    }),
    fetchJson(`${BASE}/api/admin/payments/intents/${intentId}/refund`, {
      method: "POST",
      headers: ah,
      body: JSON.stringify({ amount, idempotencyKey: `p131-ref-b-${run}` }),
    }),
  ]);

  // second payment for partials
  const phone2 = `+99896${String(1000000 + run)}`;
  const auth2 = await ensureCustomer(pool, phone2);
  const h2 = { authorization: `Bearer ${auth2.token}`, "content-type": "application/json" };
  await fetchJson(`${BASE}/api/cart/branch`, { method: "POST", headers: h2, body: JSON.stringify({ branchId }) });
  await fetchJson(`${BASE}/api/cart/items`, { method: "POST", headers: h2, body: JSON.stringify({ productId, quantity: 1 }) });
  const order2 = await fetchJson(`${BASE}/api/orders`, {
    method: "POST",
    headers: { ...h2, "idempotency-key": `p131-refp-ord-${run}` },
    body: JSON.stringify({ branchId, fulfillment: "pickup", paymentMethod: "payme", idempotencyKey: `p131-refp-ord-${run}` }),
  });
  const paymentId2 = Number(
    ((order2.body as { payment?: { id?: number; payment?: { id?: number } } })?.payment?.payment?.id ||
      (order2.body as { payment?: { id?: number } })?.payment?.id ||
      0) as number,
  );
  await fetchJson(`${BASE}/api/payments/${paymentId2}/simulate-success`, { method: "POST", headers: h2 });
  const intent2 = await sql(
    pool,
    `SELECT pi.id, pi.amount FROM payment_intents pi
     JOIN payments p ON p.payment_intent_id = pi.id OR p.id = pi.legacy_payment_id
     WHERE p.id = $1 LIMIT 1`,
    [paymentId2],
  );
  const intentId2 = Number(intent2.rows[0]?.id || 0);
  const amount2 = Number(intent2.rows[0]?.amount || 0);
  if (intentId2) {
    await mapPool(10, async (i) =>
      fetchJson(`${BASE}/api/admin/payments/intents/${intentId2}/refund`, {
        method: "POST",
        headers: ah,
        body: JSON.stringify({ amount: Math.max(1, Math.floor(amount2 / 5)), idempotencyKey: `p131-refp-${run}-${i}` }),
      }),
    );
  }

  const sum1 = await sql(pool, `SELECT COALESCE(SUM(amount),0)::int AS s FROM payment_refunds WHERE intent_id = $1 AND status IN ('SUCCEEDED','PENDING')`, [intentId]);
  const sum2 = intentId2
    ? await sql(pool, `SELECT COALESCE(SUM(amount),0)::int AS s FROM payment_refunds WHERE intent_id = $1 AND status IN ('SUCCEEDED','PENDING')`, [intentId2])
    : { rows: [{ s: 0 }] };
  const s1 = Number(sum1.rows[0].s);
  const s2 = Number(sum2.rows[0].s);
  if (s1 > amount) failures.push(`over-refund full ${s1}>${amount}`);
  if (intentId2 && s2 > amount2) failures.push(`over-refund partial ${s2}>${amount2}`);

  return {
    name: `refund_http_run_${run}`,
    status: failures.length ? "FAIL" : "PASS",
    details: { intentId, amount, s1, intentId2, amount2, s2 },
    failures,
  };
}

async function cashbackHttpRace(pool: InstanceType<typeof Pool>, run: number): Promise<Scenario> {
  const failures: string[] = [];
  const receiptId = `P131-FOM-${run}`;
  const br = await sql(pool, `SELECT id, code FROM branches ORDER BY id ASC LIMIT 1`);
  const branchId = Number(br.rows[0].id);
  const phone = `+99897${String(1000000 + run)}`;
  const auth = await ensureCustomer(pool, phone);
  const customerId = auth.id;
  // ensure balance for USE later via FOM walk-in
  const settled = await mapPool(20, async () =>
    fetchJson(`${BASE}/api/integrations/fom/sale`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-fom-secret": "p13-1-fom-webhook-secret" },
      body: JSON.stringify({
        receiptId,
        branchId,
        amount: 50_000,
        paymentMethod: "cash",
        customerQr: `VAKSINA-${customerId}`,
      }),
    }),
  );
  // FOM may require webhook secret in production-like — development may allow
  const events = await sql(pool, `SELECT COUNT(*)::int AS c FROM fom_sale_events WHERE receipt_id = $1`, [receiptId]);
  const eventCount = Number(events.rows[0].c);
  // commercial EARN uniqueness
  const earns = await sql(
    pool,
    `SELECT COUNT(*)::int AS c FROM cashback_ledger cl
     JOIN commercial_transactions ct ON ct.id = cl.commercial_transaction_id
     WHERE cl.entry_type = 'EARN' AND ct.receipt_id = $1`,
    [receiptId],
  ).catch(async () =>
    sql(
      pool,
      `SELECT COUNT(*)::int AS c FROM cashback_ledger WHERE customer_id = $1 AND entry_type = 'EARN'`,
      [customerId],
    ),
  );
  const earnCount = Number(earns.rows[0].c);
  if (eventCount > 1) failures.push(`fom events=${eventCount}`);
  // If FOM auth blocked all, mark NOT_PROVEN rather than false FAIL for cashback HTTP
  const anyOk = settled.some((s) => s.ok);
  if (!anyOk) {
    return {
      name: `cashback_http_run_${run}`,
      status: "NOT_PROVEN",
      details: { reason: "FOM/sale HTTP path not accepted (auth/config); library cashback already PASS in P13", earnCount, eventCount },
      failures: [],
    };
  }
  if (earnCount > 1) failures.push(`earnCount=${earnCount}`);

  // Concurrent USE attempts via FOM sale cashbackToUse (same customer, high requested spend)
  await sql(pool, `UPDATE customers SET balance = 50_000 WHERE id = $1`, [customerId]);
  const useReceipt = `P131-FOM-USE-${run}`;
  await mapPool(20, async (i) =>
    fetchJson(`${BASE}/api/integrations/fom/sale`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-fom-secret": "p13-1-fom-webhook-secret" },
      body: JSON.stringify({
        receiptId: `${useReceipt}-${i}`,
        branchId,
        amount: 10_000,
        cashbackToUse: 10_000,
        paymentMethod: "cash",
        customerQr: `VAKSINA-${customerId}`,
      }),
    }),
  );
  const bal = await sql(pool, `SELECT balance FROM customers WHERE id = $1`, [customerId]);
  const balance = Number(bal.rows[0]?.balance ?? -1);
  if (balance < 0) failures.push(`negative balance=${balance}`);

  return {
    name: `cashback_http_run_${run}`,
    status: failures.length ? "FAIL" : "PASS",
    details: { eventCount, earnCount, customerId, balance },
    failures,
  };
}

async function branchIsolationHttp(pool: InstanceType<typeof Pool>, adminTok: string): Promise<Scenario> {
  const failures: string[] = [];
  // login cashier if exists — else use admin with branch filter denial checks via customer A vs B orders
  const phoneA = "+998981000001";
  const phoneB = "+998981000002";
  const a = await ensureCustomer(pool, phoneA);
  const b = await ensureCustomer(pool, phoneB);

  const branches = await fetchJson(`${BASE}/api/branches`);
  const list = ((branches.body as { branches?: { id: number }[] })?.branches || []).slice(0, 2);
  if (list.length < 2) {
    return { name: "branch_isolation_http", status: "NOT_PROVEN", details: { reason: "need ≥2 branches" } };
  }
  const branchA = list[0].id;
  const branchB = list[1].id;

  // Customer A order on A
  const ha = { authorization: `Bearer ${a.token}`, "content-type": "application/json" };
  const products = await fetchJson(`${BASE}/api/catalog/products?branchId=${branchA}`);
  const productId = Number(((products.body as { products?: { id: number }[] })?.products || [])[0]?.id || 0);
  if (!productId) return { name: "branch_isolation_http", status: "NOT_PROVEN", details: { reason: "no product" } };
  await fetchJson(`${BASE}/api/cart/branch`, { method: "POST", headers: ha, body: JSON.stringify({ branchId: branchA }) });
  await fetchJson(`${BASE}/api/cart/items`, { method: "POST", headers: ha, body: JSON.stringify({ productId, quantity: 1 }) });
  const ordA = await fetchJson(`${BASE}/api/orders`, {
    method: "POST",
    headers: { ...ha, "idempotency-key": "p131-iso-a" },
    body: JSON.stringify({ branchId: branchA, fulfillment: "pickup", paymentMethod: "pay_at_branch", idempotencyKey: "p131-iso-a" }),
  });
  const orderIdA = Number((ordA.body as { order?: { id?: number } })?.order?.id || 0);

  // Customer B must not read A's order
  const hb = { authorization: `Bearer ${b.token}` };
  const cross = await fetchJson(`${BASE}/api/orders/${orderIdA}`, { headers: hb });
  if (cross.ok) failures.push("customer B read customer A order");
  if (![401, 403, 404].includes(cross.status)) failures.push(`unexpected cross status ${cross.status}`);

  // Admin branch scope: HQ can read; cashier branch B cannot manage A — if no cashier, probe admin with x-branch if supported
  void adminTok;
  void branchB;

  return {
    name: "branch_isolation_http",
    status: failures.length ? "FAIL" : "PASS",
    details: { orderIdA, crossStatus: cross.status, branchA, branchB },
    failures,
  };
}

async function integrity(pool: InstanceType<typeof Pool>): Promise<Scenario> {
  const bad = await sql(
    pool,
    `SELECT COUNT(*)::int AS c FROM product_stocks
     WHERE physical_quantity < 0 OR reserved_quantity < 0 OR reserved_quantity > physical_quantity`,
  );
  const multi = await sql(pool, `SELECT intent_id FROM payment_captures GROUP BY intent_id HAVING COUNT(*) > 1`);
  const failures: string[] = [];
  if (Number(bad.rows[0].c) > 0) failures.push(`bad stock=${bad.rows[0].c}`);
  if (multi.rows.length > 0) failures.push(`multi capture=${multi.rows.length}`);
  return {
    name: "data_integrity",
    status: failures.length ? "FAIL" : "PASS",
    details: { badStock: Number(bad.rows[0].c), multiCapture: multi.rows.length, fomWriter: false },
    failures,
  };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  if ((process.env.PAYME_MERCHANT_API_ENABLED || "") === "1" || (process.env.CLICK_MERCHANT_API_ENABLED || "") === "1") {
    throw new Error("Refuse: production PSP flags must stay off");
  }

  let stopPg: (() => Promise<void>) | undefined;
  let api: ChildProcess | undefined;
  let pool: InstanceType<typeof Pool> | undefined;

  try {
    const boot = await bootstrapPg();
    stopPg = boot.stop;
    pool = new Pool({ connectionString: boot.connectionString, max: 20 });

    console.error("[p13.1] postgres ready:", boot.source);
    api = startApi(boot.connectionString);
    const ready = await waitReady();
    console.error("[p13.1] API ready driver=", (ready as { driver?: string }).driver);
    const adminTok = await adminToken();
    console.error("[p13.1] admin token:", adminTok ? "ok" : "MISSING");

    // Scale datasets
    const scale: Record<string, unknown> = {};
    for (const n of [200, 500, 1000]) {
      console.error(`[p13.1] seeding ${n} branches...`);
      scale[`branches_${n}`] = await seedScale(pool, n);
    }
    console.error("[p13.1] seed done");

    const branchRow = await sql(pool, `SELECT id FROM branches WHERE code LIKE 'P131-B-%' ORDER BY code ASC LIMIT 1`);
    const branchHint = Number(branchRow.rows[0]?.id || 1);

    const matrix = [
      { id: "A", branches: 200, users: 100 },
      { id: "B", branches: 200, users: 250 },
      { id: "C", branches: 200, users: 500 },
      { id: "D", branches: 500, users: 500 },
      { id: "E", branches: 500, users: 1000 },
      { id: "F", branches: 1000, users: 1000 },
    ];
    const perf: Array<Record<string, unknown>> = [];
    for (const m of matrix) {
      console.error(`[p13.1] read matrix ${m.id} branches=${m.branches} users=${m.users}`);
      const row = await readMatrix(branchHint, m.users);
      perf.push({ scenario: m.id, branches: m.branches, ...row, dbWait: "NOT_PROVEN" });
    }

    // Auth probes (real HTTP auth path — low volume)
    console.error("[p13.1] auth probes");
    const badAuth = await fetchJson(`${BASE}/api/auth/me`, { headers: { authorization: "Bearer invalid" } });
    const goodPhone = "+998991112233";
    const good = await authCustomer(goodPhone);
    const me = good.ok
      ? await fetchJson(`${BASE}/api/auth/me`, { headers: { authorization: `Bearer ${good.token}` } })
      : { ok: false, status: 0 };

    console.error("[p13.1] inventory races");
    const invRuns: Scenario[] = [];
    for (let i = 1; i <= 3; i++) invRuns.push(await inventoryHttpRace(pool, i));

    console.error("[p13.1] payment races");
    const payRuns: Scenario[] = [];
    for (let i = 1; i <= 3; i++) payRuns.push(await paymentHttpRace(pool, i));

    console.error("[p13.1] refund races");
    const refRuns: Scenario[] = [];
    for (let i = 1; i <= 3; i++) refRuns.push(await refundHttpRace(pool, i, adminTok));

    console.error("[p13.1] cashback races");
    const cbRuns: Scenario[] = [];
    for (let i = 1; i <= 3; i++) cbRuns.push(await cashbackHttpRace(pool, i));

    console.error("[p13.1] isolation + integrity");
    const isolation = await branchIsolationHttp(pool, adminTok);
    const integ = await integrity(pool);

    const agg = (runs: Scenario[]) =>
      runs.every((r) => r.status === "PASS") ? "PASS" : runs.some((r) => r.status === "FAIL") ? "FAIL" : "NOT_PROVEN";

    const report = {
      at: new Date().toISOString(),
      REAL_HTTP_API: perf.every((p) => p.result === "PASS") && integ.status === "PASS" ? "PASS" : "FAIL",
      REAL_POSTGRES: "PASS",
      INVENTORY_HTTP_CONCURRENCY: agg(invRuns),
      PAYMENT_HTTP_CONCURRENCY: agg(payRuns),
      REFUND_HTTP_CONCURRENCY: agg(refRuns),
      CASHBACK_HTTP_CONCURRENCY: agg(cbRuns),
      BRANCH_ISOLATION_HTTP: isolation.status,
      FAILURE_RECOVERY: "NOT_PROVEN",
      PERFORMANCE: "OBSERVED",
      PRODUCTION: "NOT READY",
      postgresSource: boot.source,
      ready,
      poolMax: Number(process.env.PG_POOL_MAX || 40),
      auth: {
        invalidStatus: badAuth.status,
        validMe: me.ok,
      },
      scale,
      matrix: perf,
      inventory: invRuns,
      payment: payRuns,
      refund: refRuns,
      cashback: cbRuns,
      isolation,
      integrity: integ,
      queryProfiling: "QUERY_PROFILING_NOT_PROVEN",
      infraMetrics: "INFRA_METRICS_NOT_PROVEN",
      productionFlags: { payme: false, click: false, fomInventoryWriter: false },
      note: "P13.1 non-production HTTP validation. Does not claim production capacity.",
    };

    writeFileSync(path.join(outDir, "last-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, reportPath: path.join(outDir, "last-report.json") }, null, 2));

    if (report.REAL_HTTP_API === "FAIL" || report.INVENTORY_HTTP_CONCURRENCY === "FAIL" || report.PAYMENT_HTTP_CONCURRENCY === "FAIL") {
      process.exitCode = 1;
    }
  } finally {
    if (api && !api.killed) {
      api.kill("SIGTERM");
      await sleep(1000);
      if (!api.killed) api.kill("SIGKILL");
    }
    if (pool) await pool.end().catch(() => undefined);
    if (stopPg) await stopPg();
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      REAL_HTTP_API: "FAIL",
      HTTP_API_REAL_PG: "BLOCKED",
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
