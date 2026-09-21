/**
 * P7.1–P7.4 / P7.7 — authoritative payment service.
 * SoT: payment_intents + payment_attempts + payment_captures + payment_refunds (+ webhook_events).
 * Legacy `payments` dual-written for API compatibility.
 * PAID does not earn cashback or consume inventory (P5/P6).
 * Refund does NOT auto-reverse cashback (P6/Q5 OPEN).
 */

import { and, eq, sql } from "drizzle-orm";
import {
  db,
  paymentAttempts,
  paymentCaptures,
  paymentIntents,
  paymentRefunds,
  paymentWebhookEvents,
  payments,
  orders,
  type PaymentAttempt,
  type PaymentCapture,
  type PaymentIntent,
  type PaymentRefund,
  type PaymentWebhookEvent,
} from "@workspace/db";
import {
  assertIntentTransition,
  intentStatusToOrderAxis,
  type IntentStatus,
} from "./paymentLifecycle";
import { getPaymentAdapter, type PaymentProviderName } from "./paymentAdapters";
import { applyOrderTransition } from "./orderTransitions";
import { allowPaymentSimulate } from "./securityEnv";
import {
  isOnlinePaymentProvider,
  resolvePaymentMerchantConfig,
  toPublicMerchantSummary,
} from "./branchPaymentMerchant";

type DbLike = typeof db;

const DEFAULT_CURRENCY = "UZS";

function badRequest(message: string, status = 400, code?: string) {
  return Object.assign(new Error(message), { status, code });
}

function withTx<T>(executor: DbLike, alreadyInTx: boolean, fn: (tx: DbLike) => Promise<T>): Promise<T> {
  if (alreadyInTx) return fn(executor);
  return (executor as typeof db).transaction(async (tx) => fn(tx as unknown as DbLike));
}

function isUniqueViolation(error: unknown): boolean {
  const err = error as { message?: string; code?: string; cause?: { message?: string; code?: string } };
  const msg = `${err?.message || error || ""} ${err?.cause?.message || ""}`.toLowerCase();
  const code = String(err?.cause?.code || err?.code || "");
  return (
    code === "23505"
    || msg.includes("unique")
    || msg.includes("duplicate")
  );
}

function normalizeCurrency(raw?: string): string {
  const c = String(raw || DEFAULT_CURRENCY).trim().toUpperCase() || DEFAULT_CURRENCY;
  if (!/^[A-Z]{3}$/.test(c)) throw badRequest("Currency noto‘g‘ri", 400, "INVALID_CURRENCY");
  return c;
}

function normalizeAmount(raw: number): number {
  const amount = Math.floor(Number(raw) || 0);
  if (amount <= 0) throw badRequest("To‘lov miqdori musbat butun son bo‘lishi kerak", 400, "INVALID_AMOUNT");
  return amount;
}

export type CreateIntentInput = {
  orderId: number;
  provider: PaymentProviderName | string;
  branchId: number;
  /** Server-authoritative amount — never trust client. */
  amount: number;
  currency?: string;
  merchantId?: string;
  idempotencyKey?: string | null;
  actor?: string;
};

