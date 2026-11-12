/**
 * Compatibility facade over P7 paymentService.
 * createBranchPayment dual-writes payment_intents + legacy payments.
 * markPaymentPaid captures via authoritative intent (one capture / order).
 * Merchant secrets resolved only via branchPaymentMerchant (P7.6.2).
 */

import { eq } from "drizzle-orm";
import { db, payments, paymentIntents, orders, branches, type Branch } from "@workspace/db";
import {
  createPaymentIntent,
  capturePayment,
  createPaymentAttempt,
  findIntentByOrderId,
} from "./paymentService";
import { getPaymentAdapter } from "./paymentAdapters";
import {
  isOnlinePaymentProvider,
  resolvePaymentMerchantConfig,
  toPublicMerchantSummary,
} from "./branchPaymentMerchant";

function paymentError(message: string, status = 400, code?: string) {
  return Object.assign(new Error(message), { status, code });
}

export async function createBranchPayment(options: {
  orderId: number;
  branch: Branch;
  provider: "payme" | "click" | "pay_at_branch" | "cod" | "simulate";
  amount: number;
  currency?: string;
  idempotencyKey?: string | null;
}) {
  const { orderId, branch, provider, amount } = options;

  let merchantId = branch.code;
  let configured = true;
  let merchantSummary: ReturnType<typeof toPublicMerchantSummary> | null = null;

  if (isOnlinePaymentProvider(provider)) {
    // Resolve for THIS branch only — never another branch's merchant
    const merchant = await resolvePaymentMerchantConfig({
      branchId: branch.id,
      provider,
      expectedBranchId: branch.id,
      requireConfigured: false,
    });
    merchantId = merchant.merchantId || "";
    configured = merchant.configured;
    merchantSummary = toPublicMerchantSummary(merchant);
  }

  const idempotencyKey =
    options.idempotencyKey?.trim() ||
    `order:${orderId}:provider:${provider}`;

  const result = await createPaymentIntent({
    orderId,
    provider,
    branchId: branch.id,
    amount,
    currency: options.currency || "UZS",
    merchantId: merchantId || "",
    idempotencyKey,
    actor: "checkout",
  });

  // Preserve legacy pending_keys when merchant keys missing (no secrets exposed).
  if (
    !configured
    && isOnlinePaymentProvider(provider)
    && result.legacyPayment.status !== "paid"
  ) {
    const updated = await db
      .update(payments)
      .set({ status: "pending_keys" })
      .where(eq(payments.id, result.legacyPayment.id))
      .returning();
    if (updated[0]) result.legacyPayment = updated[0];
  }

  // Real Payme/Click host only — never fall back to /api/payments/{payme|click}/checkout sim-path.
  const checkoutUrl = result.adapter.checkoutUrl || null;

  return {
    payment: result.legacyPayment,
    intent: result.intent,
    configured: configured && Boolean(checkoutUrl),
    checkoutUrl,
    message: checkoutUrl
      ? (result.adapter.message || `${branch.name} kassasining ${provider.toUpperCase()} to‘lovi`)
      : configured
        ? (result.adapter.message || `${provider.toUpperCase()} checkout host sozlanmagan`)
        : `${branch.name} uchun ${provider.toUpperCase()} kalitlari hali kiritilmagan. Admin paneldan merchant ID/key qo‘shing.`,
    idempotent: result.idempotent,
    adapterCode: result.adapter.code,
    // Public metadata only — never secrets
    merchant: merchantSummary,
  };
}

/**
 * Customer retry after abandoned/failed online checkout.
 * Re-opens adapter checkout URL; never invents capture or sim-path.
 */
