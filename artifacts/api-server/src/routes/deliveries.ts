/**
 * P8 — delivery routes (moved off payments router).
 * (workers returns fixed elsewhere)
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, orders } from "@workspace/db";
import { requireAdmin, requireCustomer } from "../lib/auth";
import { requirePermission, assertBranchScope } from "../lib/rbac";
import {
  assignCourier,
  getDeliveryByOrderId,
  serializeDeliveryPublic,
  transitionDelivery,
} from "../lib/deliveryService";
import { DELIVERY_STATUSES } from "../lib/deliveryLifecycle";
import { getDeliveryAdapter } from "../lib/deliveryAdapters";

const router = Router();

/** Customer: own order delivery status */
router.get("/deliveries/order/:orderId", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const orderId = Number(req.params.orderId);
    const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!order || order.customerId !== customer.id) {
      return res.status(404).json({ message: "Buyurtma topilmadi" });
    }
    const delivery = await getDeliveryByOrderId(orderId);
    return res.json({ delivery: delivery ? serializeDeliveryPublic(delivery) : null });
  } catch (error) {
    return next(error);
  }
});

/** Staff: assign courier (branch-scoped) */
router.post("/deliveries/:orderId/assign", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "delivery:update");
    const orderId = Number(req.params.orderId);
    const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
    await assertBranchScope(admin, order.branchId);

    const courierId = Number(req.body.courierId || admin.id);
    const courierName = String(req.body.courierName || admin.name || admin.email || "").trim();
    const courierBranchId = Number(req.body.courierBranchId ?? order.branchId);
    if (!courierName) return res.status(400).json({ message: "courierName majburiy" });

    const delivery = await assignCourier({
      orderId,
      courierId,
      courierName,
      courierBranchId,
      actor: admin.email,
      expectedOrderBranchId: order.branchId,
    });
    return res.json({ delivery: serializeDeliveryPublic(delivery) });
  } catch (error) {
    return next(error);
  }
});

/** Staff: status transition with delivery lifecycle guards */
router.post("/deliveries/:orderId/status", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "delivery:update");
    const orderId = Number(req.params.orderId);
    const status = String(req.body.status || "");
    if (!DELIVERY_STATUSES.includes(status as (typeof DELIVERY_STATUSES)[number])) {
      return res.status(400).json({ message: "Noto‘g‘ri status" });
    }
    const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
    await assertBranchScope(admin, order.branchId);

    const delivery = await transitionDelivery({
      orderId,
      toStatus: status,
      actor: admin.email,
      actorType: "staff",
      reason: typeof req.body.reason === "string" ? req.body.reason : `status_${status}`,
      courierName: typeof req.body.courierName === "string" ? req.body.courierName : undefined,
      courierId: req.body.courierId != null ? Number(req.body.courierId) : undefined,
      courierBranchId: req.body.courierBranchId != null ? Number(req.body.courierBranchId) : undefined,
    });
    return res.json({ delivery: serializeDeliveryPublic(delivery), actor: admin.email });
  } catch (error) {
    return next(error);
  }
});

/** External provider probe — always CONTRACT_PENDING until contract exists */
router.post("/deliveries/:orderId/external/sync", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "delivery:update");
    const orderId = Number(req.params.orderId);
    const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
    await assertBranchScope(admin, order.branchId);
    const delivery = await getDeliveryByOrderId(orderId);
    if (!delivery) return res.status(404).json({ message: "Yetkazib berish topilmadi" });
    const adapter = getDeliveryAdapter("external");
    const result = await adapter.syncStatus!({
      deliveryId: delivery.id,
      providerRef: delivery.providerRef,
    });
    return res.status(result.ok ? 200 : 501).json(result);
  } catch (error) {
    return next(error);
  }
});

export default router;
