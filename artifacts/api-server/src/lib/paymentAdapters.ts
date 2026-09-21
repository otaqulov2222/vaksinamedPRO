/**
 * P7.5 — provider-neutral payment adapter boundary.
 * Payme (P7.6.3) / Click (P7.6.4): verified contract modules only — no invented PSP behavior.
 * SimulateAdapter: development-only capture confirmation (gated by ALLOW_PAYMENT_SIMULATE).
 */

import type { IntentStatus } from "./paymentLifecycle";
import { buildPaymeCheckoutUrl, mapPaymeStateToIntentStatus, PAYME_STATE } from "./paymeContract";
import { buildClickCheckoutUrl, CLICK_ACTION, mapClickCompleteToIntentStatus } from "./clickContract";

export type PaymentProviderName = "payme" | "click" | "simulate" | "pay_at_branch" | "cod";

/** Stable non-cryptographic key for duplicate unknown payloads (not a PSP signature). */
function simplePayloadKey(raw: unknown): string {
  try {
    const s = typeof raw === "string" ? raw : JSON.stringify(raw ?? {});
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `h${Math.abs(h)}`;
  } catch {
    return "h0";
  }
}

export type AdapterInitiateInput = {
  intentId: number;
  orderId: number;
  amount: number;
  currency: string;
  merchantId?: string;
  /** Public merchant summary only — never includes secrets (P7.6.2). */
  merchantSummary?: {
    branchId: number;
    provider: string;
    configured: boolean;
    hasMerchantId: boolean;
    hasServiceId: boolean;
    /** Public Click service_id when provider=click — never a secret. */
    serviceId?: string | null;
  };
};

export type AdapterInitiateResult = {
  configured: boolean;
  checkoutUrl: string | null;
  message: string;
  externalRef?: string;
  code?: string;
};

export type AdapterCallbackParseResult = {
  /** When false, webhook must not mutate payment state. */
  recognized: boolean;
  externalEventId: string;
  intentId?: number;
  code?: string;
  message?: string;
};

export type AdapterNotConfiguredResult = {
  ok: false;
  code: "CONTRACT_PENDING" | "NOT_CONFIGURED" | "NOT_APPLICABLE" | "UNKNOWN_PROVIDER";
  message: string;
};

export interface PaymentProviderAdapter {
  readonly name: PaymentProviderName | string;
  initiate(input: AdapterInitiateInput): Promise<AdapterInitiateResult>;
  verifyPayment?(input: { intentId: number; externalRef?: string }): Promise<{ ok: boolean; code?: string }>;
  capture?(input: { intentId: number; amount: number; currency: string }): Promise<AdapterNotConfiguredResult | { ok: true }>;
  cancel?(input: { intentId: number }): Promise<AdapterNotConfiguredResult | { ok: true }>;
  refund?(input: {
    intentId: number;
    amount: number;
    currency: string;
  }): Promise<AdapterNotConfiguredResult | { ok: true }>;
  parseCallback(raw: unknown, headers?: Record<string, string | undefined>): Promise<AdapterCallbackParseResult>;
  /** Signature verification — only when official contract known. */
  verifyWebhookSignature?(rawBody: string, headers: Record<string, string | undefined>): Promise<boolean>;
  /** Map provider status string → internal intent status; null if unknown. */
  mapProviderStatus?(providerStatus: string): IntentStatus | null;
}

function notConfigured(
  provider: string,
  code: AdapterNotConfiguredResult["code"] = "CONTRACT_PENDING",
): AdapterNotConfiguredResult {
  return {
    ok: false,
    code,
    message: `${provider}: ${code} — no live PSP mutation`,
  };
}