export async function retryOrderOnlinePayment(options: {
  orderId: number;
  customerId: number;
}) {
  const { orderId, customerId } = options;
  const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!order || order.customerId !== customerId) {
    throw paymentError("Buyurtma topilmadi", 404, "ORDER_NOT_FOUND");
  }
  if (order.fulfillmentStatus === "CANCELLED") {
    throw paymentError("Bekor qilingan buyurtmani to‘lab bo‘lmaydi", 409, "ORDER_CANCELLED");
  }
  const provider = String(order.paymentMethod || "").toLowerCase();
  if (provider !== "payme" && provider !== "click") {
    throw paymentError("Faqat Payme/Click uchun qayta urinish mumkin", 400, "NOT_ONLINE_PAYMENT");
  }
  if (order.paymentStatus !== "PENDING" && order.paymentStatus !== "FAILED") {
    throw paymentError("Bu buyurtma uchun qayta to‘lov ochilmaydi", 409, "PAYMENT_NOT_RETRYABLE");
  }

  const branch = (await db.select().from(branches).where(eq(branches.id, order.branchId)).limit(1))[0];
  if (!branch) {
    throw paymentError("Filial topilmadi", 404, "BRANCH_NOT_FOUND");
  }

  let intent = await findIntentByOrderId(orderId);
  if (!intent) {
    const created = await createBranchPayment({
      orderId,
      branch,
      provider,
      amount: order.total,
      idempotencyKey: `order:${orderId}:provider:${provider}:retry:${Date.now()}`,
    });
    if (!created.checkoutUrl) {
      throw paymentError(
        created.message || "To‘lov sahifasi ochilmadi",
        503,
        created.adapterCode || "CHECKOUT_UNAVAILABLE",
      );
    }
    return {
      checkoutUrl: created.checkoutUrl,
      provider,
      configured: created.configured,
      message: created.message,
      orderPaymentStatus: order.paymentStatus === "FAILED" ? "PENDING" : order.paymentStatus,
      intent: created.intent,
    };
  }

  if (intent.status === "PAID") {
    throw paymentError("Buyurtma allaqachon to‘langan", 409, "ALREADY_PAID");
  }

  if (intent.status === "FAILED") {
    await createPaymentAttempt({
      intentId: intent.id,
      idempotencyKey: `customer-retry:${orderId}:${Date.now()}`,
      actor: "customer:retry",
    });
    intent = (await findIntentByOrderId(orderId)) || intent;
  }

  const merchant = await resolvePaymentMerchantConfig({
    branchId: branch.id,
    provider,
    expectedBranchId: branch.id,
    requireConfigured: false,
  });
  const merchantSummary = toPublicMerchantSummary(merchant);
  const adapter = await getPaymentAdapter(provider).initiate({
    intentId: intent.id,
    orderId: intent.orderId,
    amount: intent.amount,
    currency: intent.currency,
    merchantId: intent.merchantId || merchant.merchantId || "",
    merchantSummary,
  });

  if (!adapter.checkoutUrl) {
    throw paymentError(
      adapter.message || "To‘lov sahifasi ochilmadi",
      503,
      adapter.code || "CHECKOUT_UNAVAILABLE",
    );
  }

  return {
    checkoutUrl: adapter.checkoutUrl,
    provider,
    configured: Boolean(adapter.configured && adapter.checkoutUrl),
    message: adapter.message,
    orderPaymentStatus: order.paymentStatus === "FAILED" ? "PENDING" : order.paymentStatus,
    intent,
  };
}

/**
 * Mark legacy payment paid via authoritative capture (intent SoT).
 * Idempotent — duplicate calls return existing capture / paid row.
 */
export async function markPaymentPaid(paymentId: number) {
  const rows = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!rows[0]) throw Object.assign(new Error("To‘lov topilmadi"), { status: 404 });

  let intentId = rows[0].paymentIntentId;
  if (!intentId) {
    const byLegacy = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.legacyPaymentId, paymentId))
      .limit(1);
    intentId = byLegacy[0]?.id ?? null;
  }

  if (!intentId) {
    // Pre-P7 orphan legacy row: create intent then capture (server amount from legacy).
    const created = await createPaymentIntent({
      orderId: rows[0].orderId,
      provider: rows[0].provider,
      branchId: rows[0].branchId,
      amount: rows[0].amount,
      currency: rows[0].currency || "UZS",
      merchantId: rows[0].merchantId || "",
      idempotencyKey: `legacy-backfill:${paymentId}`,
      actor: "markPaymentPaid:backfill",
    });
    intentId = created.intent.id;
  }

  await capturePayment({
    intentId,
    actor: "markPaymentPaid",
    allowSimulate: true,
  });

  const updated = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  return updated[0];
}
