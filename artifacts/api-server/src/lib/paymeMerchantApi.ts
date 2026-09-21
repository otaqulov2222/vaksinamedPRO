/**
 * P7.6.3 — Payme (Paycom) Merchant API — verified contract only.
 *
 * Contract sources (official):
 * - https://developer.help.paycom.uz/metody-merchant-api/
 * - https://developer.help.paycom.uz/protokol-merchant-api/
 * - https://developer.help.paycom.uz/initsializatsiya-platezhey/otpravka-cheka-po-metodu-get/
 * - Sandbox: https://test.paycom.uz/
 *
 * Model: Payme calls OUR merchant endpoint (JSON-RPC 2.0 POST).
 * Auth: HTTP Basic, login "Paycom", password = branch payme_key (official templates).
 * Amount: tiyin (1 UZS = 100 tiyin) — CreateTransaction docs: "в тийинах".
 * Checkout GET: <checkout_url>/<base64(m=...;ac.order_id=...;a=...)>
 *
 * GetStatement / fiscal / Subscribe API: CONTRACT_PENDING (not required for core settle).
 * Production live host: only when PAYME_CHECKOUT_BASE_URL or PAYME_LIVE=1 set.
 */

import { and, desc, eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import {
  db,
  paymentAttempts,
  paymentCaptures,
  paymentIntents,
  paymentRefunds,
  type PaymentAttempt,
  type PaymentIntent,
} from "@workspace/db";
import {
  getPaymentMerchantSecretMaterial,
  resolvePaymentMerchantConfig,
} from "./branchPaymentMerchant";
import { capturePayment, createPaymentAttempt, failPaymentIntent } from "./paymentService";
import { assertIntentTransition, type IntentStatus } from "./paymentLifecycle";
import { applyOrderTransition } from "./orderTransitions";
import { flagEnabled, isProductionLike } from "./securityEnv";

type DbLike = typeof db;

/** Official Payme transaction states (Merchant API response examples). */
export const PAYME_STATE = {
  CREATED: 1,
  PERFORMED: 2,
  CANCELLED: -1,
  CANCELLED_AFTER_PERFORM: -2,
} as const;

/** Official error codes used below (from Merchant API method pages). */
export const PAYME_ERROR = {
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  CANNOT_CANCEL_FULFILLED: -31007,
  CANNOT_PERFORM: -31008,
  /** Account / order input errors: -31050 … -31099 */
  INVALID_ACCOUNT: -31050,
  ACCESS_DENIED: -32504,
  METHOD_NOT_FOUND: -32601,
  INTERNAL: -32400,
} as const;

type PaymeRpcRequest = {
  id?: unknown;
  method?: string;
  params?: Record<string, unknown>;
};

type PaymeRpcError = {
  code: number;
  message: { uz: string; ru: string; en: string };
  data?: string;
};

export type PaymeRpcResponse = {
  id: unknown;
  result?: unknown;
  error?: PaymeRpcError;
};

type AttemptMeta = {
  paymeId?: string;
  paymeTime?: number;
  createTime?: number;
  performTime?: number;
  cancelTime?: number;
  state?: number;
  reason?: number | null;
  amountTiyin?: number;
  orderId?: number;
};

function rpcError(
  id: unknown,
  code: number,
  message: { uz: string; ru: string; en: string },
  data?: string,
): PaymeRpcResponse {
  return { id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

function rpcResult(id: unknown, result: unknown): PaymeRpcResponse {
  return { id: id ?? null, result };
}

/** Server UZS integer so'm → Payme tiyin (verified: amount in тийинах). */
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

/** Checkout host: verified production + test hosts; live prod host gated. */
export function resolvePaymeCheckoutBaseUrl(): string | null {
  const explicit = process.env.PAYME_CHECKOUT_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (flagEnabled("PAYME_LIVE") && isProductionLike()) {
    return "https://checkout.paycom.uz";
  }
  if (!isProductionLike()) {
    return "https://checkout.test.paycom.uz";
  }
  // Production-like without explicit base / PAYME_LIVE → do not invent enablement
  return null;
}

/**
 * Build Payme checkout GET URL (official GET cheque init).
 * params: m, ac.order_id, a (tiyin); optional l, c, ct, cr left unused unless provided.
 */
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

function parseMeta(raw: string | null | undefined): AttemptMeta {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? (v as AttemptMeta) : {};
  } catch {
    return {};
  }
}

async function findAttemptByPaymeId(paymeId: string, executor: DbLike): Promise<PaymentAttempt | null> {
  const rows = await executor
    .select()
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.provider, "payme"), eq(paymentAttempts.externalRef, paymeId)))
    .limit(1);
  return rows[0] || null;
}

