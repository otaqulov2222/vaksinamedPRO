import { Router } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import {
  branches,
  cartItems,
  carts,
  customers,
  db,
  deliveries,
  loyaltyLedger,
  orderItems,
  orders,
  products,
  productStocks,
  reservations,
  staffRatings,
  auditLog,
  fiscalCheques,
} from "@workspace/db";
import { requireAdmin, requireCustomer } from "../lib/auth";
import { RESERVE_HOURS, formatDate, orderCode, computeCashback } from "../lib/money";
import { birthdayExtraBps } from "../lib/cashback";
import { createBranchPayment } from "../lib/payments";
import { confirmFomSale } from "../lib/fom";
import { cartPayload } from "./cart";
import { requirePermission, assertBranchScope } from "../lib/rbac";
import { bindReservationOrder, reserveStock } from "../lib/inventory";
import { createFiscalCheque, getFiscalChequeByOrderId } from "../lib/fiscalService";
import {
  applyOrderTransition,
  initialAxesForCheckout,
  voidPendingOrderPayments,
  type OrderChannel,
} from "../lib/orderTransitions";
import { publicBranch } from "../lib/securityEnv";
import {
  earnCashback,
  useCashback as applyCashbackUse,
  reverseOrderUseOnCancel,
  getCashbackPolicy,
  refundOrderCashback,
  getAuthoritativeBalance,
} from "../lib/cashbackFinance";
import { rateLimit } from "../lib/rateLimit";

const router = Router();

/** Order create spam protection — Redis in production; memory fallback in dev. */
const orderCreateLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  key: (req) => `order-create:${req.ip}:${String(req.header("authorization") || "").slice(0, 24)}`,
});

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

function shapeSerializedOrder(args: {
  order: typeof orders.$inferSelect;
  items: Array<typeof orderItems.$inferSelect>;
  branch: typeof branches.$inferSelect | null | undefined;
  delivery: typeof deliveries.$inferSelect | null | undefined;
  existingRating: typeof staffRatings.$inferSelect | null | undefined;
  chequeRow: typeof fiscalCheques.$inferSelect | null | undefined;
  reservationStatus: string;
  reservedUntil: Date | null | undefined;
  serverTime: string;
}) {
  const {
    order,
    items,
    branch,
    delivery,
    existingRating,
    chequeRow,
    reservationStatus,
    reservedUntil,
    serverTime,
  } = args;
  const completed =
    order.fulfillmentStatus === "COMPLETED" || String(order.status).toLowerCase() === "completed";
  const canCancel =
    order.fulfillmentStatus !== "COMPLETED"
    && order.fulfillmentStatus !== "CANCELLED";
  const reservationActive = reservationStatus === "ACTIVE";
  const reservationExpired =
    reservationStatus === "EXPIRED"
    || (reservationActive && reservedUntil != null && new Date(reservedUntil).getTime() <= Date.now());

  return {
    id: order.id,
    code: order.code,
    customerId: order.customerId,
    branchId: order.branchId,
    fulfillment: order.fulfillment,
    /** Legacy compatibility — not long-term SoT. Prefer P5 axes. */
    status: order.status,
    paymentMethod: order.paymentMethod,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    cashbackUsed: order.cashbackUsed,
    cashbackEarned: order.cashbackEarned,
    total: order.total,
    address: order.address,
    comment: order.comment,
    reservedUntil,
    reservationId: order.reservationId,
    createdAt: order.createdAt,
    /** P5 axes — authoritative */
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    reservationStatus,
    fulfillment_status: order.fulfillmentStatus,
    payment_status: order.paymentStatus,
    reservation_status: reservationStatus,
    /** Clock skew helper for countdown UX only — expiry remains server-authoritative. */
    serverTime,
    canCancel,
    /** Customer cancel does not capture/refund PSP; do not promise money returned. */
    cancelRefundsPayment: false,
    reservationActive: reservationActive && !reservationExpired,
    reservationExpired,
    /** No customer payment-retry capture endpoint for production PSP in this build. */
    canRetryPayment: false,
    items,
    branch: branch ? publicBranch(branch as unknown as Record<string, unknown>) : null,
    delivery: delivery ?? null,
    qrPayload: `VAKSINA-${order.code}`,
    alreadyRated: Boolean(existingRating),
    canRate: completed && !existingRating,
    fiscalCheque: chequeRow
      ? {
          id: chequeRow.id,
          receiptNumber: chequeRow.receiptNumber,
          fiscalSign: chequeRow.fiscalSign,
          terminalId: chequeRow.terminalId,
          qrUrl: chequeRow.qrUrl,
          status: chequeRow.status,
          totalAmount: chequeRow.totalAmount,
          vatAmount: chequeRow.vatAmount,
          discountAmount: chequeRow.discountAmount,
          createdAt: chequeRow.createdAt,
        }
      : null,
  };
}

