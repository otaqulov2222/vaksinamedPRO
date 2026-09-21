import { Router } from "express";
import { processFomSale } from "../lib/fomBridge";
import { completeOrderCashback, serializeOrder } from "./orders";
import { publicCashbackRules } from "../lib/cashback";
import { db, orders, customers, staffRatings } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

/** Cashback qoidalari (ilova / kassa / FOM uchun ochiq) */
router.get("/cashback/rules", (_req, res) => {
  res.json(publicCashbackRules());
});

/**
 * FOM kassa webhook
 *
 * Walk-in:
 *   { receiptId, branchCode: "apteka53", customerQr, amount, paymentMethod: "click"|"payme"|"cash", cashbackToUse? }
 *
 * Ilova bron:
 *   { receiptId, orderCode: "VM-…", paymentMethod?, amount? }
 */
router.post("/integrations/fom/sale", async (req, res, next) => {
  try {
    const body = req.body || {};
    const result = await processFomSale({
      receiptId: String(body.receiptId || body.cheque || body.chek || `FOM-${Date.now()}`),
      branchCode: body.branchCode || body.filial || body.apteka,
      branchId: body.branchId != null ? Number(body.branchId) : undefined,
      customerQr: typeof body.customerQr === "string" ? body.customerQr
        : typeof body.qr === "string" ? body.qr
          : typeof body.loyaltyCard === "string" ? body.loyaltyCard
            : undefined,
      orderCode: body.orderCode || body.code || undefined,
      amount: body.amount != null ? Number(body.amount) : undefined,
      cashbackToUse: body.cashbackToUse != null ? Number(body.cashbackToUse) : Number(body.cashback || 0),
      paymentMethod: body.paymentMethod || body.payType || body.payment,
      barcodes: Array.isArray(body.barcodes) ? body.barcodes.map(String) : undefined,
      actor: "fom-webhook",
    });

    if (result.mode === "order") {
      await completeOrderCashback(result.order);
      const fresh = (await db.select().from(orders).where(eq(orders.id, result.order.id)))[0];
      return res.json({
        ok: true,
        ...result,
        order: await serializeOrder(fresh),
      });
    }

    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.get("/integrations/fom/status", async (_req, res) => {
  const rules = publicCashbackRules();
  res.json({
    provider: "F-Apteka / DMED / F-Kassa",
    ready: true,
    mode: "bridge",
    role: {
      fom: "Skan, narx, ombor, Click/Payme/naqd, chek",
      app: "Qidiruv, filial, bron, yetkazish, loyalty QR",
      bridge: "Chek yopilganda cashback / bron tasdiq",
    },
    endpoints: {
      sale: "POST /api/integrations/fom/sale",
      rules: "GET /api/cashback/rules",
      posLookup: "POST /api/pos/lookup",
      posSale: "POST /api/pos/sale",
      confirmPos: "POST /api/orders/:id/confirm-pos",
    },
    cashback: rules,
    sampleWalkIn: {
      receiptId: "FOM-20260919-001",
      branchCode: "apteka53",
      customerQr: "VAKSINA-100",
      amount: 126000,
      paymentMethod: "click",
      cashbackToUse: 0,
    },
    sampleOrder: {
      receiptId: "FOM-20260919-002",
      orderCode: "VM-XXXX",
      paymentMethod: "payme",
    },
  });
});

router.post("/ratings", async (req, res, next) => {
  try {
    const telegramId = String(req.body.telegramId || req.header("x-telegram-id") || "firdavs");
    const customer = (await db.select().from(customers).where(eq(customers.telegramId, telegramId)))[0];
    if (!customer) return res.status(404).json({ message: "Mijoz topilmadi" });
    const created = await db.insert(staffRatings).values({
      customerId: customer.id,
      branchId: Number(req.body.branchId) || 12,
      employeeName: String(req.body.employeeName || "Farmatsevt"),
      rating: Number(req.body.rating) || 5,
      tags: JSON.stringify(req.body.tags ?? []),
      comment: String(req.body.comment || ""),
    }).returning();
    res.status(201).json({ rating: created[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
