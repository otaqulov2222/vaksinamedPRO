/**
 * P7.6.5 — dual-provider readiness audit (Payme + Click).
 * Does NOT enable production. Does NOT invent PSP behavior.
 * Production merchant APIs remain fail-closed unless explicit *_MERCHANT_API_ENABLED=1.
 */

import { isProductionLike, flagEnabled } from "./securityEnv";
import { isPaymeMerchantApiEnabled, resolvePaymeCheckoutBaseUrl } from "./paymeContract";
import { isClickMerchantApiEnabled, resolveClickCheckoutBaseUrl } from "./clickContract";
import { getPaymentAdapter } from "./paymentAdapters";

export type ProviderReadiness = {
  provider: "payme" | "click";
  adapterPresent: boolean;
  merchantApiEnabledNow: boolean;
  /** Contract: unset enable flag must disable merchant API in production-like. */
  productionFailClosed: boolean;
  checkoutBaseConfigured: boolean;
  checkoutHost: string | null;
  refundAdapterStatus: "CONTRACT_PENDING" | "NOT_APPLICABLE" | "UNKNOWN";
  sandboxE2e: "SANDBOX_E2E_PENDING" | "CREDENTIALS_PRESENT";
  notes: string[];
};

/** Documented fail-closed contract: missing enable flag ⇒ disabled in production-like. */
export function assertMerchantApiFailClosedContract(): {
  payme: boolean;
  click: boolean;
  ok: boolean;
} {
  const paymeDisabledWhenProdUnset =
    isProductionLike() && !flagEnabled("PAYME_MERCHANT_API_ENABLED")
      ? isPaymeMerchantApiEnabled() === false
      : true;
  const clickDisabledWhenProdUnset =
    isProductionLike() && !flagEnabled("CLICK_MERCHANT_API_ENABLED")
      ? isClickMerchantApiEnabled() === false
      : true;

  return {
    payme: paymeDisabledWhenProdUnset,
    click: clickDisabledWhenProdUnset,
    ok: paymeDisabledWhenProdUnset && clickDisabledWhenProdUnset,
  };
}

export async function auditPaymeReadiness(): Promise<ProviderReadiness> {
  const adapter = getPaymentAdapter("payme");
  const refund = await adapter.refund!({ intentId: 0, amount: 1, currency: "UZS" });
  const host = resolvePaymeCheckoutBaseUrl();
  const sandbox = Boolean(process.env.PAYME_SANDBOX_KEY?.trim())
    ? "CREDENTIALS_PRESENT"
    : "SANDBOX_E2E_PENDING";
  return {
    provider: "payme",
    adapterPresent: adapter.name === "payme",
    merchantApiEnabledNow: isPaymeMerchantApiEnabled(),
    productionFailClosed: true,
    checkoutBaseConfigured: Boolean(host),
    checkoutHost: host,
    refundAdapterStatus:
      refund.ok === false && (refund.code === "CONTRACT_PENDING" || refund.code === "NOT_APPLICABLE")
        ? refund.code
        : "UNKNOWN",
    sandboxE2e: sandbox,
    notes: [
      "Merchant API: inbound JSON-RPC; Basic Paycom:<payme_key>",
      "Capture via PerformTransaction → capturePayment",
      "Outbound refund API: CONTRACT_PENDING",
      "Production requires PAYME_MERCHANT_API_ENABLED=1",
    ],
  };
}

export async function auditClickReadiness(): Promise<ProviderReadiness> {
  const adapter = getPaymentAdapter("click");
  const refund = await adapter.refund!({ intentId: 0, amount: 1, currency: "UZS" });
  const host = resolveClickCheckoutBaseUrl();
  const sandbox =
    Boolean(process.env.CLICK_SANDBOX_SECRET?.trim())
    && Boolean(process.env.CLICK_SANDBOX_SERVICE_ID?.trim())
      ? "CREDENTIALS_PRESENT"
      : "SANDBOX_E2E_PENDING";
  return {
    provider: "click",
    adapterPresent: adapter.name === "click",
    merchantApiEnabledNow: isClickMerchantApiEnabled(),
    productionFailClosed: true,
    checkoutBaseConfigured: Boolean(host),
    checkoutHost: host,
    refundAdapterStatus:
      refund.ok === false && (refund.code === "CONTRACT_PENDING" || refund.code === "NOT_APPLICABLE")
        ? refund.code
        : "UNKNOWN",
    sandboxE2e: sandbox,
    notes: [
      "Shop API: Prepare/Complete; MD5 sign_string",
      "Capture via Complete → capturePayment",
      "Outbound refund API: CONTRACT_PENDING",
      "Production requires CLICK_MERCHANT_API_ENABLED=1",
    ],
  };
}

export async function auditDualProviderReadiness() {
  const [payme, click] = await Promise.all([auditPaymeReadiness(), auditClickReadiness()]);
  const failClosed = assertMerchantApiFailClosedContract();
  return {
    phase: "P7.6.5",
    productionLike: isProductionLike(),
    productionPspsDisabledByDefault: failClosed.ok,
    payme,
    click,
    cashbackReversalOnRefund: "OPEN",
    realPgConcurrency: "REAL_PG_CONCURRENCY_PENDING" as const,
    realPgLoadHarness: "pnpm p13:load with REAL_POSTGRES_LOAD_TEST=1" as const,
  };
}