async function findPaymeIntentForOrder(orderId: number, executor: DbLike): Promise<PaymentIntent | null> {
  const rows = await executor
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.orderId, orderId), eq(paymentIntents.provider, "payme")))
    .orderBy(desc(paymentIntents.id))
    .limit(5);
  const open = rows.find((r) =>
    ["CREATED", "REQUIRES_PAYMENT", "PROCESSING"].includes(r.status),
  );
  return open || rows[0] || null;
}

async function resolveIntentFromAccount(
  account: Record<string, unknown> | undefined,
  executor: DbLike,
): Promise<PaymentIntent> {
  if (!account || typeof account !== "object") {
    throw Object.assign(new Error("account required"), {
      paymeCode: PAYME_ERROR.INVALID_ACCOUNT,
      data: "account",
    });
  }
  const intentId = Number(account.payment_intent_id || account.paymentIntentId || 0);
  if (intentId > 0) {
    const intent = (
      await executor.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1)
    )[0];
    if (!intent || intent.provider !== "payme") {
      throw Object.assign(new Error("payment intent not found"), {
        paymeCode: PAYME_ERROR.INVALID_ACCOUNT,
        data: "payment_intent_id",
      });
    }
    return intent;
  }
  const orderId = Number(account.order_id || account.orderId || account.order || 0);
  if (orderId > 0) {
    const intent = await findPaymeIntentForOrder(orderId, executor);
    if (!intent) {
      throw Object.assign(new Error("order not found"), {
        paymeCode: PAYME_ERROR.INVALID_ACCOUNT,
        data: "order_id",
      });
    }
    return intent;
  }
  throw Object.assign(new Error("order_id required"), {
    paymeCode: PAYME_ERROR.INVALID_ACCOUNT,
    data: "order_id",
  });
}

async function assertAuthForIntent(
  intent: PaymentIntent,
  authorization: string | undefined,
  executor: DbLike,
): Promise<void> {
  const merchant = await resolvePaymentMerchantConfig(
    {
      branchId: intent.branchId,
      provider: "payme",
      expectedBranchId: intent.branchId,
      requireConfigured: true,
    },
    executor,
  );
  const secrets = getPaymentMerchantSecretMaterial(merchant);
  if (!verifyPaymeBasicAuth(authorization, secrets.paymeKey)) {
    throw Object.assign(new Error("auth failed"), { paymeCode: PAYME_ERROR.ACCESS_DENIED });
  }
}

async function checkPerform(
  params: Record<string, unknown>,
  authorization: string | undefined,
  executor: DbLike,
) {
  const intent = await resolveIntentFromAccount(params.account as Record<string, unknown>, executor);
  await assertAuthForIntent(intent, authorization, executor);

  const amountTiyin = Math.floor(Number(params.amount) || 0);
  const expected = uzsToPaymeTiyin(intent.amount);
  if (amountTiyin !== expected) {
    throw Object.assign(new Error("amount mismatch"), {
      paymeCode: PAYME_ERROR.INVALID_AMOUNT,
      data: "amount",
    });
  }
  if (intent.status === "PAID") {
    throw Object.assign(new Error("already paid"), { paymeCode: PAYME_ERROR.CANNOT_PERFORM });
  }
  if (["CANCELLED", "EXPIRED", "REFUNDED"].includes(intent.status)) {
    throw Object.assign(new Error("intent not payable"), { paymeCode: PAYME_ERROR.CANNOT_PERFORM });
  }
  const captured = await executor
    .select()
    .from(paymentCaptures)
    .where(eq(paymentCaptures.intentId, intent.id))
    .limit(1);
  if (captured[0]) {
    throw Object.assign(new Error("already captured"), { paymeCode: PAYME_ERROR.CANNOT_PERFORM });
  }
  return { allow: true };
}