export async function serializeOrders(orderRows: Array<typeof orders.$inferSelect>) {
  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((order) => order.id);
  const branchIds = [...new Set(orderRows.map((order) => order.branchId).filter((id) => Number.isFinite(id)))];
  const reservationIds = [
    ...new Set(
      orderRows
        .map((order) => order.reservationId)
        .filter((id): id is number => id != null && Number.isFinite(id)),
    ),
  ];

  const [itemRows, branchRows, deliveryRows, ratingRows, chequeRows, reservationRows] = await Promise.all([
    db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)),
    branchIds.length
      ? db.select().from(branches).where(inArray(branches.id, branchIds))
      : Promise.resolve([] as Array<typeof branches.$inferSelect>),
    db.select().from(deliveries).where(inArray(deliveries.orderId, orderIds)),
    db.select().from(staffRatings).where(inArray(staffRatings.orderId, orderIds)),
    db.select().from(fiscalCheques).where(inArray(fiscalCheques.orderId, orderIds)),
    reservationIds.length
      ? db.select().from(reservations).where(inArray(reservations.id, reservationIds))
      : Promise.resolve([] as Array<typeof reservations.$inferSelect>),
  ]);

  const itemsByOrder = new Map<number, Array<typeof orderItems.$inferSelect>>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }
  const branchById = new Map(branchRows.map((branch) => [branch.id, branch]));
  const deliveryByOrder = new Map(deliveryRows.map((row) => [row.orderId, row]));
  const ratingByOrder = new Map(ratingRows.map((row) => [row.orderId, row]));
  const chequeByOrder = new Map(chequeRows.map((row) => [row.orderId, row]));
  const reservationById = new Map(reservationRows.map((row) => [row.id, row]));

  const healUpdates: Array<{ orderId: number; reservationStatus: string }> = [];
  const serverTime = new Date().toISOString();

  const serialized = orderRows.map((order) => {
    let reservationStatus = order.reservationStatus;
    let reservedUntil = order.reservedUntil;
    if (order.reservationId) {
      const live = reservationById.get(order.reservationId);
      if (live) {
        reservationStatus = live.status;
        if (live.expiresAt) reservedUntil = live.expiresAt;
        if (live.status !== order.reservationStatus) {
          healUpdates.push({ orderId: order.id, reservationStatus: live.status });
        }
      }
    }

    return shapeSerializedOrder({
      order,
      items: itemsByOrder.get(order.id) ?? [],
      branch: branchById.get(order.branchId),
      delivery: deliveryByOrder.get(order.id),
      existingRating: ratingByOrder.get(order.id),
      chequeRow: chequeByOrder.get(order.id),
      reservationStatus,
      reservedUntil,
      serverTime,
    });
  });

  // Heal denormalized mirrors off the list critical path (one write per drifted row).
  if (healUpdates.length > 0) {
    void Promise.all(
      healUpdates.map((row) =>
        db.update(orders).set({ reservationStatus: row.reservationStatus }).where(eq(orders.id, row.orderId)),
      ),
    ).catch(() => undefined);
  }

  return serialized;
}

export async function serializeOrder(order: typeof orders.$inferSelect) {
  const [serialized] = await serializeOrders([order]);
  return serialized;
}

