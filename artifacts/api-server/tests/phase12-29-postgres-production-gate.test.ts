/**
 * Phase 12.29 — Managed PostgreSQL production gate invariants.
 * Documentation + configuration honesty only — does not provision infrastructure.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");
const matrix = path.join(repo, "docs/PRODUCTION_GAP_MATRIX.md");
const runbook = path.join(repo, "docs/PRODUCTION_OPS_RUNBOOK.md");

describe("Phase 12.29 — managed PostgreSQL production gate", () => {
  it("gap matrix records 12.29 P0-1 OPS_REQUIRED without claiming DONE/PITR", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.29|P0-1 Managed PostgreSQL Closure/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
    assert.match(doc, /P0-1[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /P0-1[\s\S]{0,220}\|\s*\*\*DONE\*\*/);
    assert.match(doc, /RPO[\s\S]{0,80}NOT ESTABLISHED/i);
    assert.match(doc, /RTO[\s\S]{0,80}NOT ESTABLISHED/i);
    assert.match(doc, /DATABASE_URL[\s\S]{0,40}\*\*MISSING\*\*/);
    assert.doesNotMatch(doc, /PITR configured|managed PITR PASS|PITR = DONE/i);
  });

  it("PGlite backup drill is documented as not equivalent to managed PITR", () => {
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /backup:drill/);
    assert.match(doc, /not.*managed PITR|≠ managed PITR|Does \*\*not\*\* prove managed PITR/i);

    const drill = readFileSync(path.join(repo, "lib/db/src/scripts/restore-drill.ts"), "utf8");
    assert.match(drill, /PGlite|pglite-logical|PGLITE_LOGICAL/);
    assert.doesNotMatch(drill, /createPITR|enablePITR|wal_level/);
  });

  it("production/staging fail-closed without postgres DATABASE_URL; PGlite forbidden", () => {
    const env = readFileSync(path.join(repo, "lib/db/src/env.ts"), "utf8");
    assert.match(env, /assertProductionDatabaseConfig/);
    assert.match(env, /requires DATABASE_URL=postgres/);
    assert.match(env, /DB_DRIVER=pglite is forbidden/);
    assert.match(env, /PGlite is not a production database/);
  });

  it("pool defaults are code-documented; SSL not silently disabled", () => {
    const pool = readFileSync(path.join(repo, "lib/db/src/poolConfig.ts"), "utf8");
    assert.match(pool, /PG_POOL_MAX|DATABASE_POOL_MAX/);
    assert.match(pool, /20/);
    assert.match(pool, /30_000|10000|10_000/);

    const index = readFileSync(path.join(repo, "lib/db/src/index.ts"), "utf8");
    assert.match(index, /new Pool\(/);
    assert.match(index, /connectionString/);
    assert.doesNotMatch(index, /sslmode\s*=\s*disable|ssl:\s*false/i);
  });

  it("health separates liveness from DB readiness", () => {
    const health = readFileSync(path.join(apiRoot, "src/routes/health.ts"), "utf8");
    assert.match(health, /\/health\/live/);
    assert.match(health, /\/health\/ready/);
    assert.match(health, /checkDatabaseHealth/);
    assert.match(health, /liveness/);
    assert.match(health, /readiness/);
  });

  it("versioned migrations 0000–0010 present; no invented provider IaC", () => {
    const migDir = path.join(repo, "lib/db/migrations");
    const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
    assert.ok(files.some((f) => f.startsWith("0000_")));
    assert.ok(files.some((f) => f.startsWith("0010_")));
    assert.equal(files.length >= 11, true);

    const tf = readdirSync(repo, { withFileTypes: true });
    // Shallow honesty: no top-level terraform/pulumi claiming managed PG
    assert.equal(existsSync(path.join(repo, "terraform")), false);
    assert.equal(existsSync(path.join(repo, "pulumi")), false);
    void tf;
  });

  it("ops runbook keeps managed restore NOT_PROVEN and RPO/RTO not established", () => {
    assert.ok(existsSync(runbook));
    const doc = readFileSync(runbook, "utf8");
    assert.match(doc, /1\.1 Managed PostgreSQL/);
    assert.match(doc, /NOT_PROVEN|OPS_REQUIRED/);
    assert.match(doc, /NOT ESTABLISHED|NOT_PROVEN/);
    assert.match(doc, /Phase 12\.29|12\.29/);
  });

  it("P13.1 evidence exists locally but gate docs refuse durability claim", () => {
    const p131 = path.join(repo, ".data/p13-1-http/last-report.json");
    if (existsSync(p131)) {
      const report = JSON.parse(readFileSync(p131, "utf8"));
      assert.equal(report.REAL_HTTP_API, "PASS");
      assert.equal(report.REAL_POSTGRES, "PASS");
    }
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P13 \/ P13\.1 distinction/i);
    assert.match(doc, /Does \*\*not\*\* prove/);
    assert.match(doc, /Managed production backup\/restore|managed durability/i);
  });

  it("FOM / production PSP gates unchanged by this phase", () => {
    const fom = readFileSync(path.join(apiRoot, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(fom, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);
    const integ = readFileSync(path.join(apiRoot, "src/routes/integrations.ts"), "utf8");
    assert.match(integ, /fomPosContract:\s*"CONTRACT_PENDING"/);
  });
});