async function createTransaction(
  params: Record<string, unknown>,
  authorization: string | undefined,
  executor: DbLike,
) {
  const paymeId = String(params.id || "").trim();
  if (!paymeId) {
    throw Object.assign(new Error("id required"), { paymeCode: PAYME_ERROR.INVALID_ACCOUNT, data: "id" });
  }

  const existing = await findAttemptByPaymeId(paymeId, executor);
  if (existing) {
    const meta = parseMeta(existing.meta);
    const intent = (
      await executor.select().from(paymentIntents).where(eq(paymentIntents.id, existing.intentId)).limit(1)
    )[0];
    if (intent) await assertAuthForIntent(intent, authorization, executor);
    return {
      create_time: meta.createTime || existing.createdAt.getTime(),
      transaction: String(existing.id),
      state: meta.state ?? PAYME_STATE.CREATED,
    };
  }

  const intent = await resolveIntentFromAccount(params.account as Record<string, unknown>, executor);
  await assertAuthForIntent(intent, authorization, executor);

  const amountTiyin = Math.floor(Number(params.amount) || 0);
  const expected = uzsToPaymeTiyin(intent.amount);
  if (amountTiyin !== expected) {
    throw Object.assign(new Error("amount mismatch"), {
      paymeCode: PAYME_ERROR.INVALID_AMOUNT,
      data: "amount",
    });
  }
  if (intent.status === "PAID" || ["CANCELLED", "EXPIRED", "REFUNDED"].includes(intent.status)) {
    throw Object.assign(new Error("cannot create"), { paymeCode: PAYME_ERROR.CANNOT_PERFORM });
  }

  const paymeTime = Math.floor(Number(params.time) || Date.now());
  const createTime = Date.now();
  const { attempt } = await createPaymentAttempt(
    {
      intentId: intent.id,
      idempotencyKey: `payme:create:${paymeId}`,
      externalRef: paymeId,
      actor: "payme:CreateTransaction",
    },
    executor,
  );

  const meta: AttemptMeta = {
    paymeId,
    paymeTime,
    createTime,
    state: PAYME_STATE.CREATED,
    amountTiyin,
    orderId: intent.orderId,
    reason: null,
  };
  await executor
    .update(paymentAttempts)
    .set({
      status: "PROCESSING",
      meta: JSON.stringify(meta),
      externalRef: paymeId,
    })
    .where(eq(paymentAttempts.id, attempt.id));

  return {
    create_time: createTime,
    transaction: String(attempt.id),
    state: PAYME_STATE.CREATED,
  };
}

async function performTransaction(
  params: Record<string, unknown>,
  authorization: string | undefined,
  executor: DbLike,
) {
  const paymeId = String(params.id || "").trim();
  const attempt = await findAttemptByPaymeId(paymeId, executor);
  if (!attempt) {
    throw Object.assign(new Error("not found"), { paymeCode: PAYME_ERROR.TRANSACTION_NOT_FOUND });
  }
  const intent = (
    await executor.select().from(paymentIntents).where(eq(paymentIntents.id, attempt.intentId)).limit(1)
  )[0];
  if (!intent) {
    throw Object.assign(new Error("not found"), { paymeCode: PAYME_ERROR.TRANSACTION_NOT_FOUND });
  }
  await assertAuthForIntent(intent, authorization, executor);

  const meta = parseMeta(attempt.meta);
  if (meta.state === PAYME_STATE.PERFORMED || intent.status === "PAID") {
    return {
      transaction: String(attempt.id),
      perform_time: meta.performTime || Date.now(),
      state: PAYME_STATE.PERFORMED,
    };
  }
  if (meta.state === PAYME_STATE.CANCELLED || meta.state === PAYME_STATE.CANCELLED_AFTER_PERFORM) {
    throw Object.assign(new Error("cancelled"), { paymeCode: PAYME_ERROR.CANNOT_PERFORM });
  }

  const performTime = Date.now();
  await capturePayment(
    {
      intentId: intent.id,
      attemptId: attempt.id,
      amount: intent.amount,
      currency: intent.currency,
      actor: "payme:PerformTransaction",
    },
    executor,
  );

  const nextMeta: AttemptMeta = {
    ...meta,
    state: PAYME_STATE.PERFORMED,
    performTime,
  };
  await executor
    .update(paymentAttempts)
    .set({ status: "SUCCEEDED", meta: JSON.stringify(nextMeta) })
    .where(eq(paymentAttempts.id, attempt.id));

  return {
    transaction: String(attempt.id),
    perform_time: performTime,
    state: PAYME_STATE.PERFORMED,
  };
}

