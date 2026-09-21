/**
 * P7.6.3 — verified Payme contract helpers (no paymentService imports).
 * Sources: developer.help.paycom.uz Merchant API + GET cheque init.
 */

import { timingSafeEqual } from "node:crypto";
import type { IntentStatus } from "./paymentLifecycle";
import { flagEnabled, isProductionLike } from "./securityEnv";

export const PAYME_STATE = {
  CREATED: 1,
  PERFORMED: 2,
  CANCELLED: -1,
  CANCELLED_AFTER_PERFORM: -2,
} as const;

export const PAYME_ERROR = {
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  CANNOT_CANCEL_FULFILLED: -31007,
  CANNOT_PERFORM: -31008,
  INVALID_ACCOUNT: -31050,
  ACCESS_DENIED: -32504,
  METHOD_NOT_FOUND: -32601,
  INTERNAL: -32400,
} as const;

/** Server UZS integer so'm → Payme tiyin (docs: сумма в тийинах). */
export function uzsToPaymeTiyin(amountUzs: number): number {
  const n = Math.floor(Number(amountUzs) || 0);
  if (n <= 0) throw Object.assign(new Error("Invalid amount"), { code: "INVALID_AMOUNT" });
  return n * 100;
}

export function paymeTiyinToUzs(amountTiyin: number): number {
  const n = Math.floor(Number(amountTiyin) || 0);
  if (n <= 0 || n % 100 !== 0) {
    throw Object.assign(new Error("Payme amount must be positive tiyin multiple of 100 for UZS so'm"), {
      code: "INVALID_AMOUNT",
    });
  }
  return n / 100;
}

export function isPaymeMerchantApiEnabled(): boolean {
  if (!isProductionLike()) return true;
  return flagEnabled("PAYME_MERCHANT_API_ENABLED");
}

export function resolvePaymeCheckoutBaseUrl(): string | null {
  const explicit = process.env.PAYME_CHECKOUT_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (flagEnabled("PAYME_LIVE") && isProductionLike()) {
    return "https://checkout.paycom.uz";
  }
  if (!isProductionLike()) {
    return "https://checkout.test.paycom.uz";
  }
  return null;
}

export function buildPaymeCheckoutUrl(input: {
  merchantId: string;
  orderId: number;
  amountUzs: number;
  language?: "uz" | "ru" | "en";
  returnUrl?: string;
}): { checkoutUrl: string | null; code?: string; message: string; amountTiyin: number } {
  const base = resolvePaymeCheckoutBaseUrl();
  const amountTiyin = uzsToPaymeTiyin(input.amountUzs);
  if (!base) {
    return {
      checkoutUrl: null,
      code: "CONTRACT_PENDING",
      message: "Payme checkout host not enabled (set PAYME_CHECKOUT_BASE_URL or PAYME_LIVE=1)",
      amountTiyin,
    };
  }
  if (!input.merchantId?.trim()) {
    return {
      checkoutUrl: null,
      code: "NOT_CONFIGURED",
      message: "Payme merchant id missing for branch",
      amountTiyin,
    };
  }
  const parts = [
    `m=${input.merchantId.trim()}`,
    `ac.order_id=${input.orderId}`,
    `a=${amountTiyin}`,
  ];
  if (input.language) parts.push(`l=${input.language}`);
  if (input.returnUrl) parts.push(`c=${input.returnUrl}`);
  const encoded = Buffer.from(parts.join(";"), "utf8").toString("base64");
  return {
    checkoutUrl: `${base}/${encoded}`,
    message: "Payme checkout URL (official GET cheque)",
    amountTiyin,
  };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Official Basic auth: Paycom:<merchant_key> */
export function verifyPaymeBasicAuth(authorization: string | undefined, paymeKey: string): boolean {
  if (!authorization || !paymeKey) return false;
  const m = /^Basic\s+(.+)$/i.exec(authorization.trim());
  if (!m) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return false;
  }
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);
  return user === "Paycom" && safeEqual(pass, paymeKey);
}

export function mapPaymeStateToIntentStatus(state: number): IntentStatus | null {
  if (state === PAYME_STATE.PERFORMED) return "PAID";
  if (state === PAYME_STATE.CREATED) return "PROCESSING";
  if (state === PAYME_STATE.CANCELLED) return "CANCELLED";
  if (state === PAYME_STATE.CANCELLED_AFTER_PERFORM) return "REFUNDED";
  return null;
}
