import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, deliveries, orders, payments } from "@workspace/db";
import { markPaymentPaid } from "../lib/payments";
import { completeOrderCashback, serializeOrder } from "./orders";

const router = Router();

router.get("/payments/:provider/checkout/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
    if (!rows[0]) return res.status(404).send("To‘lov topilmadi");
    const order = (await db.select().from(orders).where(eq(orders.id, rows[0].orderId)))[0];
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(`<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vaksina Med to‘lov</title>
    <style>body{font-family:Inter,Arial,sans-serif;background:#fcfaff;color:#29153f;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}card{display:block;background:#fff;border:1px solid #e5d9ed;border-radius:24px;padding:28px;max-width:420px}h1{margin:0 0 8px}p{color:#7d7085}button{background:#603085;color:#fff;border:0;border-radius:14px;padding:14px 18px;font-weight:700;width:100%;margin-top:18px;cursor:pointer}</style></head>
    <body><form method="post" action="/api/payments/${id}/simulate-success"><div style="background:#fff;border:1px solid #e5d9ed;border-radius:24px;padding:28px;max-width:420px">
    <h1>Vaksina Med</h1><p>${rows[0].provider.toUpperCase()} · ${order?.code ?? ""}</p><h2>${new Intl.NumberFormat("uz-UZ").format(rows[0].amount)} so‘m</h2>
    <p>Bu filialning o‘z merchant kabineti orqali to‘lov. Real kalitlar admin panelda saqlanadi.</p>
    <button type="submit">To‘lovni tasdiqlash</button></div></form></body></html>`);
  } catch (error) {
    next(error);
  }
});

router.post("/payments/:id/simulate-success", async (req, res, next) => {
  try {
    const payment = await markPaymentPaid(Number(req.params.id));
    const order = (await db.select().from(orders).where(eq(orders.id, payment.orderId)))[0];
    const nextStatus = order.fulfillment === "delivery" ? "paid" : "reserved";
    await db.update(orders).set({ status: nextStatus }).where(eq(orders.id, order.id));
    if (order.fulfillment === "delivery") {
      // To‘lov qabul qilindi — cashback faqat yetkazilganda (qaytarish xavfsizligi)
    }
    const wantsJson = req.header("accept")?.includes("application/json") || req.header("content-type")?.includes("application/json");
    if (wantsJson) {
      res.json({ order: await serializeOrder((await db.select().from(orders).where(eq(orders.id, order.id)))[0]), payment });
      return;
    }
    res.redirect(302, `http://localhost:8081/order/${order.id}`);
  } catch (error) {
    next(error);
  }
});

router.post("/payments/payme/webhook", async (req, res, next) => {
  try {
    res.json({ ok: true, received: req.body ?? {} });
  } catch (error) {
    next(error);
  }
});

router.post("/payments/click/webhook", async (req, res, next) => {
  try {
    res.json({ ok: true, received: req.body ?? {} });
  } catch (error) {
    next(error);
  }
});

router.post("/deliveries/:orderId/status", async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    const status = String(req.body.status || "");
    if (!["pending", "assigned", "on_the_way", "delivered"].includes(status)) {
      return res.status(400).json({ message: "Noto‘g‘ri status" });
    }
    await db.update(deliveries).set({
      status,
      courierName: typeof req.body.courierName === "string" ? req.body.courierName : "",
    }).where(eq(deliveries.orderId, orderId));
    if (status === "delivered") {
      const order = (await db.select().from(orders).where(eq(orders.id, orderId)))[0];
      if (order) {
        await db.update(orders).set({ status: "completed" }).where(eq(orders.id, orderId));
        await completeOrderCashback(order);
      }
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