async function staffTransition(
  req: Parameters<typeof requireAdmin>[0],
  orderId: number,
  toFulfillment: "CONFIRMED" | "PREPARING" | "READY_FOR_PICKUP" | "OUT_FOR_DELIVERY" | "COMPLETED",
  reason: string,
) {
  const admin = await requireAdmin(req);
  await requirePermission(admin, "orders:confirm_pos");
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!rows[0]) throw Object.assign(new Error("Buyurtma topilmadi"), { status: 404 });
  await assertBranchScope(admin, rows[0].branchId);

  const inventory = toFulfillment === "COMPLETED" ? "consume" as const : "none" as const;
  // Existing policy: COMPLETED may dual-write payment PAID for branch/FOM flows — not a generic admin "mark paid" button.
  const transitioned = await applyOrderTransition({
    orderId,
    toFulfillment,
    toPayment: toFulfillment === "COMPLETED" && rows[0].paymentStatus !== "PAID" ? "PAID" : undefined,
    actor: `staff:${admin.email}`,
    actorType: "staff",
    reason,
    inventory,
  });

  try {
    await db.insert(auditLog).values({
      actor: admin.email,
      action: `order.transition.${toFulfillment}`,
      entity: "order",
      payload: JSON.stringify({
        orderId,
        branchId: rows[0].branchId,
        from: rows[0].fulfillmentStatus,
        to: toFulfillment,
        paymentStatus: transitioned.order.paymentStatus,
        reason,
        idempotent: transitioned.idempotent,
      }),
    });
  } catch {
    // audit must not block transition
  }

  if (toFulfillment === "COMPLETED") {
    await completeOrderCashback(transitioned.order);
  }
  return transitioned;
}

router.get("/orders", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 30;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customer.id))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);
    return res.json({
      orders: await serializeOrders(rows),
      limit,
      offset,
      hasMore: rows.length === limit,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/orders/:id", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const rows = await db.select().from(orders).where(eq(orders.id, Number(req.params.id))).limit(1);
    if (!rows[0] || rows[0].customerId !== customer.id) {
      return res.status(404).json({ message: "Buyurtma topilmadi", code: "ORDER_NOT_FOUND" });
    }
    return res.json({ order: await serializeOrder(rows[0]) });
  } catch (error) {
    return next(error);
  }
});

/**
 * OFD / Soliq elektron fiskal chekni olish
 * Mijoz: o'zining buyurtmasi uchun
 * Admin: xodimlar va kassa audit uchun
 */
