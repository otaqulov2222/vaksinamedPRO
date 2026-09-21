import { eq } from "drizzle-orm";
import { auditLog, db, orders } from "@workspace/db";
import { logger } from "./logger";
import { applyOrderTransition } from "./orderTransitions";

/**
 * FOM order confirm — P6.7: converges on P5 axes + shared earn (caller: completeOrderCashback).
 * Does not invent FOM vendor APIs. receiptId is audit metadata only for order-linked path;
 * commercial identity remains `order:{id}` so app + FOM cannot double-earn.
 */
export async function confirmFomSale(options: {
  orderCode?: string;
  customerQr?: string;
  receiptId: string;
  amount?: number;
  actor?: string;
}) {
  const { orderCode, receiptId, actor = "fom" } = options;
  if (!orderCode) {
    throw Object.assign(new Error("Buyurtma kodi kerak"), { status: 400 });
  }
  const found = await db.select().from(orders).where(eq(orders.code, orderCode)).limit(1);
  if (!found[0]) throw Object.assign(new Error("Buyurtma topilmadi"), { status: 404 });

  if (found[0].fulfillmentStatus === "CANCELLED" || found[0].status === "cancelled") {
    throw Object.assign(new Error("Buyurtma bekor qilingan"), { status: 400, code: "ORDER_CANCELLED" });
  }

  // Idempotent: already COMPLETED — earn caller remains idempotent via commercial unique
  if (found[0].fulfillmentStatus === "COMPLETED") {
    await db.insert(auditLog).values({
      actor,
      action: "fom.sale_confirmed",
      entity: "order",
      payload: JSON.stringify({
        orderCode,
        receiptId,
        amount: options.amount ?? found[0].total,
        idempotent: true,
      }),
    });
    return found[0];
  }

  const transitioned = await applyOrderTransition({
    orderId: found[0].id,
    toFulfillment: "COMPLETED",
    toPayment: found[0].paymentStatus === "PAID" ? undefined : "PAID",
    actor,
    actorType: "system",
    reason: "fom_sale_confirm",
    inventory: "consume",
  });

  await db.insert(auditLog).values({
    actor,
    action: "fom.sale_confirmed",
    entity: "order",
    payload: JSON.stringify({
      orderCode,
      receiptId,
      amount: options.amount ?? transitioned.order.total,
      note: "receiptId audited; commercial earn key remains order:{id} — vendor receipt identity beyond aliases is OPEN",
    }),
  });
  logger.info({ orderCode, receiptId }, "FOM sale confirmed via shared transition");
  return transitioned.order;
}
