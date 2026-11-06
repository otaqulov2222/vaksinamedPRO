/**
 * P8 — delivery routes (moved off payments router).
 * Business rule: home delivery is disabled network-wide — pickup only.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, orders } from "@workspace/db";
import { requireAdmin, requireCustomer } from "../lib/auth";
import { requirePermission } from "../lib/rbac";

const router = Router();

function deliveryDisabled(res: import("express").Response) {
  return res.status(400).json({
    message: "Yetkazib berish xizmati o‘chirilgan. Faqat filialdan olib ketish.",
    code: "DELIVERY_DISABLED",
  });
}

router.get("/admin/deliveries", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "delivery:update");
    return deliveryDisabled(res);
  } catch (error) {
    return next(error);
  }
});

/** Customer: always empty while delivery is disabled. */
router.get("/deliveries/order/:orderId", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const orderId = Number(req.params.orderId);
    const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!order || order.customerId !== customer.id) {
      return res.status(404).json({ message: "Buyurtma topilmadi" });
    }
    return res.json({ delivery: null, disabled: true, code: "DELIVERY_DISABLED" });
  } catch (error) {
    return next(error);
  }
});

router.post("/deliveries/:orderId/assign", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "delivery:update");
    return deliveryDisabled(res);
  } catch (error) {
    return next(error);
  }
});

router.post("/deliveries/:orderId/status", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "delivery:update");
    return deliveryDisabled(res);
  } catch (error) {
    return next(error);
  }
});

router.post("/deliveries/:orderId/external/sync", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "delivery:update");
    return deliveryDisabled(res);
  } catch (error) {
    return next(error);
  }
});

export default router;
