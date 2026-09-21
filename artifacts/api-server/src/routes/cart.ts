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

async function cartPayload(customerId: number) {
  const cart = await getOrCreateCart(customerId);
  const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
  const detailed = [];
  for (const item of items) {
    const product = (await db.select().from(products).where(eq(products.id, item.productId)).limit(1))[0];
    if (!product) continue;
    detailed.push({ ...item, product, lineTotal: product.price * item.quantity });
  }
  const subtotal = detailed.reduce((sum, item) => sum + item.lineTotal, 0);
  const branch = cart.branchId ? (await db.select().from(branches).where(eq(branches.id, cart.branchId)).limit(1))[0] : null;
  return { cart, items: detailed, subtotal, branch };
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
    const cart = await getOrCreateCart(customer.id);
    await db.update(carts).set({ branchId, updatedAt: new Date() }).where(eq(carts.id, cart.id));
    res.json(await cartPayload(customer.id));
  } catch (error) {
    next(error);
  }
});

router.post("/cart/items", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const productId = Number(req.body.productId);
    const quantity = Math.max(1, Number(req.body.quantity) || 1);
    const cart = await getOrCreateCart(customer.id);
    const existing = await db.select().from(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, productId))).limit(1);
    if (existing[0]) {
      await db.update(cartItems).set({ quantity: existing[0].quantity + quantity }).where(eq(cartItems.id, existing[0].id));
    } else {
      await db.insert(cartItems).values({ cartId: cart.id, productId, quantity });
    }
    res.json(await cartPayload(customer.id));
  } catch (error) {
    next(error);
  }
});

router.patch("/cart/items/:id", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const cart = await getOrCreateCart(customer.id);
    const quantity = Number(req.body.quantity);
    if (quantity <= 0) {
      await db.delete(cartItems).where(and(eq(cartItems.id, Number(req.params.id)), eq(cartItems.cartId, cart.id)));
    } else {
      await db.update(cartItems).set({ quantity }).where(and(eq(cartItems.id, Number(req.params.id)), eq(cartItems.cartId, cart.id)));
    }
    res.json(await cartPayload(customer.id));
  } catch (error) {
    next(error);
  }
});

router.delete("/cart/items/:id", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const cart = await getOrCreateCart(customer.id);
    await db.delete(cartItems).where(and(eq(cartItems.id, Number(req.params.id)), eq(cartItems.cartId, cart.id)));
    res.json(await cartPayload(customer.id));
  } catch (error) {
    next(error);
  }
});

export default router;
export { cartPayload, getOrCreateCart };
