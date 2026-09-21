import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { branches, cartItems, customers, db, deliveries, loyaltyLedger, orderItems, orders, productStocks, products } from "@workspace/db";
import { requireAdmin, requireCustomer } from "../lib/auth";
import { DELIVERY_FEE, RESERVE_HOURS, formatDate, orderCode, computeCashback } from "../lib/money";
import { createBranchPayment } from "../lib/payments";
import { confirmFomSale } from "../lib/fom";
import { cartPayload, getOrCreateCart } from "./cart";

const router = Router();

export async function completeOrderCashback(order: typeof orders.$inferSelect) {
  if (order.cashbackEarned <= 0) return order;
  const existingEarn = await db.select().from(loyaltyLedger).where(eq(loyaltyLedger.orderId, order.id));
  if (existingEarn.some((item) => item.kind === "earn")) return order;
  const customer = (await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1))[0];
  if (!customer) return order;
  await db.update(customers).set({
    balance: customer.balance + order.cashbackEarned,
    purchasesCount: customer.purchasesCount + 1,
    totalPurchases: customer.totalPurchases + order.subtotal,
    savedAmount: customer.savedAmount + order.cashbackEarned,
  }).where(eq(customers.id, customer.id));
  const branch = (await db.select().from(branches).where(eq(branches.id, order.branchId)).limit(1))[0];
  await db.insert(loyaltyLedger).values({
    customerId: customer.id,
    orderId: order.id,
    externalId: order.code,
    date: formatDate(),
    title: "Buyurtma cashback",
    branch: branch?.name ?? "Vaksina Med",
    amount: order.total,
    cashback: order.cashbackEarned,
    kind: "earn",
  });
  return order;
}

export async function serializeOrder(order: typeof orders.$inferSelect) {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const branch = (await db.select().from(branches).where(eq(branches.id, order.branchId)).limit(1))[0];
  const delivery = (await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1))[0] ?? null;
  return { ...order, items, branch, delivery, qrPayload: `VAKSINA-${order.code}` };
}

router.get("/orders", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const rows = await db.select().from(orders).where(eq(orders.customerId, customer.id)).orderBy(desc(orders.createdAt));
    res.json({ orders: await Promise.all(rows.map(serializeOrder)) });
  } catch (error) {
    next(error);
  }
});