async function cancelTransaction(
  params: Record<string, unknown>,
  authorization: string | undefined,
  executor: DbLike,
) {
  const paymeId = String(params.id || "").trim();
  const reason = params.reason != null ? Number(params.reason) : null;
  const attempt = await findAttemptByPaymeId(paymeId, executor);
  if (!attempt) {
    throw Object.assign(new Error("not found"), { paymeCode: PAYME_ERROR.TRANSACTION_NOT_FOUND });
  }
  const intent = (
    await executor.select().from(paymentIntents).where(eq(paymentIntents.id, attempt.intentId)).limit(1)
  )[0];
  if (!intent) {
    throw Object.assign(new Error("not found"), { paymeCode: PAYME_ERROR.TRANSACTION_NOT_FOUND });
  }
  await assertAuthForIntent(intent, authorization, executor);

  const meta = parseMeta(attempt.meta);
  const cancelTime = Date.now();

  if (meta.state === PAYME_STATE.CANCELLED || meta.state === PAYME_STATE.CANCELLED_AFTER_PERFORM) {
    return {
      transaction: String(attempt.id),
      cancel_time: meta.cancelTime || cancelTime,
      state: meta.state,
    };
  }

  if (meta.state === PAYME_STATE.PERFORMED || intent.status === "PAID") {
    // Official CancelTransaction may cancel performed txns → state -2.
    // Map to P7 REFUNDED (payment axis only). Cashback reversal is NOT automatic (P6/P7.7).
    const nextState = PAYME_STATE.CANCELLED_AFTER_PERFORM;
    await executor
      .update(paymentAttempts)
      .set({
        status: "FAILED",
        meta: JSON.stringify({ ...meta, state: nextState, cancelTime, reason }),
      })
      .where(eq(paymentAttempts.id, attempt.id));

    if (intent.status === "PAID") {
      assertIntentTransition("PAID", "REFUNDED");
      await executor
        .update(paymentIntents)
        .set({ status: "REFUNDED", updatedAt: new Date() })
        .where(eq(paymentIntents.id, intent.id));
      await applyOrderTransition(
        {
          orderId: intent.orderId,
          toPayment: "REFUNDED",
          actor: "payme:CancelTransaction",
          actorType: "system",
          reason: "payme_cancel_after_perform",
          inventory: "none",
        },
        executor,
      );
      // P7.7 — record payment_refunds row (provider inbound cancel; cashback still OPEN)
      const cap = (
        await executor.select().from(paymentCaptures).where(eq(paymentCaptures.intentId, intent.id)).limit(1)
      )[0];
      if (cap) {
        try {
          await executor.insert(paymentRefunds).values({
            captureId: cap.id,
            intentId: intent.id,
            orderId: intent.orderId,
            amount: cap.amount,
            currency: cap.currency,
            status: "SUCCEEDED",
            idempotencyKey: `payme:cancel-after-perform:${paymeId}`,
            providerRefundId: paymeId,
            actor: "payme:CancelTransaction",
            reason: "payme_cancel_after_perform",
            meta: JSON.stringify({
              providerExecution: "INBOUND_CANCEL",
              cashbackReversal: "OPEN_NOT_AUTO",
            }),
          });
        } catch {
          // Idempotent — unique key already recorded
        }
      }
    }

    return {
      transaction: String(attempt.id),
      cancel_time: cancelTime,
      state: nextState,
    };
  }

  // Unperformed cancel → state -1; fail intent (no inventory/cashback)
  await executor
    .update(paymentAttempts)
    .set({
      status: "FAILED",
      meta: JSON.stringify({
        ...meta,
        state: PAYME_STATE.CANCELLED,
        cancelTime,
        reason,
      }),
    })
    .where(eq(paymentAttempts.id, attempt.id));

  if (["CREATED", "REQUIRES_PAYMENT", "PROCESSING"].includes(intent.status)) {
    try {
      await failPaymentIntent(intent.id, { actor: "payme:CancelTransaction", reason: "payme_cancel" }, executor);
    } catch {
      await executor
        .update(paymentIntents)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(eq(paymentIntents.id, intent.id));
    }
  }

  return {
    transaction: String(attempt.id),
    cancel_time: cancelTime,
    state: PAYME_STATE.CANCELLED,
  };
}

