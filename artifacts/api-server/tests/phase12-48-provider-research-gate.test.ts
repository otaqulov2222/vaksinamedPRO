/**
 * Phase 12.48 — Real cloud provider research gate.
 * Research only: no provisioning, no winner, no OPS gate closure.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");
const research = path.join(repo, "docs/PHASE_12_48_PROVIDER_RESEARCH.md");
const blueprint = path.join(repo, "docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md");
const matrix = path.join(repo, "docs/PRODUCTION_GAP_MATRIX.md");

describe("Phase 12.48 — Provider research gate", () => {
  it("research doc exists; no automatic winner; Hetzner managed DB NOT_AVAILABLE; DO PITR VERIFIED", () => {
    assert.ok(existsSync(research));
    const doc = readFileSync(research, "utf8");
    assert.match(doc, /Phase 12\.48/);
    assert.match(doc, /OPERATIONAL EVIDENCE MISSING/);
    assert.match(doc, /DECISION REQUIRED FROM OPS \+ PRODUCT/);
    assert.match(doc, /LIVE_LATENCY_TEST_REQUIRED/);
    assert.match(doc, /Hetzner[\s\S]{0,400}NOT_AVAILABLE/);
    assert.match(doc, /DigitalOcean[\s\S]{0,800}PITR[\s\S]{0,200}VERIFIED|PITR[\s\S]{0,120}7/);
    assert.match(doc, /OPTION A[\s\S]+OPTION B[\s\S]+OPTION C/);
    assert.doesNotMatch(doc, /SELECTED PROVIDER:\s*(AWS|GCP|Azure|DigitalOcean)/i);
    assert.doesNotMatch(doc, /is the best provider/i);
  });

  it("gap + blueprint reference 12.48; P0 remain OPS_REQUIRED; prior 12.47 present", () => {
    const gap = readFileSync(matrix, "utf8");
    assert.match(gap, /Phase 12\.48/);
    assert.match(gap, /PHASE_12_48_PROVIDER_RESEARCH/);
    assert.match(gap, /Phase 12\.47/);
    assert.match(gap, /OPERATIONAL EVIDENCE MISSING/);
    assert.match(gap, /P0-1[\s\S]{0,120}OPS_REQUIRED/);

    const bp = readFileSync(blueprint, "utf8");
    assert.match(bp, /Phase 12\.48/);
    assert.match(bp, /PHASE_12_48_PROVIDER_RESEARCH/);
  });

  it("no production enablement in compose; fail-closed retained", () => {
    const compose = readFileSync(path.join(repo, "docker-compose.yml"), "utf8");
    assert.match(compose, /PAYME_MERCHANT_API_ENABLED:\s*"0"/);
    assert.match(compose, /CLICK_MERCHANT_API_ENABLED:\s*"0"/);
    assert.match(compose, /ENABLE_BACKGROUND_WORKERS:\s*"0"/);
  });
});
