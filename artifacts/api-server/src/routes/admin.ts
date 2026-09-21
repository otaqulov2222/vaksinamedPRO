import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { auditLog, branches, customers, db, orders, payments, productStocks, products, promos, rewards, staffRatings } from "@workspace/db";
import { loginAdmin, requireAdmin } from "../lib/auth";
import { serializeOrder } from "./orders";
import { rateLimit } from "../lib/rateLimit";
import { isHqAdminRole, publicAdminCustomer } from "../lib/securityEnv";
import { toAdminBranchPaymentDto } from "../lib/branchPaymentMerchant";
import { assertBranchScope, requirePermission } from "../lib/rbac";
import { revokeSessionFromToken } from "../lib/sessions";
import { recordAuthEvent } from "../lib/authEvents";
import { adjustStock, expireDueReservations } from "../lib/inventory";

const router = Router();

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  key: (req) => `admin-login:${req.ip}`,
});

router.post("/admin/login", adminLoginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase();
    const password = String(req.body.password || "");
    const result = await loginAdmin(email, password, req);
    return res.json({
      token: result.token,
      user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role, branchId: result.user.branchId },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/admin/logout", async (req, res, next) => {
  try {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const result = await revokeSessionFromToken(token, { actorType: "admin" });
    await recordAuthEvent({
      actorType: "admin",
      eventType: "logout",
      success: true,
      meta: { revoked: result.revoked },
    });
    return res.json({ ok: true, revoked: result.revoked });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/me", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    return res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId } });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/dashboard", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "dashboard:read");
    const allOrders = await db.select().from(orders);
    const allCustomers = await db.select().from(customers);
    const allBranches = await db.select().from(branches);
    const completed = allOrders.filter((item) => item.status === "completed");
    const revenue = completed.reduce((sum, item) => sum + item.total, 0);
    const reserved = allOrders.filter((item) => item.status === "reserved").length;
    const delivering = allOrders.filter((item) => ["awaiting_delivery", "paid"].includes(item.status)).length;
    return res.json({
      kpis: {
        revenue,
        orders: allOrders.length,
        completed: completed.length,
        reserved,
        delivering,
        customers: allCustomers.length,
        branches: allBranches.length,
        cashback: allCustomers.reduce((sum, item) => sum + item.balance, 0),
      },
      recentOrders: await Promise.all(allOrders.slice(-8).reverse().map(serializeOrder)),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/branches", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "branches:read");
    const rows = await db.select().from(branches);
    return res.json({
      branches: rows.map((item) => ({
        ...item,
        ...toAdminBranchPaymentDto(item),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/admin/branches/:id", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "branches:manage");
    const id = Number(req.params.id);
    await assertBranchScope(user, id);
    const current = (await db.select().from(branches).where(eq(branches.id, id)).limit(1))[0];
    if (!current) return res.status(404).json({ message: "Filial topilmadi" });
    const body = req.body ?? {};
    const updated = await db.update(branches).set({
      name: typeof body.name === "string" ? body.name : current.name,
      phone: typeof body.phone === "string" ? body.phone : current.phone,
      hours: typeof body.hours === "string" ? body.hours : current.hours,
      address: typeof body.address === "string" ? body.address : current.address,
      isOpen: typeof body.isOpen === "boolean" ? body.isOpen : current.isOpen,
      paymeMerchantId: typeof body.paymeMerchantId === "string" ? body.paymeMerchantId : current.paymeMerchantId,
      paymeKey: typeof body.paymeKey === "string" && body.paymeKey !== "••••" ? body.paymeKey : current.paymeKey,
      clickMerchantId: typeof body.clickMerchantId === "string" ? body.clickMerchantId : current.clickMerchantId,
      clickServiceId: typeof body.clickServiceId === "string" ? body.clickServiceId : current.clickServiceId,
      clickSecret: typeof body.clickSecret === "string" && body.clickSecret !== "••••" ? body.clickSecret : current.clickSecret,
    }).where(eq(branches.id, id)).returning();
    // Audit: never log secret values — only branch id
    await db.insert(auditLog).values({ actor: user.email, action: "branch.update", entity: "branch", payload: JSON.stringify({ id }) });
    return res.json({
      branch: {
        ...updated[0],
        ...toAdminBranchPaymentDto(updated[0]),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/products", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "products:read");
    return res.json({ products: await db.select().from(products) });
  } catch (error) {
    return next(error);
  }
});

router.post("/admin/products", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "products:manage");
    const body = req.body ?? {};
    const created = await db.insert(products).values({
      sku: String(body.sku),
      nameUz: String(body.nameUz),
      nameRu: String(body.nameRu || body.nameUz),
      category: String(body.category || "Boshqa"),
      manufacturer: String(body.manufacturer || "Vaksina Med"),
      description: String(body.description || ""),
      price: Number(body.price) || 0,
      icon: String(body.icon || "pill"),
      analogGroup: String(body.analogGroup || ""),
      requiresPrescription: Boolean(body.requiresPrescription),
    }).returning();
    const allBranches = await db.select().from(branches);
    if (allBranches.length) {
      await db.insert(productStocks).values(allBranches.map((branch) => ({
        productId: created[0].id,
        branchId: branch.id,
        quantity: Number(body.quantity) || 10,
      })));
    }
    return res.status(201).json({ product: created[0] });
  } catch (error) {
    return next(error);
  }
});

router.patch("/admin/products/:id", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "products:manage");
    const id = Number(req.params.id);
    const current = (await db.select().from(products).where(eq(products.id, id)))[0];
    if (!current) return res.status(404).json({ message: "Mahsulot topilmadi" });
    const body = req.body ?? {};
    const updated = await db.update(products).set({
      nameUz: typeof body.nameUz === "string" ? body.nameUz : current.nameUz,
      nameRu: typeof body.nameRu === "string" ? body.nameRu : current.nameRu,
      category: typeof body.category === "string" ? body.category : current.category,
      price: typeof body.price === "number" ? body.price : current.price,
      description: typeof body.description === "string" ? body.description : current.description,
      requiresPrescription: typeof body.requiresPrescription === "boolean" ? body.requiresPrescription : current.requiresPrescription,
    }).where(eq(products.id, id)).returning();
    return res.json({ product: updated[0] });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/orders", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "orders:read");
    let rows = await db.select().from(orders);
    if (!isHqAdminRole(user.role) && user.branchId) {
      rows = rows.filter((o) => o.branchId === user.branchId);
    }
    return res.json({ orders: await Promise.all(rows.reverse().map(serializeOrder)) });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/customers", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "customers:read");
    const rows = await db.select().from(customers);
    return res.json({ customers: rows.map((row) => publicAdminCustomer(row as unknown as Record<string, unknown>)) });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/ratings", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "ratings:read");
    return res.json({ ratings: await db.select().from(staffRatings).orderBy(desc(staffRatings.createdAt)) });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/promos", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "promos:read");
    return res.json({ promos: await db.select().from(promos), rewards: await db.select().from(rewards) });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/audit", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "audit:read");
    return res.json({ audit: await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)) });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/payments", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "payments:read");
    // Legacy payments list — strip nothing sensitive (no secrets on legacy rows).
    // P7 reconciliation detail: GET /admin/payments/intents/:id
    const rows = await db.select().from(payments).orderBy(desc(payments.id)).limit(200);
    const scoped = [];
    for (const row of rows) {
      try {
        await assertBranchScope(user, row.branchId);
        scoped.push({
          id: row.id,
          orderId: row.orderId,
          provider: row.provider,
          branchId: row.branchId,
          merchantId: row.merchantId,
          status: row.status,
          amount: row.amount,
          currency: row.currency,
          paymentIntentId: row.paymentIntentId,
          externalId: row.externalId,
        });
      } catch {
        // skip out-of-scope branch rows
      }
    }
    return res.json({ payments: scoped });
  } catch (error) {
    return next(error);
  }
});

/**
 * P4.7 — controlled inventory adjustment (HQ permission + branch scope).
 * Cashier without inventory:adjust cannot call this.
 */
router.post("/admin/inventory/adjust", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "inventory:adjust");
    const body = req.body ?? {};
    const branchId = Number(body.branchId);
    const productId = Number(body.productId);
    const physicalDelta = Number(body.physicalDelta);
    await assertBranchScope(user, branchId);
    const result = await adjustStock({
      branchId,
      productId,
      physicalDelta,
      reason: String(body.reason || ""),
      actor: user.email,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : null,
      meta: { adminId: user.id, role: user.role },
    });
    await db.insert(auditLog).values({
      actor: user.email,
      action: "inventory.adjust",
      entity: "product_stock",
      payload: JSON.stringify({
        branchId,
        productId,
        physicalDelta,
        reason: body.reason,
        adjusted: result.adjusted,
        idempotent: result.idempotent,
      }),
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

/**
 * P4.6 — ops/worker trigger for due reservation expiry (not an in-memory timer).
 */
router.post("/admin/inventory/expire-due", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "inventory:adjust");
    const body = req.body ?? {};
    const result = await expireDueReservations({
      limit: body.limit != null ? Number(body.limit) : undefined,
      actor: user.email,
    });
    await db.insert(auditLog).values({
      actor: user.email,
      action: "inventory.expire_due",
      entity: "reservation",
      payload: JSON.stringify(result),
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

export default router;
