import { and, eq, sql } from "drizzle-orm";
import {
  db,
  inventoryMovements,
  orders,
  reservationItems,
  reservations,
  type Reservation,
} from "@workspace/db";

/** Keep orders.reservation_status mirror in sync when reservation leaves ACTIVE. */
async function syncOrderReservationMirror(
  tx: DbLike,
  orderId: number | null | undefined,
  reservationStatus: "EXPIRED" | "CANCELLED" | "FULFILLED",
) {
  if (orderId == null || !Number.isFinite(Number(orderId)) || Number(orderId) <= 0) return;
  await tx
    .update(orders)
    .set({ reservationStatus })
    .where(eq(orders.id, Number(orderId)));
}

type DbLike = typeof db;

export type ReserveItem = { productId: number; quantity: number };

export type ReserveInput = {
  branchId: number;
  customerId?: number | null;
  orderId?: number | null;
  items: ReserveItem[];
  idempotencyKey?: string | null;
  expiresAt?: Date | null;
  actor?: string;
};

function stockUnavailable(message = "Mahsulot filialida yetarli emas") {
  return Object.assign(new Error(message), { status: 400, code: "STOCK_UNAVAILABLE" });
}

function badRequest(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
}

function rowsOf(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: any[] }).rows;
  }
  return [];
}

/** Aggregate quantities by productId; reject non-positive qty. */
export function normalizeReserveItems(items: ReserveItem[]): ReserveItem[] {
  const map = new Map<number, number>();
  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    if (!Number.isFinite(productId) || productId <= 0) {
      throw badRequest("Mahsulot identifikatori noto‘g‘ri");
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      throw badRequest("Bron miqdori butun musbat son bo‘lishi kerak");
    }
    map.set(productId, (map.get(productId) || 0) + quantity);
  }
  return [...map.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId - b.productId);
}

async function loadReservationBundle(executor: DbLike, reservationId: number) {
  const rows = await executor.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  const reservation = rows[0];
  if (!reservation) return null;
  const items = await executor
    .select()
    .from(reservationItems)
    .where(eq(reservationItems.reservationId, reservationId));
  return { reservation, items };
}

async function withTx<T>(executor: DbLike, alreadyInTx: boolean, fn: (tx: DbLike) => Promise<T>): Promise<T> {
  if (alreadyInTx) return fn(executor);
  return (executor as typeof db).transaction(async (tx) => fn(tx as unknown as DbLike));
}

/**
 * AVAILABLE → RESERVED
 * Locks stock rows in product_id order; does not decrease physical_quantity.
 */