export async function createPaymentIntent(
  input: CreateIntentInput,
  executor: DbLike = db,
  opts: { alreadyInTx?: boolean } = {},
): Promise<{ intent: PaymentIntent; legacyPayment: typeof payments.$inferSelect; idempotent: boolean; adapter: Awaited<ReturnType<ReturnType<typeof getPaymentAdapter>["initiate"]>> }> {
  const amount = normalizeAmount(input.amount);
  const currency = normalizeCurrency(input.currency);
  const provider = String(input.provider || "").toLowerCase();
  const idemKey = input.idempotencyKey?.trim() || null;

  return withTx(executor, Boolean(opts.alreadyInTx), async (tx) => {
    if (idemKey) {
      const existing = await tx
        .select()
        .from(paymentIntents)
        .where(eq(paymentIntents.idempotencyKey, idemKey))
        .limit(1);
      if (existing[0]) {
        const legacy = existing[0].legacyPaymentId
          ? (await tx.select().from(payments).where(eq(payments.id, existing[0].legacyPaymentId)).limit(1))[0]
          : null;
        const adapter = await getPaymentAdapter(provider).initiate({
          intentId: existing[0].id,
          orderId: existing[0].orderId,
          amount: existing[0].amount,
          currency: existing[0].currency,
          merchantId: existing[0].merchantId,
        });
        return {
          intent: existing[0],
          legacyPayment: legacy || (await ensureLegacyRow(tx, existing[0])),
          idempotent: true,
          adapter,
        };
      }
    }

    // One successful capture/PAID per order — reject new intent if order already captured
    const captured = await tx
      .select()
      .from(paymentCaptures)
      .where(eq(paymentCaptures.orderId, input.orderId))
      .limit(1);
    if (captured[0]) {
      throw badRequest("Buyurtma allaqachon to‘langan (capture mavjud)", 409, "ALREADY_CAPTURED");
    }

    const initialStatus: IntentStatus =
      provider === "payme" || provider === "click" || provider === "simulate"
        ? "REQUIRES_PAYMENT"
        : "REQUIRES_PAYMENT";

    let intent: PaymentIntent;
    try {
      const inserted = await tx
        .insert(paymentIntents)
        .values({
          orderId: input.orderId,
          provider,
          branchId: input.branchId,
          amount,
          currency,
          status: initialStatus,
          idempotencyKey: idemKey,
          merchantId: input.merchantId || "",
          meta: JSON.stringify({ actor: input.actor || "system" }),
          updatedAt: new Date(),
        })
        .returning();
      intent = inserted[0];
    } catch (error) {
      if (idemKey && isUniqueViolation(error)) {
        const raced = await tx
          .select()
          .from(paymentIntents)
          .where(eq(paymentIntents.idempotencyKey, idemKey))
          .limit(1);
        if (raced[0]) {
          const adapter = await getPaymentAdapter(provider).initiate({
            intentId: raced[0].id,
            orderId: raced[0].orderId,
            amount: raced[0].amount,
            currency: raced[0].currency,
            merchantId: raced[0].merchantId,
          });
          return {
            intent: raced[0],
            legacyPayment: await ensureLegacyRow(tx, raced[0]),
            idempotent: true,
            adapter,
          };
        }
      }
      throw error;
    }

    const legacyStatus =
      provider === "payme" || provider === "click"
        ? "pending"
        : provider === "simulate"
          ? "pending"
          : "awaiting_pos";

    const legacyRows = await tx
      .insert(payments)
      .values({
        orderId: input.orderId,
        provider,
        branchId: input.branchId,
        merchantId: input.merchantId || "",
        externalId: `intent:${intent.id}`,
        status: legacyStatus,
        amount,
        currency,
        paymentIntentId: intent.id,
      })
      .returning();

    const linked = await tx
      .update(paymentIntents)
      .set({ legacyPaymentId: legacyRows[0].id, updatedAt: new Date() })
      .where(eq(paymentIntents.id, intent.id))
      .returning();

    let merchantSummary: {
      branchId: number;
      provider: string;
      configured: boolean;
      hasMerchantId: boolean;
      hasServiceId: boolean;
      serviceId?: string | null;
    } | undefined;
    if (isOnlinePaymentProvider(provider)) {
      const merchant = await resolvePaymentMerchantConfig(
        {
          branchId: linked[0].branchId,
          provider,
          expectedBranchId: linked[0].branchId,
          requireConfigured: false,
        },
        tx,
      );
      const pub = toPublicMerchantSummary(merchant);
      merchantSummary = {
        branchId: pub.branchId,
        provider: pub.provider,
        configured: pub.configured,
        hasMerchantId: pub.hasMerchantId,
        hasServiceId: pub.hasServiceId,
        serviceId: pub.serviceId,
      };
    }

    const adapter = await getPaymentAdapter(provider).initiate({
      intentId: linked[0].id,
      orderId: linked[0].orderId,
      amount: linked[0].amount,
      currency: linked[0].currency,
      merchantId: linked[0].merchantId,
      merchantSummary,
    });

    // Local HTML checkout for online methods that are not yet contracted:
    // keep legacy checkout URL pointing at legacy payment id for Expo compatibility.
    // NOT a real Payme/Click URL — P7.6 protocol adapters will replace when contracts land.
    if ((provider === "payme" || provider === "click") && !adapter.checkoutUrl) {
      adapter.checkoutUrl = `/api/payments/${provider}/checkout/${legacyRows[0].id}`;
      if (adapter.code === "CONTRACT_PENDING") {
        adapter.message = `${adapter.message}; local sim checkout available only when ALLOW_PAYMENT_SIMULATE=1`;
      }
    }

    return { intent: linked[0], legacyPayment: legacyRows[0], idempotent: false, adapter };
  });
}

