/**
 * Compatibility facade over P7 paymentService.
 * createBranchPayment dual-writes payment_intents + legacy payments.
 * markPaymentPaid captures via authoritative intent (one capture / order).
 * Merchant secrets resolved only via branchPaymentMerchant (P7.6.2).
 */

import { eq } from "drizzle-orm";
import { db, payments, paymentIntents, type Branch } from "@workspace/db";
import {
  createPaymentIntent,
  capturePayment,
} from "./paymentService";
import {
  isOnlinePaymentProvider,
  resolvePaymentMerchantConfig,
  toPublicMerchantSummary,
} from "./branchPaymentMerchant";

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

  // Legacy/local HTML checkout only — NOT a real Payme/Click URL (P7.6.1/P7.6.2).
  const checkoutUrl =
    result.adapter.checkoutUrl
    || ((provider === "payme" || provider === "click")
      ? `/api/payments/${provider}/checkout/${result.legacyPayment.id}`
      : null);

  return {
    payment: result.legacyPayment,
    intent: result.intent,
    configured,
    checkoutUrl,
    message: configured
      ? (result.adapter.message || `${branch.name} kassasining ${provider.toUpperCase()} to‘lovi`)
      : `${branch.name} uchun ${provider.toUpperCase()} kalitlari hali kiritilmagan. Admin paneldan merchant ID/key qo‘shing.`,
    idempotent: result.idempotent,
    adapterCode: result.adapter.code,
    // Public metadata only — never secrets
    merchant: merchantSummary,
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