export class PaymeAdapter implements PaymentProviderAdapter {
  readonly name = "payme" as const;
  async initiate(input: AdapterInitiateInput): Promise<AdapterInitiateResult> {
    if (!input.merchantId) {
      return {
        configured: false,
        checkoutUrl: null,
        message: "Payme merchant id missing — configure branch Payme keys",
        code: "NOT_CONFIGURED",
      };
    }
    if (input.merchantSummary && input.merchantSummary.configured === false) {
      return {
        configured: false,
        checkoutUrl: null,
        message: "Payme merchant not configured for branch",
        code: "NOT_CONFIGURED",
      };
    }
    const built = buildPaymeCheckoutUrl({
      merchantId: input.merchantId,
      orderId: input.orderId,
      amountUzs: input.amount,
    });
    if (!built.checkoutUrl) {
      return {
        configured: Boolean(input.merchantId),
        checkoutUrl: null,
        message: built.message,
        code: built.code || "CONTRACT_PENDING",
        externalRef: `payme:intent:${input.intentId}`,
      };
    }
    return {
      configured: true,
      checkoutUrl: built.checkoutUrl,
      message: built.message,
      externalRef: `payme:intent:${input.intentId}`,
    };
  }
  async verifyPayment(input: { intentId: number; externalRef?: string }): Promise<{ ok: boolean; code?: string }> {
    if (!input.externalRef) return { ok: false, code: "MISSING_EXTERNAL_REF" };
    return { ok: true, code: "PAYME_ATTEMPT_BOUND" };
  }
  async capture(): Promise<AdapterNotConfiguredResult> {
    // Capture is driven by inbound PerformTransaction → capturePayment (not outbound)
    return notConfigured("payme", "NOT_APPLICABLE");
  }
  async cancel(): Promise<AdapterNotConfiguredResult> {
    return notConfigured("payme", "NOT_APPLICABLE");
  }
  async refund(): Promise<AdapterNotConfiguredResult> {
    // Outbound Payme refund API not verified — use requestRefund() for internal refund rows
    return notConfigured("payme", "CONTRACT_PENDING");
  }
  async parseCallback(raw: unknown): Promise<AdapterCallbackParseResult> {
    const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const method = String(body.method || "");
    const params = (body.params && typeof body.params === "object" ? body.params : {}) as Record<string, unknown>;
    const paymeId = String(params.id || "").trim();
    if (method === "PerformTransaction" && paymeId) {
      return {
        recognized: true,
        externalEventId: `payme:PerformTransaction:${paymeId}`,
        message: "Use POST /api/payments/payme/merchant for JSON-RPC Merchant API",
      };
    }
    const candidate = String(body.id || body.event_id || "").trim();
    return {
      recognized: false,
      externalEventId: candidate || `payme-rpc:${simplePayloadKey(raw)}`,
      code: "USE_MERCHANT_ENDPOINT",
      message: "Payme Merchant API must use /api/payments/payme/merchant (JSON-RPC)",
    };
  }
  async verifyWebhookSignature(rawBody: string, headers: Record<string, string | undefined>): Promise<boolean> {
    // Basic auth is verified inside handlePaymeMerchantRpc after branch resolve — not a global HMAC.
    void rawBody;
    void headers;
    return false;
  }
  mapProviderStatus(providerStatus: string): IntentStatus | null {
    const n = Number(providerStatus);
    if (Number.isFinite(n)) return mapPaymeStateToIntentStatus(n);
    const s = String(providerStatus || "").toUpperCase();
    if (s === "PERFORMED" || s === "PAID") return mapPaymeStateToIntentStatus(PAYME_STATE.PERFORMED);
    if (s === "CREATED" || s === "PENDING") return mapPaymeStateToIntentStatus(PAYME_STATE.CREATED);
    if (s === "CANCELLED") return mapPaymeStateToIntentStatus(PAYME_STATE.CANCELLED);
    return null;
  }
}

