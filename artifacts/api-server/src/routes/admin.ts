import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { auditLog, branches, customers, db, orders, payments, productStocks, products, promos, rewards, staffRatings } from "@workspace/db";
import { loginAdmin, requireAdmin } from "../lib/auth";
import { serializeOrder } from "./orders";

const router = Router();

router.post("/admin/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase();
    const password = String(req.body.password || "");
    const result = await loginAdmin(email, password);
    res.json({
      token: result.token,
      user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role, branchId: result.user.branchId },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/me", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId } });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/dashboard", async (req, res, next) => {
  try {
    await requireAdmin(req);
    const allOrders = await db.select().from(orders);
    const allCustomers = await db.select().from(customers);
    const allBranches = await db.select().from(branches);
    const completed = allOrders.filter((item) => item.status === "completed");
    const revenue = completed.reduce((sum, item) => sum + item.total, 0);
    const reserved = allOrders.filter((item) => item.status === "reserved").length;
    const delivering = allOrders.filter((item) => ["awaiting_delivery", "paid"].includes(item.status)).length;
    res.json({
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
    next(error);
  }
});

router.get("/admin/branches", async (req, res, next) => {
  try {
    await requireAdmin(req);
    const rows = await db.select().from(branches);
    res.json({
      branches: rows.map((item) => ({
        ...item,
        hasPayme: Boolean(item.paymeMerchantId && item.paymeKey),
        hasClick: Boolean(item.clickMerchantId && item.clickSecret),
        paymeKey: item.paymeKey ? "••••" : "",
        clickSecret: item.clickSecret ? "••••" : "",
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/branches/:id", async (req, res, next) => {
  try {
    const user = await requireAdmin(req);
    const id = Number(req.params.id);
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
    await db.insert(auditLog).values({ actor: user.email, action: "branch.update", entity: "branch", payload: JSON.stringify({ id }) });
    res.json({ branch: updated[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/products", async (req, res, next) => {
  try {
    await requireAdmin(req);
    res.json({ products: await db.select().from(products) });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/products", async (req, res, next) => {
  try {
    await requireAdmin(req);
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
    res.status(201).json({ product: created[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/admin/products/:id", async (req, res, next) => {
  try {
    await requireAdmin(req);
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
    res.json({ product: updated[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/orders", async (req, res, next) => {
  try {
    await requireAdmin(req);
    const rows = await db.select().from(orders);
    res.json({ orders: await Promise.all(rows.reverse().map(serializeOrder)) });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/customers", async (req, res, next) => {
  try {
    await requireAdmin(req);
    res.json({ customers: await db.select().from(customers) });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/ratings", async (req, res, next) => {
  try {
    await requireAdmin(req);
    res.json({ ratings: await db.select().from(staffRatings).orderBy(desc(staffRatings.createdAt)) });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/promos", async (req, res, next) => {
  try {
    await requireAdmin(req);
    res.json({ promos: await db.select().from(promos), rewards: await db.select().from(rewards) });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/audit", async (req, res, next) => {
  try {
    await requireAdmin(req);
    res.json({ audit: await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)) });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/payments", async (req, res, next) => {
  try {
    await requireAdmin(req);
    res.json({ payments: await db.select().from(payments) });
  } catch (error) {
    next(error);
  }
});

export default router;
