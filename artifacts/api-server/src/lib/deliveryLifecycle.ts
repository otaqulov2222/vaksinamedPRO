/**
 * P8 — delivery lifecycle (separate from payment / fulfillment axes).
 * Does not change orders.payment_status.
 */

export type DeliveryStatus =
  | "pending"
  | "assigned"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled"
  | "failed";

const GRAPH: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ["assigned", "cancelled", "failed"],
  assigned: ["picked_up", "on_the_way", "cancelled", "failed"],
  picked_up: ["on_the_way", "cancelled", "failed"],
  on_the_way: ["delivered", "failed", "cancelled"],
  delivered: [],
  cancelled: [],
  failed: [],
};

export function assertDeliveryTransition(from: string, to: string): void {
  const f = from as DeliveryStatus;
  const t = to as DeliveryStatus;
  if (f === t) return;
  if (!(GRAPH[f] || []).includes(t)) {
    throw Object.assign(new Error(`Yetkazib berish holati ${from} → ${to} ruxsat etilmagan`), {
      status: 409,
      code: "INVALID_DELIVERY_TRANSITION",
    });
  }
}

export function isTerminalDeliveryStatus(status: string): boolean {
  return status === "delivered" || status === "cancelled" || status === "failed";
}

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  "pending",
  "assigned",
  "picked_up",
  "on_the_way",
  "delivered",
  "cancelled",
  "failed",
];
