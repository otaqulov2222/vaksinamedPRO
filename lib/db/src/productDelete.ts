import { eq } from "drizzle-orm";
import { cartItems, orderItems } from "./schema/commerce";
import { products, productStocks } from "./schema/catalog";
import { inventoryMovements, reservationItems } from "./schema/inventory";

export type ProductDeleteBlockedBy = "order" | "reservation";

export type ProductDeleteInspect = {
  found: boolean;
  sku: string | null;
  nameUz: string | null;
  blockedBy: ProductDeleteBlockedBy | null;
};

export type ProductDeleteResult =
  | { ok: true; id: number; sku: string }
  | { ok: false; code: "NOT_FOUND" | "PRODUCT_IN_USE"; blockedBy?: ProductDeleteBlockedBy };

type DbLike = {
  select: (...args: never[]) => any;
  delete: (...args: never[]) => any;
  transaction?: (fn: (tx: DbLike) => Promise<unknown>) => Promise<unknown>;
};

async function withTx<T>(db: DbLike, fn: (tx: DbLike) => Promise<T>): Promise<T> {
  if (typeof db.transaction === "function") {
    return db.transaction(fn) as Promise<T>;
  }
  return fn(db);
}

/** Remove cart / stock / movement rows, then the product. Caller must have checked order/reservation refs. */
export async function deleteProductGraph(db: DbLike, productId: number): Promise<void> {
  await db.delete(cartItems).where(eq(cartItems.productId, productId));
  await db.delete(inventoryMovements).where(eq(inventoryMovements.productId, productId));
  await db.delete(productStocks).where(eq(productStocks.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
}

export async function inspectProductDelete(db: DbLike, productId: number): Promise<ProductDeleteInspect> {
  const rows = (await db.select().from(products).where(eq(products.id, productId)).limit(1)) as Array<{
    id: number;
    sku: string;
    nameUz: string;
  }>;
  const row = rows[0];
  if (!row) return { found: false, sku: null, nameUz: null, blockedBy: null };

  const orderHits = (await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.productId, productId))
    .limit(1)) as Array<{ id: number }>;
  if (orderHits[0]) {
    return { found: true, sku: row.sku, nameUz: row.nameUz, blockedBy: "order" };
  }

  const reservationHits = (await db
    .select({ id: reservationItems.id })
    .from(reservationItems)
    .where(eq(reservationItems.productId, productId))
    .limit(1)) as Array<{ id: number }>;
  if (reservationHits[0]) {
    return { found: true, sku: row.sku, nameUz: row.nameUz, blockedBy: "reservation" };
  }

  return { found: true, sku: row.sku, nameUz: row.nameUz, blockedBy: null };
}

/**
 * Hard-delete a catalog product that has never been ordered or reserved.
 * Cart lines, stock rows and inventory movements are removed with the SKU.
 */
export async function deleteUnusedProduct(db: DbLike, productId: number): Promise<ProductDeleteResult> {
  const inspect = await inspectProductDelete(db, productId);
  if (!inspect.found) return { ok: false, code: "NOT_FOUND" };
  if (inspect.blockedBy) {
    return { ok: false, code: "PRODUCT_IN_USE", blockedBy: inspect.blockedBy };
  }

  await withTx(db, async (tx) => {
    await deleteProductGraph(tx, productId);
  });

  return { ok: true, id: productId, sku: inspect.sku || "" };
}
