import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import {
  branches,
  cartItems,
  customers,
  db,
  deliveries,
  loyaltyLedger,
  orderItems,
  orders,
  productStocks,
  reservations,
} from "@workspace/db";
import { requireAdmin, requireCustomer } from "../lib/auth";
import { DELIVERY_FEE, RESERVE_HOURS, formatDate, orderCode, computeCashback } from "../lib/money";
import { createBranchPayment } from "../lib/payments";
import { confirmFomSale } from "../lib/fom";
import { cartPayload, getOrCreateCart } from "./cart";
import { requirePermission, assertBranchScope } from "../lib/rbac";
import { bindReservationOrder, reserveStock } from "../lib/inventory";
import {
  applyOrderTransition,
  initialAxesForCheckout,
  type OrderChannel,
} from "../lib/orderTransitions";
import { publicBranch } from "../lib/securityEnv";
import { earnCashback, useCashback as applyCashbackUse, reverseOrderUseOnCancel, getMaxSpendRatio, refundOrderCashback } from "../lib/cashbackFinance";

const router = Router();

/**
 * P6.4/P6.7 — shared earn path (commercial_tx + unique EARN).
 * PAID alone does NOT earn. CANCELLED must not earn.
 * Only fulfillment COMPLETED may earn (pickup exact moment remains Q3 OPEN — callers choose when COMPLETED).
 */
export async function completeOrderCashback(order: typeof orders.$inferSelect) {
  if (order.fulfillmentStatus === "CANCELLED" || order.status === "cancelled") {
    return order;
  }
  if (order.fulfillmentStatus !== "COMPLETED") {
    return order;
  }
  if (order.cashbackEarned <= 0) return order;
  const customer = (await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1))[0];
  if (!customer) return order;
  const branch = (await db.select().from(branches).where(eq(branches.id, order.branchId)).limit(1))[0];

  const earned = await earnCashback({
    customerId: order.customerId,
    amount: order.cashbackEarned,
    commercial: {
      sourceType: "ORDER",
      sourceKey: `order:${order.id}`,
      customerId: order.customerId,
      orderId: order.id,
      amount: order.total,
      meta: { code: order.code },
    },
    orderId: order.id,
    actor: "order:complete",
    reason: "order_completed",
    idempotencyKey: `earn:order:${order.id}`,
    legacyTitle: "Buyurtma cashback",
    legacyBranch: branch?.name ?? "Vaksina Med",
    legacyAmount: order.total,
  });

  if (!earned.idempotent) {
    await db.update(customers).set({
      purchasesCount: customer.purchasesCount + 1,
      totalPurchases: customer.totalPurchases + order.subtotal,
      savedAmount: customer.savedAmount + order.cashbackEarned,
    }).where(eq(customers.id, customer.id));
  }
  return order;
}

export async function serializeOrder(order: typeof orders.$inferSelect) {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const branch = (await db.select().from(branches).where(eq(branches.id, order.branchId)).limit(1))[0];
  const delivery = (await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1))[0] ?? null;
  return {
    id: order.id,
    code: order.code,
    customerId: order.customerId,
    branchId: order.branchId,
    fulfillment: order.fulfillment,
    /** Legacy compatibility — not long-term SoT. Expo still reads this. */
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    cashbackUsed: order.cashbackUsed,
    cashbackEarned: order.cashbackEarned,
    total: order.total,
    address: order.address,
    comment: order.comment,
    reservedUntil: order.reservedUntil,
    reservationId: order.reservationId,
    createdAt: order.createdAt,
    /** P5 axes — authoritative */
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    reservationStatus: order.reservationStatus,
    fulfillment_status: order.fulfillmentStatus,
    payment_status: order.paymentStatus,
    reservation_status: order.reservationStatus,
    items,
    branch: branch ? publicBranch(branch as unknown as Record<string, unknown>) : null,
    delivery,
    qrPayload: `VAKSINA-${order.code}`,
  };
}

async function staffTransition(
  req: Parameters<typeof requireAdmin>[0],
  orderId: number,
  toFulfillment: "PREPARING" | "READY_FOR_PICKUP" | "OUT_FOR_DELIVERY" | "COMPLETED",
  reason: string,
) {
  const admin = await requireAdmin(req);
  await requirePermission(admin, "orders:confirm_pos");
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!rows[0]) throw Object.assign(new Error("Buyurtma topilmadi"), { status: 404 });
  await assertBranchScope(admin, rows[0].branchId);

  const inventory = toFulfillment === "COMPLETED" ? "consume" as const : "none" as const;
  const transitioned = await applyOrderTransition({
    orderId,
    toFulfillment,
    toPayment: toFulfillment === "COMPLETED" && rows[0].paymentStatus !== "PAID" ? "PAID" : undefined,
    actor: `staff:${admin.email}`,
    actorType: "staff",
    reason,
    inventory,
  });

  if (toFulfillment === "COMPLETED") {
    await completeOrderCashback(transitioned.order);
  }
  return transitioned;
}