async function ensureLegacyRow(tx: DbLike, intent: PaymentIntent) {
  if (intent.legacyPaymentId) {
    const row = (await tx.select().from(payments).where(eq(payments.id, intent.legacyPaymentId)).limit(1))[0];
    if (row) return row;
  }
  const inserted = await tx
    .insert(payments)
    .values({
      orderId: intent.orderId,
      provider: intent.provider,
      branchId: intent.branchId,
      merchantId: intent.merchantId,
      externalId: `intent:${intent.id}`,
      status: "pending",
      amount: intent.amount,
      currency: intent.currency,
      paymentIntentId: intent.id,
    })
    .returning();
  await tx
    .update(paymentIntents)
    .set({ legacyPaymentId: inserted[0].id, updatedAt: new Date() })
    .where(eq(paymentIntents.id, intent.id));
  return inserted[0];
}

export async function createPaymentAttempt(
  input: {
    intentId: number;
    idempotencyKey?: string | null;
    actor?: string;
    externalRef?: string;
  },
  executor: DbLike = db,
): Promise<{ attempt: PaymentAttempt; idempotent: boolean }> {
  return withTx(executor, false, async (tx) => {
    const intent = (await tx.select().from(paymentIntents).where(eq(paymentIntents.id, input.intentId)).limit(1))[0];
    if (!intent) throw badRequest("Payment intent topilmadi", 404);

    const idemKey = input.idempotencyKey?.trim() || null;
    if (idemKey) {
      const existing = await tx
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.idempotencyKey, idemKey))
        .limit(1);
      if (existing[0]) return { attempt: existing[0], idempotent: true };
    }

    const from = intent.status as IntentStatus;
    if (from === "FAILED") {
      assertIntentTransition(from, "PROCESSING");
    } else if (from === "CREATED" || from === "REQUIRES_PAYMENT") {
      assertIntentTransition(from, "PROCESSING");
    } else if (from !== "PROCESSING") {
      throw badRequest(`Attempt uchun intent holati noto‘g‘ri: ${from}`, 409, "INVALID_PAYMENT_TRANSITION");
    }

    if (intent.status !== "PROCESSING") {
      await tx
        .update(paymentIntents)
        .set({ status: "PROCESSING", updatedAt: new Date() })
        .where(eq(paymentIntents.id, intent.id));
    }

    // Mirror: FAILED order axis → PENDING when a new attempt starts (intent SoT)
    if (from === "FAILED") {
      await applyOrderTransition(
        {
          orderId: intent.orderId,
          toPayment: "PENDING",
          actor: input.actor || "payment:attempt",
          actorType: "system",
          reason: "payment_retry_attempt",
          inventory: "none",
          alreadyInTx: true,
        },
        tx,
      );
    }

    try {
      const inserted = await tx
        .insert(paymentAttempts)
        .values({
          intentId: intent.id,
          provider: intent.provider,
          status: "STARTED",
          idempotencyKey: idemKey,
          externalRef: input.externalRef || "",
          actor: input.actor || "system",
        })
        .returning();
      return { attempt: inserted[0], idempotent: false };
    } catch (error) {
      if (idemKey && isUniqueViolation(error)) {
        const raced = await tx
          .select()
          .from(paymentAttempts)
          .where(eq(paymentAttempts.idempotencyKey, idemKey))
          .limit(1);
        if (raced[0]) return { attempt: raced[0], idempotent: true };
      }
      throw error;
    }
  });
}

export type CaptureInput = {
  intentId: number;
  /** Must match intent amount — client amount rejected. */
  amount?: number;
  currency?: string;
  attemptId?: number | null;
  actor?: string;
  /** Dev simulate only — production-like must fail closed via caller. */
  allowSimulate?: boolean;
};

/**
 * Atomic capture: one successful capture per intent AND per order (DB unique).
 * Updates intent → PAID and mirrors orders.payment_status via P5 transition.
 * Does NOT consume inventory or earn cashback.
 */