export class ClickAdapter implements PaymentProviderAdapter {
  readonly name = "click" as const;
  async initiate(input: AdapterInitiateInput): Promise<AdapterInitiateResult> {
    if (!input.merchantId) {
      return {
        configured: false,
        checkoutUrl: null,
        message: "Click merchant id missing — configure branch Click keys",
        code: "NOT_CONFIGURED",
      };
    }
    if (input.merchantSummary && input.merchantSummary.configured === false) {
      return {
        configured: false,
        checkoutUrl: null,
        message: "Click merchant not configured for branch",
        code: "NOT_CONFIGURED",
      };
    }
    const serviceId = String(input.merchantSummary?.serviceId || "").trim();
    if (!serviceId) {
      return {
        configured: false,
        checkoutUrl: null,
        message: "Click service_id missing — configure branch clickServiceId",
        code: "NOT_CONFIGURED",
      };
    }
    const built = buildClickCheckoutUrl({
      merchantId: input.merchantId,
      serviceId,
      transactionParam: String(input.orderId),
      amountUzs: input.amount,
    });
    if (!built.checkoutUrl) {
      return {
        configured: Boolean(input.merchantId && serviceId),
        checkoutUrl: null,
        message: built.message,
        code: built.code || "CONTRACT_PENDING",
        externalRef: `click:intent:${input.intentId}`,
      };
    }
    return {
      configured: true,
      checkoutUrl: built.checkoutUrl,
      message: built.message,
      externalRef: `click:intent:${input.intentId}`,
    };
  }
  async verifyPayment(input: { intentId: number; externalRef?: string }): Promise<{ ok: boolean; code?: string }> {
    if (!input.externalRef) return { ok: false, code: "MISSING_EXTERNAL_REF" };
    return { ok: true, code: "CLICK_ATTEMPT_BOUND" };
  }
  async capture(): Promise<AdapterNotConfiguredResult> {
    // Capture is driven by inbound Complete → capturePayment (not outbound)
    return notConfigured("click", "NOT_APPLICABLE");
  }
  async cancel(): Promise<AdapterNotConfiguredResult> {
    return notConfigured("click", "NOT_APPLICABLE");
  }
  async refund(): Promise<AdapterNotConfiguredResult> {
    // Outbound Click refund API not verified in P7.6.4 — internal refund via requestRefund only
    return notConfigured("click", "CONTRACT_PENDING");
  }
  async parseCallback(raw: unknown): Promise<AdapterCallbackParseResult> {
    const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const action = Number(body.action);
    const clickTransId = String(body.click_trans_id || "").trim();
    if (
      clickTransId
      && (action === CLICK_ACTION.PREPARE || action === CLICK_ACTION.COMPLETE)
    ) {
      return {
        recognized: true,
        externalEventId: `click:action:${action}:${clickTransId}`,
        message: "Use POST /api/payments/click/merchant for Shop API Prepare/Complete",
      };
    }
    const candidate = String(body.id || body.event_id || body.external_event_id || "").trim();
    return {
      recognized: false,
      externalEventId: candidate || `click-shop:${simplePayloadKey(raw)}`,
      code: "USE_MERCHANT_ENDPOINT",
      message: "Click Shop API must use /api/payments/click/merchant (Prepare/Complete)",
    };
  }
  async verifyWebhookSignature(): Promise<boolean> {
    // MD5 sign_string is verified inside handleClickMerchantRequest after branch resolve.
    return false;
  }
  mapProviderStatus(providerStatus: string): IntentStatus | null {
    const n = Number(providerStatus);
    if (Number.isFinite(n)) {
      if (n === CLICK_ACTION.COMPLETE) return mapClickCompleteToIntentStatus(0, true);
      if (n === CLICK_ACTION.PREPARE) return "PROCESSING";
    }
    const s = String(providerStatus || "").toUpperCase();
    if (s === "COMPLETE" || s === "PAID" || s === "SUCCESS") return "PAID";
    if (s === "PREPARE" || s === "PENDING") return "PROCESSING";
    if (s === "CANCELLED" || s === "FAILED") return "FAILED";
    return null;
  }
}