router.get("/orders", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const rows = await db.select().from(orders).where(eq(orders.customerId, customer.id)).orderBy(desc(orders.createdAt));
    return res.json({ orders: await Promise.all(rows.map(serializeOrder)) });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders/:id", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const rows = await db.select().from(orders).where(eq(orders.id, Number(req.params.id))).limit(1);
    if (!rows[0] || rows[0].customerId !== customer.id) return res.status(404).json({ message: "Buyurtma topilmadi" });
    return res.json({ order: await serializeOrder(rows[0]) });
  } catch (error) {
    return next(error);
  }
});

router.post("/orders", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const fulfillment = (req.body.fulfillment === "delivery" ? "delivery" : "pickup") as OrderChannel;
    const paymentMethod = ["payme", "click", "pay_at_branch", "cod"].includes(req.body.paymentMethod)
      ? req.body.paymentMethod
      : "pay_at_branch";
    const address = typeof req.body.address === "string" ? req.body.address.trim() : "";
    const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
    const useCashback = Boolean(req.body.useCashback);
    const idempotencyKey = String(req.header("idempotency-key") || req.body?.idempotencyKey || "").trim() || null;

    const payload = await cartPayload(customer.id);
    if (!payload.items.length) return res.status(400).json({ message: "Savat bo‘sh" });
    const branchId = Number(req.body.branchId || payload.cart.branchId);
    const branch = (await db.select().from(branches).where(eq(branches.id, branchId)).limit(1))[0];
    if (!branch) return res.status(400).json({ message: "Filial tanlang" });
    if (fulfillment === "delivery" && address.length < 8) {
      return res.status(400).json({ message: "Yetkazib berish manzili kiriting" });
    }

    // Strongest idempotency: order.checkout_idempotency_key, then reservation key
    if (idempotencyKey) {
      const byCheckout = await db
        .select()
        .from(orders)
        .where(eq(orders.checkoutIdempotencyKey, idempotencyKey))
        .limit(1);
      if (byCheckout[0] && byCheckout[0].customerId === customer.id) {
        const payment = await createBranchPayment({
          orderId: byCheckout[0].id,
          branch,
          provider: paymentMethod,
          amount: byCheckout[0].total,
        });
        return res.status(200).json({
          order: await serializeOrder(byCheckout[0]),
          payment,
          idempotent: true,
        });
      }
      const existingRes = await db
        .select()
        .from(reservations)
        .where(eq(reservations.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existingRes[0]?.orderId) {
        const existingOrder = (
          await db.select().from(orders).where(eq(orders.id, existingRes[0].orderId)).limit(1)
        )[0];
        if (existingOrder && existingOrder.customerId === customer.id) {
          const payment = await createBranchPayment({
            orderId: existingOrder.id,
            branch,
            provider: paymentMethod,
            amount: existingOrder.total,
          });
          return res.status(200).json({
            order: await serializeOrder(existingOrder),
            payment,
            idempotent: true,
          });
        }
      }
    }

    const deliveryFee = fulfillment === "delivery" ? DELIVERY_FEE : 0;
    const maxSpendRatio = await getMaxSpendRatio();
    const calc = computeCashback({
      goodsAmount: payload.subtotal,
      cashbackToUse: useCashback ? customer.balance : 0,
      balance: customer.balance,
      tier: customer.tier,
      deliveryFee,
      maxSpendRatio,
    });
    const cashbackUsed = useCashback ? calc.cashbackUsed : 0;
    const cashbackEarned = calc.cashbackEarned;
    const total = calc.payableTotal;
    const expiresAt = new Date(Date.now() + RESERVE_HOURS * 60 * 60 * 1000);
    const reservedUntil = fulfillment === "pickup" ? expiresAt : null;
    const axes = initialAxesForCheckout({ fulfillment, paymentMethod });

    const reserveItems = payload.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    const result = await db.transaction(async (tx) => {
      const reserved = await reserveStock(
        {
          branchId: branch.id,
          customerId: customer.id,
          items: reserveItems,
          idempotencyKey,
          expiresAt,
          actor: `customer:${customer.id}`,
        },
        tx as unknown as typeof db,
        { alreadyInTx: true },
      );

      if (reserved.idempotent && reserved.reservation.orderId) {
        const existingOrder = (
          await tx.select().from(orders).where(eq(orders.id, reserved.reservation.orderId)).limit(1)
        )[0];
        if (existingOrder) {
          return { order: existingOrder, idempotent: true as const };
        }
      }

      const created = await tx.insert(orders).values({
        code: orderCode(),
        customerId: customer.id,
        branchId: branch.id,
        fulfillment,
        status: axes.legacyStatus,
        fulfillmentStatus: axes.fulfillmentStatus,
        paymentStatus: axes.paymentStatus,
        reservationStatus: axes.reservationStatus,
        checkoutIdempotencyKey: idempotencyKey,
        paymentMethod,
        subtotal: payload.subtotal,
        deliveryFee,
        cashbackUsed,
        cashbackEarned,
        total,
        address,
        comment,
        reservedUntil,
        reservationId: reserved.reservation.id,
      }).returning();
      const orderRow = created[0];

      await bindReservationOrder(reserved.reservation.id, orderRow.id, tx as unknown as typeof db);

      await tx.insert(orderItems).values(payload.items.map((item) => ({
        orderId: orderRow.id,
        productId: item.productId,
        title: item.product.nameUz,
        price: item.product.price,
        quantity: item.quantity,
      })));

      if (fulfillment === "delivery") {
        await tx.insert(deliveries).values({
          orderId: orderRow.id,
          address,
          timeWindow: typeof req.body.window === "string" ? req.body.window : "Bugun 10:00 — 18:00",
          status: "pending",
        });
      }

      if (cashbackUsed > 0) {
        await applyCashbackUse(
          {
            customerId: customer.id,
            amount: cashbackUsed,
            eligibleGoodsAmount: payload.subtotal,
            maxSpendRatio,
            commercial: {
              sourceType: "ORDER",
              sourceKey: `order:${orderRow.id}`,
              customerId: customer.id,
              orderId: orderRow.id,
              amount: orderRow.total,
              meta: { code: orderRow.code },
            },
            orderId: orderRow.id,
            actor: `customer:${customer.id}`,
            reason: "checkout_use",
            idempotencyKey: `use:order:${orderRow.id}`,
          },
          tx as unknown as typeof db,
          { alreadyInTx: true },
        );
        try {
          await tx.insert(loyaltyLedger).values({
            customerId: customer.id,
            orderId: orderRow.id,
            externalId: `${orderRow.code}-USE`,
            date: formatDate(),
            title: "Cashback ishlatildi",
            branch: branch.name,
            amount: cashbackUsed,
            cashback: cashbackUsed,
            kind: "use",
          });
        } catch {
          // non-authoritative display ledger
        }
      }

      const cart = await getOrCreateCart(customer.id);
      await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));

      return { order: orderRow, idempotent: false as const };
    });

    const payment = await createBranchPayment({
      orderId: result.order.id,
      branch,
      provider: paymentMethod,
      amount: result.order.total,
    });

    return res.status(result.idempotent ? 200 : 201).json({
      order: await serializeOrder(result.order),
      payment,
      ...(result.idempotent ? { idempotent: true } : {}),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/orders/:id/confirm-pos", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "orders:confirm_pos");
    const rows = await db.select().from(orders).where(eq(orders.id, Number(req.params.id))).limit(1);
    if (!rows[0]) return res.status(404).json({ message: "Buyurtma topilmadi" });
    await assertBranchScope(admin, rows[0].branchId);

    // Preserve existing FOM confirm side-effect (order code / audit). Q3 semantics remain OPEN.
    await confirmFomSale({
      orderCode: rows[0].code,
      receiptId: typeof req.body.receiptId === "string" ? req.body.receiptId : `POS-${Date.now()}`,
      actor: admin.email,
    });

    let orderId = rows[0].id;
    if (rows[0].fulfillmentStatus === "CREATED") {
      await applyOrderTransition({
        orderId,
        toFulfillment: "CONFIRMED",
        actor: `staff:${admin.email}`,
        actorType: "staff",
        reason: "confirm_pos_accept",
        inventory: "none",
      });
    }

    const transitioned = await applyOrderTransition({
      orderId,
      toFulfillment: "COMPLETED",
      toPayment: rows[0].paymentStatus === "PAID" ? undefined : "PAID",
      actor: `staff:${admin.email}`,
      actorType: "staff",
      reason: "confirm_pos",
      inventory: "consume",
    });

    await completeOrderCashback(transitioned.order);
    return res.json({ order: await serializeOrder(transitioned.order) });
  } catch (error) {
    return next(error);
  }
});

