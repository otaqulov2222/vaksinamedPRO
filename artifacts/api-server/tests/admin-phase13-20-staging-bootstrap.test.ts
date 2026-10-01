/**
 * Phase 13.20 — staging infrastructure bootstrap (repository preparation only; nothing is provisioned).
 * Covers: CORS_ORIGIN allowlist (no wildcard, legacy reflect when unset), standalone worker process
 * (gated, no HTTP server, bounded drain, graceful stop), runtime image layout (externals + migrations),
 * environment contract, readiness stays PostgreSQL-only, trust proxy untouched, docs honesty.
 * Integration: the real Express app over a throw-away PGlite directory.
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
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const dataDir = mkdtempSync(path.join(tmpdir(), "vm-1320-api-"));
process.env.PGLITE_DIR = dataDir;
process.env.APP_ENV = "development";
process.env.DB_DRIVER = "pglite";
process.env.ALLOW_DEMO_SEED = "0";
process.env.LOG_LEVEL = "silent";
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;
delete process.env.CORS_ORIGIN;

const { default: app } = await import("../src/app");
const { parseCorsOrigins, resolveCorsPolicy, isCorsOriginAllowed } = await import("../src/lib/corsPolicy");
const {
  assertWorkerProcessAllowed,
  createWorkerLoop,
  workerPollIntervalMs,
  WORKER_BATCH_LIMIT,
  WORKER_MAX_DRAIN_BATCHES,
  WORKER_DEFAULT_POLL_MS,
} = await import("../src/lib/workerLoop");
const { backgroundWorkersEnabled } = await import("../src/lib/securityEnv");
const { isBackgroundWorkersEnabled } = await import("../src/lib/workers");

let server: Server;
let port = 0;

type Res = { status: number; headers: http.IncomingHttpHeaders };
function request(method: string, url: string, headers: Record<string, string> = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: url, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

function setEnv(vars: Record<string, string | undefined>): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const restore = setEnv(vars);
  try {
    return fn();
  } finally {
    restore();
  }
}

async function withEnvAsync(vars: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const restore = setEnv(vars);
  try {
    await fn();
  } finally {
    restore();
  }
}

const silentLog = { info: () => {}, error: () => {} };

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

describe("13.20 CORS_ORIGIN policy", () => {
  it("parses exact origins; rejects wildcard, paths, trailing slash, non-http(s), empty lists", () => {
    assert.equal(parseCorsOrigins(undefined, false), null);
    assert.equal(parseCorsOrigins("   ", false), null);
    assert.deepEqual(
      parseCorsOrigins(" https://admin.staging.example.test , https://app.staging.example.test:8443,https://admin.staging.example.test", true),
      ["https://admin.staging.example.test", "https://app.staging.example.test:8443"],
    );
    assert.deepEqual(parseCorsOrigins("http://localhost:5173", false), ["http://localhost:5173"]);
    for (const bad of ["*", "https://*.example.test", "https://admin.example.test/", "https://admin.example.test/app", "admin.example.test", "ftp://admin.example.test", ",,"]) {
      assert.throws(() => parseCorsOrigins(bad, false), /CORS_ORIGIN/, bad);
    }
  });

  it("production/staging requires https origins", () => {
    assert.throws(() => parseCorsOrigins("http://admin.staging.example.test", true), /https in production\/staging/);
    assert.deepEqual(parseCorsOrigins("https://admin.staging.example.test", true), ["https://admin.staging.example.test"]);
  });

  it("unset keeps the legacy reflect behaviour; set → allowlist only; invalid → deny (fail closed)", () => {
    withEnv({ CORS_ORIGIN: undefined }, () => {
      assert.deepEqual(resolveCorsPolicy(), { mode: "reflect" });
      assert.equal(isCorsOriginAllowed("https://anything.example.test"), true);
    });
    withEnv({ CORS_ORIGIN: "https://admin.staging.example.test" }, () => {
      assert.equal(resolveCorsPolicy().mode, "allowlist");
      assert.equal(isCorsOriginAllowed("https://admin.staging.example.test"), true);
      assert.equal(isCorsOriginAllowed("https://evil.example.test"), false);
      assert.equal(isCorsOriginAllowed("https://admin.staging.example.test.evil.test"), false);
      assert.equal(isCorsOriginAllowed(undefined), false);
    });
    withEnv({ CORS_ORIGIN: "*" }, () => {
      assert.throws(() => resolveCorsPolicy(), /wildcards are not allowed/);
      assert.equal(isCorsOriginAllowed("https://admin.staging.example.test"), false);
    });
  });

  it("real app: allowlisted origin gets ACAO + credentials; others get no ACAO; requests still served", async () => {
    await withEnvAsync({ CORS_ORIGIN: "https://admin.staging.example.test" }, async () => {
      const ok = await request("GET", "/api/health/live", { origin: "https://admin.staging.example.test" });
      assert.equal(ok.status, 200);
      assert.equal(ok.headers["access-control-allow-origin"], "https://admin.staging.example.test");
      assert.equal(ok.headers["access-control-allow-credentials"], "true");
      assert.match(String(ok.headers.vary || ""), /Origin/i);

      const evil = await request("GET", "/api/health/live", { origin: "https://evil.example.test" });
      assert.equal(evil.status, 200);
      assert.equal(evil.headers["access-control-allow-origin"], undefined);

      const preflight = await request("OPTIONS", "/api/admin/login", {
        origin: "https://evil.example.test",
        "access-control-request-method": "POST",
      });
      assert.equal(preflight.headers["access-control-allow-origin"], undefined);

      const noOrigin = await request("GET", "/api/health/live");
      assert.equal(noOrigin.status, 200);
      assert.equal(noOrigin.headers["access-control-allow-origin"], undefined);
    });
  });

  it("real app: CORS_ORIGIN unset reflects the request origin exactly as before (no wildcard)", async () => {
    await withEnvAsync({ CORS_ORIGIN: undefined }, async () => {
      const r = await request("GET", "/api/health/live", { origin: "http://localhost:5173" });
      assert.equal(r.headers["access-control-allow-origin"], "http://localhost:5173");
      assert.notEqual(r.headers["access-control-allow-origin"], "*");
    });
  });

  it("wiring: app.ts uses the policy (no origin:true / '*'); boot validates it before listen, after the proxy guard", () => {
    const appTs = read(path.join(root, "src/app.ts"));
    assert.match(appTs, /cors\(\{ origin: \(origin, callback\) => callback\(null, isCorsOriginAllowed\(origin\)\), credentials: true \}\)/);
    assert.doesNotMatch(appTs, /origin:\s*true|origin:\s*["']\*["']/);
    const index = read(path.join(root, "src/index.ts"));
    const guard = index.indexOf("assertNoProxyTrust(app);");
    const cors = index.indexOf("resolveCorsPolicy();");
    const listen = index.indexOf("app.listen(");
    assert.ok(guard > 0 && cors > guard && listen > cors);
    assert.match(index, /cors: corsPolicy\.mode/);
  });
});

describe("13.20 worker process", () => {
  it("poll interval: default, clamped, invalid → default", () => {
    assert.equal(WORKER_DEFAULT_POLL_MS, 15_000);
    assert.equal(workerPollIntervalMs(undefined), 15_000);
    assert.equal(workerPollIntervalMs(""), 15_000);
    assert.equal(workerPollIntervalMs("abc"), 15_000);
    assert.equal(workerPollIntervalMs("-5"), 15_000);
    assert.equal(workerPollIntervalMs("10"), 1_000);
    assert.equal(workerPollIntervalMs("5000"), 5_000);
    assert.equal(workerPollIntervalMs("99999999"), 300_000);
  });

  it("gate: production-like requires ENABLE_BACKGROUND_WORKERS=1; dev flag never counts in production-like", () => {
    assert.throws(() => assertWorkerProcessAllowed(false, true), /ENABLE_BACKGROUND_WORKERS=1 in production\/staging/);
    assert.throws(() => assertWorkerProcessAllowed(false, false), /ENABLE_BACKGROUND_WORKERS_DEV=1/);
    assert.doesNotThrow(() => assertWorkerProcessAllowed(true, true));
    withEnv({ APP_ENV: "staging", NODE_ENV: undefined, ENABLE_BACKGROUND_WORKERS: undefined, ENABLE_BACKGROUND_WORKERS_DEV: "1" }, () => {
      assert.equal(backgroundWorkersEnabled(), false);
      assert.equal(isBackgroundWorkersEnabled(), false);
    });
    withEnv({ APP_ENV: "staging", ENABLE_BACKGROUND_WORKERS: "1" }, () => {
      assert.equal(backgroundWorkersEnabled(), true);
      assert.equal(isBackgroundWorkersEnabled(), true);
    });
    withEnv({ APP_ENV: "development", NODE_ENV: undefined, ENABLE_BACKGROUND_WORKERS: undefined, ENABLE_BACKGROUND_WORKERS_DEV: "1" }, () => {
      assert.equal(backgroundWorkersEnabled(), true);
    });
  });

  it("tick: enqueues sweeps, drains full batches up to the bound, stops on a partial batch", async () => {
    const calls: Array<{ limit: number; workerId: string }> = [];
    let sweeps = 0;
    const loop = createWorkerLoop({ workerId: "w-test", intervalMs: 60_000 }, {
      ensureSweeps: async () => { sweeps++; },
      runDue: async (opts) => {
        calls.push(opts);
        return { processed: calls.length < 3 ? WORKER_BATCH_LIMIT : 4 };
      },
      log: silentLog,
    });
    await loop.tickNow();
    assert.equal(sweeps, 1);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0], { limit: WORKER_BATCH_LIMIT, workerId: "w-test" });

    const always: number[] = [];
    const busy = createWorkerLoop({ workerId: "w-busy", intervalMs: 60_000 }, {
      ensureSweeps: async () => {},
      runDue: async () => { always.push(1); return { processed: WORKER_BATCH_LIMIT }; },
      log: silentLog,
    });
    await busy.tickNow();
    assert.equal(always.length, WORKER_MAX_DRAIN_BATCHES);
  });

  it("tick errors are logged and do not kill the loop; concurrent ticks never overlap", async () => {
    const errors: string[] = [];
    let n = 0;
    const loop = createWorkerLoop({ workerId: "w-err", intervalMs: 60_000 }, {
      ensureSweeps: async () => {},
      runDue: async () => {
        n++;
        if (n === 1) throw new Error("db down");
        return { processed: 0 };
      },
      log: { info: () => {}, error: (obj) => { errors.push(String(obj.err)); } },
    });
    await loop.tickNow();
    assert.deepEqual(errors, ["db down"]);
    const a = loop.tickNow();
    const b = loop.tickNow();
    assert.equal(a, b);
    await a;
    assert.equal(n, 2);
  });

  it("stop: waits for the in-flight tick (drained) or reports timeout; no ticks after stop", async () => {
    let release!: () => void;
    let runs = 0;
    const loop = createWorkerLoop({ workerId: "w-stop", intervalMs: 5 }, {
      ensureSweeps: async () => {},
      runDue: async () => {
        runs++;
        if (runs === 1) await new Promise<void>((r) => { release = r; });
        return { processed: 0 };
      },
      log: silentLog,
    });
    loop.start();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(runs, 1);
    assert.equal(await loop.stop(20), "timeout");
    const drained = loop.stop(1_000);
    release();
    assert.equal(await drained, "drained");
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(runs, 1);
    assert.equal(await loop.stop(10), "drained");
  });

  it("entrypoint: no HTTP server, gate before the DB-backed workers import, SIGTERM handled; API boot unchanged", () => {
    const worker = read(path.join(root, "src/worker.ts"));
    assert.doesNotMatch(worker, /from ["']express["']|\.listen\(|from ["']\.\/app["']/);
    const gate = worker.indexOf("assertWorkerProcessAllowed(backgroundWorkersEnabled(), isProductionLike());");
    const dynamicImport = worker.indexOf('await import("./lib/workers")');
    assert.ok(gate > 0 && dynamicImport > gate);
    assert.doesNotMatch(worker, /^import .*["']\.\/lib\/workers["']/m);
    assert.match(worker, /process\.on\("SIGTERM"/);
    assert.match(worker, /loop\.stop\(SHUTDOWN_TIMEOUT_MS\)/);

    const loopSrc = read(path.join(root, "src/lib/workerLoop.ts"));
    assert.doesNotMatch(loopSrc, /from ["'](bullmq|ioredis|@workspace\/db)["']/);

    const index = read(path.join(root, "src/index.ts"));
    assert.match(index, /workersAutoStart:\s*false/);
    assert.doesNotMatch(index, /runDueWorkerJobs|workerLoop|createWorkerLoop/);

    const build = read(path.join(root, "build.mjs"));
    assert.match(build, /src\/index\.ts"\), path\.resolve\(artifactDir, "src\/worker\.ts"\)/);
    const pkg = JSON.parse(read(path.join(root, "package.json")));
    assert.equal(pkg.scripts.start, "node --enable-source-maps ./dist/index.mjs");
    assert.equal(pkg.scripts["start:worker"], "node --enable-source-maps ./dist/worker.mjs");
  });
});

describe("13.20 runtime image + CI", () => {
  const docker = read(path.join(repoRoot, "Dockerfile"));

  it("runtime stage ships production node_modules for the bundle externals and the migrations folder", () => {
    const build = read(path.join(root, "build.mjs"));
    assert.match(build, /"@electric-sql\/pglite",/);
    assert.match(build, /"ioredis",/);
    assert.match(docker, /FROM node:22-bookworm-slim AS prod-deps/);
    assert.match(docker, /pnpm install --frozen-lockfile --prod --no-optional --filter @workspace\/api-server\.\.\./);
    const runtime = docker.slice(docker.indexOf("AS runtime"));
    assert.match(runtime, /WORKDIR \/app\/artifacts\/api-server/);
    assert.match(runtime, /COPY --from=prod-deps \/app\/node_modules \/app\/node_modules/);
    assert.match(runtime, /COPY --from=prod-deps \/app\/artifacts\/api-server\/node_modules \.\/node_modules/);
    assert.match(runtime, /COPY --from=build \/app\/lib\/db\/migrations \/app\/lib\/db\/migrations/);
    assert.match(runtime, /COPY --from=build \/app\/artifacts\/api-server\/dist \.\/dist/);
    const migrationsPath = read(path.join(repoRoot, "lib/db/src/migrationsPath.ts"));
    assert.match(migrationsPath, /path\.resolve\(process\.cwd\(\), "\.\.", "\.\.", "lib", "db", "migrations"\)/);
  });

  it("runtime stays fail-closed, non-root, no baked secrets, API by default", () => {
    const runtime = docker.slice(docker.indexOf("AS runtime"));
    assert.match(runtime, /ENV PAYME_MERCHANT_API_ENABLED=0/);
    assert.match(runtime, /ENV CLICK_MERCHANT_API_ENABLED=0/);
    assert.match(runtime, /ENV ENABLE_BACKGROUND_WORKERS=0/);
    assert.match(runtime, /USER appuser/);
    assert.match(runtime, /HEALTHCHECK[\s\S]*\/api\/health\/live/);
    assert.match(runtime, /^CMD \["node", "--enable-source-maps", "dist\/index\.mjs"\]$/m);
    assert.doesNotMatch(docker, /^\s*ENV\s+(DATABASE_URL|REDIS_URL|MERCHANT_SECRET_KEK|ADMIN_SECRET|CUSTOMER_SECRET|POS_SECRET|CORS_ORIGIN|TRUST_PROXY)\b/m);
  });

  it("CI verifies the runtime image resolves externals, migrations and both entrypoints", () => {
    const ci = read(path.join(repoRoot, ".github/workflows/ci.yml"));
    assert.match(ci, /await import\('ioredis'\); await import\('@electric-sql\/pglite'\)/);
    assert.match(ci, /test -f \/app\/lib\/db\/migrations\/meta\/_journal\.json && test -f dist\/index\.mjs && test -f dist\/worker\.mjs/);
    assert.match(ci, /docker-image/);
  });

  it("compose keeps PSPs and workers OFF", () => {
    const compose = read(path.join(repoRoot, "docker-compose.yml"));
    assert.match(compose, /PAYME_MERCHANT_API_ENABLED:\s*"0"/);
    assert.match(compose, /CLICK_MERCHANT_API_ENABLED:\s*"0"/);
    assert.match(compose, /ENABLE_BACKGROUND_WORKERS:\s*"0"/);
  });
});

describe("13.20 environment contract + unchanged surfaces", () => {
  it(".env.example documents the staging contract with placeholders only; still no trusted-proxy setting", () => {
    const env = read(path.join(repoRoot, ".env.example"));
    assert.match(env, /^# MERCHANT_SECRET_KEK=$/m);
    assert.match(env, /^# CORS_ORIGIN=https:\/\/admin\.staging\.example\.com$/m);
    assert.match(env, /^# WORKER_POLL_INTERVAL_MS=15000$/m);
    assert.match(env, /sslmode=verify-full&sslrootcert=/);
    assert.match(env, /Never disable certificate verification/);
    assert.match(env, /there is NO trusted-proxy setting/);
    assert.doesNotMatch(env, /^\s*#?\s*(TRUST_PROXY|TRUSTED_PROXIES|TRUSTED_PROXY_[A-Z_]+|PROXY_[A-Z_]+)=/m);
    assert.doesNotMatch(env, /^(MERCHANT_SECRET_KEK|REDIS_URL|CORS_ORIGIN)=\S/m);
    assert.doesNotMatch(env, /rejectUnauthorized|sslmode=(disable|no-verify)/);
  });

  it("readiness stays PostgreSQL-only (12.38 decision); liveness has no dependency check", () => {
    const health = read(path.join(root, "src/routes/health.ts"));
    assert.doesNotMatch(health, /redis|Redis/);
    const live = health.slice(health.indexOf("/health/live"), health.indexOf("/health/ready"));
    assert.doesNotMatch(live, /checkDatabaseHealth/);
  });

  it("trust proxy stays off and the rate limiter is untouched", () => {
    assert.equal(app.get("trust proxy"), false);
    const rl = read(path.join(root, "src/lib/rateLimit.ts"));
    assert.match(rl, /RATE_LIMIT_REDIS_UNAVAILABLE/);
    for (const f of ["src/app.ts", "src/index.ts", "src/worker.ts", "src/lib/corsPolicy.ts", "src/lib/workerLoop.ts", "src/lib/envFile.ts"]) {
      const code = read(path.join(root, f));
      assert.doesNotMatch(code, /trust proxy["'],\s*(true|1|["'])/, f);
      assert.doesNotMatch(code, /x-forwarded|x-real-ip|req\.ips\b/i, f);
    }
  });

  it("no new migration: journal still ends at 0013", () => {
    const journal = JSON.parse(read(path.join(repoRoot, "lib/db/migrations/meta/_journal.json")));
    assert.equal(journal.entries.length, 14);
    assert.equal(journal.entries.at(-1).tag, "0013_auth_event_telemetry");
  });
});

describe("13.20 docs honesty", () => {
  const status = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
  const blueprint = read(path.join(repoRoot, "docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md"));
  const matrix = read(path.join(repoRoot, "docs/PRODUCTION_GAP_MATRIX.md"));

  it("status doc: 13.20 section above 13.19, NOT PROVISIONED, LOCAL QA label, smoke checklist without PASS", () => {
    const a = status.indexOf("## Phase 13.20 — Staging Infrastructure Bootstrap");
    const b = status.indexOf("## Phase 13.19 — Deployment Proxy + Trusted Proxy Security");
    assert.ok(a > 0 && b > a);
    const section = status.slice(a, b);
    assert.match(section, /STAGING STATUS: NOT PROVISIONED/);
    assert.doesNotMatch(section, /STAGING STATUS: (PARTIALLY PROVISIONED|PROVISIONED)/);
    for (const heading of ["Readiness matrix", "Docker", "Environment contract", "PostgreSQL", "Redis / Valkey", "Health", "Worker", "Admin", "CORS", "DigitalOcean topology", "Trusted proxy", "Firewall matrix", "Backup / restore", "Smoke checklist", "Tests", "Browser QA", "Remaining gaps"]) {
      assert.ok(section.includes(heading), heading);
    }
    assert.match(section, /LOCAL QA/);
    const smokeStart = section.indexOf("Smoke checklist");
    const smoke = section.slice(smokeStart, section.indexOf("\n", section.indexOf("| 20 |", smokeStart)));
    assert.equal((smoke.match(/^\s*\| (?:[1-9]|1\d|20) \|/gm) || []).length, 20);
    assert.doesNotMatch(smoke, /\|\s*\*{0,2}PASS\*{0,2}\s*\|/);
  });

  it("blueprint addendum + gap matrix rows; no provisioned / live claims", () => {
    assert.match(blueprint, /## Phase 13\.20 addendum — DigitalOcean staging bootstrap/);
    assert.match(blueprint, /STAGING STATUS: \*\*NOT PROVISIONED\*\*/);
    assert.doesNotMatch(blueprint, /SELECTED PROVIDER:\s*\w+/i);
    assert.match(matrix, /## Phase 13\.20 — Staging infrastructure bootstrap/);
    assert.match(matrix, /\| O-7 \| Runtime container image[\s\S]{0,400}\*\*READY_IN_REPO\*\*/);
    assert.match(matrix, /\| O-8 \| Migration release step[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(matrix, /\*\*PRODUCTION READINESS: NOT READY\*\*/);
    assert.doesNotMatch(matrix, /STAGING STATUS: \*\*PROVISIONED/);
  });
});
