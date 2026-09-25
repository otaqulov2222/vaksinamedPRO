import { Router } from "express";
import { and, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import {
  auditLog,
  branches,
  cashbackAccounts,
  customers,
  db,
  orders,
  payments,
  productStocks,
  products,
  promos,
  rewards,
  staffRatings,
} from "@workspace/db";
import { loginAdmin, requireAdmin } from "../lib/auth";
import { serializeOrder } from "./orders";
import { rateLimit } from "../lib/rateLimit";
import { toAdminCustomerListItem } from "../lib/securityEnv";
import { prepareMerchantSecretForStorage, toAdminBranchPaymentDto } from "../lib/branchPaymentMerchant";
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
const ADMIN_CUSTOMERS_DEFAULT_LIMIT = 25;
const ADMIN_CUSTOMERS_MAX_LIMIT = 50;

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
    const { getPermissionsForRole } = await import("../lib/rbac");
    const perms = await getPermissionsForRole(user.role);
    return res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId },
      permissions: Array.from(perms).sort(),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/dashboard", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "dashboard:read");

    const requestedBranch = req.query.branchId != null ? Number(req.query.branchId) : undefined;
    let branchFilter: number | undefined;
    try {
      branchFilter = resolveStaffBranchFilter(
        user,
        Number.isFinite(requestedBranch as number) ? (requestedBranch as number) : undefined,
      );
    } catch (error) {
      return next(error);
    }

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

    const orderFilters: SQL[] = [];
    if (branchFilter != null) orderFilters.push(eq(orders.branchId, branchFilter));
    if (fromRange) orderFilters.push(gte(orders.createdAt, fromRange.start));
    if (toRange) orderFilters.push(lt(orders.createdAt, toRange.endExclusive));
    const orderWhere = orderFilters.length ? and(...orderFilters) : undefined;

    // Bounded aggregates — never load full tables into memory.
    const [orderKpis] = await db
      .select({
        orders: count(),
        completed: sql<number>`count(*) filter (where ${orders.status} = 'completed')`.mapWith(Number),
        reserved: sql<number>`count(*) filter (where ${orders.status} = 'reserved')`.mapWith(Number),
        delivering: sql<number>`count(*) filter (where ${orders.status} in ('awaiting_delivery', 'paid'))`.mapWith(Number),
        revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)`.mapWith(Number),
      })
      .from(orders)
      .where(orderWhere);

    // Customers / cashback / branch counts are global SoT snapshots (not date-filtered).
    const [customerCount] = await db.select({ value: count() }).from(customers);
    const [branchCount] = await db.select({ value: count() }).from(branches);
    const [cashbackSum] = await db
      .select({
        value: sql<number>`coalesce(sum(${cashbackAccounts.balance}), 0)`.mapWith(Number),
      })
      .from(cashbackAccounts);

    const recentJoined = await db
      .select({
        order: orders,
        customerId: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(orderWhere)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(8);

    const recentOrders = await Promise.all(recentJoined.map(async (row) => {
      const base = await serializeOrder(row.order);
      return {
        ...base,
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

    /**
     * Inventory snapshot — factual axes only.
     * No invented low-stock threshold: expose Available = 0 rows + lowest available list.
     * Requires branch scope (cashier forced; HQ must pick branchId).
     */
    let inventory: {
      branchId: number;
      stockRows: number;
      zeroAvailable: number;
      items: Array<{
        productId: number;
        sku: string;
        nameUz: string;
        physical: number;
        reserved: number;
        available: number;
      }>;
      note: string;
    } | null = null;

    if (branchFilter != null) {
      const stockRows = await db
        .select({
          productId: productStocks.productId,
          physical: productStocks.physicalQuantity,
          reserved: productStocks.reservedQuantity,
          available: productStocks.availableQuantity,
          sku: products.sku,
          nameUz: products.nameUz,
        })
        .from(productStocks)
        .innerJoin(products, eq(products.id, productStocks.productId))
        .where(eq(productStocks.branchId, branchFilter));

      const mapped = stockRows.map((s) => {
        const physical = Number(s.physical) || 0;
        const reserved = Number(s.reserved) || 0;
        const available = s.available != null ? Number(s.available) : physical - reserved;
        return {
          productId: s.productId,
          sku: s.sku,
          nameUz: s.nameUz,
          physical,
          reserved,
          available,
        };
      });
      const zeroAvailable = mapped.filter((m) => m.available <= 0).length;
      const items = [...mapped]
        .sort((a, b) => a.available - b.available || a.sku.localeCompare(b.sku))
        .slice(0, 12);
      inventory = {
        branchId: branchFilter,
        stockRows: mapped.length,
        zeroAvailable,
        items,
        note: "Threshold yo‘q — Available ≤ 0 va eng past available qatorlari (product_stocks).",
      };
    }

    return res.json({
      kpis: {
        revenue: Number(orderKpis?.revenue || 0),
        orders: Number(orderKpis?.orders || 0),
        completed: Number(orderKpis?.completed || 0),
        reserved: Number(orderKpis?.reserved || 0),
        delivering: Number(orderKpis?.delivering || 0),
        customers: Number(customerCount?.value || 0),
        branches: Number(branchCount?.value || 0),
        cashback: Number(cashbackSum?.value || 0),
        cashbackSource: "cashback_accounts",
        /** Date filter applies to order KPIs only. */
        customersScope: "global",
        cashbackScope: "global",
        branchesScope: "global",
      },
      filters: {
        branchId: branchFilter ?? null,
        createdFrom: typeof req.query.createdFrom === "string" ? req.query.createdFrom.trim() || null : null,
        createdTo: typeof req.query.createdTo === "string" ? req.query.createdTo.trim() || null : null,
        timezone: "Asia/Tashkent",
        orderKpisScoped: Boolean(branchFilter || fromRange || toRange),
      },
      recentOrders,
      inventory,
      capabilities: {
        dateFilter: true,
        branchFilter: true,
        inventoryThreshold: false,
        inventorySnapshotRequiresBranch: true,
      },
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
    let nextPaymeKey = current.paymeKey;
    let nextClickSecret = current.clickSecret;
    if (typeof body.paymeKey === "string" && body.paymeKey !== "••••" && body.paymeKey.trim()) {
      nextPaymeKey = prepareMerchantSecretForStorage(body.paymeKey.trim());
    }
    if (typeof body.clickSecret === "string" && body.clickSecret !== "••••" && body.clickSecret.trim()) {
      nextClickSecret = prepareMerchantSecretForStorage(body.clickSecret.trim());
    }
    const updated = await db.update(branches).set({
      name: typeof body.name === "string" ? body.name : current.name,
      phone: typeof body.phone === "string" ? body.phone : current.phone,
      hours: typeof body.hours === "string" ? body.hours : current.hours,
      address: typeof body.address === "string" ? body.address : current.address,
      isOpen: typeof body.isOpen === "boolean" ? body.isOpen : current.isOpen,
      paymeMerchantId: typeof body.paymeMerchantId === "string" ? body.paymeMerchantId : current.paymeMerchantId,
      paymeKey: nextPaymeKey,
      clickMerchantId: typeof body.clickMerchantId === "string" ? body.clickMerchantId : current.clickMerchantId,
      clickServiceId: typeof body.clickServiceId === "string" ? body.clickServiceId : current.clickServiceId,
      clickSecret: nextClickSecret,
    }).where(eq(branches.id, id)).returning();
    // Audit: never log secret values — only branch id + which fields updated (booleans)
    await db.insert(auditLog).values({
      actor: user.email,
      action: "branch.update",
      entity: "branch",
      payload: JSON.stringify({
        id,
        paymeCredentialUpdated: nextPaymeKey !== current.paymeKey,
        clickCredentialUpdated: nextClickSecret !== current.clickSecret,
      }),
    });
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

    const requested = req.query.branchId != null ? Number(req.query.branchId) : undefined;
    // Cashiers forced to own branch; HQ may omit branchId (catalog only, no invented stock).
    let stockBranchId: number | undefined;
    try {
      stockBranchId = resolveStaffBranchFilter(
        user,
        Number.isFinite(requested as number) ? (requested as number) : undefined,
      );
    } catch (error) {
      return next(error);
    }

    const productRows = await db.select().from(products).orderBy(desc(products.id));

    if (stockBranchId == null) {
      return res.json({
        products: productRows.map((p) => ({
          id: p.id,
          sku: p.sku,
          nameUz: p.nameUz,
          nameRu: p.nameRu,
          category: p.category,
          price: p.price,
          requiresPrescription: p.requiresPrescription,
          stock: null,
        })),
        stockBranchId: null,
        stockAxes: ["physical", "reserved", "available"],
        note: "Pass branchId to include authoritative product_stocks axes",
      });
    }

    const stocks = await db
      .select()
      .from(productStocks)
      .where(eq(productStocks.branchId, stockBranchId));
    const byProduct = new Map(stocks.map((s) => [s.productId, s]));

    return res.json({
      products: productRows.map((p) => {
        const s = byProduct.get(p.id);
        const physical = s ? Number(s.physicalQuantity) || 0 : 0;
        const reserved = s ? Number(s.reservedQuantity) || 0 : 0;
        const available = s?.availableQuantity != null
          ? Number(s.availableQuantity)
          : physical - reserved;
        return {
          id: p.id,
          sku: p.sku,
          nameUz: p.nameUz,
          nameRu: p.nameRu,
          category: p.category,
          price: p.price,
          requiresPrescription: p.requiresPrescription,
          stock: {
            branchId: stockBranchId,
            physical,
            reserved,
            available,
          },
        };
      }),
      stockBranchId,
      stockAxes: ["physical", "reserved", "available"],
    });
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
    try {
      await db.insert(auditLog).values({
        actor: user.email,
        action: "product.create",
        entity: "product",
        payload: JSON.stringify({ productId: created[0].id, sku: created[0].sku }),
      });
    } catch {
      // audit must not block create
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
    try {
      await db.insert(auditLog).values({
        actor: user.email,
        action: "product.update",
        entity: "product",
        payload: JSON.stringify({ productId: id }),
      });
    } catch {
      // audit must not block update
    }
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

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(ADMIN_CUSTOMERS_MAX_LIMIT, Math.floor(limitRaw))
      : ADMIN_CUSTOMERS_DEFAULT_LIMIT;
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
    const q = sanitizeAdminOrderSearch(typeof req.query.q === "string" ? req.query.q : "");

    const filters: SQL[] = [];
    if (q) {
      const pattern = `%${q}%`;
      filters.push(
        or(
          ilike(customers.firstName, pattern),
          ilike(customers.lastName, pattern),
          ilike(customers.phone, pattern),
          ilike(customers.telegramId, pattern),
        )!,
      );
    }
    const whereClause = filters.length ? and(...filters) : undefined;

    const totalRow = await db.select({ value: count() }).from(customers).where(whereClause);
    const total = Number(totalRow[0]?.value || 0);

    const rows = await db
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        tier: customers.tier,
        purchasesCount: customers.purchasesCount,
        cashbackBalance: cashbackAccounts.balance,
      })
      .from(customers)
      .leftJoin(cashbackAccounts, eq(cashbackAccounts.customerId, customers.id))
      .where(whereClause)
      .orderBy(desc(customers.id))
      .limit(limit)
      .offset(offset);

    const list = rows.map((row) =>
      toAdminCustomerListItem({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        phone: row.phone,
        tier: row.tier,
        purchasesCount: row.purchasesCount,
        cashbackBalance: row.cashbackBalance,
      }),
    );

    const hasMore = offset + rows.length < total;
    return res.json({
      customers: list,
      total,
      hasMore,
      pagination: { limit, offset, total, hasMore },
    });
  } catch (error) {
    return next(error);
  }
});

/** Read-only customer detail — cashback from SoT, not customers.balance. */
router.get("/admin/customers/:id", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "customers:read");
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(404).json({ message: "Mijoz topilmadi", code: "CUSTOMER_NOT_FOUND" });
    }
    const row = (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0];
    if (!row) return res.status(404).json({ message: "Mijoz topilmadi", code: "CUSTOMER_NOT_FOUND" });
    const [acct] = await db
      .select({ balance: cashbackAccounts.balance })
      .from(cashbackAccounts)
      .where(eq(cashbackAccounts.customerId, id))
      .limit(1);
    const listItem = toAdminCustomerListItem({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      tier: row.tier,
      purchasesCount: row.purchasesCount,
      cashbackBalance: acct?.balance ?? 0,
    });
    return res.json({
      customer: {
        ...listItem,
        language: row.language,
        totalPurchases: row.totalPurchases,
        savedAmount: row.savedAmount,
        createdAt: row.createdAt,
        cashbackSource: "cashback_accounts",
      },
    });
  } catch (error) {
    return next(error);
  }
});

/** Read-only cashback history via existing SoT projection (no engine change). */
router.get("/admin/customers/:id/cashback-history", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "customers:read");
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(404).json({ message: "Mijoz topilmadi", code: "CUSTOMER_NOT_FOUND" });
    }
    const exists = (await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1))[0];
    if (!exists) return res.status(404).json({ message: "Mijoz topilmadi", code: "CUSTOMER_NOT_FOUND" });
    const { getCustomerCashbackHistory } = await import("../lib/cashbackHistory");
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const page = await getCustomerCashbackHistory(id, {
      limit: Number.isFinite(limitRaw) ? limitRaw : 40,
      offset: Number.isFinite(offsetRaw) ? offsetRaw : 0,
    });
    return res.json({
      customerId: id,
      ...page,
      cashbackSource: "cashback_ledger",
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/admin/ratings", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    await requirePermission(user, "ratings:read");

    const requested = req.query.branchId != null ? Number(req.query.branchId) : undefined;
    // Never trust client branchId to expand access — cashiers forced to own branch.
    const branchFilter = resolveStaffBranchFilter(
      user,
      Number.isFinite(requested as number) ? (requested as number) : undefined,
    );

    const filters: SQL[] = [];
    if (branchFilter != null) {
      filters.push(eq(staffRatings.branchId, branchFilter));
    }
    const whereClause = filters.length ? and(...filters) : undefined;

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(100, Math.floor(limitRaw))
      : 50;
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

    const totalRow = await db.select({ value: count() }).from(staffRatings).where(whereClause);
    const total = Number(totalRow[0]?.value || 0);
    const rows = await db
      .select({
        id: staffRatings.id,
        branchId: staffRatings.branchId,
        orderId: staffRatings.orderId,
        employeeName: staffRatings.employeeName,
        rating: staffRatings.rating,
        comment: staffRatings.comment,
        createdAt: staffRatings.createdAt,
      })
      .from(staffRatings)
      .where(whereClause)
      .orderBy(desc(staffRatings.createdAt), desc(staffRatings.id))
      .limit(limit)
      .offset(offset);

    // Omit customerId from list DTO (least privilege); detail not exposed here.
    return res.json({
      ratings: rows,
      total,
      hasMore: offset + rows.length < total,
      branchFilter: branchFilter ?? null,
      pagination: { limit, offset, total },
    });
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