export async function reserveStock(
  input: ReserveInput,
  executor: DbLike = db,
  opts: { alreadyInTx?: boolean } = {},
): Promise<{
  reservation: Reservation;
  items: typeof reservationItems.$inferSelect[];
  idempotent: boolean;
}> {
  const items = normalizeReserveItems(input.items);
  if (!items.length) throw badRequest("Bron qilinadigan mahsulot yo‘q");
  if (!Number.isFinite(input.branchId) || input.branchId <= 0) {
    throw badRequest("Filial tanlang");
  }

  const key = input.idempotencyKey?.trim() || null;

  return withTx(executor, Boolean(opts.alreadyInTx), async (tx) => {
    if (key) {
      const existing = await tx.select().from(reservations).where(eq(reservations.idempotencyKey, key)).limit(1);
      if (existing[0]) {
        const bundle = await loadReservationBundle(tx, existing[0].id);
        if (!bundle) throw badRequest("Bron topilmadi", 404);
        return { ...bundle, idempotent: true };
      }
    }

    for (const item of items) {
      const locked = await tx.execute(sql`
        SELECT id, physical_quantity, reserved_quantity
        FROM product_stocks
        WHERE branch_id = ${input.branchId} AND product_id = ${item.productId}
        FOR UPDATE
      `);
      const stock = rowsOf(locked)[0] as
        | { id: number; physical_quantity: number; reserved_quantity: number }
        | undefined;
      if (!stock) throw stockUnavailable();
      const available = Number(stock.physical_quantity) - Number(stock.reserved_quantity);
      if (available < item.quantity) throw stockUnavailable();

      const updated = await tx.execute(sql`
        UPDATE product_stocks
        SET reserved_quantity = reserved_quantity + ${item.quantity}
        WHERE id = ${stock.id}
          AND physical_quantity - reserved_quantity >= ${item.quantity}
        RETURNING id
      `);
      if (!rowsOf(updated)[0]) throw stockUnavailable();
    }

    let reservation: Reservation;
    try {
      const inserted = await tx.insert(reservations).values({
        orderId: input.orderId ?? null,
        customerId: input.customerId ?? null,
        branchId: input.branchId,
        status: "ACTIVE",
        expiresAt: input.expiresAt ?? null,
        idempotencyKey: key,
        updatedAt: new Date(),
      }).returning();
      reservation = inserted[0];
    } catch (error: unknown) {
      if (key && String((error as Error)?.message || "").toLowerCase().includes("unique")) {
        const existing = await tx.select().from(reservations).where(eq(reservations.idempotencyKey, key)).limit(1);
        if (existing[0]) {
          const bundle = await loadReservationBundle(tx, existing[0].id);
          if (bundle) return { ...bundle, idempotent: true };
        }
      }
      throw error;
    }

    const itemRows = await tx.insert(reservationItems).values(
      items.map((item) => ({
        reservationId: reservation.id,
        productId: item.productId,
        quantity: item.quantity,
      })),
    ).returning();

    for (const item of items) {
      await tx.insert(inventoryMovements).values({
        branchId: input.branchId,
        productId: item.productId,
        movementType: "RESERVE",
        quantity: item.quantity,
        physicalDelta: 0,
        reservedDelta: item.quantity,
        reservationId: reservation.id,
        orderId: input.orderId ?? null,
        actor: input.actor || "system",
        reason: "reserve",
        idempotencyKey: key ? `${key}:RESERVE:${item.productId}` : `reservation:${reservation.id}:RESERVE:${item.productId}`,
      });
    }

    return { reservation, items: itemRows, idempotent: false };
  });
}

/** RESERVED → AVAILABLE (CANCELLED or EXPIRED). Idempotent. */
export async function releaseReservation(
  reservationId: number,
  opts: { actor?: string; toStatus?: "CANCELLED" | "EXPIRED"; reason?: string; alreadyInTx?: boolean } = {},
  executor: DbLike = db,
): Promise<{ reservation: Reservation; released: boolean }> {
  const toStatus = opts.toStatus || "CANCELLED";

  return withTx(executor, Boolean(opts.alreadyInTx), async (tx) => {
    const locked = await tx.execute(sql`
      SELECT id, status, branch_id, order_id
      FROM reservations
      WHERE id = ${reservationId}
      FOR UPDATE
    `);
    const row = rowsOf(locked)[0] as
      | { id: number; status: string; branch_id: number; order_id: number | null }
      | undefined;
    if (!row) throw badRequest("Bron topilmadi", 404);

    if (row.status === "CANCELLED" || row.status === "EXPIRED") {
      const bundle = await loadReservationBundle(tx, reservationId);
      return { reservation: bundle!.reservation, released: false };
    }
    if (row.status === "FULFILLED") {
      throw badRequest("Bajarilgan bronni qaytarib bo‘lmaydi", 409);
    }
    if (row.status !== "ACTIVE") {
      throw badRequest("Bron holati noto‘g‘ri", 409);
    }

    const items = await tx.select().from(reservationItems).where(eq(reservationItems.reservationId, reservationId));
    const sorted = [...items].sort((a, b) => a.productId - b.productId);

    for (const item of sorted) {
      await tx.execute(sql`
        SELECT id FROM product_stocks
        WHERE branch_id = ${row.branch_id} AND product_id = ${item.productId}
        FOR UPDATE
      `);
      await tx.execute(sql`
        UPDATE product_stocks
        SET reserved_quantity = GREATEST(0, reserved_quantity - ${item.quantity})
        WHERE branch_id = ${row.branch_id} AND product_id = ${item.productId}
      `);

      try {
        await tx.insert(inventoryMovements).values({
          branchId: row.branch_id,
          productId: item.productId,
          movementType: "RELEASE",
          quantity: item.quantity,
          physicalDelta: 0,
          reservedDelta: -item.quantity,
          reservationId,
          orderId: row.order_id,
          actor: opts.actor || "system",
          reason: opts.reason || toStatus.toLowerCase(),
          idempotencyKey: `reservation:${reservationId}:RELEASE:${item.productId}`,
        });
      } catch (error: unknown) {
        if (!String((error as Error)?.message || "").toLowerCase().includes("unique")) throw error;
      }
    }

    const updated = await tx
      .update(reservations)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(and(eq(reservations.id, reservationId), eq(reservations.status, "ACTIVE")))
      .returning();

    if (!updated[0]) {
      const bundle = await loadReservationBundle(tx, reservationId);
      return { reservation: bundle!.reservation, released: false };
    }
    await syncOrderReservationMirror(tx, row.order_id, toStatus);
    return { reservation: updated[0], released: true };
  });
}

