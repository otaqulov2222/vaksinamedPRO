/**
 * Phase 12.41 — Click sandbox E2E operational gate.
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

describe("Phase 12.41 — Click sandbox E2E operational gate", () => {
  it("gap matrix records 12.41; P0-3b OPS_REQUIRED; credentials MISSING; E2E NOT_RUN", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.41/);
    assert.match(doc, /Click sandbox E2E operational/);
    assert.match(doc, /CLICK_SANDBOX[\s\S]{0,120}\*\*MISSING\*\*/);
    assert.match(doc, /LIVE SANDBOX E2E[\s\S]{0,40}NOT_RUN|NOT_PROVEN/);
    assert.match(doc, /OUTBOUND REFUND[\s\S]{0,40}CONTRACT_PENDING/);
    assert.match(doc, /PRODUCTION CLICK[\s\S]{0,40}\*\*OFF\*\*/);
    assert.match(doc, /P0-3b[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /P0-3b[\s\S]{0,220}\|\s*\*\*DONE\*\*/);
    assert.doesNotMatch(doc, /CLICK_SANDBOX_E2E\s*=\s*\*\*PASS\*\*|LIVE_SANDBOX_VERIFIED/);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("adapter + Shop API remain ready; MD5 sign; outbound refund CONTRACT_PENDING; prod flag fail-closed", () => {
    const api = readFileSync(path.join(apiRoot, "src/lib/clickMerchantApi.ts"), "utf8");
    assert.match(api, /Prepare|COMPLETE|CLICK_ACTION/);
    assert.match(api, /verifyClickSignString|sign_string/);
    assert.match(api, /CLICK_MERCHANT_API_ENABLED|isClickMerchantApiEnabled/);
    assert.match(api, /capturePayment/);

    const contract = readFileSync(path.join(apiRoot, "src/lib/clickContract.ts"), "utf8");
    assert.match(contract, /createHash\("md5"\)/);
    assert.match(contract, /timingSafeEqual|verifyClickSignString/);
    assert.doesNotMatch(contract, /rejectUnauthorized\s*:\s*false/);

    const adapters = readFileSync(path.join(apiRoot, "src/lib/paymentAdapters.ts"), "utf8");
    assert.match(adapters, /class ClickAdapter/);
    const clickSlice = adapters.slice(adapters.indexOf("class ClickAdapter"));
    const nextClass = clickSlice.search(/\nexport class |\nclass /);
    const body = nextClass > 0 ? clickSlice.slice(0, nextClass) : clickSlice.slice(0, 800);
    assert.match(body, /async refund\(\)[\s\S]{0,200}CONTRACT_PENDING/);

    const harness = readFileSync(path.join(apiRoot, "src/scripts/sandbox-e2e-harness.ts"), "utf8");
    assert.match(harness, /CLICK_SANDBOX_SECRET/);
    assert.match(harness, /CLICK_SANDBOX_E2E_PENDING|status: "PENDING"/);
    assert.match(harness, /CLICK_MERCHANT_API_ENABLED must stay off/);
  });

  it("runbook + final preserve OFF + OPS; other gates untouched", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.41/);
    assert.match(rb, /OPS_REQUIRED|PENDING/);
    assert.match(rb, /CLICK_MERCHANT_API_ENABLED=0|production Click \*\*OFF\*\*/i);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.41/);
    assert.match(fc, /OPS_REQUIRED/);
    assert.match(fc, /OFF|NOT_RUN/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-3a[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /Phase 12\.32/);
    assert.match(doc, /Phase 12\.40/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
  });
});
