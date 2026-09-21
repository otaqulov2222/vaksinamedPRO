/**
 * P7.6.5–P7.9 API source contracts (AuthZ, serializers, flags, no invented PSP refund).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("P7.6.5–P7.9 accelerated batch contracts", () => {
  it("P7.6.5 readiness module + fail-closed flags", () => {
    const readiness = readFileSync(path.join(root, "src/lib/paymentProviderReadiness.ts"), "utf8");
    assert.match(readiness, /assertMerchantApiFailClosedContract/);
    assert.match(readiness, /SANDBOX_E2E_PENDING/);
    assert.match(readiness, /REAL_PG_CONCURRENCY_PENDING/);
    const payme = readFileSync(path.join(root, "src/lib/paymeContract.ts"), "utf8");
    const click = readFileSync(path.join(root, "src/lib/clickContract.ts"), "utf8");
    assert.match(payme, /PAYME_MERCHANT_API_ENABLED/);
    assert.match(click, /CLICK_MERCHANT_API_ENABLED/);
    assert.match(payme, /isProductionLike\(\)/);
    assert.match(click, /isProductionLike\(\)/);
  });

  it("P7.7 requestRefund — no cashback/inventory; provider CONTRACT_PENDING", () => {
    const svc = readFileSync(path.join(root, "src/lib/paymentService.ts"), "utf8");
    assert.match(svc, /export async function requestRefund/);
    assert.match(svc, /REFUND_EXCEEDS_CAPTURE/);
    assert.match(svc, /OPEN_NOT_AUTO/);
    const refundSlice = svc.slice(svc.indexOf("export async function requestRefund"));
    assert.doesNotMatch(refundSlice.slice(0, 3500), /earnCashback|completeOrderCashback|adjustStock|consumeReservation/);
    const adapters = readFileSync(path.join(root, "src/lib/paymentAdapters.ts"), "utf8");
    const paymeRefund = adapters.slice(adapters.indexOf("class PaymeAdapter"), adapters.indexOf("class ClickAdapter"));
    assert.match(paymeRefund, /refund[\s\S]*CONTRACT_PENDING/);
    const clickRefund = adapters.slice(adapters.indexOf("class ClickAdapter"), adapters.indexOf("class SimulateAdapter"));
    assert.match(clickRefund, /refund[\s\S]*CONTRACT_PENDING/);
  });

  it("P7.8 payment status + admin refund routes AuthZ", () => {
    const payments = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    assert.match(payments, /\/payments\/intents\/:id/);
    assert.match(payments, /\/orders\/:orderId\/payment/);
    assert.match(payments, /\/admin\/payments\/intents\/:id\/refund/);
    assert.match(payments, /requireCustomer/);
    assert.match(payments, /payments:manage/);
    assert.match(payments, /assertBranchScope/);
    assert.match(payments, /serializePaymentIntentPublic/);
    assert.doesNotMatch(payments, /paymeKey|clickSecret/);
    const ser = readFileSync(path.join(root, "src/lib/paymentSerializers.ts"), "utf8");
    assert.match(ser, /serializePaymentRefundPublic/);
    assert.doesNotMatch(ser, /paymeKey|clickSecret/);
  });

  it("P7.8 admin payments list is branch-scoped", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /admin\/payments/);
    assert.match(admin, /assertBranchScope/);
    assert.match(admin, /payments:read/);
  });

  it("env example documents Click/Payme production gates", () => {
    const env = readFileSync(path.join(root, "../../.env.example"), "utf8");
    assert.match(env, /PAYME_MERCHANT_API_ENABLED/);
    assert.match(env, /CLICK_MERCHANT_API_ENABLED/);
  });
});
