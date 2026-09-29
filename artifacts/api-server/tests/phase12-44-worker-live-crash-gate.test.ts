/**
 * Phase 12.44 — Worker live crash / recovery operational gate.
 * Does not invent staging worker/PG. Does not claim LIVE_STAGING_VERIFIED.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");
const matrix = path.join(repo, "docs/PRODUCTION_GAP_MATRIX.md");
const runbook = path.join(repo, "docs/PRODUCTION_OPS_RUNBOOK.md");
const finalDoc = path.join(repo, "docs/FINAL_PRODUCTION_CLOSURE.md");

describe("Phase 12.44 — Worker live crash recovery operational gate", () => {
  it("gap matrix records 12.44; staging worker MISSING; live drill NOT_PROVEN; no fabricated RTO", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.44/);
    assert.match(doc, /Worker live crash/);
    assert.match(doc, /STAGING WORKER[\s\S]{0,40}\*\*MISSING\*\*/);
    assert.match(doc, /LIVE_STAGING_DRILL[\s\S]{0,40}NOT_PROVEN|NOT_RUN/);
    assert.match(doc, /OBSERVED_STAGING_RECOVERY_TIME[\s\S]{0,40}NOT_ESTABLISHED/);
    assert.match(doc, /WORKER LIVE CRASH GATE[\s\S]{0,80}OPS_REQUIRED/);
    assert.match(doc, /O-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /LIVE_STAGING_VERIFIED\s*\|\s*\*\*Yes\*\*|live kill drill\s*=\s*\*\*PASS\*\*/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("reclaim + SKIP LOCKED + LEASE race-safety remain; workers not Redis SoT", () => {
    const workers = readFileSync(path.join(apiRoot, "src/lib/workers.ts"), "utf8");
    assert.match(workers, /reclaimStaleRunningJobs/);
    assert.match(workers, /WORKER_STALE_RUNNING_MS/);
    assert.match(workers, /FOR UPDATE SKIP LOCKED/);
    assert.match(workers, /WORKER_STALE_JOB_RECLAIMED/);
    assert.match(workers, /locked_by|lockedBy/);
    assert.match(workers, /stale_running_reclaimed/);
    assert.doesNotMatch(workers, /from ["']bullmq["']|from ["']ioredis["']/);

    const alerts = readFileSync(path.join(apiRoot, "src/lib/alerts.ts"), "utf8");
    assert.match(alerts, /WORKER_STALE_JOB_RECLAIMED/);

    const compose = readFileSync(path.join(repo, "docker-compose.yml"), "utf8");
    assert.match(compose, /ENABLE_BACKGROUND_WORKERS:\s*"0"/);

    assert.equal(existsSync(path.join(repo, "terraform")), false);
    assert.equal(existsSync(path.join(repo, "k8s")), false);
  });

  it("runbook + final preserve OPS; other gates untouched", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.44/);
    assert.match(rb, /OPS_REQUIRED|NOT_PROVEN/);
    assert.match(rb, /WORKER_STALE_RUNNING_MS|Phase 12\.36/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.44/);
    assert.match(fc, /OPS_REQUIRED/);
    assert.match(fc, /NOT_PROVEN|MISSING/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.36/);
    assert.match(doc, /Phase 12\.43/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
    assert.match(doc, /P0-1[\s\S]{0,300}\*\*OPS_REQUIRED\*\*/);
  });
});
