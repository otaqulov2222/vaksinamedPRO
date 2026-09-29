/**
 * Phase 12.40 — Payme sandbox E2E operational gate.
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

describe("Phase 12.40 — Payme sandbox E2E operational gate", () => {
  it("gap matrix records 12.40; P0-3a OPS_REQUIRED; credentials MISSING; E2E NOT_RUN", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.40/);
    assert.match(doc, /Payme sandbox E2E operational/);
    assert.match(doc, /PAYME_SANDBOX[\s\S]{0,80}\*\*MISSING\*\*/);
    assert.match(doc, /LIVE SANDBOX E2E[\s\S]{0,40}NOT_RUN|NOT_PROVEN/);
    assert.match(doc, /OUTBOUND REFUND[\s\S]{0,40}CONTRACT_PENDING/);
    assert.match(doc, /PRODUCTION PAYME[\s\S]{0,40}\*\*OFF\*\*/);
    assert.match(doc, /P0-3a[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /P0-3a[\s\S]{0,220}\|\s*\*\*DONE\*\*/);
    assert.doesNotMatch(doc, /PAYME_SANDBOX_E2E\s*=\s*\*\*PASS\*\*|LIVE_SANDBOX_VERIFIED/);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("adapter + merchant API remain ready; outbound refund CONTRACT_PENDING; prod flag fail-closed", () => {
    const api = readFileSync(path.join(apiRoot, "src/lib/paymeMerchantApi.ts"), "utf8");
    assert.match(api, /CheckPerformTransaction/);
    assert.match(api, /CreateTransaction/);
    assert.match(api, /PerformTransaction/);
    assert.match(api, /CancelTransaction/);
    assert.match(api, /CheckTransaction/);
    assert.match(api, /PAYME_MERCHANT_API_ENABLED|isPaymeMerchantApiEnabled/);

    const adapters = readFileSync(path.join(apiRoot, "src/lib/paymentAdapters.ts"), "utf8");
    assert.match(adapters, /class PaymeAdapter/);
    assert.match(adapters, /async refund\(\)[\s\S]{0,200}CONTRACT_PENDING/);

    const harness = readFileSync(path.join(apiRoot, "src/scripts/sandbox-e2e-harness.ts"), "utf8");
    assert.match(harness, /PAYME_SANDBOX_KEY/);
    assert.match(harness, /PAYME_SANDBOX_E2E_PENDING|status: "PENDING"/);
    assert.match(harness, /PAYME_MERCHANT_API_ENABLED must stay off/);
    assert.doesNotMatch(harness, /rejectUnauthorized\s*:\s*false/);
  });

  it("runbook + final preserve OFF + OPS; other gates untouched", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.40/);
    assert.match(rb, /OPS_REQUIRED|PENDING/);
    assert.match(rb, /PAYME_MERCHANT_API_ENABLED=0|production Payme \*\*OFF\*\*/i);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.40/);
    assert.match(fc, /OPS_REQUIRED/);
    assert.match(fc, /OFF|NOT_RUN/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /Phase 12\.31/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
  });
});
