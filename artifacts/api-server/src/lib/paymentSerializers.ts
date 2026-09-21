/**
 * P7.8 — safe payment DTOs (no secrets, no DB internals dump).
 */

import type {
  PaymentAttempt,
  PaymentCapture,
  PaymentIntent,
  PaymentRefund,
} from "@workspace/db";

export function serializePaymentIntentPublic(intent: PaymentIntent) {
  return {
    id: intent.id,
    orderId: intent.orderId,
    provider: intent.provider,
    branchId: intent.branchId,
    amount: intent.amount,
    currency: intent.currency,
    status: intent.status,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
    // Public merchant id only (not secret)
    merchantId: intent.merchantId || null,
  };
}

export function serializePaymentAttemptPublic(attempt: PaymentAttempt) {
  return {
    id: attempt.id,
    intentId: attempt.intentId,
    provider: attempt.provider,
    status: attempt.status,
    externalRef: attempt.externalRef || null,
    createdAt: attempt.createdAt,
  };
}

export function serializePaymentCapturePublic(capture: PaymentCapture) {
  return {
    id: capture.id,
    intentId: capture.intentId,
    orderId: capture.orderId,
    amount: capture.amount,
    currency: capture.currency,
    capturedAt: capture.capturedAt,
  };
}

export function serializePaymentRefundPublic(refund: PaymentRefund) {
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(refund.meta || "{}") as Record<string, unknown>;
  } catch {
    meta = {};
  }
  return {
    id: refund.id,
    intentId: refund.intentId,
    orderId: refund.orderId,
    captureId: refund.captureId,
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status,
    reason: refund.reason || null,
    providerRefundId: refund.providerRefundId || null,
    providerExecution: typeof meta.providerExecution === "string" ? meta.providerExecution : null,
    createdAt: refund.createdAt,
  };
}

export type PaymentSnapshotPublic = {
  intent: ReturnType<typeof serializePaymentIntentPublic>;
  attempts: ReturnType<typeof serializePaymentAttemptPublic>[];
  capture: ReturnType<typeof serializePaymentCapturePublic> | null;
  refunds: ReturnType<typeof serializePaymentRefundPublic>[];
  refundableAmount: number;
  axes: {
    paymentStatus: string;
    /** Explicit: not fulfillment / reservation */
    note: "payment_axis_only";
  };
};