router.post("/orders/:id/cancel", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const rows = await db.select().from(orders).where(eq(orders.id, Number(req.params.id))).limit(1);
    if (!rows[0] || rows[0].customerId !== customer.id) return res.status(404).json({ message: "Buyurtma topilmadi" });

    if (rows[0].fulfillmentStatus === "COMPLETED" || rows[0].fulfillmentStatus === "CANCELLED") {
      if (rows[0].fulfillmentStatus === "CANCELLED") {
        return res.json({ ok: true, idempotent: true });
      }
      return res.status(400).json({ message: "Bu buyurtmani bekor qilib bo‘lmaydi" });
    }

    await applyOrderTransition({
      orderId: rows[0].id,
      toFulfillment: "CANCELLED",
      actor: `customer:${customer.id}`,
      actorType: "customer",
      customerId: customer.id,
      reason: "order_cancel",
      inventory: "release",
    });

    // Legacy orders without reservation_id: restore physical (pre-P4.5 consume-at-create)
    if (!rows[0].reservationId) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, rows[0].id));
      for (const item of items) {
        const stock = (await db.select().from(productStocks).where(eq(productStocks.productId, item.productId)))
          .find((row) => row.branchId === rows[0].branchId);
        if (stock) {
          await db.update(productStocks).set({
            quantity: stock.quantity + item.quantity,
            physicalQuantity: stock.physicalQuantity + item.quantity,
          }).where(eq(productStocks.id, stock.id));
        }
      }
    }

    if (rows[0].cashbackUsed > 0 && rows[0].fulfillmentStatus !== "CANCELLED") {
      await reverseOrderUseOnCancel(rows[0].id, {
        actor: `customer:${customer.id}`,
        reason: "order_cancel",
      });
    }
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

