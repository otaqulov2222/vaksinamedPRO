/**
 * Phase 12.42 — Merchant secret KMS production operational gate.
 * Does not invent a cloud KMS provider. Does not claim LIVE_KMS_VERIFIED.
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
const followup = path.join(repo, "docs/PHASE_3_3_P12_1_SECRETS_HMAC_FOLLOWUP.md");

describe("Phase 12.42 — Merchant secret KMS operational gate", () => {
  it("gap matrix records 12.42; P0-2 OPS_REQUIRED; managed KMS MISSING; env KEK not claimed as KMS", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.42/);
    assert.match(doc, /Merchant secret KMS production/);
    assert.match(doc, /CURRENT_KEY_SOURCE[\s\S]{0,40}ENVIRONMENT_KEK/);
    assert.match(doc, /KMS_PROVIDER[\s\S]{0,40}MISSING|KMS_BACKING[\s\S]{0,40}NOT_PROVEN/);
    assert.match(doc, /MERCHANT_SECRET_KEK[\s\S]{0,40}\*\*MISSING\*\*/);
    assert.match(doc, /P0-2[\s\S]{0,500}\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /P0-2[\s\S]{0,220}\|\s*\*\*DONE\*\*/);
    assert.doesNotMatch(doc, /LIVE_KMS_VERIFIED\s*\|\s*\*\*Yes\*\*|managed KMS\s*=\s*\*\*DONE\*\*/i);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
  });

  it("app encryption boundary remains local_kek AES-GCM; no cloud KMS SDK invented", () => {
    const crypto = readFileSync(path.join(apiRoot, "src/lib/merchantSecretCrypto.ts"), "utf8");
    assert.match(crypto, /enc:v1:|CIPHERTEXT_PREFIX/);
    assert.match(crypto, /aes-256-gcm/);
    assert.match(crypto, /local_kek|createLocalKekProvider/);
    assert.match(crypto, /MERCHANT_SECRET_KEK/);
    assert.match(crypto, /assertProductionMerchantSecretCryptoReady/);
    assert.match(crypto, /NOT a cloud KMS|Not "cloud KMS"|No cloud KMS/i);
    assert.doesNotMatch(crypto, /@aws-sdk\/client-kms|@google-cloud\/kms|@azure\/keyvault|node-vault/);

    const merchant = readFileSync(path.join(apiRoot, "src/lib/branchPaymentMerchant.ts"), "utf8");
    assert.match(merchant, /decryptMerchantSecretFromStorage/);
    assert.match(merchant, /prepareMerchantSecretForStorage|WeakMap/);

    const pkg = readFileSync(path.join(apiRoot, "package.json"), "utf8");
    assert.doesNotMatch(pkg, /@aws-sdk\/client-kms|@google-cloud\/kms|@azure\/keyvault|node-vault/);

    assert.equal(existsSync(path.join(repo, "terraform")), false);
    assert.equal(existsSync(path.join(repo, "pulumi")), false);
  });

  it("runbook + final + followup keep OPS; other gates untouched; PSP OFF", () => {
    const rb = readFileSync(runbook, "utf8");
    assert.match(rb, /Phase 12\.42/);
    assert.match(rb, /OPS_REQUIRED/);
    assert.match(rb, /1\.5 KMS/);

    const fc = readFileSync(finalDoc, "utf8");
    assert.match(fc, /Phase 12\.42/);
    assert.match(fc, /OPS_REQUIRED/);
    assert.match(fc, /ENVIRONMENT_KEK|MISSING/);

    const fu = readFileSync(followup, "utf8");
    assert.match(fu, /Phase 12\.42/);
    assert.match(fu, /Do not invent AWS\/GCP\/Azure\/Vault/);

    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /P0-3a[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /P0-4[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.match(doc, /Phase 12\.28/);
    assert.match(doc, /FOM[\s\S]{0,80}CONTRACT_PENDING|inventoryWriter.*OFF/i);
    assert.match(doc, /PRODUCTION PSP[\s\S]{0,20}\*\*OFF\*\*|Payme\/Click production[\s\S]{0,40}OFF/i);
  });
});
