import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { branches, cartItems, carts, db, productStocks, products } from "@workspace/db";
import { requireCustomer } from "../lib/auth";

const router = Router();

async function getOrCreateCart(customerId: number) {
  const existing = await db.select().from(carts).where(eq(carts.customerId, customerId)).limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db.insert(carts).values({ customerId }).returning();
  return inserted[0];
}

function availableFromStock(stock: typeof productStocks.$inferSelect | undefined): number {
  if (!stock) return 0;
  if (stock.availableQuantity != null) return Math.max(0, Number(stock.availableQuantity));
  return Math.max(0, Number(stock.physicalQuantity) - Number(stock.reservedQuantity));
}

async function cartPayload(customerId: number) {
  const cart = await getOrCreateCart(customerId);
  const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
  const detailed = [];
  const notices: Array<{ code: string; message: string; productId?: number; cartItemId?: number }> = [];

  for (const item of items) {
    const product = (await db.select().from(products).where(eq(products.id, item.productId)).limit(1))[0];
    if (!product) {
      await db.delete(cartItems).where(and(eq(cartItems.id, item.id), eq(cartItems.cartId, cart.id)));
      notices.push({
        code: "PRODUCT_REMOVED",
        message: "Mahsulot katalogdan olib tashlangan — savatdan o‘chirildi",
        productId: item.productId,
        cartItemId: item.id,
      });
      continue;
    }
    let available: number | null = null;
    if (cart.branchId) {
      const stock = (await db.select().from(productStocks).where(and(
        eq(productStocks.productId, item.productId),
        eq(productStocks.branchId, cart.branchId),
      )).limit(1))[0];
      available = availableFromStock(stock);
      if (available < item.quantity) {
        notices.push({
          code: "STOCK_CHANGED",
          message: `Mavjud miqdor o‘zgargan (mavjud: ${available})`,
          productId: item.productId,
          cartItemId: item.id,
        });
      }
    }
    detailed.push({
      ...item,
      product,
      /** Current catalog unit price — not a cart financial snapshot. Checkout recalculates. */
      unitPrice: product.price,
      lineTotal: product.price * item.quantity,
      available,
      availabilityKnown: cart.branchId != null,
      stockInsufficient: cart.branchId != null && available != null && available < item.quantity,
    });
  }
  const subtotal = detailed.reduce((sum, item) => sum + item.lineTotal, 0);
  const branch = cart.branchId
    ? (await db.select().from(branches).where(eq(branches.id, cart.branchId)).limit(1))[0]
    : null;
  return {
    cart,
    items: detailed,
    subtotal,
    branch: branch || null,
    branchRequired: true,
    notices,
    /** Prices are live catalog values; historical cart price is not stored. */
    priceAuthority: "catalog_current" as const,
  };
}

router.get("/cart", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    res.json(await cartPayload(customer.id));
  } catch (error) {
    next(error);
  }
});

router.post("/cart/branch", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const branchId = Number(req.body.branchId);
    if (!Number.isFinite(branchId) || branchId <= 0) {
      return res.status(400).json({ message: "Filial tanlang", code: "BRANCH_REQUIRED" });
    }
    const branch = (await db.select().from(branches).where(eq(branches.id, branchId)).limit(1))[0];
    if (!branch) {
      return res.status(400).json({ message: "Filial topilmadi", code: "BRANCH_NOT_FOUND" });
    }
    if (!branch.isOpen) {
      return res.status(400).json({ message: "Filial hozir ochiq emas", code: "BRANCH_CLOSED" });
    }
    const cart = await getOrCreateCart(customer.id);
    await db.update(carts).set({ branchId: branch.id, updatedAt: new Date() }).where(eq(carts.id, cart.id));
    return res.json(await cartPayload(customer.id));
  } catch (error) {
    return next(error);
  }
});

router.post("/cart/items", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const productId = Number(req.body.productId);
    const quantity = Math.max(1, Math.floor(Number(req.body.quantity) || 1));
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ message: "Mahsulot identifikatori noto‘g‘ri", code: "INVALID_PRODUCT" });
    }
    const product = (await db.select().from(products).where(eq(products.id, productId)).limit(1))[0];
    if (!product) return res.status(404).json({ message: "Mahsulot topilmadi", code: "PRODUCT_NOT_FOUND" });

    const cart = await getOrCreateCart(customer.id);
    const existing = await db.select().from(cartItems).where(and(
      eq(cartItems.cartId, cart.id),
      eq(cartItems.productId, productId),
    )).limit(1);
    const nextQty = (existing[0]?.quantity || 0) + quantity;

    // Soft availability check when cart has a branch — checkout remains authoritative.
    if (cart.branchId) {
      const stock = (await db.select().from(productStocks).where(and(
        eq(productStocks.productId, productId),
        eq(productStocks.branchId, cart.branchId),
      )).limit(1))[0];
      const available = availableFromStock(stock);
      if (available < nextQty) {
        return res.status(400).json({
          message: `Yetarli qoldiq yo‘q (mavjud: ${available})`,
          code: "STOCK_UNAVAILABLE",
          available,
        });
      }
    }

    if (existing[0]) {
      await db.update(cartItems).set({ quantity: nextQty }).where(eq(cartItems.id, existing[0].id));
    } else {
      await db.insert(cartItems).values({ cartId: cart.id, productId, quantity });
    }
    return res.json(await cartPayload(customer.id));
  } catch (error) {
    return next(error);
  }
});

router.patch("/cart/items/:id", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const cart = await getOrCreateCart(customer.id);
    const itemId = Number(req.params.id);
    const quantity = Math.floor(Number(req.body.quantity));
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return res.status(400).json({ message: "Savat elementi noto‘g‘ri", code: "INVALID_CART_ITEM" });
    }

    const existing = (await db.select().from(cartItems).where(and(
      eq(cartItems.id, itemId),
      eq(cartItems.cartId, cart.id),
    )).limit(1))[0];
    if (!existing) {
      return res.status(404).json({ message: "Savat elementi topilmadi", code: "CART_ITEM_NOT_FOUND" });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
      return res.json(await cartPayload(customer.id));
    }

    if (cart.branchId) {
      const stock = (await db.select().from(productStocks).where(and(
        eq(productStocks.productId, existing.productId),
        eq(productStocks.branchId, cart.branchId),
      )).limit(1))[0];
      const available = availableFromStock(stock);
      if (available < quantity) {
        return res.status(400).json({
          message: `Yetarli qoldiq yo‘q (mavjud: ${available})`,
          code: "STOCK_UNAVAILABLE",
          available,
        });
      }
    }

    await db.update(cartItems).set({ quantity }).where(and(
      eq(cartItems.id, itemId),
      eq(cartItems.cartId, cart.id),
    ));
    return res.json(await cartPayload(customer.id));
  } catch (error) {
    return next(error);
  }
});

router.delete("/cart/items/:id", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const cart = await getOrCreateCart(customer.id);
    await db.delete(cartItems).where(and(
      eq(cartItems.id, Number(req.params.id)),
      eq(cartItems.cartId, cart.id),
    ));
    return res.json(await cartPayload(customer.id));
  } catch (error) {
    return next(error);
  }
});

export default router;
export { cartPayload, getOrCreateCart };
