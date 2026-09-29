/**
 * Phase 12.35 — Failure recovery & operational resilience gate invariants.
 * Does not invent HA/RPO/RTO. Does not claim production failover verified.
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

describe("Phase 12.35 — Failure recovery & resilience", () => {
  it("gap matrix records 12.35; RPO/RTO NOT_ESTABLISHED; no fake HA claim", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.35/);
    assert.match(doc, /Failure recovery|operational resilience/i);
    assert.match(doc, /RPO[\s\S]{0,40}NOT_ESTABLISHED/);
    assert.match(doc, /RTO[\s\S]{0,40}NOT_ESTABLISHED/);
    assert.match(doc, /OPS_REQUIRED/);
    assert.match(doc, /NOT_PROVEN|NOT READY/);
    assert.match(doc, /RUNNING[\s\S]{0,80}reclaim|no auto-reclaim of RUNNING/i);
    assert.doesNotMatch(doc, /PRODUCTION FAILOVER VERIFIED|DISASTER RECOVERY READY|HIGH AVAILABILITY.*VERIFIED/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("health live ≠ ready; ready is PG-only; Redis not in ready", () => {
    const health = readFileSync(path.join(apiRoot, "src/routes/health.ts"), "utf8");
    assert.match(health, /\/health\/live/);
    assert.match(health, /\/health\/ready/);
    assert.match(health, /checkDatabaseHealth/);
    assert.match(health, /status\(503\)/);
    assert.doesNotMatch(health, /resolveRedisUrl|getRedisClient|warmRedis/);
  });

  it("Redis fail-closed + worker SKIP LOCKED + RUNNING reclaim gap documented in code/docs", () => {
    const redis = readFileSync(path.join(apiRoot, "src/lib/redis.ts"), "utf8");
    assert.match(redis, /assertProductionRedisConfig/);
    assert.match(redis, /connectTimeout:\s*5_000/);

    const rl = readFileSync(path.join(apiRoot, "src/lib/rateLimit.ts"), "utf8");
    assert.match(rl, /RATE_LIMIT_REDIS_UNAVAILABLE/);
    assert.match(rl, /status\(503\)/);

    const workers = readFileSync(path.join(apiRoot, "src/lib/workers.ts"), "utf8");
    assert.match(workers, /FOR UPDATE SKIP LOCKED/);
    assert.match(workers, /PENDING',\s*'FAILED'|PENDING.*FAILED/s);
    assert.match(workers, /backoffMs|max_attempts/);
    // Claim does not include RUNNING — intentional gap called out in docs
    assert.doesNotMatch(workers, /status IN \('PENDING',\s*'FAILED',\s*'RUNNING'\)/);
  });

  it("runbook + final keep resilience OPS; other P0 gates preserved", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.35|1\.9 Failure recovery/);
    assert.match(rb, /NOT_ESTABLISHED|OPS_REQUIRED/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.35/);
    assert.match(fc, /NOT_ESTABLISHED|OPS_REQUIRED/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-1[\s\S]{0,300}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-3a[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /Phase 12\.30|Phase 12\.34/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
  });

  it("FOM writer remains OFF; payment prod flags fail-closed in source", () => {
    const fom = readFileSync(path.join(apiRoot, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(fom, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);

    const payme = readFileSync(path.join(apiRoot, "src/lib/paymeContract.ts"), "utf8");
    assert.match(payme, /PAYME_MERCHANT_API_ENABLED/);
    assert.match(payme, /isProductionLike\(\)[\s\S]{0,80}flagEnabled/);
  });
});