/** RESERVED → CONSUMED (FULFILLED). Idempotent. */
export async function consumeReservation(
  reservationId: number,
  opts: { actor?: string; reason?: string; alreadyInTx?: boolean } = {},
  executor: DbLike = db,
): Promise<{ reservation: Reservation; consumed: boolean }> {
  return withTx(executor, Boolean(opts.alreadyInTx), async (tx) => {
    const locked = await tx.execute(sql`
      SELECT id, status, branch_id, order_id
      FROM reservations
      WHERE id = ${reservationId}
      FOR UPDATE
    `);
    const row = rowsOf(locked)[0] as
      | { id: number; status: string; branch_id: number; order_id: number | null }
      | undefined;
    if (!row) throw badRequest("Bron topilmadi", 404);

    if (row.status === "FULFILLED") {
      const bundle = await loadReservationBundle(tx, reservationId);
      return { reservation: bundle!.reservation, consumed: false };
    }
    if (row.status !== "ACTIVE") {
      throw badRequest("Faqat faol bronni yakunlash mumkin", 409);
    }

    const items = await tx.select().from(reservationItems).where(eq(reservationItems.reservationId, reservationId));
    const sorted = [...items].sort((a, b) => a.productId - b.productId);

    for (const item of sorted) {
      const stockLock = await tx.execute(sql`
        SELECT id, physical_quantity, reserved_quantity
        FROM product_stocks
        WHERE branch_id = ${row.branch_id} AND product_id = ${item.productId}
        FOR UPDATE
      `);
      const stock = rowsOf(stockLock)[0] as
        | { id: number; physical_quantity: number; reserved_quantity: number }
        | undefined;
      if (!stock) throw badRequest("Ombor qatori topilmadi", 500);
      if (Number(stock.reserved_quantity) < item.quantity || Number(stock.physical_quantity) < item.quantity) {
        throw badRequest("Ombor holati bron bilan mos emas", 409);
      }

      const updated = await tx.execute(sql`
        UPDATE product_stocks
        SET
          reserved_quantity = reserved_quantity - ${item.quantity},
          physical_quantity = physical_quantity - ${item.quantity},
          quantity = GREATEST(0, quantity - ${item.quantity})
        WHERE id = ${stock.id}
          AND reserved_quantity >= ${item.quantity}
          AND physical_quantity >= ${item.quantity}
        RETURNING id
      `);
      if (!rowsOf(updated)[0]) throw badRequest("Ombor holati bron bilan mos emas", 409);

      try {
        await tx.insert(inventoryMovements).values({
          branchId: row.branch_id,
          productId: item.productId,
          movementType: "CONSUME",
          quantity: item.quantity,
          physicalDelta: -item.quantity,
          reservedDelta: -item.quantity,
          reservationId,
          orderId: row.order_id,
          actor: opts.actor || "system",
          reason: opts.reason || "fulfill",
          idempotencyKey: `reservation:${reservationId}:CONSUME:${item.productId}`,
        });
      } catch (error: unknown) {
        if (!String((error as Error)?.message || "").toLowerCase().includes("unique")) throw error;
      }
    }

    const updated = await tx
      .update(reservations)
      .set({ status: "FULFILLED", updatedAt: new Date() })
      .where(and(eq(reservations.id, reservationId), eq(reservations.status, "ACTIVE")))
      .returning();

    if (!updated[0]) {
      const bundle = await loadReservationBundle(tx, reservationId);
      return { reservation: bundle!.reservation, consumed: false };
    }
    await syncOrderReservationMirror(tx, row.order_id, "FULFILLED");
    return { reservation: updated[0], consumed: true };
  });
}

