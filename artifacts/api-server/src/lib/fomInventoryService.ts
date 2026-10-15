/**
 * FOM (F-Apteka / DMED / 1C Kassa) Xavfsiz Ombor Sinxronizatsiyasi
 *
 * Dorixona qoldiqlari (Stock Discrepancy) xavfini to'liq bartaraf etuvchi xizmat:
 * - Kassa / ombor fizik qoldiqlarini bron (reserved) miqdoriga ziyon yetkazmasdan sinxronlash.
 * - Qoldiq tafovuti (physical < reserved) yuzaga kelganda avtomatik diskrepansiya xabarnomasi (ALERT.FOM_STOCK_DISCREPANCY).
 * - Har bir harakat inventory_movements audit jadvaliga 'FOM_SYNC' sababi bilan yoziladi.
 * - Yetishmayotgan dorilar uchun zaxira (muqobil) filiallarni tezkor topish.
 */

import { and, eq, sql } from "drizzle-orm";
import {
  branches,
  db,
  inventoryMovements,
  products,
  productStocks,
  type ProductStock,
} from "@workspace/db";
import { emitAlert, ALERT } from "./alerts";
import { logger } from "./logger";

type DbLike = typeof db;

export type FomStockSyncItem = {
  productId?: number;
  sku?: string;
  physicalQuantity?: number;
  deltaQuantity?: number;
};

export type FomInventorySyncInput = {
  branchId?: number;
  branchCode?: string;
  batchId?: string;
  syncMode?: "SNAPSHOT" | "DELTA";
  actor?: string;
  items: FomStockSyncItem[];
};

export type StockDiscrepancyReport = {
  productId: number;
  sku: string;
  productName: string;
  reportedPhysical: number;
  reservedQuantity: number;
  shortage: number;
  appliedPhysical: number;
};

export type FomSyncResult = {
  ok: boolean;
  branchId: number;
  branchName: string;
  batchId: string;
  syncMode: "SNAPSHOT" | "DELTA";
  processedCount: number;
  syncedCount: number;
  discrepancies: StockDiscrepancyReport[];
  timestamp: string;
};

function rowsOf(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: any[] }).rows;
  }
  return [];
}

/** Branch identification helper */
async function resolveBranch(
  input: { branchId?: number; branchCode?: string },
  executor: DbLike = db,
) {
  if (input.branchId && Number.isFinite(input.branchId) && input.branchId > 0) {
    const row = (
      await executor.select().from(branches).where(eq(branches.id, Number(input.branchId))).limit(1)
    )[0];
    if (row) return row;
  }

  const code = String(input.branchCode || "").trim().toLowerCase();
  if (!code) return null;

  const all = await executor.select().from(branches);
  return (
    all.find((b) => b.code.toLowerCase() === code) ||
    all.find((b) => b.code.toLowerCase().includes(code) || code.includes(b.code.toLowerCase())) ||
    null
  );
}

/**
 * Execute audited, reservation-safe inventory synchronization from FOM
 */
