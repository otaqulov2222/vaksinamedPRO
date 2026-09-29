/**
 * Phase 12.49 — Provider decision & final staging architecture gate.
 * Decision only: DigitalOcean selected; no provisioning; no OPS gate closure.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");
const decision = path.join(repo, "docs/PHASE_12_49_PROVIDER_DECISION.md");
const research = path.join(repo, "docs/PHASE_12_48_PROVIDER_RESEARCH.md");
const blueprint = path.join(repo, "docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md");
const matrix = path.join(repo, "docs/PRODUCTION_GAP_MATRIX.md");

describe("Phase 12.49 — Provider decision gate", () => {
  it("decision selects DigitalOcean; Hetzner does not fit; KMS tradeoff explicit; no provisioning", () => {
    assert.ok(existsSync(decision));
    const doc = readFileSync(decision, "utf8");
    assert.match(doc, /SELECTED STAGING PROVIDER:\s*DigitalOcean/);
    assert.match(doc, /FITS_WITH_TRADEOFFS/);
    assert.match(doc, /DOES_NOT_FIT_CURRENT_REQUIREMENTS/);
    assert.match(doc, /Hetzner/);
    assert.match(doc, /ENVIRONMENT_KEK/);
    assert.match(doc, /not equivalent to managed KMS|ENVIRONMENT_KEK ≠|not claim ENVIRONMENT_KEK = managed KMS/i);
    assert.match(doc, /OPERATIONAL EVIDENCE MISSING/);
    assert.match(doc, /FRA1/);
    assert.match(doc, /LIVE_LATENCY_TEST_REQUIRED/);
    assert.match(doc, /does not execute|Do not execute|No provisioning/i);
    assert.doesNotMatch(doc, /P0-1[\s\S]{0,80}\|\s*\*\*DONE\*\*/);
  });

  it("gap + blueprint record 12.49; prior 12.48 research present; P0 remain OPS", () => {
    const gap = readFileSync(matrix, "utf8");
    assert.match(gap, /Phase 12\.49/);
    assert.match(gap, /DigitalOcean/);
    assert.match(gap, /PHASE_12_49_PROVIDER_DECISION/);
    assert.match(gap, /Phase 12\.48/);
    assert.match(gap, /OPS_REQUIRED/);
    assert.match(gap, /OPERATIONAL EVIDENCE MISSING/);

    assert.ok(existsSync(research));
    const bp = readFileSync(blueprint, "utf8");
    assert.match(bp, /Phase 12\.49/);
    assert.match(bp, /DigitalOcean/);
  });

  it("production flags remain OFF; no fabricated LIVE_VERIFIED", () => {
    const compose = readFileSync(path.join(repo, "docker-compose.yml"), "utf8");
    assert.match(compose, /PAYME_MERCHANT_API_ENABLED:\s*"0"/);
    assert.match(compose, /CLICK_MERCHANT_API_ENABLED:\s*"0"/);
    assert.match(compose, /ENABLE_BACKGROUND_WORKERS:\s*"0"/);

    const doc = readFileSync(decision, "utf8");
    assert.doesNotMatch(doc, /LIVE_VERIFIED/);
  });
});
