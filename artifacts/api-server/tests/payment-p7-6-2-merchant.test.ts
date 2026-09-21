import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("P7.6.2 merchant resolver contracts (AuthZ / DTO / no PSP)", () => {
  it("G. customer DTOs strip payment secrets", () => {
    const security = readFileSync(path.join(root, "src/lib/securityEnv.ts"), "utf8");
    assert.match(security, /export function publicBranch/);
    assert.match(security, /paymeKey:\s*_pk/);
    assert.match(security, /clickSecret:\s*_cs/);
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /publicBranch/);
    const paymentsRoute = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    assert.match(paymentsRoute, /safePayment/);
    assert.doesNotMatch(paymentsRoute, /paymeKey|clickSecret/);
  });

  it("H. admin merchant write requires branches:manage + branch scope", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /requirePermission\(user,\s*"branches:manage"\)/);
    assert.match(admin, /assertBranchScope\(user,\s*id\)/);
    assert.match(admin, /toAdminBranchPaymentDto/);
    assert.doesNotMatch(admin, /maskBranchSecrets/);
  });

  it("F. logger redacts paymeKey/clickSecret explicitly", () => {
    const logger = readFileSync(path.join(root, "src/lib/logger.ts"), "utf8");
    assert.match(logger, /"paymeKey"/);
    assert.match(logger, /"clickSecret"/);
    assert.match(logger, /"payme_key"/);
    assert.match(logger, /"click_secret"/);
  });

  it("createBranchPayment uses resolver; no direct secret in return", () => {
    const payments = readFileSync(path.join(root, "src/lib/payments.ts"), "utf8");
    assert.match(payments, /resolvePaymentMerchantConfig/);
    assert.match(payments, /toPublicMerchantSummary/);
    assert.doesNotMatch(payments, /paymeKey:\s*|clickSecret:\s*/);
  });

  it("I. adapters use verified Payme/Click contract modules; resolver stays protocol-free", () => {
    const adapters = readFileSync(path.join(root, "src/lib/paymentAdapters.ts"), "utf8");
    assert.match(adapters, /buildPaymeCheckoutUrl/);
    assert.match(adapters, /buildClickCheckoutUrl/);
    assert.doesNotMatch(adapters, /fetch\(|axios/i);
    const click = adapters.slice(adapters.indexOf("class ClickAdapter"));
    assert.match(click, /buildClickCheckoutUrl/);
    const resolver = readFileSync(path.join(root, "src/lib/branchPaymentMerchant.ts"), "utf8");
    assert.doesNotMatch(resolver, /fetch\(|axios|https:\/\//i);
    const payme = readFileSync(path.join(root, "src/lib/paymeMerchantApi.ts"), "utf8");
    assert.match(payme, /CheckPerformTransaction/);
    assert.match(payme, /verifyPaymeBasicAuth/);
    const clickApi = readFileSync(path.join(root, "src/lib/clickMerchantApi.ts"), "utf8");
    assert.match(clickApi, /handleClickMerchantRequest/);
    assert.match(clickApi, /verifyClickSignString|CLICK_ACTION/);
  });
});