router.get("/orders/:id/fiscal-cheque", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(404).json({ message: "Buyurtma topilmadi", code: "ORDER_NOT_FOUND" });
    }
    const order = (await db.select().from(orders).where(eq(orders.id, id)).limit(1))[0];
    if (!order) {
      return res.status(404).json({ message: "Buyurtma topilmadi", code: "ORDER_NOT_FOUND" });
    }

    // Auth check
    const authHeader = req.header("authorization");
    let isOwner = false;
    let isAdmin = false;
    if (authHeader) {
      try {
        const cust = await requireCustomer(req);
        if (cust && cust.id === order.customerId) isOwner = true;
      } catch {
        try {
          const adm = await requireAdmin(req);
          if (adm) isAdmin = true;
        } catch {}
      }
    }
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Ruxsat berilmagan", code: "FORBIDDEN" });
    }

    let cheque = await getFiscalChequeByOrderId(id);
    if (!cheque && (order.paymentStatus === "PAID" || order.status === "paid")) {
      await createFiscalCheque({ orderId: id, actor: "orders:get-fiscal-cheque" });
      cheque = await getFiscalChequeByOrderId(id);
    }

    if (!cheque) {
      return res.status(404).json({
        message: "Fiskal chek hali shakllanmagan (to‘lov amalga oshirilgandan keyin beriladi)",
        code: "FISCAL_CHEQUE_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      fiscalCheque: cheque,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/orders", orderCreateLimiter, async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    // Business rule: medicine home delivery is not offered — pickup only.
    if (req.body?.fulfillment === "delivery") {
      return res.status(400).json({
        message: "Yetkazib berish mavjud emas. Faqat filialdan olib ketish mumkin.",
        code: "DELIVERY_DISABLED",
      });
    }
    const fulfillment = "pickup" as OrderChannel;
    const paymentMethod = ["payme", "click", "pay_at_branch"].includes(req.body.paymentMethod)
      ? req.body.paymentMethod
      : "pay_at_branch";

    if (paymentMethod === "cod") {
      return res.status(400).json({
        message: "Filialdan olib ketishda COD mavjud emas",
        code: "INVALID_PAYMENT_METHOD",
      });
    }
    const address = typeof req.body.address === "string" ? req.body.address.trim() : "";
    const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
    const useCashback = Boolean(req.body.useCashback);
    const idempotencyKey = String(req.header("idempotency-key") || req.body?.idempotencyKey || "").trim() || null;
    // Client financial fields are never authoritative (ignored if present).
    void req.body.total;
    void req.body.subtotal;
    void req.body.unitPrice;
    void req.body.cashbackAmount;
    void req.body.discount;
    void req.body.paymentStatus;
    void req.body.paymentAmount;
    void req.body.deliveryFee;

    const payload = await cartPayload(customer.id);
    if (!payload.items.length) {
      return res.status(400).json({ message: "Savat bo‘sh", code: "CART_EMPTY" });
    }

    const bodyBranchId = Number(req.body.branchId);
    const cartBranchId = payload.cart.branchId != null ? Number(payload.cart.branchId) : NaN;
    const branchId =
      Number.isFinite(bodyBranchId) && bodyBranchId > 0
        ? bodyBranchId
        : Number.isFinite(cartBranchId) && cartBranchId > 0
          ? cartBranchId
          : NaN;
    if (!Number.isFinite(branchId) || branchId <= 0) {
      return res.status(400).json({ message: "Filial tanlang", code: "BRANCH_REQUIRED" });
    }

    const branch = (await db.select().from(branches).where(eq(branches.id, branchId)).limit(1))[0];
    if (!branch) {
      return res.status(400).json({ message: "Filial topilmadi", code: "BRANCH_NOT_FOUND" });
    }
    if (!branch.isOpen) {
      return res.status(400).json({ message: "Filial hozir ochiq emas", code: "BRANCH_CLOSED" });
    }
    if (fulfillment === "delivery" && address.length < 8) {
      return res.status(400).json({ message: "Yetkazib berish manzili kiriting", code: "ADDRESS_REQUIRED" });
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

    const cashbackPolicy = await getCashbackPolicy();
    const deliveryFee = fulfillment === "delivery" ? cashbackPolicy.deliveryFee : 0;
    const maxSpendRatio = cashbackPolicy.maxSpendRatio;
    const expiresAt = new Date(Date.now() + RESERVE_HOURS * 60 * 60 * 1000);
    const reservedUntil = fulfillment === "pickup" ? expiresAt : null;
    const axes = initialAxesForCheckout({ fulfillment, paymentMethod });

    const result = await db.transaction(async (tx) => {
      const cart = (await tx.select().from(carts).where(eq(carts.customerId, customer.id)).limit(1))[0];
      if (!cart) {
        throw Object.assign(new Error("Savat topilmadi"), { status: 400, code: "CART_EMPTY" });
      }

      await tx.update(carts).set({ branchId: branch.id, updatedAt: new Date() }).where(eq(carts.id, cart.id));

      const rawItems = await tx.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
      const pricedItems: Array<{
        productId: number;
        quantity: number;
        title: string;
        price: number;
        lineTotal: number;
      }> = [];
      let subtotal = 0;
      for (const item of rawItems) {
        const qty = Math.floor(Number(item.quantity));
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const product = (await tx.select().from(products).where(eq(products.id, item.productId)).limit(1))[0];
        if (!product) {
          throw Object.assign(new Error("Savatdagi mahsulot topilmadi"), {
            status: 400,
            code: "PRODUCT_MISSING",
          });
        }
        const price = Math.floor(Number(product.price));
        const lineTotal = price * qty;
        subtotal += lineTotal;
        pricedItems.push({
          productId: product.id,
          quantity: qty,
          title: product.nameUz,
          price,
          lineTotal,
        });
      }
      if (!pricedItems.length) {
        throw Object.assign(new Error("Savat bo‘sh"), { status: 400, code: "CART_EMPTY" });
      }

      const balance = await getAuthoritativeBalance(customer.id, tx as unknown as typeof db);
      const extraBps = birthdayExtraBps(customer.birthDate, new Date(), {
        windowDays: cashbackPolicy.birthdayWindowDays,
        extraBps: cashbackPolicy.birthdayExtraBps,
      });
      const calc = computeCashback({
        goodsAmount: subtotal,
        cashbackToUse: useCashback ? balance : 0,
        balance,
        tier: customer.tier,
        deliveryFee,
        maxSpendRatio,
        extraBps,
        minPurchase: cashbackPolicy.minPurchase,
        tiers: cashbackPolicy.tiers,
      });
      let cashbackUsed = useCashback ? calc.cashbackUsed : 0;
      let cashbackEarned = calc.cashbackEarned;
      let total = calc.payableTotal;

      let reserved;
      try {
        reserved = await reserveStock(
          {
            branchId: branch.id,
            customerId: customer.id,
            items: pricedItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
            idempotencyKey,
            expiresAt,
            actor: `customer:${customer.id}`,
          },
          tx as unknown as typeof db,
          { alreadyInTx: true },
        );
      } catch (err: any) {
        if (err?.code === "STOCK_UNAVAILABLE" || err?.status === 400) {
          let alternativeBranches: any[] = [];
          try {
            const firstUnavailable = pricedItems[0];
            if (firstUnavailable) {
              const { findAlternativeBranchesWithStock } = await import("../lib/fomInventoryService");
              alternativeBranches = await findAlternativeBranchesWithStock(
                firstUnavailable.productId,
                firstUnavailable.quantity,
                branch.id,
                tx as unknown as typeof db,
              );
            }
          } catch {}
          throw Object.assign(
            new Error("Mahsulot tanlangan filialda yetarli emas. Boshqa filialni tanlang yoki kuryerlik orqali buyurtma bering."),
            {
              status: 409,
              code: "STOCK_UNAVAILABLE",
              branchId: branch.id,
              alternativeBranches,
            },
          );
        }
        throw err;
      }

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
        subtotal,
        deliveryFee,
        cashbackUsed,
        cashbackEarned,
        total,
        address,
        comment,
        reservedUntil,
        reservationId: reserved.reservation.id,
      }).returning();
      let orderRow = created[0];

      await bindReservationOrder(reserved.reservation.id, orderRow.id, tx as unknown as typeof db);

      await tx.insert(orderItems).values(pricedItems.map((item) => ({
        orderId: orderRow.id,
        productId: item.productId,
        title: item.title,
        price: item.price,
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
        const used = await applyCashbackUse(
          {
            customerId: customer.id,
            amount: cashbackUsed,
            eligibleGoodsAmount: subtotal,
            maxSpendRatio,
            commercial: {
              sourceType: "ORDER",
              sourceKey: `order:${orderRow.id}`,
              customerId: customer.id,
              orderId: orderRow.id,
              amount: total,
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
        const actualUsed = Math.floor(Number(used.entry.amount) || 0);
        if (actualUsed !== cashbackUsed) {
          const recalc = computeCashback({
            goodsAmount: subtotal,
            cashbackToUse: actualUsed,
            balance,
            tier: customer.tier,
            deliveryFee,
            maxSpendRatio,
            extraBps,
            minPurchase: cashbackPolicy.minPurchase,
            tiers: cashbackPolicy.tiers,
          });
          cashbackUsed = actualUsed;
          cashbackEarned = recalc.cashbackEarned;
          total = recalc.payableTotal;
          const updated = await tx.update(orders).set({
            cashbackUsed,
            cashbackEarned,
            total,
          }).where(eq(orders.id, orderRow.id)).returning();
          orderRow = updated[0];
        }
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
    try {
      await db.insert(auditLog).values({
        actor: admin.email,
        action: "order.confirm_pos",
        entity: "order",
        payload: JSON.stringify({
          orderId: transitioned.order.id,
          branchId: rows[0].branchId,
          paymentStatus: transitioned.order.paymentStatus,
          fulfillmentStatus: transitioned.order.fulfillmentStatus,
        }),
      });
    } catch {
      // non-blocking
    }
    return res.json({ order: await serializeOrder(transitioned.order) });
  } catch (error) {
    return next(error);
  }
});

router.post("/orders/:id/cancel", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const rows = await db.select().from(orders).where(eq(orders.id, Number(req.params.id))).limit(1);
    if (!rows[0] || rows[0].customerId !== customer.id) {
      return res.status(404).json({ message: "Buyurtma topilmadi", code: "ORDER_NOT_FOUND" });
    }

    if (rows[0].fulfillmentStatus === "COMPLETED" || rows[0].fulfillmentStatus === "CANCELLED") {
      if (rows[0].fulfillmentStatus === "CANCELLED") {
        await voidPendingOrderPayments(rows[0].id, {
          actor: `customer:${customer.id}`,
          reason: "idempotent_customer_order_cancel",
        });
        return res.json({ ok: true, idempotent: true });
      }
      return res.status(400).json({
        message: "Bu buyurtmani bekor qilib bo‘lmaydi",
        code: "CANCEL_NOT_ALLOWED",
      });
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
 * Staff/admin cancel — uses orders:cancel + branch scope.
 * Releases reservation / reverses cashback USE via existing paths.
 * Does NOT invent PSP refunds; PAID orders return paymentRefundRequired.
 */
router.post("/orders/:id/admin-cancel", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "orders:cancel");
    const rows = await db.select().from(orders).where(eq(orders.id, Number(req.params.id))).limit(1);
    if (!rows[0]) {
      return res.status(404).json({ message: "Buyurtma topilmadi", code: "ORDER_NOT_FOUND" });
    }
    await assertBranchScope(admin, rows[0].branchId);

    if (rows[0].fulfillmentStatus === "COMPLETED" || rows[0].fulfillmentStatus === "CANCELLED") {
      if (rows[0].fulfillmentStatus === "CANCELLED") {
        await voidPendingOrderPayments(rows[0].id, {
          actor: `staff:${admin.email}`,
          reason: "idempotent_admin_order_cancel",
        });
        return res.json({ ok: true, idempotent: true, paymentRefundRequired: false });
      }
      return res.status(400).json({
        message: "Bu buyurtmani bekor qilib bo‘lmaydi",
        code: "CANCEL_NOT_ALLOWED",
      });
    }

    const wasPaid = rows[0].paymentStatus === "PAID" || rows[0].paymentStatus === "PARTIALLY_REFUNDED";

    await applyOrderTransition({
      orderId: rows[0].id,
      toFulfillment: "CANCELLED",
      actor: `staff:${admin.email}`,
      actorType: "staff",
      reason: "admin_order_cancel",
      inventory: "release",
    });

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

    if (rows[0].cashbackUsed > 0) {
      await reverseOrderUseOnCancel(rows[0].id, {
        actor: `staff:${admin.email}`,
        reason: "admin_order_cancel",
      });
    }

    const finalPaymentStatus = wasPaid ? rows[0].paymentStatus : "FAILED";

    try {
      await db.insert(auditLog).values({
        actor: admin.email,
        action: "order.cancel",
        entity: "order",
        payload: JSON.stringify({
          orderId: rows[0].id,
          branchId: rows[0].branchId,
          wasPaid,
          paymentRefundRequired: wasPaid,
          paymentStatus: finalPaymentStatus,
        }),
      });
    } catch {
      // non-blocking
    }

    return res.json({
      ok: true,
      paymentRefundRequired: wasPaid,
      paymentStatus: finalPaymentStatus,
      note: wasPaid
        ? "Buyurtma bekor qilindi. PSP refund CONTRACT_PENDING — pul avtomatik qaytarilmaydi."
        : "Buyurtma bekor qilindi.",
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * P5.5 — staff fulfillment transitions (all via applyOrderTransition).
 * Permission: orders:confirm_pos + branch scope.
 * Channel rules enforced in transition service.
 */
router.post("/orders/:id/confirm", async (req, res, next) => {
  try {
    const result = await staffTransition(req, Number(req.params.id), "CONFIRMED", "staff_confirm");
    return res.json({ order: await serializeOrder(result.order), idempotent: result.idempotent });
  } catch (error) {
    return next(error);
  }
});

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

router.post("/orders/:id/out-for-delivery", async (_req, res) => {
  return res.status(400).json({
    message: "Yetkazib berish o‘chirilgan. Faqat filialdan olib ketish.",
    code: "DELIVERY_DISABLED",
  });
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

    try {
      await db.insert(auditLog).values({
        actor: admin.email,
        action: `order.refund_cashback.${mode}`,
        entity: "order",
        payload: JSON.stringify({
          orderId,
          customerId: rows[0].customerId,
          branchId: rows[0].branchId,
          mode,
          earnReversalAmount: earnReversalAmount ?? null,
          reversalAmount: cashback.earnReversal?.amount ?? 0,
          idempotent: cashback.idempotent,
          openPolicy: cashback.openPolicy ?? null,
          reason: `cashback_${mode}_refund`,
        }),
      });
    } catch {
      // audit must not block refund
    }

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
