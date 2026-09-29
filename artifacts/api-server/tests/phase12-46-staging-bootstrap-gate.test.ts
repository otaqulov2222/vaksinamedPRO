/**
 * Phase 12.46 — Staging infrastructure bootstrap & evidence gate.
 * Does not invent providers. Does not close OPS_REQUIRED without evidence.
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

describe("Phase 12.46 — Staging infrastructure bootstrap gate", () => {
  it("gap matrix records 12.46; PRODUCTION NOT READY; P0 gates remain OPS_REQUIRED", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.46/);
    assert.match(doc, /Staging infrastructure bootstrap/);
    assert.match(doc, /OPERATIONAL EVIDENCE MISSING/);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
    assert.match(doc, /P0-1[\s\S]{0,200}OPS_REQUIRED|evidence checklist[\s\S]{0,80}OPS_REQUIRED/);
    assert.match(doc, /No cloud provider invented|provider-neutral|No provider invented/i);
    assert.doesNotMatch(doc, /P0-1[\s\S]{0,120}\|\s*\*\*DONE\*\*|LIVE_VERIFIED.*managed PostgreSQL PASS/i);
  });

  it("repo still fail-closed; compose keeps PSP/workers OFF; Dockerfile present", () => {
    const env = readFileSync(path.join(repo, "lib/db/src/env.ts"), "utf8");
    assert.match(env, /assertProductionDatabaseConfig/);

    const redis = readFileSync(path.join(apiRoot, "src/lib/redis.ts"), "utf8");
    assert.match(redis, /assertProductionRedisConfig/);

    const crypto = readFileSync(path.join(apiRoot, "src/lib/merchantSecretCrypto.ts"), "utf8");
    assert.match(crypto, /assertProductionMerchantSecretCryptoReady/);

    const compose = readFileSync(path.join(repo, "docker-compose.yml"), "utf8");
    assert.match(compose, /PAYME_MERCHANT_API_ENABLED:\s*"0"/);
    assert.match(compose, /CLICK_MERCHANT_API_ENABLED:\s*"0"/);
    assert.match(compose, /ENABLE_BACKGROUND_WORKERS:\s*"0"/);
    assert.match(compose, /health\/ready/);

    assert.ok(existsSync(path.join(repo, "Dockerfile")));
    assert.equal(existsSync(path.join(repo, "docker-compose.staging.yml")), false);
  });

  it("runbook + final preserve 12.46; prior 12.45 present; FOM/delivery contracts unchanged", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.46/);
    assert.match(rb, /OPERATIONAL EVIDENCE MISSING|OPS_REQUIRED/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.46/);
    assert.match(fc, /NOT READY/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.45/);
    assert.match(doc, /CONTRACT_PENDING/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
  });
});
