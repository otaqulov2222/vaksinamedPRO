import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

const ENV_KEYS = [
  "APP_ENV",
  "NODE_ENV",
  "ALLOW_OTP_DEV_BYPASS",
  "ALLOW_PAYMENT_SIMULATE",
  "ALLOW_TELEGRAM_AUTO_PROVISION",
  "ALLOW_TELEGRAM_HEADER_AUTH",
  "ESKIZ_EMAIL",
  "FOM_WEBHOOK_SECRET",
  "ADMIN_SECRET",
  "CUSTOMER_SECRET",
  "POS_SECRET",
] as const;

const saved: Record<string, string | undefined> = {};

function snapEnv() {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
}

function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

async function loadSecurity() {
  // Fresh module each time so secret constants aren't an issue for env helpers
  return import(`../src/lib/securityEnv.ts?t=${Date.now()}-${Math.random()}`);
}

describe("P2 security env gates", () => {
  beforeEach(() => {
    snapEnv();
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => restoreEnv());

  it("production rejects OTP bypass and payment simulate by default", async () => {
    process.env.APP_ENV = "production";
    const s = await loadSecurity();
    assert.equal(s.isProductionLike(), true);
    assert.equal(s.allowOtpDevBypass(), false);
    assert.equal(s.allowOtpDevCodeInResponse(), false);
    assert.equal(s.allowPaymentSimulate(), false);
    assert.equal(s.allowTelegramAutoProvision(), false);
    assert.equal(s.allowTelegramHeaderAuth(), false);
  });

  it("non-prod allows telegram header lookup but not auto-provision by default", async () => {
    process.env.APP_ENV = "development";
    const s = await loadSecurity();
    assert.equal(s.allowTelegramHeaderAuth(), true);
    assert.equal(s.allowTelegramAutoProvision(), false);
  });

  it("devCode only when non-prod and ALLOW_OTP_DEV_BYPASS=1", async () => {
    process.env.APP_ENV = "development";
    process.env.ALLOW_OTP_DEV_BYPASS = "1";
    const s = await loadSecurity();
    assert.equal(s.allowOtpDevCodeInResponse(), true);
    assert.equal(s.allowOtpDevBypass(), true);
  });

  it("production-like ignores ALLOW_OTP_DEV_BYPASS", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_OTP_DEV_BYPASS = "1";
    const s = await loadSecurity();
    assert.equal(s.allowOtpDevBypass(), false);
    assert.equal(s.allowOtpDevCodeInResponse(), false);
  });

  it("missing HMAC secret fails closed in production", async () => {
    process.env.APP_ENV = "production";
    const s = await loadSecurity();
    assert.throws(() => s.requireConfiguredSecret("ADMIN_SECRET"));
  });

  it("missing POS secret fails closed in production", async () => {
    process.env.APP_ENV = "staging";
    const s = await loadSecurity();
    assert.throws(() => s.requireConfiguredSecret("POS_SECRET"));
  });

  it("dev may use fallback secrets", async () => {
    process.env.APP_ENV = "development";
    const s = await loadSecurity();
    assert.equal(s.requireConfiguredSecret("ADMIN_SECRET", "dev-only"), "dev-only");
  });

  it("FOM webhook requires secret in production", async () => {
    process.env.APP_ENV = "production";
    const s = await loadSecurity();
    assert.throws(() => s.assertFomWebhookAuthorized(undefined));
    process.env.FOM_WEBHOOK_SECRET = "fom-test-secret";
    const s2 = await loadSecurity();
    assert.throws(() => s2.assertFomWebhookAuthorized("wrong"));
    assert.doesNotThrow(() => s2.assertFomWebhookAuthorized("fom-test-secret"));
  });

  it("payment simulate only with explicit non-prod flag", async () => {
    process.env.APP_ENV = "development";
    let s = await loadSecurity();
    assert.equal(s.allowPaymentSimulate(), false);
    process.env.ALLOW_PAYMENT_SIMULATE = "1";
    s = await loadSecurity();
    assert.equal(s.allowPaymentSimulate(), true);
  });

  it("strips passwordHash from admin customer DTO", async () => {
    const s = await loadSecurity();
    const out = s.publicAdminCustomer({ id: 1, phone: "+998", passwordHash: "x", balance: 1 });
    assert.equal("passwordHash" in out, false);
    assert.equal(out.balance, 1);
  });

  it("publicBranch omits payment secrets", async () => {
    const s = await loadSecurity();
    const out = s.publicBranch({
      id: 1,
      name: "Test",
      paymeMerchantId: "m1",
      paymeKey: "SECRETKEY",
      clickMerchantId: "c1",
      clickSecret: "CLICKSECRET",
    });
    assert.equal("paymeKey" in out, false);
    assert.equal("clickSecret" in out, false);
    assert.equal(out.hasPayme, true);
    assert.equal(out.hasClick, true);
  });

  it("maskBranchSecrets never returns raw secrets", async () => {
    const s = await loadSecurity();
    const out = s.maskBranchSecrets({ paymeKey: "abc", clickSecret: "xyz", name: "B" });
    assert.equal(out.paymeKey, "••••");
    assert.equal(out.clickSecret, "••••");
  });

  it("cashier is not HQ role", async () => {
    const s = await loadSecurity();
    assert.equal(s.isHqAdminRole("cashier"), false);
    assert.equal(s.isHqAdminRole("super_admin"), true);
  });
});
