import { Router } from "express";
import { and, count, desc, eq, gte, ilike, lt, or, type SQL } from "drizzle-orm";
import { auditLog, branches, customers, db, orders, payments, productStocks, products, promos, rewards, staffRatings } from "@workspace/db";
import { loginAdmin, requireAdmin } from "../lib/auth";
import { serializeOrder } from "./orders";
import { rateLimit } from "../lib/rateLimit";
import { publicAdminCustomer } from "../lib/securityEnv";
import { toAdminBranchPaymentDto } from "../lib/branchPaymentMerchant";
import { adminHasPermission, assertBranchScope, requirePermission, resolveStaffBranchFilter } from "../lib/rbac";
import { revokeSessionFromToken } from "../lib/sessions";
import { recordAuthEvent } from "../lib/authEvents";
import { adjustStock, expireDueReservations } from "../lib/inventory";
import {
  adminCustomerIdentity,
  sanitizeAdminOrderSearch,
  sanitizeAuditPayload,
  tashkentBusinessDayUtcRange,
} from "../lib/adminOrderOps";

const router = Router();

const ADMIN_ORDERS_DEFAULT_LIMIT = 25;
const ADMIN_ORDERS_MAX_LIMIT = 50;
const ADMIN_AUDIT_DEFAULT_LIMIT = 40;
const ADMIN_AUDIT_MAX_LIMIT = 100;

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

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(ADMIN_ORDERS_MAX_LIMIT, Math.floor(limitRaw))
      : ADMIN_ORDERS_DEFAULT_LIMIT;
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
    const q = sanitizeAdminOrderSearch(typeof req.query.q === "string" ? req.query.q : "");
    const fulfillmentStatus = typeof req.query.fulfillmentStatus === "string"
      ? req.query.fulfillmentStatus.trim().toUpperCase()
      : "";
    const paymentStatus = typeof req.query.paymentStatus === "string"
      ? req.query.paymentStatus.trim().toUpperCase()
      : "";
    const reservationStatus = typeof req.query.reservationStatus === "string"
      ? req.query.reservationStatus.trim().toUpperCase()
      : "";
    const requestedBranch = req.query.branchId != null ? Number(req.query.branchId) : undefined;
    const branchFilter = resolveStaffBranchFilter(
      user,
      Number.isFinite(requestedBranch as number) ? (requestedBranch as number) : undefined,
    );
    const fromRange = typeof req.query.createdFrom === "string"
      ? tashkentBusinessDayUtcRange(req.query.createdFrom)
      : null;
    const toRange = typeof req.query.createdTo === "string"
      ? tashkentBusinessDayUtcRange(req.query.createdTo)
      : null;
    if (
      (typeof req.query.createdFrom === "string" && req.query.createdFrom.trim() && !fromRange)
      || (typeof req.query.createdTo === "string" && req.query.createdTo.trim() && !toRange)
    ) {
      return res.status(400).json({
        message: "createdFrom/createdTo YYYY-MM-DD (Asia/Tashkent business day) bo‘lishi kerak",
        code: "INVALID_DATE_FILTER",
      });
    }

    const filters: SQL[] = [];
    if (branchFilter) filters.push(eq(orders.branchId, branchFilter));
    if (fulfillmentStatus) filters.push(eq(orders.fulfillmentStatus, fulfillmentStatus));
    if (paymentStatus) filters.push(eq(orders.paymentStatus, paymentStatus));
    if (reservationStatus) filters.push(eq(orders.reservationStatus, reservationStatus));
    if (fromRange) filters.push(gte(orders.createdAt, fromRange.start));
    if (toRange) filters.push(lt(orders.createdAt, toRange.endExclusive));
    if (q) {
      const pattern = `%${q}%`;
      filters.push(or(
        ilike(orders.code, pattern),
        ilike(customers.phone, pattern),
        ilike(customers.firstName, pattern),
        ilike(customers.lastName, pattern),
      )!);
    }
    const whereClause = filters.length ? and(...filters) : undefined;

    const totalRow = await db
      .select({ value: count() })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(whereClause);
    const total = Number(totalRow[0]?.value || 0);
    const joined = await db
      .select({
        order: orders,
        customerId: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(whereClause)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit)
      .offset(offset);

    const serialized = await Promise.all(joined.map(async (row) => {
      const base = await serializeOrder(row.order);
      return {
        ...base,
        // List: name + id only. Phone OPEN for long-term masking policy — omitted from list rows.
        customer: row.customerId != null
          ? adminCustomerIdentity({
            id: row.customerId,
            firstName: row.firstName,
            lastName: row.lastName,
            phone: row.phone,
          }, { includePhone: false })
          : null,
      };
    }));

    const hasMore = offset + joined.length < total;
    return res.json({
      orders: serialized,
      pagination: {
        limit,
        offset,
        total,
        hasMore,
        nextOffset: hasMore ? offset + joined.length : null,
        timezone: "Asia/Tashkent",
      },
      limit,
      offset,
      total,
      hasMore,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/orders/:id", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "orders:read");
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(404).json({ message: "Buyurtma topilmadi", code: "ORDER_NOT_FOUND" });
    }
    const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!rows[0]) {
      return res.status(404).json({ message: "Buyurtma topilmadi", code: "ORDER_NOT_FOUND" });
    }
    await assertBranchScope(user, rows[0].branchId);
    const order = await serializeOrder(rows[0]);
    const customerRow = (await db.select().from(customers).where(eq(customers.id, rows[0].customerId)).limit(1))[0];
    const customer = customerRow
      ? adminCustomerIdentity(customerRow, { includePhone: true })
      : null;
    const fulfillmentOpen =
      rows[0].fulfillmentStatus !== "COMPLETED"
      && rows[0].fulfillmentStatus !== "CANCELLED";
    const mayCancel = await adminHasPermission(user, "orders:cancel");
    const mayConfirmPos = await adminHasPermission(user, "orders:confirm_pos");
    return res.json({
      order: { ...order, customer },
      capabilities: {
        canCancel: fulfillmentOpen && mayCancel,
        canConfirmPos: fulfillmentOpen && mayConfirmPos,
        canTransitionFulfillment: fulfillmentOpen && mayConfirmPos,
        paymentRefundsViaPsp: false,
        reservationExpired: Boolean(order.reservationExpired),
        note: "PSP refund CONTRACT_PENDING — admin cancel does not invent provider refund",
        /** OPEN: cashier cancel / PAID cancel / expiry→order cancel — see Batch 3I report */
        openPolicy: {
          cashierCancel: "OPEN — seeded RBAC denies orders:cancel for cashier",
          paidCancelRefund: "OPEN — cancel allowed by fulfillment; PSP refund not implemented",
          reservationExpiryAutoCancel: "OPEN — expiry releases reservation only",
          completedRequiresPaid: "OPEN — staff COMPLETED may dual-write PAID (existing)",
          customerPhoneMasking: "OPEN — detail shows full phone; list omits phone",
        },
      },
    });
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

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(ADMIN_AUDIT_MAX_LIMIT, Math.floor(limitRaw))
      : ADMIN_AUDIT_DEFAULT_LIMIT;
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
    const action = typeof req.query.action === "string" ? req.query.action.trim().slice(0, 80) : "";
    const entity = typeof req.query.entity === "string" ? req.query.entity.trim().slice(0, 80) : "";

    const filters: SQL[] = [];
    if (action) filters.push(ilike(auditLog.action, `%${action.replace(/[%_\\]/g, "")}%`));
    if (entity) filters.push(eq(auditLog.entity, entity));
    const whereClause = filters.length ? and(...filters) : undefined;

    const totalRow = await db.select({ value: count() }).from(auditLog).where(whereClause);
    const total = Number(totalRow[0]?.value || 0);
    const rows = await db
      .select()
      .from(auditLog)
      .where(whereClause)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit)
      .offset(offset);

    const audit = rows.map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      entity: row.entity,
      createdAt: row.createdAt,
      metadata: sanitizeAuditPayload(row.payload),
    }));

    const hasMore = offset + rows.length < total;
    return res.json({
      audit,
      pagination: { limit, offset, total, hasMore, nextOffset: hasMore ? offset + rows.length : null },
      readOnly: true,
    });
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