export async function bindReservationOrder(
  reservationId: number,
  orderId: number,
  executor: DbLike = db,
) {
  await executor
    .update(reservations)
    .set({ orderId, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId));
}

/**
 * P4.6 — ACTIVE → EXPIRED with reserved release.
 * Idempotent: already EXPIRED/CANCELLED returns released=false.
 * DB `expires_at` is authoritative; no in-memory timer as truth.
 */
export async function expireReservation(
  reservationId: number,
  opts: { actor?: string; reason?: string; alreadyInTx?: boolean } = {},
  executor: DbLike = db,
): Promise<{ reservation: Reservation; released: boolean }> {
  return releaseReservation(
    reservationId,
    {
      actor: opts.actor || "expiry",
      toStatus: "EXPIRED",
      reason: opts.reason || "expire",
      alreadyInTx: opts.alreadyInTx,
    },
    executor,
  );
}

/**
 * Sweep due ACTIVE reservations for a future worker / ops trigger.
 * Each expiry runs in its own short transaction (or nested if alreadyInTx).
 */
export async function expireDueReservations(
  opts: { now?: Date; limit?: number; actor?: string } = {},
  executor: DbLike = db,
): Promise<{ examined: number; expired: number; reservationIds: number[] }> {
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const due = await executor.execute(sql`
    SELECT id
    FROM reservations
    WHERE status = 'ACTIVE'
      AND expires_at IS NOT NULL
      AND expires_at <= ${now}
    ORDER BY id ASC
    LIMIT ${limit}
  `);
  const ids = rowsOf(due).map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
  let expired = 0;
  const reservationIds: number[] = [];
  for (const id of ids) {
    const result = await expireReservation(id, { actor: opts.actor || "expiry-sweep" }, executor);
    if (result.released) {
      expired += 1;
      reservationIds.push(id);
    }
  }
  return { examined: ids.length, expired, reservationIds };
}

