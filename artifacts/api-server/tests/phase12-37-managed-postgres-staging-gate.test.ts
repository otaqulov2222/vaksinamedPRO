/**
 * Phase 12.37 — Managed PostgreSQL staging provisioning & restore gate.
 * Does not provision infrastructure. Does not invent DATABASE_URL / PITR / RPO.
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
const finalDoc = path.join(repo, "docs/FINAL_PRODUCTION_CLOSURE.md");

describe("Phase 12.37 — Managed PostgreSQL staging gate", () => {
  it("gap matrix records 12.37; P0-1 OPS_REQUIRED; RPO/RTO NOT_ESTABLISHED; no fake restore", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.37/);
    assert.match(doc, /Managed PostgreSQL staging/);
    assert.match(doc, /P0-1[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /DATABASE_URL[\s\S]{0,40}\*\*MISSING\*\*/);
    assert.match(doc, /RPO[\s\S]{0,40}NOT_ESTABLISHED/);
    assert.match(doc, /RTO[\s\S]{0,40}NOT_ESTABLISHED/);
    assert.match(doc, /PITR[\s\S]{0,40}NOT_PROVEN/);
    assert.match(doc, /RESTORE[\s\S]{0,60}NOT_PROVEN|NOT RUN/i);
    assert.doesNotMatch(doc, /P0-1[\s\S]{0,220}\|\s*\*\*DONE\*\*/);
    assert.doesNotMatch(doc, /managed PITR PASS|RESTORE DRILL\s*=\s*\*\*PASS\*\*/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("in-repo fail-closed + pool + health remain; no managed provider IaC", () => {
    const env = readFileSync(path.join(repo, "lib/db/src/env.ts"), "utf8");
    assert.match(env, /assertProductionDatabaseConfig/);
    assert.match(env, /DB_DRIVER=pglite is forbidden/);

    const pool = readFileSync(path.join(repo, "lib/db/src/poolConfig.ts"), "utf8");
    assert.match(pool, /PG_POOL_MAX|max:\s*.*20/);

    const health = readFileSync(path.join(apiRoot, "src/routes/health.ts"), "utf8");
    assert.match(health, /\/health\/ready/);
    assert.match(health, /checkDatabaseHealth/);

    assert.equal(existsSync(path.join(repo, "terraform")), false);
    assert.equal(existsSync(path.join(repo, "pulumi")), false);

    const mig = readdirSync(path.join(repo, "lib/db/migrations")).filter((f) => f.endsWith(".sql"));
    assert.ok(mig.some((f) => f.startsWith("0000_")));
    assert.ok(mig.some((f) => f.startsWith("0010_")));
  });

  it("compose postgres is P13 local only — not managed evidence", () => {
    const compose = readFileSync(path.join(repo, "docker-compose.yml"), "utf8");
    assert.match(compose, /55432|p13/i);
    assert.match(compose, /postgres:16/);
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /55432|P13|local\/demo|PGlite/i);
    assert.match(doc, /not managed|≠ managed|Local.*only/i);
  });

  it("runbook + final + other gates preserved", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.37|1\.1 Managed PostgreSQL/);
    assert.match(rb, /OPS_REQUIRED|NOT_ESTABLISHED/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.37/);
    assert.match(fc, /NOT_ESTABLISHED|OPS_REQUIRED/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /Phase 12\.36/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
  });
});
