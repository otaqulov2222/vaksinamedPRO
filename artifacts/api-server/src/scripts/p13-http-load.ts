/**
 * Final production closure — HTTP API load harness (non-production only).
 *
 * Usage:
 *   P13_API_BASE_URL=http://127.0.0.1:5000 pnpm p13:http
 *
 * PASS requires:
 *   - P13_API_BASE_URL reachable
 *   - /api/health/ready reports driver=postgres (real PostgreSQL)
 *   - concurrent HTTP matrix actually executed
 *
 * Against PGlite local demo: harness runs smoke but returns
 * HTTP_LOAD_EXTERNAL_STAGING_REQUIRED / NOT_PROVEN (honest).
 *
 * Never enables production Payme/Click. Never prints secrets.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = path.join(root, ".data", "p13-load");

type Lat = {
  endpoint: string;
  count: number;
  ok: number;
  errors: number;
  timeouts: number;
  p50: number;
  p95: number;
  p99: number;
  errorPct: number;
  timeoutPct: number;
  throughputRps: number;
};

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function stats(endpoint: string, samples: number[], errors: number, timeouts: number, wallMs: number): Lat {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.length + errors;
  return {
    endpoint,
    count: total,
    ok: samples.length,
    errors,
    timeouts,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    errorPct: total ? Number(((errors / total) * 100).toFixed(2)) : 0,
    timeoutPct: total ? Number(((timeouts / total) * 100).toFixed(2)) : 0,
    throughputRps: wallMs > 0 ? Number(((samples.length / wallMs) * 1000).toFixed(2)) : 0,
  };
}

async function fetchTimed(
  url: string,
  opts: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; ms: number; timeout: boolean; status?: number }> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const start = performance.now();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ac.signal });
    return { ok: res.ok || res.status < 500, ms: performance.now() - start, timeout: false, status: res.status };
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message));
    return { ok: false, ms: performance.now() - start, timeout };
  } finally {
    clearTimeout(t);
  }
}

async function mapPool<T>(n: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
}

async function loadEndpoint(
  base: string,
  pathAndQuery: string,
  concurrency: number,
  iterations: number,
  method: string = "GET",
  body?: unknown,
): Promise<Lat> {
  const samples: number[] = [];
  let errors = 0;
  let timeouts = 0;
  const t0 = performance.now();
  await mapPool(concurrency, async () => {
    for (let i = 0; i < iterations; i++) {
      const r = await fetchTimed(`${base}${pathAndQuery}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        timeoutMs: 20_000,
      });
      if (r.timeout) timeouts += 1;
      else if (!r.ok) errors += 1;
      else samples.push(r.ms);
    }
  });
  return stats(pathAndQuery, samples, errors, timeouts, performance.now() - t0);
}

async function main() {
  const base = (process.env.P13_API_BASE_URL || "").trim().replace(/\/$/, "");
  mkdirSync(outDir, { recursive: true });

  if (!base) {
    const report = {
      at: new Date().toISOString(),
      HTTP_LOAD: "PENDING",
      HTTP_LOAD_EXTERNAL_STAGING_REQUIRED: true,
      reason: "P13_API_BASE_URL not set",
    };
    writeFileSync(path.join(outDir, "last-http-load.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  const live = await fetchTimed(`${base}/api/health/live`);
  const readyRes = await fetch(`${base}/api/health/ready`).catch(() => null);
  const readyBody = readyRes ? ((await readyRes.json().catch(() => ({}))) as Record<string, unknown>) : {};
  const driver = String(readyBody.driver || "");
  const readyOk = Boolean(readyRes?.ok);

  // Discover public IDs for realistic paths
  let branchId = 1;
  let productId = 1;
  try {
    const br = (await (await fetch(`${base}/api/branches`)).json()) as { branches?: { id: number }[] };
    if (br.branches?.[0]?.id) branchId = br.branches[0].id;
  } catch {
    /* keep default */
  }
  try {
    const pr = (await (await fetch(`${base}/api/catalog/products`)).json()) as { products?: { id: number }[] };
    if (pr.products?.[0]?.id) productId = pr.products[0].id;
  } catch {
    /* keep default */
  }

  const matrixPlan = [
    { id: "A", users: 100 },
    { id: "B", users: 250 },
    { id: "C", users: 500 },
    { id: "D", users: 500 },
    { id: "E", users: 1000 },
    { id: "F", users: 1000 },
  ];

  const endpoints = [
    { path: "/api/health/live", name: "auth_health_proxy" },
    { path: "/api/catalog/categories", name: "catalog" },
    { path: "/api/catalog/products?q=a", name: "search" },
    { path: "/api/branches", name: "branch_lookup" },
    { path: `/api/branches/${branchId}`, name: "branch_detail" },
    { path: `/api/catalog/products?branchId=${branchId}`, name: "inventory_lookup" },
    { path: `/api/catalog/products/${productId}`, name: "product_detail" },
  ];

  // Authenticated / mutating flows require tokens — probe unauthenticated expected 401 without inventing sessions.
  const statusProbes = [
    { path: "/api/orders", name: "order_list_authz", expectStatuses: [401, 403] },
    { path: "/api/payments/intents/1", name: "payment_status_authz", expectStatuses: [401, 403, 404] },
  ];

  const isRealPostgres = driver === "postgres";
  const allowPgliteSmoke = (process.env.P13_HTTP_ALLOW_PGLITE_SMOKE || "").toLowerCase() === "1";

  if (!live.ok || !readyOk) {
    const report = {
      at: new Date().toISOString(),
      HTTP_LOAD: "FAIL",
      base,
      liveOk: live.ok,
      readyOk,
      driver,
      reason: "API live/ready failed",
    };
    writeFileSync(path.join(outDir, "last-http-load.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (!isRealPostgres && !allowPgliteSmoke) {
    const report = {
      at: new Date().toISOString(),
      HTTP_LOAD: "NOT_PROVEN",
      HTTP_LOAD_EXTERNAL_STAGING_REQUIRED: true,
      base,
      driver,
      note: "Target API is not real PostgreSQL (driver must be postgres). Set P13_API_BASE_URL to staging API on managed/test Postgres. Optional smoke-only: P13_HTTP_ALLOW_PGLITE_SMOKE=1",
      endpointsPlanned: endpoints.map((e) => e.name),
      matrixPlanned: matrixPlan,
    };
    writeFileSync(path.join(outDir, "last-http-load.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  // Full or smoke matrix
  const matrix: Array<Record<string, unknown>> = [];
  const endpointLats: Lat[] = [];
  const usersCap = isRealPostgres ? null : 100; // pglite smoke limited

  for (const m of matrixPlan) {
    if (usersCap != null && m.users > usersCap) {
      matrix.push({
        scenario: m.id,
        concurrentUsers: m.users,
        result: "SKIPPED",
        reason: "PGlite smoke limited to ≤100 concurrent",
      });
      continue;
    }
    const iters = m.users >= 1000 ? 1 : 2;
    // Round-robin endpoints under concurrency
    const samples: number[] = [];
    let errors = 0;
    let timeouts = 0;
    const t0 = performance.now();
    await mapPool(m.users, async (u) => {
      for (let i = 0; i < iters; i++) {
        const ep = endpoints[u % endpoints.length];
        const r = await fetchTimed(`${base}${ep.path}`, { timeoutMs: 20_000 });
        if (r.timeout) timeouts += 1;
        else if (!r.ok) errors += 1;
        else samples.push(r.ms);
      }
    });
    const s = stats(`matrix_${m.id}`, samples, errors, timeouts, performance.now() - t0);
    matrix.push({
      scenario: m.id,
      concurrentUsers: m.users,
      result: s.errorPct > 5 ? "FAIL" : "PASS",
      p50: s.p50,
      p95: s.p95,
      p99: s.p99,
      errorPct: s.errorPct,
      timeoutPct: s.timeoutPct,
      throughputRps: s.throughputRps,
      driver,
    });
  }

  // Per-endpoint 100-user snapshot
  for (const ep of endpoints) {
    endpointLats.push(await loadEndpoint(base, ep.path, isRealPostgres ? 100 : 25, 1));
  }

  const authz: Array<Record<string, unknown>> = [];
  for (const p of statusProbes) {
    const r = await fetchTimed(`${base}${p.path}`);
    const ok = r.status != null && p.expectStatuses.includes(r.status);
    authz.push({ name: p.name, status: r.status, ok, ms: Math.round(r.ms) });
  }

  const anyFail = matrix.some((m) => m.result === "FAIL") || endpointLats.some((e) => e.errorPct > 5);
  const report = {
    at: new Date().toISOString(),
    HTTP_LOAD: !isRealPostgres
      ? "NOT_PROVEN"
      : anyFail
        ? "FAIL"
        : "PASS",
    HTTP_LOAD_EXTERNAL_STAGING_REQUIRED: !isRealPostgres,
    base,
    driver,
    isRealPostgres,
    matrix,
    endpoints: endpointLats,
    authzProbes: authz,
    note: isRealPostgres
      ? "HTTP load executed against real PostgreSQL API"
      : "PGlite smoke only — not accepted as production/staging HTTP evidence",
    pool: "INFRA_METRICS_EXTERNAL_REQUIRED",
    dbConnections: "INFRA_METRICS_EXTERNAL_REQUIRED",
  };

  writeFileSync(path.join(outDir, "last-http-load.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportPath: path.join(outDir, "last-http-load.json") }, null, 2));
  if (report.HTTP_LOAD === "FAIL") process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ HTTP_LOAD: "FAIL", error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
