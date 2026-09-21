import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.resolve(root, "../../docs");

describe("P7.1–P7.5 payment contracts (AuthZ / secrets / axes / adapters)", () => {
  it("P7.0 lock retained", () => {
    assert.ok(existsSync(path.join(docs, "PHASE_3_3_P7_PAYMENT_ARCHITECTURE_LOCK.md")));
  });

  it("P. AuthZ — delivery/payment admin paths remain gated; simulate gated", () => {
    const payments = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    const deliveries = readFileSync(path.join(root, "src/routes/deliveries.ts"), "utf8");
    assert.match(payments, /requireAdmin\(req\)/);
    assert.match(deliveries, /requirePermission\(admin,\s*"delivery:update"\)/);
    assert.match(payments, /allowPaymentSimulate/);
    assert.match(payments, /Payment simulation is disabled/);
    assert.match(deliveries, /assertBranchScope/);
  });

  it("Q. secrets not exposed in customer payment DTO path", () => {
    const payments = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    const lib = readFileSync(path.join(root, "src/lib/payments.ts"), "utf8");
    // Route response must not include key/secret fields
    assert.match(payments, /safePayment/);
    assert.doesNotMatch(payments, /paymeKey|clickSecret/);
    // Secrets resolved only via branchPaymentMerchant — never returned from facade
    assert.match(lib, /resolvePaymentMerchantConfig|toPublicMerchantSummary/);
    assert.doesNotMatch(lib, /paymeKey:\s*|clickSecret:\s*|return \{[^}]*paymeKey/);
  });

  it("M. payment simulate does not earn cashback", () => {
    const payments = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    const simulate = payments.slice(
      payments.indexOf("simulate-success"),
      payments.indexOf("payme/webhook"),
    );
    assert.doesNotMatch(simulate, /completeOrderCashback|earnOrderCashback/);
  });

  it("N. payment simulate does not consume inventory", () => {
    const payments = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    const simulate = payments.slice(
      payments.indexOf("simulate-success"),
      payments.indexOf("payme/webhook"),
    );
    assert.doesNotMatch(simulate, /consumeReservation|inventory:\s*"consume"/);
  });

  it("O. P5 axes — capture uses inventory none", () => {
    const svc = readFileSync(path.join(root, "src/lib/paymentService.ts"), "utf8");
    assert.match(svc, /inventory:\s*"none"/);
    assert.match(svc, /applyOrderTransition/);
    assert.doesNotMatch(svc, /earnOrderCashback|completeOrderCashback/);
  });

  it("L. adapters use verified Payme/Click contract modules without fake success", () => {
    const adapters = readFileSync(path.join(root, "src/lib/paymentAdapters.ts"), "utf8");
    assert.match(adapters, /class PaymeAdapter/);
    assert.match(adapters, /class ClickAdapter/);
    assert.match(adapters, /buildPaymeCheckoutUrl/);
    assert.match(adapters, /buildClickCheckoutUrl/);
    assert.doesNotMatch(adapters, /checkoutUrl:\s*`https:\/\/payme\.uz|merchant_secret|hardcoded/i);
    const click = adapters.slice(adapters.indexOf("class ClickAdapter"));
    assert.match(click, /buildClickCheckoutUrl/);
    assert.match(click, /USE_MERCHANT_ENDPOINT|NOT_APPLICABLE/);
  });

  it("I. webhook ingest is idempotent and payme/click do not invent signatures", () => {
    const svc = readFileSync(path.join(root, "src/lib/paymentService.ts"), "utf8");
    const routes = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    assert.match(svc, /ingestWebhookEvent/);
    assert.match(svc, /processWebhookEvent/);
    assert.match(svc, /\[redacted\]/);
    assert.match(routes, /ingestWebhookEvent/);
    assert.match(routes, /mutated:\s*false|mutated: processed\.mutated/);
  });

  it("R. production simulation disabled helpers used", () => {
    const payments = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    assert.match(payments, /isProductionLike\(\)/);
    assert.match(payments, /allowPaymentSimulate\(\)/);
  });
});