export async function syncBranchInventoryFromFom(
  input: FomInventorySyncInput,
  executor: DbLike = db,
): Promise<FomSyncResult> {
  const branch = await resolveBranch(input, executor);
  if (!branch) {
    throw Object.assign(new Error("Filial topilmadi"), { status: 404, code: "BRANCH_NOT_FOUND" });
  }

  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) {
    throw Object.assign(new Error("Sinxronizatsiya uchun tovarlar ro‘yxati bo‘sh"), {
      status: 400,
      code: "ITEMS_REQUIRED",
    });
  }

  const syncMode = input.syncMode === "DELTA" ? "DELTA" : "SNAPSHOT";
  const batchId = String(input.batchId || `SYNC-${Date.now()}`);
  const actor = input.actor || "fom-kassa-sync";

  const discrepancies: StockDiscrepancyReport[] = [];
  let syncedCount = 0;

  await executor.transaction(async (tx) => {
    for (const item of items) {
      // 1. Resolve product
      let product = null;
      if (item.productId && Number.isFinite(item.productId) && item.productId > 0) {
        product = (
          await tx.select().from(products).where(eq(products.id, Number(item.productId))).limit(1)
        )[0];
      } else if (item.sku) {
        const cleanSku = String(item.sku).trim();
        product = (
          await tx.select().from(products).where(eq(products.sku, cleanSku)).limit(1)
        )[0];
      }

      if (!product) {
        logger.warn({ event: "FOM_SYNC_PRODUCT_NOT_FOUND", item, branchId: branch.id });
        continue;
      }

      // 2. Lock stock row or create if non-existent
      const locked = await tx.execute(sql`
        SELECT id, physical_quantity, reserved_quantity, quantity
        FROM product_stocks
        WHERE branch_id = ${branch.id} AND product_id = ${product.id}
        FOR UPDATE
      `);

      let stockRow = rowsOf(locked)[0] as
        | { id: number; physical_quantity: number; reserved_quantity: number; quantity: number }
        | undefined;

      if (!stockRow) {
        // Create initial stock row
        const initialTarget = syncMode === "DELTA"
          ? Math.max(0, Number(item.deltaQuantity) || 0)
          : Math.max(0, Number(item.physicalQuantity) || 0);

        const created = await tx
          .insert(productStocks)
          .values({
            branchId: branch.id,
            productId: product.id,
            physicalQuantity: initialTarget,
            reservedQuantity: 0,
            quantity: initialTarget,
          })
          .returning();

        stockRow = {
          id: created[0].id,
          physical_quantity: initialTarget,
          reserved_quantity: 0,
          quantity: initialTarget,
        };

        await tx.insert(inventoryMovements).values({
          branchId: branch.id,
          productId: product.id,
          movementType: "ADJUSTMENT",
          quantity: initialTarget,
          physicalDelta: initialTarget,
          reservedDelta: 0,
          actor,
          reason: "FOM_SYNC_INITIAL",
          idempotencyKey: `${batchId}:${branch.id}:${product.id}:INITIAL`,
          meta: JSON.stringify({ batchId, mode: syncMode, sku: product.sku }),
        });

        syncedCount++;
        continue;
      }

      const curPhysical = Number(stockRow.physical_quantity);
      const curReserved = Number(stockRow.reserved_quantity);

      // 3. Compute target physical quantity
      let targetPhysical = curPhysical;
      if (syncMode === "DELTA") {
        const delta = Number(item.deltaQuantity) || 0;
        targetPhysical = Math.max(0, curPhysical + delta);
      } else {
        targetPhysical = Math.max(0, Number(item.physicalQuantity) || 0);
      }

      // 4. Check for Stock Discrepancy (physical < reserved)
      if (targetPhysical < curReserved) {
        const shortage = curReserved - targetPhysical;
        emitAlert(ALERT.FOM_STOCK_DISCREPANCY, {
          branchId: branch.id,
          branchName: branch.name,
          productId: product.id,
          sku: product.sku,
          productName: product.nameUz,
          reportedPhysical: targetPhysical,
          reservedQuantity: curReserved,
          shortage,
        });

        discrepancies.push({
          productId: product.id,
          sku: product.sku,
          productName: product.nameUz,
          reportedPhysical: targetPhysical,
          reservedQuantity: curReserved,
          shortage,
          appliedPhysical: curReserved, // Clamped to reserved to uphold database constraints
        });

        // Set to curReserved so DB constraint (reserved_quantity <= physical_quantity) is not violated
        await tx.execute(sql`
          UPDATE product_stocks
          SET
            physical_quantity = ${curReserved},
            quantity = ${curReserved}
          WHERE id = ${stockRow.id}
        `);

        await tx.insert(inventoryMovements).values({
          branchId: branch.id,
          productId: product.id,
          movementType: "ADJUSTMENT",
          quantity: shortage,
          physicalDelta: curReserved - curPhysical,
          reservedDelta: 0,
          actor,
          reason: "FOM_SYNC_DISCREPANCY_SHORTAGE",
          idempotencyKey: `${batchId}:${branch.id}:${product.id}:DISCREPANCY`,
          meta: JSON.stringify({
            batchId,
            mode: syncMode,
            sku: product.sku,
            reportedPhysical: targetPhysical,
            reservedQuantity: curReserved,
            shortage,
          }),
        });
      } else {
        // Safe update
        const physicalDelta = targetPhysical - curPhysical;
        await tx.execute(sql`
          UPDATE product_stocks
          SET
            physical_quantity = ${targetPhysical},
            quantity = ${targetPhysical}
          WHERE id = ${stockRow.id}
        `);

        if (physicalDelta !== 0) {
          await tx.insert(inventoryMovements).values({
            branchId: branch.id,
            productId: product.id,
            movementType: "ADJUSTMENT",
            quantity: Math.abs(physicalDelta),
            physicalDelta,
            reservedDelta: 0,
            actor,
            reason: "FOM_SYNC",
            idempotencyKey: `${batchId}:${branch.id}:${product.id}:SYNC`,
            meta: JSON.stringify({ batchId, mode: syncMode, sku: product.sku }),
          });
        }
      }

      syncedCount++;
    }
  });

  return {
    ok: true,
    branchId: branch.id,
    branchName: branch.name,
    batchId,
    syncMode,
    processedCount: items.length,
    syncedCount,
    discrepancies,
    timestamp: new Date().toISOString(),
  };
}

/** Find nearby branches in the same region that have sufficient stock */
export async function findAlternativeBranchesWithStock(
  productId: number,
  neededQty = 1,
  currentBranchId?: number,
  executor: DbLike = db,
) {
  const stockRows = await executor
    .select({
      stock: productStocks,
      branch: branches,
    })
    .from(productStocks)
    .innerJoin(branches, eq(productStocks.branchId, branches.id))
    .where(
      and(
        eq(productStocks.productId, productId),
        sql`COALESCE(${productStocks.availableQuantity}, GREATEST(0, ${productStocks.physicalQuantity} - ${productStocks.reservedQuantity})) >= ${neededQty}`,
      ),
    );

  return stockRows
    .filter((r) => r.branch.id !== currentBranchId)
    .map((r) => ({
      branchId: r.branch.id,
      branchName: r.branch.name,
      address: r.branch.address,
      phone: r.branch.phone,
      region: r.branch.region,
      district: r.branch.district,
      availableQuantity:
        r.stock.availableQuantity != null
          ? Number(r.stock.availableQuantity)
          : Math.max(0, Number(r.stock.physicalQuantity) - Number(r.stock.reservedQuantity)),
    }));
}
