import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, products, productStocks, promos, rewards } from "@workspace/db";

const router = Router();

router.get("/catalog/categories", async (_req, res, next) => {
  try {
    const rows = await db.select({ category: products.category }).from(products);
    res.json({ categories: [...new Set(rows.map((row) => row.category))] });
  } catch (error) {
    next(error);
  }
});

router.get("/catalog/products", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category : "";
    const branchId = Number(req.query.branchId) || 0;
    const rows = await db.select().from(products);
    const filtered = rows.filter((item) => {
      const hay = `${item.nameUz} ${item.nameRu} ${item.manufacturer} ${item.sku}`.toLowerCase();
      const okQuery = !q || hay.includes(q.toLowerCase());
      const okCat = !category || item.category === category;
      return okQuery && okCat;
    });
    let stocks: Array<{ productId: number; quantity: number }> = [];
    if (branchId) {
      stocks = await db.select({ productId: productStocks.productId, quantity: productStocks.quantity }).from(productStocks).where(eq(productStocks.branchId, branchId));
    }
    const stockMap = new Map(stocks.map((item) => [item.productId, item.quantity]));
    res.json({
      products: filtered.map((item) => ({
        ...item,
        stock: branchId ? stockMap.get(item.id) ?? 0 : undefined,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/catalog/products/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!rows[0]) return res.status(404).json({ message: "Mahsulot topilmadi" });
            const analogs = rows[0].analogGroup
      ? await db.select().from(products).where(eq(products.analogGroup, rows[0].analogGroup))
      : [];
    const availability = await db.select().from(productStocks).where(eq(productStocks.productId, id));
    res.json({ product: rows[0], analogs, availability });
  } catch (error) {
    next(error);
  }
});

router.get("/catalog/promos", async (_req, res, next) => {
  try {
    res.json({ promos: await db.select().from(promos).where(eq(promos.active, true)) });
  } catch (error) {
    next(error);
  }
});

router.get("/catalog/rewards", async (_req, res, next) => {
  try {
    res.json({ rewards: await db.select().from(rewards) });
  } catch (error) {
    next(error);
  }
});

export default router;
