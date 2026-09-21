import { and, eq, sql } from "drizzle-orm";
import { db, orders, type Order } from "@workspace/db";
import { consumeReservation, releaseReservation } from "./inventory";

type DbLike = typeof db;

export type FulfillmentStatus =
  | "CREATED"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "COMPLETED"
  | "CANCELLED";

export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type ReservationStatusMirror =
  | "NONE"
  | "ACTIVE"
  | "EXPIRED"
  | "CANCELLED"
  | "FULFILLED";

export type OrderChannel = "pickup" | "delivery";

/** Includes CONFIRMED→COMPLETED for P5.4 confirm-pos / delivery (PREPARING optional later). */
const FULFILLMENT_GRAPH: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  CREATED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "OUT_FOR_DELIVERY", "CANCELLED", "COMPLETED"],
  PREPARING: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "CANCELLED", "COMPLETED"],
  READY_FOR_PICKUP: ["COMPLETED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function badRequest(message: string, status = 400, code?: string) {
  return Object.assign(new Error(message), { status, code });
}

function withTx<T>(executor: DbLike, alreadyInTx: boolean, fn: (tx: DbLike) => Promise<T>): Promise<T> {
  if (alreadyInTx) return fn(executor);
  return (executor as typeof db).transaction(async (tx) => fn(tx as unknown as DbLike));
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

/** Dual-write legacy orders.status for mobile/admin compatibility (not SoT). */
export function deriveLegacyStatus(input: {
  fulfillment: OrderChannel;
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
}): string {
  const { fulfillment, fulfillmentStatus, paymentStatus, paymentMethod } = input;
  if (fulfillmentStatus === "CANCELLED") return "cancelled";
  if (fulfillmentStatus === "COMPLETED") return "completed";
  if (
    (paymentMethod === "payme" || paymentMethod === "click" || fulfillmentStatus === "CREATED")
    && paymentStatus === "PENDING"
  ) {
    return "pending_payment";
  }
  if (paymentStatus === "PAID" && fulfillment === "delivery") {
    return "paid";
  }
  if (fulfillment === "delivery") return "awaiting_delivery";
  return "reserved";
}

export function initialAxesForCheckout(input: {
  fulfillment: OrderChannel;
  paymentMethod: string;
}): {
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  reservationStatus: ReservationStatusMirror;
  legacyStatus: string;
} {
  const online = input.paymentMethod === "payme" || input.paymentMethod === "click";
  const fulfillmentStatus: FulfillmentStatus = online ? "CREATED" : "CONFIRMED";
  const paymentStatus: PaymentStatus = "PENDING";
  const reservationStatus: ReservationStatusMirror = "ACTIVE";
  const legacyStatus = deriveLegacyStatus({
    fulfillment: input.fulfillment,
    fulfillmentStatus,
    paymentStatus,
    paymentMethod: input.paymentMethod,
  });
  return { fulfillmentStatus, paymentStatus, reservationStatus, legacyStatus };
}

function assertFulfillmentTransition(
  channel: OrderChannel,
  from: FulfillmentStatus,
  to: FulfillmentStatus,
) {
  if (to === "READY_FOR_PICKUP" && channel !== "pickup") {
    throw badRequest("READY_FOR_PICKUP faqat pickup uchun", 409, "INVALID_TRANSITION");
  }
  if (to === "OUT_FOR_DELIVERY" && channel !== "delivery") {
    throw badRequest("OUT_FOR_DELIVERY faqat delivery uchun", 409, "INVALID_TRANSITION");
  }
  if (!(FULFILLMENT_GRAPH[from] || []).includes(to)) {
    throw badRequest(`Bajarilish holati ${from} → ${to} ruxsat etilmagan`, 409, "INVALID_TRANSITION");
  }
}

function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus) {
  if (from === to) return;
  const ok =
    (from === "PENDING" && (to === "PAID" || to === "FAILED"))
    || (from === "FAILED" && (to === "PENDING" || to === "PAID")) // new payment attempt / retry
    || (from === "PAID" && (to === "REFUNDED" || to === "PARTIALLY_REFUNDED"))
    || (from === "PARTIALLY_REFUNDED" && (to === "REFUNDED" || to === "PARTIALLY_REFUNDED"));
  if (!ok) {
    throw badRequest(`To‘lov holati ${from} → ${to} ruxsat etilmagan`, 409, "INVALID_PAYMENT_TRANSITION");
  }
}

export type TransitionInput = {
  orderId: number;
  toFulfillment?: FulfillmentStatus;
  toPayment?: PaymentStatus;
  toReservation?: ReservationStatusMirror;
  actor: string;
  actorType: "customer" | "staff" | "system";
  customerId?: number;
  reason?: string;
  inventory?: "none" | "release" | "consume";
  alreadyInTx?: boolean;
};

export type TransitionResult = {
  order: Order;
  changed: boolean;
  idempotent: boolean;
};

/**
 * P5.2 — single server-side order transition service.
 * Inventory: CANCEL→release, COMPLETE→consume via P4 services only.
 */
