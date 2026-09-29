/**
 * Phase 12.36 — Worker crash recovery / stale RUNNING reclaim documentation gates.
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

describe("Phase 12.36 — Worker crash recovery gate", () => {
  it("gap matrix records 12.36; reclaim READY_IN_REPO/TEST_VERIFIED; prod drill OPS", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.36/);
    assert.match(doc, /stale RUNNING|WORKER_STALE|reclaim/i);
    assert.match(doc, /READY_IN_REPO|TEST_VERIFIED/);
    assert.match(doc, /OPS_REQUIRED/);
    assert.match(doc, /WORKER_STALE_RUNNING_MS/);
    assert.doesNotMatch(doc, /production HA verified|DISASTER RECOVERY READY/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("workers implement reclaim + race-safe completion; claim still PENDING/FAILED only", () => {
    const workers = readFileSync(path.join(apiRoot, "src/lib/workers.ts"), "utf8");
    assert.match(workers, /reclaimStaleRunningJobs/);
    assert.match(workers, /workerStaleRunningMs/);
    assert.match(workers, /WORKER_STALE_RUNNING_MS/);
    assert.match(workers, /stale_running_reclaimed/);
    assert.match(workers, /FOR UPDATE SKIP LOCKED/);
    assert.match(workers, /status IN \('PENDING',\s*'FAILED'\)/);
    assert.match(workers, /eq\(workerJobs\.status,\s*"RUNNING"\)/);
    assert.match(workers, /eq\(workerJobs\.lockedBy,\s*workerId\)/);
    assert.match(workers, /WORKER_STALE_JOB_RECLAIMED/);

    const alerts = readFileSync(path.join(apiRoot, "src/lib/alerts.ts"), "utf8");
    assert.match(alerts, /WORKER_STALE_JOB_RECLAIMED/);
  });

  it("env example documents WORKER_STALE_RUNNING_MS; no Redis/BullMQ invent", () => {
    const env = readFileSync(path.join(repo, ".env.example"), "utf8");
    assert.match(env, /WORKER_STALE_RUNNING_MS/);
    assert.match(env, /worker_jobs|no BullMQ/i);

    const workers = readFileSync(path.join(apiRoot, "src/lib/workers.ts"), "utf8");
    assert.doesNotMatch(workers, /from ["']bullmq["']|from ["']ioredis["']/);
  });

  it("runbook + final + other gates preserved", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.36|stale RUNNING|WORKER_STALE_RUNNING_MS/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.36/);
    assert.match(fc, /OPS_REQUIRED|TEST_VERIFIED|READY_IN_REPO/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-1[\s\S]{0,300}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /Phase 12\.35/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
    assert.match(doc, /RPO[\s\S]{0,40}NOT_ESTABLISHED/);
  });
});
