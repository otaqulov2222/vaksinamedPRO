/**
 * Phase 12.47 — Infrastructure provider selection & staging blueprint gate.
 * Blueprint only: no provisioning claims, no OPS gate closures.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");
const blueprint = path.join(repo, "docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md");
const matrix = path.join(repo, "docs/PRODUCTION_GAP_MATRIX.md");
const runbook = path.join(repo, "docs/PRODUCTION_OPS_RUNBOOK.md");
const finalDoc = path.join(repo, "docs/FINAL_PRODUCTION_CLOSURE.md");

describe("Phase 12.47 — Staging infrastructure blueprint gate", () => {
  it("blueprint exists; no provider winner; PRODUCTION NOT READY; object storage optional", () => {
    assert.ok(existsSync(blueprint));
    const bp = readFileSync(blueprint, "utf8");
    assert.match(bp, /Phase 12\.47/);
    assert.match(bp, /BLUEPRINT ONLY|provider-neutral/i);
    assert.match(bp, /OPERATIONAL EVIDENCE MISSING/);
    assert.match(bp, /No provider selected|no automatic|TO_BE_AGREED/i);
    assert.match(bp, /NOT_VERIFIED/);
    assert.match(bp, /OPTIONAL[\s\S]{0,40}Object storage|Object storage[\s\S]{0,80}OPTIONAL/i);
    assert.doesNotMatch(bp, /SELECTED PROVIDER:\s*\w+|winner:\s*(AWS|GCP|Azure)/i);
    assert.doesNotMatch(bp, /P0-1[\s\S]{0,80}\|\s*\*\*DONE\*\*\s*\|\s*\*\*LIVE/);
  });

  it("gap matrix records 12.47; prior 12.45/12.46 present; P0 remain OPS_REQUIRED", () => {
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.47/);
    assert.match(doc, /STAGING_INFRASTRUCTURE_BLUEPRINT/);
    assert.match(doc, /Phase 12\.46/);
    assert.match(doc, /Phase 12\.45/);
    assert.match(doc, /OPERATIONAL EVIDENCE MISSING/);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
    assert.match(doc, /P0-1[\s\S]{0,120}OPS_REQUIRED/);
    assert.match(doc, /CONTRACT_PENDING/);
  });

  it("runbook + final + fail-closed + PSP/worker OFF preserved", () => {
    assert.match(readFileSync(runbook, "utf8"), /Phase 12\.47/);
    assert.match(readFileSync(finalDoc, "utf8"), /Phase 12\.47/);

    const compose = readFileSync(path.join(repo, "docker-compose.yml"), "utf8");
    assert.match(compose, /PAYME_MERCHANT_API_ENABLED:\s*"0"/);
    assert.match(compose, /CLICK_MERCHANT_API_ENABLED:\s*"0"/);
    assert.match(compose, /ENABLE_BACKGROUND_WORKERS:\s*"0"/);

    const env = readFileSync(path.join(repo, "lib/db/src/env.ts"), "utf8");
    assert.match(env, /assertProductionDatabaseConfig/);
  });
});