export async function applyOrderTransition(
  input: TransitionInput,
  executor: DbLike = db,
): Promise<TransitionResult> {
  return withTx(executor, Boolean(input.alreadyInTx), async (tx) => {
    const locked = await tx.execute(sql`
      SELECT *
      FROM orders
      WHERE id = ${input.orderId}
      FOR UPDATE
    `);
    const raw = rowsOf(locked)[0];
    if (!raw) throw badRequest("Buyurtma topilmadi", 404);

    const order = mapOrderRow(raw);

    if (input.actorType === "customer") {
      if (!input.customerId || order.customerId !== input.customerId) {
        throw badRequest("Buyurtma topilmadi", 404);
      }
    }

    let nextFulfillment = (order.fulfillmentStatus || "CREATED") as FulfillmentStatus;
    let nextPayment = (order.paymentStatus || "PENDING") as PaymentStatus;
    let nextReservation = (order.reservationStatus || "NONE") as ReservationStatusMirror;
    let axesChanged = false;

    if (input.toFulfillment) {
      if (input.toFulfillment === nextFulfillment) {
        // idempotent
      } else if (nextFulfillment === "COMPLETED" || nextFulfillment === "CANCELLED") {
        throw badRequest(
          nextFulfillment === "COMPLETED"
            ? "Yakunlangan buyurtmani o‘zgartirib bo‘lmaydi"
            : "Bekor qilingan buyurtmani o‘zgartirib bo‘lmaydi",
          409,
          "TERMINAL_STATE",
        );
      } else {
        assertFulfillmentTransition(
          order.fulfillment as OrderChannel,
          nextFulfillment,
          input.toFulfillment,
        );
        nextFulfillment = input.toFulfillment;
        axesChanged = true;
      }
    }

    if (input.toPayment) {
      if (input.toPayment !== nextPayment) {
        assertPaymentTransition(nextPayment, input.toPayment);
        nextPayment = input.toPayment;
        axesChanged = true;
      }
    }

    if (input.toReservation && input.toReservation !== nextReservation) {
      nextReservation = input.toReservation;
      axesChanged = true;
    }

    const inventory = input.inventory || "none";
    let inventoryMutated = false;

    if (inventory === "release" && order.reservationId) {
      const released = await releaseReservation(
        order.reservationId,
        {
          actor: input.actor,
          toStatus: "CANCELLED",
          reason: input.reason || "order_cancel",
          alreadyInTx: true,
        },
        tx,
      );
      inventoryMutated = released.released;
      nextReservation = (released.reservation.status as ReservationStatusMirror) || "CANCELLED";
    } else if (inventory === "release" && !order.reservationId) {
      nextReservation = "NONE";
    }

    if (inventory === "consume" && order.reservationId) {
      const consumed = await consumeReservation(
        order.reservationId,
        {
          actor: input.actor,
          reason: input.reason || "fulfill",
          alreadyInTx: true,
        },
        tx,
      );
      inventoryMutated = consumed.consumed;
      nextReservation = (consumed.reservation.status as ReservationStatusMirror) || "FULFILLED";
    }

    if (!axesChanged && !inventoryMutated && input.toReservation == null) {
      // Still sync reservation mirror / legacy if inventory path was no-op but target set
      if (
        input.toFulfillment === order.fulfillmentStatus
        && (!input.toPayment || input.toPayment === order.paymentStatus)
      ) {
        return { order, changed: false, idempotent: true };
      }
    }

    if (!axesChanged && !inventoryMutated) {
      return { order, changed: false, idempotent: true };
    }

    const legacyStatus = deriveLegacyStatus({
      fulfillment: order.fulfillment as OrderChannel,
      fulfillmentStatus: nextFulfillment,
      paymentStatus: nextPayment,
      paymentMethod: order.paymentMethod,
    });

    const updated = await tx
      .update(orders)
      .set({
        fulfillmentStatus: nextFulfillment,
        paymentStatus: nextPayment,
        reservationStatus: nextReservation,
        status: legacyStatus,
      })
      .where(eq(orders.id, order.id))
      .returning();

    return {
      order: updated[0],
      changed: true,
      idempotent: false,
    };
  });
}

function mapOrderRow(raw: Record<string, unknown>): Order {
  return {
    id: Number(raw.id),
    code: String(raw.code),
    customerId: Number(raw.customer_id),
    branchId: Number(raw.branch_id),
    fulfillment: String(raw.fulfillment),
    status: String(raw.status),
    fulfillmentStatus: String(raw.fulfillment_status ?? "CREATED"),
    paymentStatus: String(raw.payment_status ?? "PENDING"),
    reservationStatus: String(raw.reservation_status ?? "NONE"),
    checkoutIdempotencyKey: raw.checkout_idempotency_key != null ? String(raw.checkout_idempotency_key) : null,
    paymentMethod: String(raw.payment_method),
    subtotal: Number(raw.subtotal),
    deliveryFee: Number(raw.delivery_fee),
    cashbackUsed: Number(raw.cashback_used),
    cashbackEarned: Number(raw.cashback_earned),
    total: Number(raw.total),
    address: String(raw.address ?? ""),
    comment: String(raw.comment ?? ""),
    reservedUntil: raw.reserved_until ? new Date(String(raw.reserved_until)) : null,
    reservationId: raw.reservation_id != null ? Number(raw.reservation_id) : null,
    createdAt: new Date(String(raw.created_at)),
  } as Order;
}

/** Payment paid — never consumes inventory. */
export async function markOrderPaymentPaid(
  orderId: number,
  opts: { actor?: string } = {},
  executor: DbLike = db,
): Promise<TransitionResult> {
  return applyOrderTransition(
    {
      orderId,
      toPayment: "PAID",
      actor: opts.actor || "payment",
      actorType: "system",
      inventory: "none",
      reason: "payment_paid",
    },
    executor,
  );
}
