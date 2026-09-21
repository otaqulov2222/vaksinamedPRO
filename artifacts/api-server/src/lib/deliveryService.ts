/**
 * P8 — delivery domain service.
 * Reuses P5 fulfillment transitions; never mutates payment_status.
 */

import { eq } from "drizzle-orm";
import {
  db,
  deliveries,
  deliveryStatusHistory,
  orders,
} from "@workspace/db";
import { assertDeliveryTransition, isTerminalDeliveryStatus, type DeliveryStatus } from "./deliveryLifecycle";
import { getDeliveryAdapter } from "./deliveryAdapters";
import { applyOrderTransition } from "./orderTransitions";

type DbLike = typeof db;
type Delivery = typeof deliveries.$inferSelect;

function badRequest(message: string, status = 400, code?: string) {
  return Object.assign(new Error(message), { status, code });
}

export async function getDeliveryByOrderId(orderId: number, executor: DbLike = db) {
  return (await executor.select().from(deliveries).where(eq(deliveries.orderId, orderId)).limit(1))[0] || null;
}

export async function assignCourier(input: {
  orderId: number;
  courierId: number;
  courierName: string;
  courierBranchId: number;
  actor: string;
  expectedOrderBranchId: number;
}, executor: DbLike = db): Promise<Delivery> {
  if (input.courierBranchId !== input.expectedOrderBranchId) {
    throw badRequest("Kuryer filiali buyurtma filiali bilan mos emas", 403, "COURIER_BRANCH_MISMATCH");
  }
  return transitionDelivery({
    orderId: input.orderId,
    toStatus: "assigned",
    actor: input.actor,
    actorType: "staff",
    reason: "courier_assigned",
    courierId: input.courierId,
    courierName: input.courierName,
    courierBranchId: input.courierBranchId,
  }, executor);
}

export async function transitionDelivery(
  input: {
    orderId: number;
    toStatus: DeliveryStatus | string;
    actor: string;
    actorType?: "staff" | "system" | "customer";
    reason?: string;
    courierId?: number | null;
    courierName?: string;
    courierBranchId?: number | null;
  },
  executor: DbLike = db,
): Promise<Delivery> {
  const order = (await executor.select().from(orders).where(eq(orders.id, input.orderId)).limit(1))[0];
  if (!order) throw badRequest("Buyurtma topilmadi", 404, "ORDER_NOT_FOUND");
  if (order.fulfillment !== "delivery") {
    throw badRequest("Bu buyurtma yetkazib berish emas", 409, "NOT_DELIVERY_ORDER");
  }
  if (order.fulfillmentStatus === "CANCELLED" && input.toStatus === "delivered") {
    throw badRequest("Bekor qilingan buyurtmani yetkazib bo‘lmaydi", 409, "ORDER_CANCELLED");
  }

  const delivery = await getDeliveryByOrderId(input.orderId, executor);
  if (!delivery) throw badRequest("Yetkazib berish yozuvi topilmadi", 404, "DELIVERY_NOT_FOUND");

  const toStatus = String(input.toStatus) as DeliveryStatus;
  assertDeliveryTransition(delivery.status, toStatus);

  if (delivery.courierId && input.courierId != null && delivery.courierId !== input.courierId && delivery.status === "assigned") {
    // Reassignment only from assigned via cancel+assign or same transition with new courier — allow overwrite on assigned
  }

  const now = new Date();
  const patch: Partial<typeof deliveries.$inferInsert> = {
    status: toStatus,
    updatedAt: now,
  };
  if (input.courierName != null) patch.courierName = input.courierName;
  if (input.courierId != null) patch.courierId = input.courierId;
  if (input.courierBranchId != null) patch.courierBranchId = input.courierBranchId;
  if (toStatus === "assigned") patch.assignedAt = now;
  if (toStatus === "picked_up") patch.pickedUpAt = now;
  if (toStatus === "on_the_way") patch.outAt = now;
  if (toStatus === "delivered") patch.deliveredAt = now;
  if (toStatus === "cancelled" || toStatus === "failed") patch.cancelledAt = now;

  if (delivery.provider === "external" || delivery.mode === "external") {
    const adapter = getDeliveryAdapter("external");
    if (toStatus === "cancelled") {
      const r = await adapter.cancelDelivery({ deliveryId: delivery.id, providerRef: delivery.providerRef });
      if (!r.ok && r.code === "CONTRACT_PENDING") {
        // Local cancel still allowed; provider sync pending
        patch.meta = JSON.stringify({ ...(safeJson(delivery.meta)), providerCancel: r.code });
      }
    }
  }

  const updated = await executor
    .update(deliveries)
    .set(patch)
    .where(eq(deliveries.id, delivery.id))
    .returning();

  await executor.insert(deliveryStatusHistory).values({
    deliveryId: delivery.id,
    orderId: order.id,
    fromStatus: delivery.status,
    toStatus,
    actor: input.actor,
    actorType: input.actorType || "staff",
    reason: input.reason || "",
  });

  // Mirror fulfillment axis only — never payment_status
  if (toStatus === "assigned" || toStatus === "picked_up" || toStatus === "on_the_way") {
    if (
      order.fulfillmentStatus !== "COMPLETED"
      && order.fulfillmentStatus !== "CANCELLED"
      && order.fulfillmentStatus !== "OUT_FOR_DELIVERY"
    ) {
      try {
        await applyOrderTransition({
          orderId: order.id,
          toFulfillment: "OUT_FOR_DELIVERY",
          actor: input.actor,
          actorType: input.actorType === "customer" ? "customer" : input.actorType === "system" ? "system" : "staff",
          reason: `delivery_${toStatus}`,
          inventory: "none",
        }, executor);
      } catch {
        // Non-blocking if already past that state
      }
    }
  }

  if (toStatus === "delivered") {
    const completed = await applyOrderTransition({
      orderId: order.id,
      toFulfillment: "COMPLETED",
      // Payment axis remains P7 authority — do not set PAID from delivery
      actor: input.actor,
      actorType: "staff",
      reason: "delivery_completed",
      inventory: "consume",
    }, executor);
    try {
      const { completeOrderCashback } = await import("../routes/orders");
      await completeOrderCashback(completed.order);
    } catch {
      // Cashback failure must not undo delivery
    }
  }

  return updated[0];
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function serializeDeliveryPublic(d: Delivery) {
  return {
    id: d.id,
    orderId: d.orderId,
    address: d.address,
    timeWindow: d.timeWindow,
    status: d.status,
    courierName: d.courierName || null,
    courierId: d.courierId ?? null,
    provider: d.provider,
    providerRef: d.providerRef || null,
    mode: d.mode,
    assignedAt: d.assignedAt,
    pickedUpAt: d.pickedUpAt,
    outAt: d.outAt,
    deliveredAt: d.deliveredAt,
    cancelledAt: d.cancelledAt,
  };
}

export { isTerminalDeliveryStatus };