export async function capturePayment(
  input: CaptureInput,
  executor: DbLike = db,
): Promise<{ intent: PaymentIntent; capture: PaymentCapture; idempotent: boolean }> {
  return withTx(executor, false, async (tx) => {
    const locked = await tx.execute(sql`
      SELECT * FROM payment_intents WHERE id = ${input.intentId} FOR UPDATE
    `);
    const rows = Array.isArray(locked) ? locked : (locked as { rows?: Record<string, unknown>[] }).rows || [];
    const raw = rows[0] as Record<string, unknown> | undefined;
    if (!raw) throw badRequest("Payment intent topilmadi", 404);

    const intent: PaymentIntent = {
      id: Number(raw.id),
      orderId: Number(raw.order_id),
      provider: String(raw.provider),
      branchId: Number(raw.branch_id),
      amount: Number(raw.amount),
      currency: String(raw.currency || DEFAULT_CURRENCY),
      status: String(raw.status) as IntentStatus,
      idempotencyKey: raw.idempotency_key != null ? String(raw.idempotency_key) : null,
      merchantId: String(raw.merchant_id || ""),
      legacyPaymentId: raw.legacy_payment_id != null ? Number(raw.legacy_payment_id) : null,
      meta: String(raw.meta || "{}"),
      createdAt: new Date(String(raw.created_at)),
      updatedAt: new Date(String(raw.updated_at)),
    };

    const existingCap = await tx
      .select()
      .from(paymentCaptures)
      .where(eq(paymentCaptures.intentId, intent.id))
      .limit(1);
    if (existingCap[0]) {
      const fresh = (await tx.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1))[0];
      return { intent: fresh, capture: existingCap[0], idempotent: true };
    }

    const byOrder = await tx
      .select()
      .from(paymentCaptures)
      .where(eq(paymentCaptures.orderId, intent.orderId))
      .limit(1);
    if (byOrder[0]) {
      throw badRequest("Buyurtma uchun capture allaqachon mavjud", 409, "ALREADY_CAPTURED");
    }

    if (input.amount != null && normalizeAmount(input.amount) !== intent.amount) {
      throw badRequest("Capture miqdori intent miqdoriga mos kelmaydi", 409, "AMOUNT_MISMATCH");
    }
    if (input.currency != null && normalizeCurrency(input.currency) !== intent.currency) {
      throw badRequest("Capture currency intent currency ga mos kelmaydi", 409, "CURRENCY_MISMATCH");
    }

    const from = intent.status as IntentStatus;
    if (from === "FAILED") {
      throw badRequest("FAILED → PAID bevosita ruxsat etilmagan; yangi attempt kerak", 409, "INVALID_PAYMENT_TRANSITION");
    }
    if (from === "REFUNDED" || from === "CANCELLED" || from === "EXPIRED") {
      throw badRequest(`Intent holati ${from} dan capture qilib bo‘lmaydi`, 409, "INVALID_PAYMENT_TRANSITION");
    }
    if (from !== "PAID") {
      assertIntentTransition(from, "PAID");
    }

    let attemptId = input.attemptId ?? null;
    if (!attemptId) {
      try {
        const att = await tx
          .insert(paymentAttempts)
          .values({
            intentId: intent.id,
            provider: intent.provider,
            status: "SUCCEEDED",
            actor: input.actor || "system",
            idempotencyKey: `capture-attempt:intent:${intent.id}`,
          })
          .returning();
        attemptId = att[0].id;
      } catch (error) {
        if (isUniqueViolation(error)) {
          const existing = await tx
            .select()
            .from(paymentAttempts)
            .where(eq(paymentAttempts.idempotencyKey, `capture-attempt:intent:${intent.id}`))
            .limit(1);
          attemptId = existing[0]?.id ?? null;
        } else {
          throw error;
        }
      }
    }

    let capture: PaymentCapture;
    try {
      const inserted = await tx
        .insert(paymentCaptures)
        .values({
          intentId: intent.id,
          orderId: intent.orderId,
          attemptId,
          amount: intent.amount,
          currency: intent.currency,
          actor: input.actor || "system",
          meta: JSON.stringify({ source: input.allowSimulate ? "simulate" : "capture" }),
        })
        .returning();
      capture = inserted[0];
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await tx
        .select()
        .from(paymentCaptures)
        .where(eq(paymentCaptures.intentId, intent.id))
        .limit(1);
      if (raced[0]) {
        const fresh = (await tx.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1))[0];
        return { intent: fresh, capture: raced[0], idempotent: true };
      }
      throw error;
    }

    const updated = await tx
      .update(paymentIntents)
      .set({ status: "PAID", updatedAt: new Date() })
      .where(eq(paymentIntents.id, intent.id))
      .returning();

    if (intent.legacyPaymentId) {
      await tx
        .update(payments)
        .set({ status: "paid" })
        .where(eq(payments.id, intent.legacyPaymentId));
    }

    // P5 order axis only — no inventory, no cashback
    await applyOrderTransition(
      {
        orderId: intent.orderId,
        toPayment: "PAID",
        actor: input.actor || "payment:capture",
        actorType: "system",
        reason: "payment_capture",
        inventory: "none",
        alreadyInTx: true,
      },
      tx,
    );

    return { intent: updated[0], capture, idempotent: false };
  });
}

