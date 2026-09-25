/**
 * Admin Phase 6 — application open-item hardening contracts (audit-locked).
 * Does not invent KMS encryption, cashback correction policy, or promo pricing engine.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const dbRoot = path.resolve(root, "../../lib/db/src");

describe("Admin Phase 6 — secret encryption at rest", () => {
  it("branch merchant secret columns remain text; app encrypts enc:v1; cloud KMS still OPS", () => {
    const schema = readFileSync(path.join(dbRoot, "schema/branches.ts"), "utf8");
    assert.match(schema, /paymeKey:\s*text\("payme_key"\)/);
    assert.match(schema, /clickSecret:\s*text\("click_secret"\)/);

    const merchant = readFileSync(path.join(root, "src/lib/branchPaymentMerchant.ts"), "utf8");
    assert.match(merchant, /SECRET_ENCRYPTION_AT_REST_FOLLOW_UP/);
    assert.match(merchant, /Cloud KMS\/Vault still OPS_REQUIRED|enc:v1/i);
    assert.match(merchant, /encryptMerchantSecretForStorage|decryptMerchantSecretFromStorage/);
    // Homemade cipher stays in merchantSecretCrypto — not inline in resolver.
    assert.doesNotMatch(merchant, /createCipheriv|aes-256-gcm|scryptSync\(.*payme/i);

    const crypto = readFileSync(path.join(root, "src/lib/merchantSecretCrypto.ts"), "utf8");
    assert.match(crypto, /enc:v1:|CIPHERTEXT_PREFIX/);
    assert.match(crypto, /MERCHANT_SECRET_KEK/);
    assert.doesNotMatch(crypto, /aws-kms|@aws-sdk\/client-kms|@google-cloud\/kms/i);
  });

  it("API DTOs mask branch secrets; WeakMap holds secret material; audit has no secret values", () => {
    const merchant = readFileSync(path.join(root, "src/lib/branchPaymentMerchant.ts"), "utf8");
    assert.match(merchant, /toAdminBranchPaymentDto|hasPayme|••••/);
    assert.match(merchant, /WeakMap/);
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /toAdminBranchPaymentDto/);
    assert.match(admin, /prepareMerchantSecretForStorage/);
    assert.match(admin, /paymeCredentialUpdated/);
    assert.match(admin, /clickCredentialUpdated/);
    assert.doesNotMatch(admin, /payload: JSON\.stringify\(\{[^}]*paymeKey:/);
  });

  it("admin/customer passwords use scrypt hash — not reversible encryption of plaintext password column", () => {
    const password = readFileSync(path.join(dbRoot, "password.ts"), "utf8");
    assert.match(password, /scryptSync/);
    const adminSchema = readFileSync(path.join(dbRoot, "schema/admin.ts"), "utf8");
    assert.match(adminSchema, /passwordHash:\s*text\("password_hash"\)/);
    assert.doesNotMatch(adminSchema, /password:\s*text\("password"\)/);
  });
});

describe("Admin Phase 6 — cashback correction", () => {
  it("no admin route grants/deducts cashback by direct balance edit", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.doesNotMatch(admin, /update\(cashbackAccounts\)|\.set\(\{[^}]*balance/);
    assert.doesNotMatch(admin, /earnCashback|useCashback|adjustCashback|grantCashback/);
    const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
    const cashback = readFileSync(path.join(adminWeb, "pages/CashbackPage.tsx"), "utf8");
    assert.doesNotMatch(app, /cashback.?correct|grant cashback|adjust balance|manual.?earn/i);
    assert.doesNotMatch(cashback, /cashback.?correct|grant cashback|adjust balance|manual.?earn/i);
  });

  it("order-scoped refund-cashback exists; ADJUSTMENT is seed/integrity — not admin correction UI", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /\/orders\/:id\/refund-cashback/);
    assert.match(orders, /refundOrderCashback/);
    const finance = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
    assert.match(finance, /export async function reverseCashbackEntry/);
    assert.match(finance, /export async function refundOrderCashback/);
    // No public adminAdjustCashback export
    assert.doesNotMatch(finance, /export async function (adminAdjust|grantCashback|correctCashback)/);
  });
});

describe("Admin Phase 6 — promo ↔ pricing", () => {
  it("checkout/POS ignore client discount; promos table not used in order pricing", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /void req\.body\.discount/);
    assert.match(orders, /void req\.body\.total/);
    assert.match(orders, /void req\.body\.cashbackAmount/);
    assert.doesNotMatch(orders, /from\(promos\)|promoId|applyPromo/);
    const pos = readFileSync(path.join(root, "src/lib/pos.ts"), "utf8");
    assert.doesNotMatch(pos, /promos|promoId|discount/);
  });

  it("admin promos UI declares PROMO_MARKETING_ONLY", () => {
    const promos = readFileSync(path.join(adminWeb, "pages/PromosPage.tsx"), "utf8");
    assert.match(promos, /PROMO_MARKETING_ONLY/);
    assert.match(promos, /Marketing|marketing|narx katalogda/i);
    assert.doesNotMatch(promos, /discount applied|chegirma qo‘llandi|narx kamaytirildi/i);
  });

  it("admin promos API is read-only (no create/update pricing engine)", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/promos[\s\S]*?requirePermission\(user,\s*"promos:read"\)/);
    assert.doesNotMatch(admin, /router\.(post|patch|put)\("\/admin\/promos/);
  });
});

describe("Admin Phase 6 — FOM unchanged", () => {
  it("inventory writer OFF; FOM_POS CONTRACT_PENDING; confirm-pos ORDER identity", () => {
    const adapter = readFileSync(path.join(root, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(adapter, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);
    const integ = readFileSync(path.join(root, "src/routes/integrations.ts"), "utf8");
    assert.match(integ, /inventoryWriter:\s*"OFF"/);
    assert.match(integ, /fomPosContract:\s*"CONTRACT_PENDING"/);
    assert.match(integ, /confirmPos:\s*"ORDER"/);
    assert.match(integ, /order:\{orders\.id\}/);
  });
});

describe("Admin Phase 6 — cashback engine lock", () => {
  it("30% + earn/use/reversal surface unchanged", () => {
    const cashback = readFileSync(path.join(root, "src/lib/cashback.ts"), "utf8");
    assert.match(cashback, /DEFAULT_MAX_SPEND_RATIO\s*=\s*0\.3/);
    const finance = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
    assert.match(finance, /export async function earnCashback/);
    assert.match(finance, /export async function useCashback/);
    assert.match(finance, /export async function reverseCashbackEntry/);
  });
});