export type AdjustStockInput = {
  branchId: number;
  productId: number;
  /** Signed physical delta (positive restock, negative write-down). */
  physicalDelta: number;
  reason: string;
  actor?: string;
  idempotencyKey?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * P4.7 — auditable physical adjustment.
 * Does not change reserved_quantity. Rejects if physical would go below reserved or below 0.
 */
export async function adjustStock(
  input: AdjustStockInput,
  executor: DbLike = db,
  opts: { alreadyInTx?: boolean } = {},
): Promise<{
  stock: { id: number; physicalQuantity: number; reservedQuantity: number; availableQuantity: number };
  adjusted: boolean;
  idempotent: boolean;
}> {
  const branchId = Number(input.branchId);
  const productId = Number(input.productId);
  const delta = Number(input.physicalDelta);
  const reason = String(input.reason || "").trim();
  const key = input.idempotencyKey?.trim() || null;

  if (!Number.isFinite(branchId) || branchId <= 0) throw badRequest("Filial tanlang");
  if (!Number.isFinite(productId) || productId <= 0) throw badRequest("Mahsulot identifikatori noto‘g‘ri");
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
    throw badRequest("physicalDelta butun noldan farqli son bo‘lishi kerak");
  }
  if (!reason) throw badRequest("Sabab (reason) majburiy");

  return withTx(executor, Boolean(opts.alreadyInTx), async (tx) => {
    if (key) {
      const existing = await tx.execute(sql`
        SELECT id FROM inventory_movements WHERE idempotency_key = ${key} LIMIT 1
      `);
      if (rowsOf(existing)[0]) {
        const stockRows = await tx.execute(sql`
          SELECT id, physical_quantity, reserved_quantity,
                 (physical_quantity - reserved_quantity) AS available_quantity
          FROM product_stocks
          WHERE branch_id = ${branchId} AND product_id = ${productId}
          LIMIT 1
        `);
        const s = rowsOf(stockRows)[0] as
          | { id: number; physical_quantity: number; reserved_quantity: number; available_quantity: number }
          | undefined;
        if (!s) throw badRequest("Ombor qatori topilmadi", 404);
        return {
          stock: {
            id: Number(s.id),
            physicalQuantity: Number(s.physical_quantity),
            reservedQuantity: Number(s.reserved_quantity),
            availableQuantity: Number(s.available_quantity),
          },
          adjusted: false,
          idempotent: true,
        };
      }
    }

    const locked = await tx.execute(sql`
      SELECT id, physical_quantity, reserved_quantity
      FROM product_stocks
      WHERE branch_id = ${branchId} AND product_id = ${productId}
      FOR UPDATE
    `);
    const stock = rowsOf(locked)[0] as
      | { id: number; physical_quantity: number; reserved_quantity: number }
      | undefined;
    if (!stock) throw badRequest("Ombor qatori topilmadi", 404);

    const physical = Number(stock.physical_quantity);
    const reserved = Number(stock.reserved_quantity);
    const nextPhysical = physical + delta;
    if (nextPhysical < 0) {
      throw badRequest("Jismoniy qoldiq manfiy bo‘lishi mumkin emas", 400);
    }
    if (nextPhysical < reserved) {
      throw badRequest("Jismoniy qoldiq bron miqdoridan kam bo‘lishi mumkin emas", 409);
    }

    const updated = await tx.execute(sql`
      UPDATE product_stocks
      SET
        physical_quantity = ${nextPhysical},
        quantity = ${nextPhysical}
      WHERE id = ${stock.id}
        AND reserved_quantity = ${reserved}
        AND physical_quantity + ${delta} >= reserved_quantity
        AND physical_quantity + ${delta} >= 0
      RETURNING id, physical_quantity, reserved_quantity,
                (physical_quantity - reserved_quantity) AS available_quantity
    `);
    const row = rowsOf(updated)[0] as
      | { id: number; physical_quantity: number; reserved_quantity: number; available_quantity: number }
      | undefined;
    if (!row) throw badRequest("Ombor holati o‘zgargan; qayta urinib ko‘ring", 409);

    try {
      await tx.insert(inventoryMovements).values({
        branchId,
        productId,
        movementType: "ADJUSTMENT",
        quantity: Math.abs(delta),
        physicalDelta: delta,
        reservedDelta: 0,
        actor: input.actor || "admin",
        reason,
        idempotencyKey: key || `adjust:${branchId}:${productId}:${Date.now()}:${delta}`,
        meta: JSON.stringify(input.meta || {}),
      });
    } catch (error: unknown) {
      if (key && String((error as Error)?.message || "").toLowerCase().includes("unique")) {
        return {
          stock: {
            id: Number(row.id),
            physicalQuantity: Number(row.physical_quantity),
            reservedQuantity: Number(row.reserved_quantity),
            availableQuantity: Number(row.available_quantity),
          },
          adjusted: false,
          idempotent: true,
        };
      }
      throw error;
    }

    return {
      stock: {
        id: Number(row.id),
        physicalQuantity: Number(row.physical_quantity),
        reservedQuantity: Number(row.reserved_quantity),
        availableQuantity: Number(row.available_quantity),
      },
      adjusted: true,
      idempotent: false,
    };
  });
}