/** Mark intent FAILED with valid transition. */
export async function failPaymentIntent(
  intentId: number,
  opts: { actor?: string; reason?: string } = {},
  executor: DbLike = db,
): Promise<PaymentIntent> {
  return withTx(executor, false, async (tx) => {
    const intent = (await tx.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1))[0];
    if (!intent) throw badRequest("Payment intent topilmadi", 404);
    assertIntentTransition(intent.status as IntentStatus, "FAILED");
    const updated = await tx
      .update(paymentIntents)
      .set({
        status: "FAILED",
        updatedAt: new Date(),
        meta: JSON.stringify({ ...(safeJson(intent.meta)), failReason: opts.reason || "failed", actor: opts.actor }),
      })
      .where(eq(paymentIntents.id, intentId))
      .returning();

    try {
      const { emitAlert, ALERT } = await import("./alerts");
      emitAlert(ALERT.PAYMENT_FAILURE, {
        intentId,
        orderId: intent.orderId,
        reason: opts.reason || "failed",
      });
    } catch {
      // alert sink must not break payment path
    }

    await applyOrderTransition(
      {
        orderId: intent.orderId,
        toPayment: "FAILED",
        actor: opts.actor || "payment:fail",
        actorType: "system",
        reason: opts.reason || "payment_failed",
        inventory: "none",
        alreadyInTx: true,
      },
      tx,
    );
    return updated[0];
  });
}

/** Sum of SUCCEEDED refund amounts for an intent (integer so'm). */
export async function getSucceededRefundTotal(
  intentId: number,
  executor: DbLike = db,
): Promise<number> {
  const rows = await executor
    .select()
    .from(paymentRefunds)
    .where(and(eq(paymentRefunds.intentId, intentId), eq(paymentRefunds.status, "SUCCEEDED")));
  return rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
}

export async function getRefundableAmount(
  intentId: number,
  executor: DbLike = db,
): Promise<{
  intent: PaymentIntent;
  capture: PaymentCapture | null;
  refundedTotal: number;
  refundableAmount: number;
}> {
  const intent = (await executor.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1))[0];
  if (!intent) throw badRequest("Payment intent topilmadi", 404, "PAYMENT_INTENT_NOT_FOUND");
  const capture = (
    await executor.select().from(paymentCaptures).where(eq(paymentCaptures.intentId, intentId)).limit(1)
  )[0] || null;
  const refundedTotal = await getSucceededRefundTotal(intentId, executor);
  const captured = capture ? Number(capture.amount) : 0;
  const refundableAmount = Math.max(0, captured - refundedTotal);
  return { intent, capture, refundedTotal, refundableAmount };
}

export type RefundRequestInput = {
  intentId: number;
  /** Integer so'm. Omit / null = full remaining refundable. */
  amount?: number | null;
  idempotencyKey: string;
  actor: string;
  reason?: string;
};

/**
 * P7.7 — internal refund against a capture.
 * Provider outbound refund remains CONTRACT_PENDING (Payme/Click not inventively called).
 * Does NOT reverse cashback or mutate inventory (P6 policy OPEN).
 *
 * Schema statuses: PENDING → SUCCEEDED | FAILED (PENDING = requested/processing).
 */