router.get("/orders/:id", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const rows = await db.select().from(orders).where(eq(orders.id, Number(req.params.id))).limit(1);
    if (!rows[0] || rows[0].customerId !== customer.id) return res.status(404).json({ message: "Buyurtma topilmadi" });
    res.json({ order: await serializeOrder(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.post("/orders", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const fulfillment = req.body.fulfillment === "delivery" ? "delivery" : "pickup";
    const paymentMethod = ["payme", "click", "pay_at_branch", "cod"].includes(req.body.paymentMethod) ? req.body.paymentMethod : "pay_at_branch";
    const address = typeof req.body.address === "string" ? req.body.address.trim() : "";
    const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
    const useCashback = Boolean(req.body.useCashback);
    const payload = await cartPayload(customer.id);
    if (!payload.items.length) return res.status(400).json({ message: "Savat bo‘sh" });
    const branchId = Number(req.body.branchId || payload.cart.branchId);
    const branch = (await db.select().from(branches).where(eq(branches.id, branchId)).limit(1))[0];
    if (!branch) return res.status(400).json({ message: "Filial tanlang" });
    if (fulfillment === "delivery" && address.length < 8) return res.status(400).json({ message: "Yetkazib berish manzili kiriting" });

    for (const item of payload.items) {
      const stock = (await db.select().from(productStocks).where(eq(productStocks.productId, item.productId)).limit(200)).find((row) => row.branchId === branch.id);
      if (!stock || stock.quantity < item.quantity) {
        return res.status(400).json({ message: `${item.product.nameUz} ${branch.name} filialida yetarli emas` });
      }
    }

    const deliveryFee = fulfillment === "delivery" ? DELIVERY_FEE : 0;
    const calc = computeCashback({
      goodsAmount: payload.subtotal,
      cashbackToUse: useCashback ? customer.balance : 0,
      balance: customer.balance,
      tier: customer.tier,
      deliveryFee,
    });
    const cashbackUsed = useCashback ? calc.cashbackUsed : 0;
    const cashbackEarned = calc.cashbackEarned;
    const total = calc.payableTotal;
    const reservedUntil = fulfillment === "pickup" ? new Date(Date.now() + RESERVE_HOURS * 60 * 60 * 1000) : null;
    const initialStatus = paymentMethod === "payme" || paymentMethod === "click" ? "pending_payment" : fulfillment === "pickup" ? "reserved" : "awaiting_delivery";

    const created = await db.insert(orders).values({
      code: orderCode(),
      customerId: customer.id,
      branchId: branch.id,
      fulfillment,
      status: initialStatus,
      paymentMethod,
      subtotal: payload.subtotal,
      deliveryFee,
      cashbackUsed,
      cashbackEarned,
      total,
      address,
      comment,
      reservedUntil,
    }).returning();
    const order = created[0];

    await db.insert(orderItems).values(payload.items.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      title: item.product.nameUz,
      price: item.product.price,
      quantity: item.quantity,
    })));

    for (const item of payload.items) {
      const stock = (await db.select().from(productStocks).where(eq(productStocks.productId, item.productId))).find((row) => row.branchId === branch.id);
      if (stock) {
        await db.update(productStocks).set({ quantity: Math.max(0, stock.quantity - item.quantity) }).where(eq(productStocks.id, stock.id));
      }
    }

    if (fulfillment === "delivery") {
      await db.insert(deliveries).values({
        orderId: order.id,
        address,
        timeWindow: typeof req.body.window === "string" ? req.body.window : "Bugun 10:00 — 18:00",
        status: "pending",
      });
    }

    if (cashbackUsed > 0) {
      await db.update(customers).set({ balance: customer.balance - cashbackUsed }).where(eq(customers.id, customer.id));
      await db.insert(loyaltyLedger).values({
        customerId: customer.id,
        orderId: order.id,
        externalId: `${order.code}-USE`,
        date: formatDate(),
        title: "Cashback ishlatildi",
        branch: branch.name,
        amount: cashbackUsed,
        cashback: cashbackUsed,
        kind: "use",
      });
    }

    const cart = await getOrCreateCart(customer.id);
    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));

    const payment = await createBranchPayment({
      orderId: order.id,
      branch,
      provider: paymentMethod,
      amount: total,
    });

    res.status(201).json({ order: await serializeOrder(order), payment });
  } catch (error) {
    next(error);
  }
});

router.post("/orders/:id/confirm-pos", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req).catch(() => null);
    const rows = await db.select().from(orders).where(eq(orders.id, Number(req.params.id))).limit(1);
    if (!rows[0]) return res.status(404).json({ message: "Buyurtma topilmadi" });
    const confirmed = await confirmFomSale({
      orderCode: rows[0].code,
      receiptId: typeof req.body.receiptId === "string" ? req.body.receiptId : `POS-${Date.now()}`,
      actor: admin?.email ?? "kassa",
    });
    await completeOrderCashback(confirmed);
    res.json({ order: await serializeOrder((await db.select().from(orders).where(eq(orders.id, confirmed.id)))[0]) });
  } catch (error) {
    next(error);
  }
});

router.post("/orders/:id/cancel", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const rows = await db.select().from(orders).where(eq(orders.id, Number(req.params.id))).limit(1);
    if (!rows[0] || rows[0].customerId !== customer.id) return res.status(404).json({ message: "Buyurtma topilmadi" });
    if (["completed", "cancelled"].includes(rows[0].status)) return res.status(400).json({ message: "Bu buyurtmani bekor qilib bo‘lmaydi" });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, rows[0].id));
    for (const item of items) {
      const stock = (await db.select().from(productStocks).where(eq(productStocks.productId, item.productId))).find((row) => row.branchId === rows[0].branchId);
      if (stock) await db.update(productStocks).set({ quantity: stock.quantity + item.quantity }).where(eq(productStocks.id, stock.id));
    }
    if (rows[0].cashbackUsed > 0) {
      const fresh = (await db.select().from(customers).where(eq(customers.id, customer.id)))[0];
      await db.update(customers).set({ balance: fresh.balance + rows[0].cashbackUsed }).where(eq(customers.id, customer.id));
    }
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, rows[0].id));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;

