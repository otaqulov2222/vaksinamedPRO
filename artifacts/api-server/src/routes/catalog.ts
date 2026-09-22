import { Router } from "express";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { branches, db, products, productStocks, promos, rewards } from "@workspace/db";

const router = Router();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_QUERY_LEN = 80;

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

function parseOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function availableExpr() {
  return sql<number>`COALESCE(${productStocks.availableQuantity}, GREATEST(0, ${productStocks.physicalQuantity} - ${productStocks.reservedQuantity}))`;
}

router.get("/catalog/categories", async (_req, res, next) => {
  try {
    const rows = await db
      .selectDistinct({ category: products.category })
      .from(products)
      .orderBy(asc(products.category));
    return res.json({
      categories: rows.map((row) => row.category).filter(Boolean),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/catalog/products", async (req, res, next) => {
  try {
    const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const q = qRaw.slice(0, MAX_QUERY_LEN);
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort : "default";
    const limit = parseLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);

    let branchId = 0;
    if (req.query.branchId != null && String(req.query.branchId).trim() !== "") {
      branchId = Number(req.query.branchId);
      if (!Number.isFinite(branchId) || branchId <= 0) {
        return res.status(400).json({ message: "Filial ID noto‘g‘ri", code: "INVALID_BRANCH_ID" });
      }
      const branch = (await db.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1))[0];
      if (!branch) {
        return res.status(400).json({ message: "Filial topilmadi", code: "BRANCH_NOT_FOUND" });
      }
    }

    const filters: SQL[] = [];
    if (category) {
      filters.push(eq(products.category, category));
    }
    if (q) {
      const pattern = `%${q}%`;
      filters.push(
        or(
          ilike(products.nameUz, pattern),
          ilike(products.nameRu, pattern),
          ilike(products.manufacturer, pattern),
          ilike(products.sku, pattern),
        )!,
      );
    }
    const whereClause = filters.length ? and(...filters) : undefined;

    const orderBy = (() => {
      switch (sort) {
        case "price_asc":
          return [asc(products.price), asc(products.id)];
        case "price_desc":
          return [desc(products.price), asc(products.id)];
        case "name":
          return [asc(products.nameUz), asc(products.id)];
        default:
          return [asc(products.id)];
      }
    })();

    const totalRow = await db
      .select({ value: count() })
      .from(products)
      .where(whereClause);
    const total = Number(totalRow[0]?.value || 0);

    let rows: Array<typeof products.$inferSelect & { availableQuantity?: number | null }>;

    if (branchId) {
      const joined = await db
        .select({
          product: products,
          availableQuantity: availableExpr(),
        })
        .from(products)
        .leftJoin(
          productStocks,
          and(eq(productStocks.productId, products.id), eq(productStocks.branchId, branchId)),
        )
        .where(whereClause)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);

      rows = joined.map((row) => ({
        ...row.product,
        availableQuantity: row.availableQuantity == null ? 0 : Number(row.availableQuantity),
      }));
    } else {
      const plain = await db
        .select()
        .from(products)
        .where(whereClause)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);
      rows = plain;
    }

    const hasMore = offset + rows.length < total;

    return res.json({
      products: rows.map((item) => {
        if (!branchId) {
          return { ...item };
        }
        const available = Number(item.availableQuantity ?? 0);
        return {
          ...item,
          stock: available,
          availableQuantity: available,
          availabilityKnown: true,
          branchId,
        };
      }),
      /** Pagination metadata — `products` array preserved for compatibility. */
      pagination: {
        limit,
        offset,
        total,
        hasMore,
        nextOffset: hasMore ? offset + rows.length : null,
      },
      limit,
      offset,
      total,
      hasMore,
      branchId: branchId || null,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/catalog/products/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(404).json({ message: "Mahsulot topilmadi", code: "PRODUCT_NOT_FOUND" });
    }
    const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!rows[0]) return res.status(404).json({ message: "Mahsulot topilmadi", code: "PRODUCT_NOT_FOUND" });

    let branchId = 0;
    if (req.query.branchId != null && String(req.query.branchId).trim() !== "") {
      branchId = Number(req.query.branchId);
      if (!Number.isFinite(branchId) || branchId <= 0) {
        return res.status(400).json({ message: "Filial ID noto‘g‘ri", code: "INVALID_BRANCH_ID" });
      }
      const branch = (await db.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId)).limit(1))[0];
      if (!branch) {
        return res.status(400).json({ message: "Filial topilmadi", code: "BRANCH_NOT_FOUND" });
      }
    }

    const analogs = rows[0].analogGroup
      ? await db.select().from(products).where(eq(products.analogGroup, rows[0].analogGroup))
      : [];

    const stockQuery = db.select().from(productStocks).where(
      branchId
        ? and(eq(productStocks.productId, id), eq(productStocks.branchId, branchId))
        : eq(productStocks.productId, id),
    );
    const stockRows = await stockQuery;
    const availability = stockRows.map((row) => {
      const available =
        row.availableQuantity != null
          ? Number(row.availableQuantity)
          : Math.max(0, Number(row.physicalQuantity) - Number(row.reservedQuantity));
      return {
        branchId: row.branchId,
        physicalQuantity: Number(row.physicalQuantity),
        reservedQuantity: Number(row.reservedQuantity),
        availableQuantity: available,
      };
    });

    const selected = branchId
      ? availability.find((a) => a.branchId === branchId) || {
          branchId,
          physicalQuantity: 0,
          reservedQuantity: 0,
          availableQuantity: 0,
        }
      : null;

    return res.json({
      product: rows[0],
      analogs,
      availability,
      selectedBranchId: branchId || null,
      availableQuantity: selected ? selected.availableQuantity : undefined,
      availabilityScoped: Boolean(branchId),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/catalog/promos", async (_req, res, next) => {
  try {
    return res.json({ promos: await db.select().from(promos).where(eq(promos.active, true)) });
  } catch (error) {
    return next(error);
  }
});

router.get("/catalog/rewards", async (_req, res, next) => {
  try {
    return res.json({ rewards: await db.select().from(rewards) });
  } catch (error) {
    return next(error);
  }
});

export default router;