export async function requestRefund(
  input: RefundRequestInput,
  executor: DbLike = db,
): Promise<{
  refund: PaymentRefund;
  intent: PaymentIntent;
  idempotent: boolean;
  providerExecution: "CONTRACT_PENDING" | "NOT_APPLICABLE" | "EXECUTED";
}> {
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (!idempotencyKey) {
    throw badRequest("Refund idempotencyKey majburiy", 400, "IDEMPOTENCY_KEY_REQUIRED");
  }

  return withTx(executor, false, async (tx) => {
    const existing = await tx
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing[0]) {
      const intent = (
        await tx.select().from(paymentIntents).where(eq(paymentIntents.id, existing[0].intentId)).limit(1)
      )[0];
      const meta = safeJson(existing[0].meta);
      const providerExecution =
        meta.providerExecution === "EXECUTED"
          || meta.providerExecution === "NOT_APPLICABLE"
          || meta.providerExecution === "CONTRACT_PENDING"
          ? meta.providerExecution
          : "CONTRACT_PENDING";
      return {
        refund: existing[0],
        intent,
        idempotent: true,
        providerExecution,
      };
    }

    const locked = await tx.execute(sql`
      SELECT * FROM payment_intents WHERE id = ${input.intentId} FOR UPDATE
    `);
    const rows = Array.isArray(locked) ? locked : (locked as { rows?: Record<string, unknown>[] }).rows || [];
    const raw = rows[0] as Record<string, unknown> | undefined;
    if (!raw) throw badRequest("Payment intent topilmadi", 404, "PAYMENT_INTENT_NOT_FOUND");

    const intent: PaymentIntent = {
      id: Number(raw.id),
      orderId: Number(raw.order_id),
      provider: String(raw.provider),
      branchId: Number(raw.branch_id),
      amount: Number(raw.amount),
      currency: String(raw.currency || DEFAULT_CURRENCY),
      status: String(raw.status) as IntentStatus,
      idempotencyKey: raw.idempotency_key != null ? String(raw.idempotency_key) : null,
      merchantId: String(raw.merchant_id || ""),
      legacyPaymentId: raw.legacy_payment_id != null ? Number(raw.legacy_payment_id) : null,
      meta: String(raw.meta || "{}"),
      createdAt: new Date(String(raw.created_at)),
      updatedAt: new Date(String(raw.updated_at)),
    };

    if (intent.status !== "PAID" && intent.status !== "PARTIALLY_REFUNDED") {
      throw badRequest(
        `Intent holati ${intent.status} dan refund qilib bo‘lmaydi`,
        409,
        "INVALID_PAYMENT_TRANSITION",
      );
    }

    const capture = (
      await tx.select().from(paymentCaptures).where(eq(paymentCaptures.intentId, intent.id)).limit(1)
    )[0];
    if (!capture) {
      throw badRequest("Capture topilmadi — refund faqat capture dan keyin", 409, "CAPTURE_REQUIRED");
    }

    const refundedTotal = await getSucceededRefundTotal(intent.id, tx);
    const refundable = Math.max(0, Number(capture.amount) - refundedTotal);
    if (refundable <= 0) {
      throw badRequest("Refundable miqdor qolmagan", 409, "NOTHING_TO_REFUND");
    }

    let amount: number;
    if (input.amount == null) {
      amount = refundable;
    } else {
      amount = normalizeAmount(input.amount);
      if (amount <= 0) throw badRequest("Refund miqdori musbat butun son bo‘lishi kerak", 400, "INVALID_AMOUNT");
      if (amount > refundable) {
        throw badRequest(
          `Refund miqdori qolgan refundable dan oshib ketdi (${refundable})`,
          409,
          "REFUND_EXCEEDS_CAPTURE",
        );
      }
    }

    // Provider outbound refund — verified contracts do not document a safe outbound refund API here.
    const adapter = getPaymentAdapter(intent.provider);
    let providerExecution: "CONTRACT_PENDING" | "NOT_APPLICABLE" | "EXECUTED" = "CONTRACT_PENDING";
    let providerRefundId = "";
    if (adapter.refund) {
      const result = await adapter.refund({
        intentId: intent.id,
        amount,
        currency: intent.currency,
      });
      if (result.ok === true) {
        providerExecution = "EXECUTED";
      } else if (result.code === "NOT_APPLICABLE") {
        providerExecution = "NOT_APPLICABLE";
      } else {
        providerExecution = "CONTRACT_PENDING";
      }
    }

    let refundRow: PaymentRefund;
    try {
      const inserted = await tx
        .insert(paymentRefunds)
        .values({
          captureId: capture.id,
          intentId: intent.id,
          orderId: intent.orderId,
          amount,
          currency: intent.currency,
          status: "SUCCEEDED",
          idempotencyKey,
          providerRefundId,
          actor: input.actor || "payment:refund",
          reason: String(input.reason || "").slice(0, 500),
          meta: JSON.stringify({
            providerExecution,
            cashbackReversal: "OPEN_NOT_AUTO",
            inventory: "none",
          }),
        })
        .returning();
      refundRow = inserted[0];
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await tx
        .select()
        .from(paymentRefunds)
        .where(eq(paymentRefunds.idempotencyKey, idempotencyKey))
        .limit(1);
      if (raced[0]) {
        const fresh = (
          await tx.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1)
        )[0];
        const meta = safeJson(raced[0].meta);
        return {
          refund: raced[0],
          intent: fresh,
          idempotent: true,
          providerExecution:
            meta.providerExecution === "EXECUTED"
            || meta.providerExecution === "NOT_APPLICABLE"
            || meta.providerExecution === "CONTRACT_PENDING"
              ? meta.providerExecution
              : "CONTRACT_PENDING",
        };
      }
      throw error;
    }

    const newRefundedTotal = refundedTotal + amount;
    const nextStatus: IntentStatus =
      newRefundedTotal >= Number(capture.amount) ? "REFUNDED" : "PARTIALLY_REFUNDED";
    assertIntentTransition(intent.status as IntentStatus, nextStatus);

    const updated = await tx
      .update(paymentIntents)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(paymentIntents.id, intent.id))
      .returning();

    if (intent.legacyPaymentId) {
      await tx
        .update(payments)
        .set({ status: nextStatus === "REFUNDED" ? "refunded" : "partially_refunded" })
        .where(eq(payments.id, intent.legacyPaymentId));
    }

    await applyOrderTransition(
      {
        orderId: intent.orderId,
        toPayment: nextStatus === "REFUNDED" ? "REFUNDED" : "PARTIALLY_REFUNDED",
        actor: input.actor || "payment:refund",
        actorType: "system",
        reason: input.reason || "payment_refund",
        inventory: "none",
        alreadyInTx: true,
      },
      tx,
    );

    return {
      refund: refundRow,
      intent: updated[0],
      idempotent: false,
      providerExecution,
    };
  });
}

