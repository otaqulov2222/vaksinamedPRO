import { Router } from "express";
import { processFomSale } from "../lib/fomBridge";
import { completeOrderCashback, serializeOrder } from "./orders";
import { publicCashbackRules } from "../lib/cashback";
import { getMaxSpendRatio } from "../lib/cashbackFinance";
import { db, orders, staffRatings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin, requireCustomer } from "../lib/auth";
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

router.get("/integrations/fom/status", async (req, res, next) => {
  try {
    // Admin-authenticated only — do not expose integration topology anonymously.
    await requireAdmin(req);

    const ratio = await getMaxSpendRatio();
    const rules = publicCashbackRules(ratio);
    res.json({
      provider: "F-Apteka / DMED / F-Kassa",
      /** Honest: bridge exists; FOM_POS external receipt contract is NOT ready. */
      ready: false,
      mode: "bridge",
      status: "CONTRACT_PENDING",
      inventoryWriter: "OFF",
      fomInventoryWriterEnabled: false,
      fomPosContract: "CONTRACT_PENDING",
      commercialIdentity: {
        confirmPos: "ORDER",
        sourceKeyPattern: "order:{orders.id}",
        note: "Do not invent FOM_POS receipt IDs until vendor contract is stable",
      },
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
      note: "Inventory writer DISABLED. FOM_POS CONTRACT_PENDING. confirm-pos maps to ORDER commercial identity.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/ratings", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const body = req.body || {};

    // Trust boundary: never accept client customerId / branchId / employeeId / employeeName.
    const orderId = Number(body.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: "Baholash uchun buyurtma (orderId) majburiy" });
    }

    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Baholash 1 dan 5 gacha bo‘lsin" });
    }

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = orderRows[0];
    if (!order || order.customerId !== customer.id) {
      return res.status(404).json({ message: "Buyurtma topilmadi" });
    }

    const completed =
      order.fulfillmentStatus === "COMPLETED" || String(order.status).toLowerCase() === "completed";
    if (!completed) {
      return res.status(400).json({ message: "Faqat yakunlangan buyurtmani baholash mumkin" });
    }

    const existing = await db
      .select()
      .from(staffRatings)
      .where(eq(staffRatings.orderId, orderId))
      .limit(1);
    if (existing[0]) {
      return res.status(409).json({
        message: "Bu buyurtma allaqachon baholangan",
        rating: existing[0],
      });
    }

    // Branch derived from owned order — never from client body.
    const branchId = order.branchId;
    // No employee entity on orders — store honest branch-service label only.
    const BRANCH_SERVICE_LABEL = "Filial xizmati";

    const tags = Array.isArray(body.tags) ? body.tags.map(String).slice(0, 12) : [];
    const comment = String(body.comment || "").slice(0, 2000);

    const created = await db
      .insert(staffRatings)
      .values({
        customerId: customer.id,
        branchId,
        orderId: order.id,
        employeeName: BRANCH_SERVICE_LABEL,
        rating,
        tags: JSON.stringify(tags),
        comment,
      })
      .returning();

    return res.status(201).json({
      rating: created[0],
      // Echo ignored client forgeries so clients know they were not applied.
      ignored: {
        branchId: body.branchId != null,
        employeeName: body.employeeName != null,
        employeeId: body.employeeId != null,
        customerId: body.customerId != null,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
