import { Router } from "express";
import { processFomSale } from "../lib/fomBridge";
import { completeOrderCashback, serializeOrder } from "./orders";
import { publicCashbackRules } from "../lib/cashback";
import { getMaxSpendRatio } from "../lib/cashbackFinance";
import { db, orders, staffRatings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireCustomer } from "../lib/auth";
import { assertFomWebhookAuthorized } from "../lib/securityEnv";

const router = Router();

/** Cashback qoidalari (ilova / kassa / FOM uchun ochiq) — spend ratio from server settings */
router.get("/cashback/rules", async (_req, res, next) => {
  try {
    const ratio = await getMaxSpendRatio();
    res.json(publicCashbackRules(ratio));
  } catch (error) {
    next(error);
  }
});

/**
 * FOM kassa webhook
 * Auth: header `x-fom-secret` or `Authorization: Bearer <FOM_WEBHOOK_SECRET>`
 * Production/staging: secret required (fail closed).
 */
router.post("/integrations/fom/sale", async (req, res, next) => {
  try {
    const headerSecret = req.header("x-fom-secret")
      || req.header("authorization")?.replace(/^Bearer\s+/i, "");
    assertFomWebhookAuthorized(headerSecret);

    const body = req.body || {};
    const receiptId = String(body.receiptId || body.cheque || body.chek || "").trim();
    if (!receiptId) {
      return res.status(400).json({
        message: "receiptId (yoki cheque/chek) majburiy",
        code: "FOM_RECEIPT_REQUIRED",
      });
    }
    const result = await processFomSale({
      receiptId,
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

    const orderPayload = (result as { mode?: string; order?: { id?: number }; idempotent?: boolean });
    if (orderPayload.mode === "order" && orderPayload.order && !orderPayload.idempotent) {
      await completeOrderCashback(orderPayload.order as typeof orders.$inferSelect);
      const fresh = (await db.select().from(orders).where(eq(orders.id, Number(orderPayload.order.id))).limit(1))[0];
      return res.json({
        ok: true,
        ...result,
        order: await serializeOrder(fresh),
      });
    }
    if (orderPayload.mode === "order" && orderPayload.idempotent && orderPayload.order) {
      const oid = Number(orderPayload.order.id);
      if (oid) {
        const fresh = (await db.select().from(orders).where(eq(orders.id, oid)).limit(1))[0];
        if (fresh) {
          return res.json({ ok: true, ...result, order: await serializeOrder(fresh) });
        }
      }
    }

    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

router.get("/integrations/fom/status", async (_req, res, next) => {
  try {
    const ratio = await getMaxSpendRatio();
    const rules = publicCashbackRules(ratio);
    res.json({
      provider: "F-Apteka / DMED / F-Kassa",
      ready: true,
      mode: "bridge",
      auth: "x-fom-secret or Bearer FOM_WEBHOOK_SECRET (required in production)",
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
      openDependency: "FOM vendor receipt identity beyond receiptId/orderCode aliases is not invented",
      inventoryWriter: "DISABLED",
      fomInventoryWriterEnabled: false,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/ratings", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
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