/**
 * P7.8 — payment snapshot for status APIs (no secrets).
 */
export async function getPaymentSnapshot(
  intentId: number,
  executor: DbLike = db,
): Promise<{
  intent: PaymentIntent;
  attempts: PaymentAttempt[];
  capture: PaymentCapture | null;
  refunds: PaymentRefund[];
  refundableAmount: number;
  orderPaymentStatus: string | null;
}> {
  const intent = (await executor.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1))[0];
  if (!intent) throw badRequest("Payment intent topilmadi", 404, "PAYMENT_INTENT_NOT_FOUND");

  const attempts = await executor
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.intentId, intentId));
  const capture = (
    await executor.select().from(paymentCaptures).where(eq(paymentCaptures.intentId, intentId)).limit(1)
  )[0] || null;
  const refunds = await executor
    .select()
    .from(paymentRefunds)
    .where(eq(paymentRefunds.intentId, intentId));
  const refundedTotal = refunds
    .filter((r) => r.status === "SUCCEEDED")
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const refundableAmount = capture ? Math.max(0, Number(capture.amount) - refundedTotal) : 0;

  const order = (
    await executor.select().from(orders).where(eq(orders.id, intent.orderId)).limit(1)
  )[0];

  return {
    intent,
    attempts,
    capture,
    refunds,
    refundableAmount,
    orderPaymentStatus: order?.paymentStatus ?? null,
  };
}

export async function findIntentByOrderId(
  orderId: number,
  executor: DbLike = db,
): Promise<PaymentIntent | null> {
  const rows = await executor
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.orderId, orderId))
    .orderBy(sql`${paymentIntents.id} DESC`)
    .limit(1);
  return rows[0] || null;
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * P7.4 — ingest webhook event (idempotent by provider + external_event_id).
 * Unknown/unverified providers do not mutate payment state.
 */
export async function ingestWebhookEvent(
  input: {
    provider: string;
    externalEventId: string;
    payload: unknown;
  },
  executor: DbLike = db,
): Promise<{ event: PaymentWebhookEvent; idempotent: boolean }> {
  const provider = String(input.provider || "").toLowerCase();
  const externalEventId = String(input.externalEventId || "").trim();
  if (!provider || !externalEventId) {
    throw badRequest("provider va externalEventId majburiy", 400, "WEBHOOK_IDENTITY_REQUIRED");
  }

  const sanitized = sanitizeWebhookPayload(input.payload);

  try {
    const inserted = await executor
      .insert(paymentWebhookEvents)
      .values({
        provider,
        externalEventId,
        status: "RECEIVED",
        payload: sanitized,
        attemptCount: 0,
      })
      .returning();
    return { event: inserted[0], idempotent: false };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await executor
      .select()
      .from(paymentWebhookEvents)
      .where(
        and(
          eq(paymentWebhookEvents.provider, provider),
          eq(paymentWebhookEvents.externalEventId, externalEventId),
        ),
      )
      .limit(1);
    if (existing[0]) return { event: existing[0], idempotent: true };
    throw error;
  }
}