/** Dev-only local checkout confirmation — never a production PSP. */
export class SimulateAdapter implements PaymentProviderAdapter {
  readonly name = "simulate" as const;
  async initiate(input: AdapterInitiateInput): Promise<AdapterInitiateResult> {
    return {
      configured: true,
      checkoutUrl: `/api/payments/simulate/checkout/${input.intentId}`,
      message: "DEVELOPMENT ONLY — simulated payment checkout",
      externalRef: `simulate:${input.intentId}`,
    };
  }
  async verifyPayment(): Promise<{ ok: boolean; code?: string }> {
    return { ok: true, code: "SIMULATE" };
  }
  async capture(): Promise<{ ok: true }> {
    return { ok: true };
  }
  async cancel(): Promise<{ ok: true }> {
    return { ok: true };
  }
  async refund(): Promise<AdapterNotConfiguredResult> {
    return notConfigured("simulate", "NOT_APPLICABLE");
  }
  async parseCallback(raw: unknown): Promise<AdapterCallbackParseResult> {
    const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const intentId = Number(body.intentId || body.payment_intent_id || 0);
    const eventId = String(body.eventId || body.external_event_id || `simulate:${intentId}:${Date.now()}`);
    return {
      recognized: intentId > 0,
      externalEventId: eventId,
      intentId: intentId > 0 ? intentId : undefined,
      message: intentId > 0 ? undefined : "simulate callback missing intentId",
    };
  }
  mapProviderStatus(providerStatus: string): IntentStatus | null {
    const s = String(providerStatus || "").toUpperCase();
    if (s === "PAID" || s === "SUCCESS") return "PAID";
    if (s === "FAILED") return "FAILED";
    if (s === "CANCELLED") return "CANCELLED";
    return null;
  }
}

export class BranchCollectAdapter implements PaymentProviderAdapter {
  readonly name: "pay_at_branch" | "cod";
  constructor(name: "pay_at_branch" | "cod") {
    this.name = name;
  }
  async initiate(input: AdapterInitiateInput): Promise<AdapterInitiateResult> {
    return {
      configured: true,
      checkoutUrl: null,
      message: `${this.name} — to‘lov filialda / kuryerda (PSP emas)`,
      externalRef: `${this.name}:${input.intentId}`,
    };
  }
  async capture(): Promise<AdapterNotConfiguredResult> {
    return notConfigured(this.name, "NOT_APPLICABLE");
  }
  async cancel(): Promise<AdapterNotConfiguredResult> {
    return notConfigured(this.name, "NOT_APPLICABLE");
  }
  async refund(): Promise<AdapterNotConfiguredResult> {
    return notConfigured(this.name, "NOT_APPLICABLE");
  }
  async parseCallback(): Promise<AdapterCallbackParseResult> {
    return {
      recognized: false,
      externalEventId: `${this.name}-noop`,
      code: "NOT_APPLICABLE",
      message: "Branch/COD has no PSP webhook",
    };
  }
  mapProviderStatus(): IntentStatus | null {
    return null;
  }
}

export function getPaymentAdapter(provider: string): PaymentProviderAdapter {
  const p = String(provider || "").toLowerCase();
  if (p === "payme") return new PaymeAdapter();
  if (p === "click") return new ClickAdapter();
  if (p === "simulate") return new SimulateAdapter();
  if (p === "pay_at_branch" || p === "cod") return new BranchCollectAdapter(p);
  return {
    name: p || "unknown",
    async initiate() {
      return {
        configured: false,
        checkoutUrl: null,
        message: `Unknown provider: ${provider}`,
        code: "UNKNOWN_PROVIDER",
      };
    },
    async capture() {
      return notConfigured(String(provider), "UNKNOWN_PROVIDER");
    },
    async cancel() {
      return notConfigured(String(provider), "UNKNOWN_PROVIDER");
    },
    async refund() {
      return notConfigured(String(provider), "UNKNOWN_PROVIDER");
    },
    async parseCallback() {
      return {
        recognized: false,
        externalEventId: `unknown:${Date.now()}`,
        code: "UNKNOWN_PROVIDER",
        message: "Unknown provider — no payment mutation",
      };
    },
    mapProviderStatus() {
      return null;
    },
  };
}
