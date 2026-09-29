/**
 * Phase 12.32 — Click sandbox E2E production gate invariants.
 * Does not invent credentials. Does not claim live sandbox PASS.
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

describe("Phase 12.32 — Click sandbox E2E gate", () => {
  it("gap matrix records 12.32; P0-3b remains OPS_REQUIRED; no live PASS claim", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.32/);
    assert.match(doc, /Click sandbox E2E/);
    assert.match(doc, /Code readiness|IMPLEMENTED IN REPO/i);
    assert.match(doc, /CLICK_SANDBOX[\s\S]{0,120}MISSING/);
    assert.match(doc, /P0-3b[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /P0-3b[\s\S]{0,220}\|\s*\*\*DONE\*\*/);
    assert.doesNotMatch(doc, /CLICK_SANDBOX_E2E\s*=\s*\*\*PASS\*\*/);
    assert.match(doc, /No fake E2E PASS|fake PASS|Not claimed/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
    assert.match(doc, /outbound refund[\s\S]{0,60}CONTRACT_PENDING/i);
  });

  it("Click Shop API fail-closed + Prepare/Complete; MD5 sign; no invented outbound refund", () => {
    const api = readFileSync(path.join(apiRoot, "src/lib/clickMerchantApi.ts"), "utf8");
    assert.match(api, /Prepare|COMPLETE|CLICK_ACTION/);
    assert.match(api, /verifyClickSignString|sign_string/);
    assert.match(api, /isClickMerchantApiEnabled|CLICK_MERCHANT_API_ENABLED/);
    assert.match(api, /capturePayment/);
    assert.match(api, /CONTRACT_PENDING/);

    const contract = readFileSync(path.join(apiRoot, "src/lib/clickContract.ts"), "utf8");
    assert.match(contract, /buildClickSignString|verifyClickSignString/);
    assert.match(contract, /createHash\("md5"\)/);
    assert.match(contract, /CLICK_ACTION[\s\S]{0,80}PREPARE:\s*0/);
    assert.match(contract, /my\.click\.uz\/services\/pay/);
    assert.match(contract, /CLICK_LIVE/);
    assert.match(contract, /Clock-skew|clock-skew[\s\S]{0,40}CONTRACT_PENDING/i);

    const adapters = readFileSync(path.join(apiRoot, "src/lib/paymentAdapters.ts"), "utf8");
    assert.match(adapters, /class ClickAdapter/);
    const clickSlice = adapters.slice(adapters.indexOf("class ClickAdapter"));
    assert.match(clickSlice, /refund\(\)[\s\S]{0,200}CONTRACT_PENDING/);
  });

  it("sandbox harness is honest PENDING without Click credentials; refuses prod enable", () => {
    const harness = readFileSync(path.join(apiRoot, "src/scripts/sandbox-e2e-harness.ts"), "utf8");
    assert.match(harness, /CLICK_SANDBOX_SECRET/);
    assert.match(harness, /CLICK_SANDBOX_SERVICE_ID/);
    assert.match(harness, /CLICK_SANDBOX_MERCHANT_ID/);
    assert.match(harness, /CLICK_SANDBOX_E2E_PENDING|status: "PENDING"/);
    assert.match(harness, /PASS requires real network proof/);
    assert.match(harness, /CLICK_MERCHANT_API_ENABLED must stay off/);
    assert.match(harness, /if \(!hasSecret \|\| !hasService \|\| !hasMerchant\)[\s\S]{0,220}status:\s*"PENDING"/);
    assert.doesNotMatch(
      harness,
      /if \(!hasSecret \|\| !hasService \|\| !hasMerchant\)[\s\S]{0,220}status:\s*"PASS"/,
    );
  });

  it("ops runbook + final closure keep Click sandbox OPS / production OFF", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /2\.2 Click sandbox/);
    assert.match(rb, /Phase 12\.32/);
    assert.match(rb, /OPS_REQUIRED|PENDING/);
    assert.match(rb, /CLICK_MERCHANT_API_ENABLED=0/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.32/);
    assert.match(fc, /Production Click[\s\S]{0,40}OFF/i);
    assert.match(fc, /OPS_REQUIRED/);
  });

  it("other P0 gates preserved; Payme sandbox still OPS; FOM writer OFF", () => {
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-1[\s\S]{0,300}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-3a[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /Phase 12\.31/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
    assert.match(doc, /REDIS|Redis[\s\S]{0,80}OPS_REQUIRED/);
  });
});