function sanitizeWebhookPayload(payload: unknown): string {
  try {
    const raw = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
    // Strip obvious secret-looking keys from stored JSON
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      for (const key of Object.keys(obj as object)) {
        if (/secret|password|key|token|authorization/i.test(key)) {
          (obj as Record<string, unknown>)[key] = "[redacted]";
        }
      }
      return JSON.stringify(obj);
    }
    return raw.slice(0, 32_000);
  } catch {
    return "{}";
  }
}

/**
 * Process a stored webhook event. Payme/Click without contract → IGNORED (no mutation).
 * Simulate path only when allowPaymentSimulate and adapter recognizes intent.
 */
export async function processWebhookEvent(
  eventId: number,
  opts: { headers?: Record<string, string | undefined> } = {},
  executor: DbLike = db,
): Promise<{ event: PaymentWebhookEvent; mutated: boolean }> {
  const event = (await executor.select().from(paymentWebhookEvents).where(eq(paymentWebhookEvents.id, eventId)).limit(1))[0];
  if (!event) throw badRequest("Webhook event topilmadi", 404);

  if (event.status === "PROCESSED" || event.status === "IGNORED") {
    return { event, mutated: false };
  }

  await executor
    .update(paymentWebhookEvents)
    .set({
      status: "PROCESSING",
      attemptCount: event.attemptCount + 1,
    })
    .where(eq(paymentWebhookEvents.id, eventId));

  const adapter = getPaymentAdapter(event.provider);
  let payload: unknown = {};
  try {
    payload = JSON.parse(event.payload || "{}");
  } catch {
    payload = {};
  }

  if (adapter.verifyWebhookSignature) {
    const ok = await adapter.verifyWebhookSignature(event.payload, opts.headers || {});
    if (!ok && (event.provider === "payme" || event.provider === "click")) {
      const updated = await executor
        .update(paymentWebhookEvents)
        .set({
          status: "IGNORED",
          lastError: "CONTRACT_PENDING_OR_SIGNATURE_UNVERIFIED",
          processedAt: new Date(),
        })
        .where(eq(paymentWebhookEvents.id, eventId))
        .returning();
      return { event: updated[0], mutated: false };
    }
  }

  const parsed = await adapter.parseCallback(payload, opts.headers);
  if (!parsed.recognized) {
    const updated = await executor
      .update(paymentWebhookEvents)
      .set({
        status: "IGNORED",
        lastError: parsed.code || parsed.message || "UNRECOGNIZED",
        processedAt: new Date(),
      })
      .where(eq(paymentWebhookEvents.id, eventId))
      .returning();
    return { event: updated[0], mutated: false };
  }

  if (event.provider === "simulate") {
    if (!allowPaymentSimulate()) {
      const updated = await executor
        .update(paymentWebhookEvents)
        .set({
          status: "IGNORED",
          lastError: "SIMULATE_DISABLED",
          processedAt: new Date(),
        })
        .where(eq(paymentWebhookEvents.id, eventId))
        .returning();
      return { event: updated[0], mutated: false };
    }
    if (parsed.intentId) {
      await capturePayment(
        {
          intentId: parsed.intentId,
          actor: "webhook:simulate",
          allowSimulate: true,
        },
        executor,
      );
      const updated = await executor
        .update(paymentWebhookEvents)
        .set({
          status: "PROCESSED",
          intentId: parsed.intentId,
          processedAt: new Date(),
          lastError: "",
        })
        .where(eq(paymentWebhookEvents.id, eventId))
        .returning();
      return { event: updated[0], mutated: true };
    }
  }

  // payme/click recognized=false normally; if somehow recognized without contract, still ignore mutation
  const updated = await executor
    .update(paymentWebhookEvents)
    .set({
      status: "IGNORED",
      lastError: "PROVIDER_CONTRACT_PENDING",
      processedAt: new Date(),
    })
    .where(eq(paymentWebhookEvents.id, eventId))
    .returning();
  return { event: updated[0], mutated: false };
}

export { intentStatusToOrderAxis, DEFAULT_CURRENCY };
