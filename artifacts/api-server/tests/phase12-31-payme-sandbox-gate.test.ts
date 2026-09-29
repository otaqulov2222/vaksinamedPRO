/**
 * Phase 12.31 — Payme sandbox E2E production gate invariants.
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

describe("Phase 12.31 — Payme sandbox E2E gate", () => {
  it("gap matrix records 12.31; P0-3a remains OPS_REQUIRED; no live PASS claim", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.31/);
    assert.match(doc, /Payme sandbox E2E/);
    assert.match(doc, /Code readiness|IMPLEMENTED IN REPO/i);
    assert.match(doc, /Credential availability|MISSING/);
    assert.match(doc, /PAYME_SANDBOX[\s\S]{0,80}MISSING/);
    assert.match(doc, /P0-3a[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /P0-3a[\s\S]{0,220}\|\s*\*\*DONE\*\*/);
    assert.doesNotMatch(doc, /PAYME_SANDBOX_E2E\s*=\s*\*\*PASS\*\*/);
    assert.match(doc, /No fake E2E PASS|fake PASS|Not claimed/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
    assert.match(doc, /outbound refund[\s\S]{0,40}CONTRACT_PENDING/i);
  });

  it("Payme merchant API fail-closed + core methods; no invented GetStatement settle", () => {
    const api = readFileSync(path.join(apiRoot, "src/lib/paymeMerchantApi.ts"), "utf8");
    assert.match(api, /CheckPerformTransaction|CreateTransaction|PerformTransaction/);
    assert.match(api, /verifyPaymeBasicAuth|Paycom/);
    assert.match(api, /isPaymeMerchantApiEnabled|PAYME_MERCHANT_API_ENABLED/);
    assert.match(api, /GetStatement[\s\S]{0,200}CONTRACT_PENDING|METHOD_NOT_FOUND/);
    assert.match(api, /capturePayment/);

    const contract = readFileSync(path.join(apiRoot, "src/lib/paymeContract.ts"), "utf8");
    assert.match(contract, /uzsToPaymeTiyin|paymeTiyinToUzs/);
    assert.match(contract, /checkout\.test\.paycom\.uz/);
    assert.match(contract, /PAYME_LIVE/);

    const adapters = readFileSync(path.join(apiRoot, "src/lib/paymentAdapters.ts"), "utf8");
    assert.match(adapters, /PaymeAdapter|provider:\s*"payme"/);
    assert.match(adapters, /refund\(\)[\s\S]{0,200}CONTRACT_PENDING/);
  });

  it("sandbox harness is honest PENDING without credentials; refuses prod enable", () => {
    const harness = readFileSync(path.join(apiRoot, "src/scripts/sandbox-e2e-harness.ts"), "utf8");
    assert.match(harness, /PAYME_SANDBOX_KEY/);
    assert.match(harness, /PAYME_SANDBOX_E2E_PENDING|status: "PENDING"/);
    assert.match(harness, /PASS requires real network proof/);
    assert.match(harness, /PAYME_MERCHANT_API_ENABLED must stay off/);
    assert.match(harness, /Never prints credentials|never commit/i);
    // No hardcoded return of PASS for missing credentials (PENDING path required)
    assert.match(harness, /if \(!hasKey \|\| !hasMerchant\)[\s\S]{0,200}status:\s*"PENDING"/);
    assert.doesNotMatch(harness, /if \(!hasKey \|\| !hasMerchant\)[\s\S]{0,200}status:\s*"PASS"/);
  });

  it("ops runbook + final closure keep Payme sandbox OPS / production OFF", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /2\.1 Payme sandbox/);
    assert.match(rb, /Phase 12\.31/);
    assert.match(rb, /OPS_REQUIRED|PENDING/);
    assert.match(rb, /PAYME_MERCHANT_API_ENABLED=0/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.31/);
    assert.match(fc, /Production Payme[\s\S]{0,40}OFF/i);
    assert.match(fc, /OPS_REQUIRED/);
  });

  it("other P0 gates preserved as OPS/CONTRACT; FOM writer OFF", () => {
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-1[\s\S]{0,300}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /CLICK[\s\S]{0,80}OPS_REQUIRED|P0-3b[\s\S]{0,200}OPS_REQUIRED/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
    assert.match(doc, /REDIS|Redis[\s\S]{0,80}OPS_REQUIRED/);
  });
});
