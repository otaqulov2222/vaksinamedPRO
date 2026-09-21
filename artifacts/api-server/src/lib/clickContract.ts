/**
 * P7.6.4 — verified Click Shop API helpers (no paymentService imports).
 *
 * Contract sources (official docs.click.uz Shop API / click-api-request + click-api-error;
 * archived verified copy used when live SPA shell omitted body):
 * - Prepare action=0 / Complete action=1
 * - MD5 sign_string formulas
 * - Supplier error codes 0, -1 … -9
 * - Checkout: GET https://my.click.uz/services/pay?...
 *
 * Merchant API (outbound Auth: SHA1) / fiscal / Click Pass: CONTRACT_PENDING.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { IntentStatus } from "./paymentLifecycle";
import { flagEnabled, isProductionLike } from "./securityEnv";

/** Official Shop API actions (docs: Prepare = 0, Complete = 1). */
export const CLICK_ACTION = {
  PREPARE: 0,
  COMPLETE: 1,
} as const;

/**
 * Official supplier error codes (docs.click.uz click-api-error /
 * ERRORS RETURN BY SUPPLIERS SYSTEM).
 */
export const CLICK_ERROR = {
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INCORRECT_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  USER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  FAILED_TO_UPDATE_USER: -7,
  ERROR_IN_REQUEST: -8,
  TRANSACTION_CANCELLED: -9,
} as const;

export const CLICK_ERROR_NOTE: Record<number, string> = {
  [CLICK_ERROR.SUCCESS]: "Success",
  [CLICK_ERROR.SIGN_CHECK_FAILED]: "SIGN CHECK FAILED!",
  [CLICK_ERROR.INCORRECT_AMOUNT]: "Incorrect parameter amount",
  [CLICK_ERROR.ACTION_NOT_FOUND]: "Action not found",
  [CLICK_ERROR.ALREADY_PAID]: "Already paid",
  [CLICK_ERROR.USER_NOT_FOUND]: "User does not exist",
  [CLICK_ERROR.TRANSACTION_NOT_FOUND]: "Transaction does not exist",
  [CLICK_ERROR.FAILED_TO_UPDATE_USER]: "Failed to update user",
  [CLICK_ERROR.ERROR_IN_REQUEST]: "Error in request from click",
  [CLICK_ERROR.TRANSACTION_CANCELLED]: "Transaction cancelled",
};

export function isClickMerchantApiEnabled(): boolean {
  if (!isProductionLike()) return true;
  return flagEnabled("CLICK_MERCHANT_API_ENABLED");
}

/** Verified host from docs.click.uz click-button: https://my.click.uz/services/pay */
export function resolveClickCheckoutBaseUrl(): string | null {
  const explicit = process.env.CLICK_CHECKOUT_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (flagEnabled("CLICK_LIVE") && isProductionLike()) {
    return "https://my.click.uz/services/pay";
  }
  if (!isProductionLike()) {
    return "https://my.click.uz/services/pay";
  }
  return null;
}

/**
 * Official amount unit: soums (UZS). Intent stores integer so'm.
 * Compare via integer tiyin (×100) to avoid float drift.
 */
export function clickAmountMatchesIntentUzs(clickAmount: unknown, intentUzs: number): boolean {
  const n = typeof clickAmount === "string" ? Number(clickAmount.trim()) : Number(clickAmount);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (!Number.isFinite(intentUzs) || intentUzs <= 0) return false;
  return Math.round(n * 100) === Math.round(intentUzs * 100);
}

/** Amount string for MD5 — prefer raw string Click sent; never invent formatting. */
export function clickAmountForSign(amount: unknown): string {
  if (typeof amount === "string") return amount;
  if (typeof amount === "number" && Number.isFinite(amount)) return String(amount);
  return String(amount ?? "");
}

/**
 * Prepare: md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
 * Complete: same + merchant_prepare_id before amount
 * (Official docs.click.uz click-api-request)
 */
export function buildClickSignString(input: {
  clickTransId: string | number;
  serviceId: string | number;
  secretKey: string;
  merchantTransId: string;
  amount: unknown;
  action: number;
  signTime: string;
  merchantPrepareId?: string | number | null;
}): string {
  const parts = [
    String(input.clickTransId),
    String(input.serviceId),
    input.secretKey,
    String(input.merchantTransId),
  ];
  if (input.action === CLICK_ACTION.COMPLETE) {
    parts.push(String(input.merchantPrepareId ?? ""));
  }
  parts.push(clickAmountForSign(input.amount), String(input.action), String(input.signTime));
  return createHash("md5").update(parts.join(""), "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(String(a).toLowerCase(), "utf8");
  const bb = Buffer.from(String(b).toLowerCase(), "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyClickSignString(
  input: Parameters<typeof buildClickSignString>[0] & { signString: string },
): boolean {
  if (!input.secretKey || !input.signString) return false;
  const expected = buildClickSignString(input);
  return safeEqualHex(expected, String(input.signString).trim());
}

/** Official sign_time format: YYYY-MM-DD HH:mm:ss. Clock-skew window: CONTRACT_PENDING. */
export function isValidClickSignTime(signTime: string): boolean {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(signTime || "").trim());
}

/**
 * Checkout URL (docs.click.uz click-button):
 * https://my.click.uz/services/pay?service_id=&merchant_id=&amount=&transaction_param=
 * Optional return_url / card_type left unused unless provided (verified optional).
 * Amount format N.NN per official examples.
 */
export function buildClickCheckoutUrl(input: {
  merchantId: string;
  serviceId: string;
  /** merchant_trans_id / transaction_param — order id string */
  transactionParam: string;
  amountUzs: number;
  returnUrl?: string;
}): { checkoutUrl: string | null; code?: string; message: string; amountFormatted: string } {
  const amountInt = Math.floor(Number(input.amountUzs) || 0);
  const amountFormatted = amountInt > 0 ? `${amountInt}.00` : "0.00";
  const base = resolveClickCheckoutBaseUrl();
  if (!base) {
    return {
      checkoutUrl: null,
      code: "CONTRACT_PENDING",
      message: "Click checkout host not enabled (set CLICK_CHECKOUT_BASE_URL or CLICK_LIVE=1)",
      amountFormatted,
    };
  }
  if (!input.merchantId?.trim() || !input.serviceId?.trim()) {
    return {
      checkoutUrl: null,
      code: "NOT_CONFIGURED",
      message: "Click merchant_id and service_id required for branch",
      amountFormatted,
    };
  }
  if (amountInt <= 0 || !input.transactionParam?.trim()) {
    return {
      checkoutUrl: null,
      code: "NOT_CONFIGURED",
      message: "Click checkout requires positive amount and transaction_param",
      amountFormatted,
    };
  }
  const qs = new URLSearchParams({
    service_id: input.serviceId.trim(),
    merchant_id: input.merchantId.trim(),
    amount: amountFormatted,
    transaction_param: input.transactionParam.trim(),
  });
  if (input.returnUrl) qs.set("return_url", input.returnUrl);
  return {
    checkoutUrl: `${base}?${qs.toString()}`,
    message: "Click checkout URL (official my.click.uz/services/pay)",
    amountFormatted,
  };
}

export function mapClickCompleteToIntentStatus(clickError: number, completed: boolean): IntentStatus | null {
  if (completed && clickError === CLICK_ERROR.SUCCESS) return "PAID";
  if (clickError !== CLICK_ERROR.SUCCESS) return "FAILED";
  return null;
}