async function checkTransaction(
  params: Record<string, unknown>,
  authorization: string | undefined,
  executor: DbLike,
) {
  const paymeId = String(params.id || "").trim();
  const attempt = await findAttemptByPaymeId(paymeId, executor);
  if (!attempt) {
    throw Object.assign(new Error("not found"), { paymeCode: PAYME_ERROR.TRANSACTION_NOT_FOUND });
  }
  const intent = (
    await executor.select().from(paymentIntents).where(eq(paymentIntents.id, attempt.intentId)).limit(1)
  )[0];
  if (!intent) {
    throw Object.assign(new Error("not found"), { paymeCode: PAYME_ERROR.TRANSACTION_NOT_FOUND });
  }
  await assertAuthForIntent(intent, authorization, executor);
  const meta = parseMeta(attempt.meta);
  return {
    create_time: meta.createTime || attempt.createdAt.getTime(),
    perform_time: meta.performTime || 0,
    cancel_time: meta.cancelTime || 0,
    transaction: String(attempt.id),
    state: meta.state ?? PAYME_STATE.CREATED,
    reason: meta.reason ?? null,
  };
}

/**
 * Handle inbound Payme Merchant API JSON-RPC request.
 * Does not invent GetStatement — returns METHOD_NOT_FOUND.
 */
export async function handlePaymeMerchantRpc(
  body: unknown,
  authorization: string | undefined,
  executor: DbLike = db,
): Promise<PaymeRpcResponse> {
  if (!isPaymeMerchantApiEnabled()) {
    return rpcError(null, PAYME_ERROR.INTERNAL, {
      uz: "Payme Merchant API o‘chirilgan",
      ru: "Payme Merchant API отключён",
      en: "Payme Merchant API disabled",
    });
  }

  const req = (body && typeof body === "object" ? body : {}) as PaymeRpcRequest;
  const id = req.id ?? null;
  const method = String(req.method || "");
  const params = (req.params && typeof req.params === "object" ? req.params : {}) as Record<string, unknown>;

  try {
    switch (method) {
      case "CheckPerformTransaction":
        return rpcResult(id, await checkPerform(params, authorization, executor));
      case "CreateTransaction":
        return rpcResult(id, await createTransaction(params, authorization, executor));
      case "PerformTransaction":
        return rpcResult(id, await performTransaction(params, authorization, executor));
      case "CancelTransaction":
        return rpcResult(id, await cancelTransaction(params, authorization, executor));
      case "CheckTransaction":
        return rpcResult(id, await checkTransaction(params, authorization, executor));
      case "GetStatement":
        return rpcError(id, PAYME_ERROR.METHOD_NOT_FOUND, {
          uz: "GetStatement CONTRACT_PENDING",
          ru: "GetStatement CONTRACT_PENDING",
          en: "GetStatement CONTRACT_PENDING",
        });
      default:
        return rpcError(id, PAYME_ERROR.METHOD_NOT_FOUND, {
          uz: "Metod topilmadi",
          ru: "Метод не найден",
          en: "Method not found",
        });
    }
  } catch (error) {
    const paymeCode = Number((error as { paymeCode?: number }).paymeCode || PAYME_ERROR.INTERNAL);
    const data = (error as { data?: string }).data;
    const msg = String((error as Error).message || "error");
    // Never echo secrets
    const safe = /key|secret|password|authorization/i.test(msg) ? "request rejected" : msg;
    return rpcError(
      id,
      paymeCode,
      { uz: safe, ru: safe, en: safe },
      data,
    );
  }
}

export function mapPaymeStateToIntentStatus(state: number): IntentStatus | null {
  if (state === PAYME_STATE.PERFORMED) return "PAID";
  if (state === PAYME_STATE.CREATED) return "PROCESSING";
  if (state === PAYME_STATE.CANCELLED) return "CANCELLED";
  if (state === PAYME_STATE.CANCELLED_AFTER_PERFORM) return "REFUNDED";
  return null;
}
