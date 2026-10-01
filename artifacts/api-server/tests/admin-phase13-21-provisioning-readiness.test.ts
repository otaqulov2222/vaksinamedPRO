/**
 * Phase 13.21 — staging infrastructure provisioning readiness (nothing is provisioned).
 * Covers: migration release entrypoint (dist/migrate.mjs) wiring, worker/migrate bundles stay Redis-free,
 * trust proxy / CORS / readiness unchanged, and the provisioning package docs (no PASS, no invented values).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const section = (doc: string, start: string, end: string) => {
  const a = doc.indexOf(start);
  const b = doc.indexOf(end, a + start.length);
  assert.ok(a >= 0, `missing ${start}`);
  return doc.slice(a, b > a ? b : undefined);
};

describe("13.21 migration release entrypoint", () => {
  const migrate = read(path.join(root, "src/migrate.ts"));

  it("is a one-off job: env file, release module, exit code from the report, no HTTP / seed / app import", () => {
    assert.match(migrate, /loadEnvFile\(\);/);
    assert.match(migrate, /await import\("@workspace\/db\/release"\)/);
    assert.match(migrate, /process\.argv\.includes\("--status"\)/);
    assert.match(migrate, /process\.exit\(report\.ok \? 0 : 1\)/);
    assert.doesNotMatch(migrate, /listen\(|from "\.\/app"|from "express"|seedDatabase|from "@workspace\/db"/);
    assert.doesNotMatch(migrate, /DATABASE_URL/);
  });

  it("is the third build entry; API / worker entries unchanged", () => {
    const build = read(path.join(root, "build.mjs"));
    assert.match(build, /src\/index\.ts"\), path\.resolve\(artifactDir, "src\/worker\.ts"\)/);
    assert.match(build, /path\.resolve\(artifactDir, "src\/migrate\.ts"\)/);
  });

  it("package scripts are real; there is no invented start:api", () => {
    const pkg = JSON.parse(read(path.join(root, "package.json"))) as { scripts: Record<string, string> };
    assert.equal(pkg.scripts.start, "node --enable-source-maps ./dist/index.mjs");
    assert.equal(pkg.scripts["start:worker"], "node --enable-source-maps ./dist/worker.mjs");
    assert.equal(pkg.scripts["migrate:release"], "node --enable-source-maps ./dist/migrate.mjs");
    assert.equal(pkg.scripts["migrate:release:status"], "node --enable-source-maps ./dist/migrate.mjs --status");
    assert.equal(pkg.scripts["start:api"], undefined);
  });

  it("@workspace/db exports ./release without changing existing exports", () => {
    const pkg = JSON.parse(read(path.join(repoRoot, "lib/db/package.json"))) as { exports: Record<string, string> };
    assert.equal(pkg.exports["."], "./src/index.ts");
    assert.equal(pkg.exports["./schema"], "./src/schema/index.ts");
    assert.equal(pkg.exports["./release"], "./src/release.ts");
  });

  it("CI layout step checks dist/migrate.mjs; Dockerfile default CMD stays the API", () => {
    const ci = read(path.join(repoRoot, ".github/workflows/ci.yml"));
    assert.match(ci, /test -f dist\/worker\.mjs && test -f dist\/migrate\.mjs && echo RUNTIME_LAYOUT_OK/);
    const docker = read(path.join(repoRoot, "Dockerfile"));
    assert.match(docker, /#\s+CMD \["node", "--enable-source-maps", "dist\/migrate\.mjs"\]/);
    assert.match(docker, /^CMD \["node", "--enable-source-maps", "dist\/index\.mjs"\]$/m);
  });

  it("no new migration: journal still ends at 0013", () => {
    const journal = JSON.parse(read(path.join(repoRoot, "lib/db/migrations/meta/_journal.json"))) as {
      entries: Array<{ tag: string }>;
    };
    assert.equal(journal.entries.length, 14);
    assert.equal(journal.entries.at(-1)?.tag, "0013_auth_event_telemetry");
  });
});

describe("13.21 security posture unchanged", () => {
  it("worker and migrate entrypoints never touch Redis", () => {
    for (const file of ["src/worker.ts", "src/migrate.ts", "src/lib/workerLoop.ts"]) {
      assert.doesNotMatch(read(path.join(root, file)), /from "[^"]*redis[^"]*"|import\("[^"]*redis/i, file);
    }
    assert.doesNotMatch(read(path.join(root, "src/lib/workers.ts")), /from "\.\/redis"|ioredis/);
  });

  it("trust proxy stays off and guarded; no proxy env added", () => {
    const index = read(path.join(root, "src/index.ts"));
    assert.match(index, /assertNoProxyTrust\(app\);/);
    assert.doesNotMatch(index, /trust proxy", (true|\d)/);
    const env = read(path.join(repoRoot, ".env.example"));
    assert.doesNotMatch(env, /^\s*#?\s*(TRUST_PROXY|TRUSTED_PROX\w*|PROXY_\w*)=/m);
  });

  it("CORS stays exact-origin; readiness stays PostgreSQL-only", () => {
    const app = read(path.join(root, "src/app.ts"));
    assert.match(app, /callback\(null, isCorsOriginAllowed\(origin\)\)/);
    assert.doesNotMatch(app, /origin: true|origin: "\*"/);
    const health = read(path.join(root, "src/routes/health.ts"));
    assert.doesNotMatch(health, /ensureRedisConnected|warmRedisForBoot|getRedisClient/);
  });
});

describe("13.21 provisioning package docs", () => {
  const status = read(path.join(repoRoot, "docs/ADMIN_IMPLEMENTATION_STATUS.md"));
  const blueprint = read(path.join(repoRoot, "docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md"));
  const matrix = read(path.join(repoRoot, "docs/PRODUCTION_GAP_MATRIX.md"));
  const pkg = section(blueprint, "## Phase 13.21 — Staging provisioning package", "\n## ");

  it("status doc: 13.21 above 13.20, code ready vs infrastructure not provisioned, LOCAL QA label", () => {
    const a = status.indexOf("## Phase 13.21 — Staging Infrastructure Provisioning Readiness");
    const b = status.indexOf("## Phase 13.20 — Staging Infrastructure Bootstrap");
    assert.ok(a > 0 && b > a);
    const s = status.slice(a, b);
    assert.match(s, /CODE READY \/ INFRASTRUCTURE NOT PROVISIONED/);
    assert.match(s, /STAGING STATUS: NOT PROVISIONED/);
    assert.match(s, /LOCAL QA — NOT STAGING/);
    assert.match(s, /BLOCKED — Docker unavailable/);
    assert.match(s, /not staging/);
  });

  it("smoke checklist: 34 items across INFRA / APPLICATION / SECURITY / RESILIENCE, none PASS", () => {
    const s = section(status, "## Phase 13.21", "## Phase 13.20");
    const smoke = section(s, "Smoke checklist", "Load-test preconditions");
    const rows = smoke.split("\n").filter((l) => /^\s*\| \d+ \|/.test(l));
    assert.equal(rows.length, 34);
    for (const area of ["INFRA", "APPLICATION", "SECURITY", "RESILIENCE"]) {
      assert.ok(rows.some((r) => r.includes(`| ${area} |`)), area);
    }
    for (const row of rows) {
      assert.match(row, /\| (NOT RUN|\*\*BLOCKED\*\*[^|]*) \|$/, row);
      assert.doesNotMatch(row, /PASS|FAIL/);
    }
  });

  it("blueprint package: all parts A–S with the required table columns", () => {
    assert.match(pkg, /CODE READY \/ INFRASTRUCTURE NOT PROVISIONED/);
    assert.match(pkg, /STAGING STATUS: \*\*NOT PROVISIONED\*\*/);
    for (const part of "ABCDEFGHIJKLMNOPQRS") assert.match(pkg, new RegExp(`^### ${part}\\. `, "m"), part);
    assert.match(pkg, /\| RESOURCE \| PURPOSE \| EXPECTED TYPE \| REGION \| NETWORK EXPOSURE \| STATUS \| BLOCKER \|/);
    assert.match(pkg, /\| SOURCE \| DESTINATION \| PORT\/PROTOCOL \| PURPOSE \| PUBLIC\? \| REQUIRED\? \| STATUS \|/);
    assert.match(pkg, /\| SECRET \| PURPOSE \| STAGING REQUIRED\? \| STORAGE \| ROTATION \| CURRENT STATUS \|/);
  });

  it("no invented infrastructure values", () => {
    assert.match(pkg, /SIZE: TBD during provisioning based on measured staging load/);
    assert.match(pkg, /Use provider-assigned endpoint\/port from provisioned resource\./);
    assert.match(pkg, /<staging-domain>/);
    assert.doesNotMatch(pkg, /\b(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}\b/, "no CIDR");
    assert.doesNotMatch(pkg, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "no IP address");
    assert.doesNotMatch(pkg, /BEGIN CERTIFICATE|TRUST_PROXY=|trust proxy", true/);
    assert.doesNotMatch(pkg, /SELECTED PROVIDER:\s*\w+/i);
    assert.doesNotMatch(pkg, /:\s*(25060|25061|6379|6380|5432)\b/, "no invented provider port");
  });

  it("secrets inventory uses statuses only", () => {
    const secrets = section(pkg, "### D. ", "### E. ");
    const rows = secrets.split("\n").filter((l) => /^\| `?[A-Z]/.test(l) && !l.startsWith("| SECRET"));
    assert.ok(rows.length >= 10);
    for (const row of rows) assert.match(row, /\| (PRESENT|MISSING|TBD) \|$/, row);
    for (const name of ["DATABASE_URL", "REDIS_URL", "ADMIN_SECRET", "CUSTOMER_SECRET", "POS_SECRET", "FOM_WEBHOOK_SECRET", "MERCHANT_SECRET_KEK", "ESKIZ_PASSWORD", "PAYME_SANDBOX_KEY", "CLICK_SANDBOX_SECRET"]) {
      assert.ok(secrets.includes(name), name);
    }
  });

  it("O-2 decision required, O-6 cutover blocker, O-8 release procedure, forward-only rollback", () => {
    assert.match(section(pkg, "### N. ", "### O. "), /STATUS = DECISION REQUIRED/);
    const k = section(pkg, "### K. ", "### L. ");
    assert.match(k, /O-6 TRUSTED PROXY CUTOVER BLOCKER/);
    for (const input of ["proxy type", "IPs / CIDRs", "Forwarding-header", "firewall restriction", "TLS termination point", "proxy chain", "Test evidence"]) {
      assert.match(k, new RegExp(input, "i"), input);
    }
    const l = section(pkg, "### L. ", "### M. ");
    assert.match(l, /dist\/migrate\.mjs --status/);
    assert.match(l, /\*\*once\*\*/);
    assert.match(l, /0013_auth_event_telemetry/);
    assert.match(l, /not staging evidence/);
    assert.match(section(pkg, "### Q. ", "### R. "), /no down migrations/);
    assert.match(section(pkg, "### O. ", "### P. "), /STATUS = TBD/);
  });

  it("deployment order A–R and blockers with owner categories", () => {
    const order = section(pkg, "### S. ", "### Blockers");
    for (const phase of "ABCDEFGHIJKLMNOPQR") assert.match(order, new RegExp(`^\\| ${phase} \\|`, "m"), phase);
    const blockers = section(pkg, "### Blockers", "\n## ");
    const rows = blockers.split("\n").filter((l) => /^\| \d+ \|/.test(l));
    assert.ok(rows.length >= 8);
    for (const row of rows) assert.match(row, /\| (OPS|SECURITY|DEVOPS|PROVIDER|BUSINESS)( \+ (OPS|SECURITY|DEVOPS|PROVIDER|BUSINESS))? \|$/, row);
  });

  it("gap matrix: 13.21 section, O-2 / O-6 / O-8 updated, production still NOT READY", () => {
    assert.match(matrix, /## Phase 13\.21 — Staging infrastructure provisioning readiness/);
    assert.ok(matrix.indexOf("## Phase 13.21") < matrix.indexOf("## Phase 13.20"));
    assert.match(matrix, /\| O-2 \|[^\n]*DECISION REQUIRED/);
    assert.match(matrix, /\| O-6 \|[^\n]*O-6 TRUSTED PROXY CUTOVER BLOCKER/);
    assert.match(matrix, /\| O-8 \|[^\n]*dist\/migrate\.mjs/);
    assert.match(matrix, /\*\*PRODUCTION READINESS: NOT READY\*\*/);
  });
});