/**
 * P5.5 — staff fulfillment transitions (all via applyOrderTransition).
 * Permission: orders:confirm_pos + branch scope.
 * Channel rules enforced in transition service.
 */
router.post("/orders/:id/prepare", async (req, res, next) => {
  try {
    const result = await staffTransition(req, Number(req.params.id), "PREPARING", "staff_prepare");
    return res.json({ order: await serializeOrder(result.order), idempotent: result.idempotent });
  } catch (error) {
    return next(error);
  }
});

router.post("/orders/:id/ready", async (req, res, next) => {
  try {
    const result = await staffTransition(req, Number(req.params.id), "READY_FOR_PICKUP", "staff_ready");
    return res.json({ order: await serializeOrder(result.order), idempotent: result.idempotent });
  } catch (error) {
    return next(error);
  }
});

router.post("/orders/:id/out-for-delivery", async (req, res, next) => {
  try {
    const result = await staffTransition(req, Number(req.params.id), "OUT_FOR_DELIVERY", "staff_out_for_delivery");
    return res.json({ order: await serializeOrder(result.order), idempotent: result.idempotent });
  } catch (error) {
    return next(error);
  }
});

router.post("/orders/:id/complete", async (req, res, next) => {
  try {
    const result = await staffTransition(req, Number(req.params.id), "COMPLETED", "staff_complete");
    return res.json({ order: await serializeOrder(result.order), idempotent: result.idempotent });
  } catch (error) {
    return next(error);
  }
});

/**
 * P6.6 — staff cashback refund (REVERSAL of EARN). Does not invent PSP refunds.
 * Partial requires explicit earnReversalAmount (Q5 formula OPEN).
 */
router.post("/orders/:id/refund-cashback", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "orders:confirm_pos");
    const orderId = Number(req.params.id);
    const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!rows[0]) return res.status(404).json({ message: "Buyurtma topilmadi" });
    await assertBranchScope(admin, rows[0].branchId);

    const mode = String(req.body?.mode || "full") === "partial" ? "partial" : "full";
    const earnReversalAmount = req.body?.earnReversalAmount != null
      ? Number(req.body.earnReversalAmount)
      : undefined;

    const paymentTarget = mode === "partial" ? "PARTIALLY_REFUNDED" as const : "REFUNDED" as const;
    if (rows[0].paymentStatus === "PAID" || rows[0].paymentStatus === "PARTIALLY_REFUNDED") {
      try {
        await applyOrderTransition({
          orderId,
          toPayment: paymentTarget,
          actor: `staff:${admin.email}`,
          actorType: "staff",
          reason: `cashback_${mode}_refund`,
          inventory: "none",
        });
      } catch (error) {
        // Idempotent if already refunded
        if ((error as { code?: string }).code !== "INVALID_PAYMENT_TRANSITION") throw error;
      }
    }

    const cashback = await refundOrderCashback({
      orderId,
      mode,
      earnReversalAmount,
      actor: `staff:${admin.email}`,
      reason: `cashback_${mode}_refund`,
    });

    const fresh = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    return res.json({
      ok: true,
      order: await serializeOrder(fresh),
      cashback: {
        idempotent: cashback.idempotent,
        openPolicy: cashback.openPolicy,
        reversalAmount: cashback.earnReversal?.amount ?? 0,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
