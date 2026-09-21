import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("P2 security source contracts", () => {
  it("simulate-success is gated by allowPaymentSimulate", () => {
    const src = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    assert.match(src, /allowPaymentSimulate/);
    assert.match(src, /Payment simulation is disabled/);
  });

  it("delivery status requires admin + permission", () => {
    const src = readFileSync(path.join(root, "src/routes/deliveries.ts"), "utf8");
    assert.match(src, /requireAdmin\(req\)/);
    assert.match(src, /delivery:update/);
    assert.match(src, /deliveries\/:orderId\/status/);
  });

  it("FOM sale requires webhook auth", () => {
    const src = readFileSync(path.join(root, "src/routes/integrations.ts"), "utf8");
    assert.match(src, /assertFomWebhookAuthorized/);
  });

  it("confirm-pos requires admin without optional catch", () => {
    const src = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(src, /confirm-pos/);
    assert.doesNotMatch(src, /requireAdmin\(req\)\.catch/);
  });

  it("OTP bypass uses allowOtpDevBypass not bare ESKIZ check", () => {
    const src = readFileSync(path.join(root, "src/lib/auth.ts"), "utf8");
    assert.match(src, /allowOtpDevBypass/);
    assert.doesNotMatch(src, /!process\.env\.ESKIZ_EMAIL && safeCode === "000000"/);
  });

  it("SMS does not log OTP in production path", () => {
    const src = readFileSync(path.join(root, "src/lib/sms.ts"), "utf8");
    assert.match(src, /allowOtpConsoleLog/);
    assert.match(src, /isProductionLike/);
    assert.match(src, /message redacted/);
  });

  it("admin customers strip passwordHash", () => {
    const src = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(src, /publicAdminCustomer/);
    assert.match(src, /customers:read|requirePermission/);
  });

  it("POS secret uses fail-closed helper", () => {
    const src = readFileSync(path.join(root, "src/lib/pos.ts"), "utf8");
    assert.match(src, /requireConfiguredSecret/);
  });
});

describe("P2 env matrix documentation", () => {
  beforeEach(() => {});
  afterEach(() => {});

  it("example env documents P2 flags", () => {
    const example = readFileSync(path.join(root, "../../.env.example"), "utf8");
    assert.match(example, /ALLOW_OTP_DEV_BYPASS/);
    assert.match(example, /ALLOW_PAYMENT_SIMULATE/);
    assert.match(example, /FOM_WEBHOOK_SECRET/);
    assert.match(example, /ALLOW_TELEGRAM/);
  });
});
