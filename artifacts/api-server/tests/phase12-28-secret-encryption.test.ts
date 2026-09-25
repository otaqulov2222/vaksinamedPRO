/**
 * Phase 12.28 — Merchant secret encryption-at-rest boundary.
 * Synthetic secrets only. No real credentials. No production DB.
 *
 * Avoid importing branchPaymentMerchant here (it pulls @workspace/db auto-init).
 * DB-boundary integration lives in lib/db/tests/p12-28-merchant-secret-crypto.test.ts.
 */

import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");
const SYN_PAYME = "TEST_PAYME_SECRET_ONLY";
const SYN_CLICK = "TEST_CLICK_SECRET_ONLY";

function testKek(): string {
  return randomBytes(32).toString("base64");
}

describe("Phase 12.28 — merchant secret encryption", () => {
  const prev = {
    kek: process.env.MERCHANT_SECRET_KEK,
    app: process.env.APP_ENV,
    node: process.env.NODE_ENV,
    plain: process.env.MERCHANT_SECRET_ALLOW_PLAINTEXT_READ,
  };

  afterEach(() => {
    if (prev.kek === undefined) delete process.env.MERCHANT_SECRET_KEK;
    else process.env.MERCHANT_SECRET_KEK = prev.kek;
    if (prev.app === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = prev.app;
    if (prev.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev.node;
    if (prev.plain === undefined) delete process.env.MERCHANT_SECRET_ALLOW_PLAINTEXT_READ;
    else process.env.MERCHANT_SECRET_ALLOW_PLAINTEXT_READ = prev.plain;
  });

  it("1–2. admin DTO source masks secrets; never seeds UI from API secret fields", () => {
    const merchant = readFileSync(path.join(apiRoot, "src/lib/branchPaymentMerchant.ts"), "utf8");
    assert.match(merchant, /toAdminBranchPaymentDto/);
    assert.match(merchant, /paymeKey:\s*flags\.hasPayme\s*\?\s*"••••"/);
    assert.match(merchant, /clickSecret:\s*flags\.hasClick\s*\?\s*"••••"/);
    assert.match(merchant, /decryptMerchantSecretFromStorage/);
    assert.match(merchant, /encryptMerchantSecretForStorage/);

    const page = readFileSync(path.join(repo, "artifacts/admin-web/src/pages/BranchesPage.tsx"), "utf8");
    assert.match(page, /paymeKey:\s*""/);
    assert.match(page, /clickSecret:\s*""/);
    assert.doesNotMatch(page, /paymeKey:\s*branch\.paymeKey/);
    assert.doesNotMatch(page, /localStorage\.setItem\([^)]*paymeKey/);
    assert.doesNotMatch(page, /localStorage\.setItem\([^)]*clickSecret/);
  });

  it("3–4. logger + audit scrubbers drop secret keys; audit update uses booleans only", () => {
    const logger = readFileSync(path.join(apiRoot, "src/lib/logger.ts"), "utf8");
    assert.match(logger, /"paymeKey"/);
    assert.match(logger, /"clickSecret"/);
    assert.match(logger, /"payme_key"/);
    assert.match(logger, /"click_secret"/);

    const admin = readFileSync(path.join(apiRoot, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /paymeCredentialUpdated/);
    assert.match(admin, /clickCredentialUpdated/);
    assert.match(admin, /prepareMerchantSecretForStorage/);
    assert.doesNotMatch(admin, /payload: JSON\.stringify\(\{[^}]*paymeKey:/);

    const ops = readFileSync(path.join(apiRoot, "src/lib/adminOrderOps.ts"), "utf8");
    assert.match(ops, /SENSITIVE_KEY/);
    assert.match(ops, /payme/);
    assert.match(ops, /click/);
  });

  it("5–6. encrypt storage + decrypt boundary round-trip", async () => {
    process.env.MERCHANT_SECRET_KEK = testKek();
    delete process.env.APP_ENV;
    delete process.env.NODE_ENV;
    const crypto = await import("../src/lib/merchantSecretCrypto.ts");
    const stored = crypto.encryptMerchantSecretForStorage(SYN_PAYME);
    assert.ok(crypto.isEncryptedSecretBlob(stored));
    assert.doesNotMatch(stored, new RegExp(SYN_PAYME));
    const plain = crypto.decryptMerchantSecretFromStorage(stored);
    assert.ok(crypto.secretsMatch(plain, SYN_PAYME));
  });

  it("7. wrong KEK fails safely without leaking secret", async () => {
    process.env.MERCHANT_SECRET_KEK = testKek();
    delete process.env.APP_ENV;
    delete process.env.NODE_ENV;
    const crypto = await import("../src/lib/merchantSecretCrypto.ts");
    const stored = crypto.encryptMerchantSecretForStorage(SYN_PAYME);
    process.env.MERCHANT_SECRET_KEK = testKek();
    await assert.rejects(
      async () => crypto.decryptMerchantSecretFromStorage(stored),
      (err: any) => {
        const msg = String(err?.message || err);
        assert.doesNotMatch(msg, new RegExp(SYN_PAYME));
        assert.equal(err?.code, "MERCHANT_SECRET_DECRYPT_FAILED");
        return true;
      },
    );
  });

  it("8. payment adapter boundary wiring (source): decrypt → WeakMap → getPaymentMerchantSecretMaterial", () => {
    const merchant = readFileSync(path.join(apiRoot, "src/lib/branchPaymentMerchant.ts"), "utf8");
    assert.match(merchant, /secretBag\s*=\s*new WeakMap/);
    assert.match(merchant, /decryptMerchantSecretFromStorage\(branch\.paymeKey\)/);
    assert.match(merchant, /decryptMerchantSecretFromStorage\(branch\.clickSecret\)/);
    assert.match(merchant, /getPaymentMerchantSecretMaterial/);
    assert.match(merchant, /toPublicMerchantSummary/);
    assert.doesNotMatch(merchant, /aws-kms|@aws-sdk\/client-kms|@google-cloud\/kms/);

    const payme = readFileSync(path.join(apiRoot, "src/lib/paymeMerchantApi.ts"), "utf8");
    assert.match(payme, /getPaymentMerchantSecretMaterial/);
    const click = readFileSync(path.join(apiRoot, "src/lib/clickMerchantApi.ts"), "utf8");
    assert.match(click, /getPaymentMerchantSecretMaterial/);
  });

  it("9. blank update semantics: empty string does not erase (admin route source)", () => {
    const admin = readFileSync(path.join(apiRoot, "src/routes/admin.ts"), "utf8");
    assert.match(
      admin,
      /if \(typeof body\.paymeKey === "string" && body\.paymeKey !== "••••" && body\.paymeKey\.trim\(\)\)/,
    );
    assert.match(
      admin,
      /if \(typeof body\.clickSecret === "string" && body\.clickSecret !== "••••" && body\.clickSecret\.trim\(\)\)/,
    );
  });

  it("10. synthetic migration plaintext → enc:v1", async () => {
    process.env.MERCHANT_SECRET_KEK = testKek();
    delete process.env.APP_ENV;
    delete process.env.NODE_ENV;
    const crypto = await import("../src/lib/merchantSecretCrypto.ts");
    const mig = crypto.migrateMerchantSecretValue(SYN_PAYME);
    assert.equal(mig.wasEncrypted, false);
    assert.equal(mig.changed, true);
    assert.ok(crypto.isEncryptedSecretBlob(mig.next));
    assert.ok(crypto.secretsMatch(crypto.decryptMerchantSecretFromStorage(mig.next), SYN_PAYME));

    const again = crypto.migrateMerchantSecretValue(mig.next);
    assert.equal(again.wasEncrypted, true);
    assert.ok(crypto.secretsMatch(crypto.decryptMerchantSecretFromStorage(again.next), SYN_PAYME));
  });

  it("11. production-like requires provider — fail closed, no plaintext write/fallback", async () => {
    delete process.env.MERCHANT_SECRET_KEK;
    process.env.APP_ENV = "staging";
    delete process.env.NODE_ENV;
    delete process.env.MERCHANT_SECRET_ALLOW_PLAINTEXT_READ;

    const crypto = await import("../src/lib/merchantSecretCrypto.ts");
    await assert.rejects(
      async () => crypto.encryptMerchantSecretForStorage(SYN_PAYME),
      (err: any) => err?.code === "MERCHANT_SECRET_CRYPTO_REQUIRED",
    );
    await assert.rejects(
      async () => crypto.decryptMerchantSecretFromStorage(SYN_PAYME),
      (err: any) => err?.code === "MERCHANT_SECRET_PLAINTEXT_FORBIDDEN",
    );
    await assert.rejects(
      async () => crypto.assertProductionMerchantSecretCryptoReady(),
      (err: any) => err?.code === "MERCHANT_SECRET_CRYPTO_REQUIRED",
    );
  });

  it("12–13. no hardcoded encryption key; no real secrets in fixtures/source", () => {
    const cryptoSrc = readFileSync(path.join(apiRoot, "src/lib/merchantSecretCrypto.ts"), "utf8");
    assert.doesNotMatch(cryptoSrc, /MERCHANT_SECRET_KEK\s*=\s*["'][A-Za-z0-9+/=]{16,}/);
    assert.doesNotMatch(cryptoSrc, /TODO_FAKE_KEY/);
    assert.match(cryptoSrc, /process\.env\.MERCHANT_SECRET_KEK/);
    assert.match(cryptoSrc, /No hardcoded keys/);

    const testSrc = readFileSync(path.join(apiRoot, "tests/phase12-28-secret-encryption.test.ts"), "utf8");
    assert.match(testSrc, /TEST_PAYME_SECRET_ONLY/);
    assert.match(testSrc, /TEST_CLICK_SECRET_ONLY/);
    // Fixtures must stay synthetic — no Stripe-style live key prefixes in constants.
    assert.doesNotMatch(testSrc, /["']sk_live_[A-Za-z0-9]+["']/);
    assert.doesNotMatch(testSrc, /["']pk_live_[A-Za-z0-9]+["']/);
  });

  it("14. decrypt/encrypt errors never include secret material", async () => {
    process.env.MERCHANT_SECRET_KEK = testKek();
    delete process.env.APP_ENV;
    const crypto = await import("../src/lib/merchantSecretCrypto.ts");
    try {
      crypto.decryptMerchantSecretFromStorage("enc:v1:bad.bad.bad");
      assert.fail("expected throw");
    } catch (err: any) {
      const blob = JSON.stringify({ message: err.message, code: err.code, stack: err.stack });
      assert.doesNotMatch(blob, new RegExp(SYN_PAYME));
      assert.doesNotMatch(blob, /TEST_CLICK/);
    }
  });

  it("gap matrix P0-2 moves to OPS_REQUIRED (not DONE); cloud KMS not claimed", () => {
    const matrix = path.join(repo, "docs/PRODUCTION_GAP_MATRIX.md");
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /Phase 12\.28|P0-2 Secret Encryption Closure/i);
    assert.match(doc, /P0-2[\s\S]{0,400}\*\*OPS_REQUIRED\*\*/);
    assert.doesNotMatch(doc, /P0-2[\s\S]{0,200}\|\s*\*\*DONE\*\*/);
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);

    const merchant = readFileSync(path.join(apiRoot, "src/lib/branchPaymentMerchant.ts"), "utf8");
    assert.match(merchant, /enc:v1|encryptMerchantSecretForStorage|decryptMerchantSecretFromStorage/);
    assert.match(merchant, /WeakMap/);
    assert.doesNotMatch(merchant, /aws-kms|@aws-sdk\/client-kms|@google-cloud\/kms|vault\.hashicorp/i);
  });

  it("FOM writer remains OFF; payment production flags unchanged in source", () => {
    const fom = readFileSync(path.join(apiRoot, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(fom, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);
    const readiness = readFileSync(path.join(apiRoot, "src/lib/paymentProviderReadiness.ts"), "utf8");
    assert.match(readiness, /PAYME_MERCHANT_API_ENABLED|CLICK_MERCHANT_API_ENABLED/);
  });
});
