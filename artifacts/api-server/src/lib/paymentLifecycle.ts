/**
 * P7.2 — payment intent status transitions (independent of fulfillment).
 *
 * Intent status set (repository naming):
 * CREATED | REQUIRES_PAYMENT | PROCESSING | PAID | FAILED | CANCELLED | EXPIRED
 * | REFUNDED | PARTIALLY_REFUNDED
 *
 * Order axis mapping (P5):
 * CREATED/REQUIRES_PAYMENT/PROCESSING/EXPIRED → orders.payment_status PENDING
 * PAID → PAID
 * FAILED/CANCELLED → FAILED (CANCELLED maps to FAILED on order axis; intent keeps CANCELLED)
 * REFUNDED → REFUNDED
 * PARTIALLY_REFUNDED → PARTIALLY_REFUNDED
 */

export type IntentStatus =
  | "CREATED"
  | "REQUIRES_PAYMENT"
  | "PROCESSING"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type OrderPaymentAxis =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

const INTENT_GRAPH: Record<IntentStatus, IntentStatus[]> = {
  CREATED: ["REQUIRES_PAYMENT", "PROCESSING", "PAID", "CANCELLED", "EXPIRED", "FAILED"],
  REQUIRES_PAYMENT: ["PROCESSING", "PAID", "FAILED", "CANCELLED", "EXPIRED"],
  PROCESSING: ["PAID", "FAILED", "CANCELLED", "EXPIRED"],
  PAID: ["REFUNDED", "PARTIALLY_REFUNDED"],
  FAILED: ["REQUIRES_PAYMENT", "PROCESSING", "CANCELLED"], // new attempt allowed; not direct FAILED→PAID
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ["REFUNDED", "PARTIALLY_REFUNDED"],
};

export function assertIntentTransition(from: IntentStatus, to: IntentStatus) {
  if (from === to) return;
  if (!(INTENT_GRAPH[from] || []).includes(to)) {
    throw Object.assign(
      new Error(`To‘lov holati ${from} → ${to} ruxsat etilmagan`),
      { status: 409, code: "INVALID_PAYMENT_TRANSITION" },
    );
  }
  // Explicit: FAILED cannot jump to PAID without a new attempt path (REQUIRES_PAYMENT/PROCESSING)
  if (from === "FAILED" && to === "PAID") {
    throw Object.assign(
      new Error("FAILED → PAID bevosita ruxsat etilmagan"),
      { status: 409, code: "INVALID_PAYMENT_TRANSITION" },
    );
  }
  if (from === "REFUNDED" && to === "PAID") {
    throw Object.assign(
      new Error("REFUNDED → PAID ruxsat etilmagan"),
      { status: 409, code: "INVALID_PAYMENT_TRANSITION" },
    );
  }
}

/** Map intent status → P5 orders.payment_status (denormalized mirror). */
export function intentStatusToOrderAxis(status: IntentStatus): OrderPaymentAxis {
  switch (status) {
    case "PAID":
      return "PAID";
    case "REFUNDED":
      return "REFUNDED";
    case "PARTIALLY_REFUNDED":
      return "PARTIALLY_REFUNDED";
    case "FAILED":
    case "CANCELLED":
      return "FAILED";
    default:
      return "PENDING";
  }
}

export function isTerminalIntentStatus(status: IntentStatus): boolean {
  return status === "CANCELLED" || status === "EXPIRED" || status === "REFUNDED";
}
