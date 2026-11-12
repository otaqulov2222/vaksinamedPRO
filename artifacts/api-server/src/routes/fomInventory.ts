/**
 * FOM Ombor Integratsiyasi Marshrutlari
 *
 * - POST /api/integrations/fom/inventory-sync: Kassa / FOM dan qoldiq sinxronizatsiyasi
 * - GET /api/integrations/fom/stock-status: Admin ombor monitoringi
 * - GET /api/catalog/products/:id/alternative-branches: Muqobil filiallar ro'yxati
 */

import { Router } from "express";
import { assertFomWebhookAuthorized } from "../lib/securityEnv";
import { requireAdmin } from "../lib/auth";
import { assertFomInventoryWriterAllowed } from "../lib/fomAdapter";
import {
  syncBranchInventoryFromFom,
  shadowReconcileBranchInventoryFromFom,
  findAlternativeBranchesWithStock,
} from "../lib/fomInventoryService";
import { db, productStocks, branches, products } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

function parseFomInventoryBody(body: Record<string, unknown>) {
  const items = Array.isArray(body.items) ? body.items : [];
  return {
    branchId: body.branchId != null ? Number(body.branchId) : undefined,
    branchCode: (body.branchCode || body.filialCode) as string | undefined,
    batchId: (body.batchId || body.syncId) as string | undefined,
    syncMode: body.syncMode === "DELTA" ? ("DELTA" as const) : ("SNAPSHOT" as const),
    items,
  };
}

/**
 * Phase 1 — shadow recon (no product_stocks writes).
 * Auth: header `x-fom-secret` yoki `Authorization: Bearer <FOM_WEBHOOK_SECRET>`
 * Quarantines unmapped SKU/barcode into fom_product_links only.
 */
router.post("/integrations/fom/inventory-shadow", async (req, res, next) => {
  try {
    const headerSecret =
      req.header("x-fom-secret") || req.header("authorization")?.replace(/^Bearer\s+/i, "");
    assertFomWebhookAuthorized(headerSecret);

    const parsed = parseFomInventoryBody(req.body || {});
    const result = await shadowReconcileBranchInventoryFromFom({
      ...parsed,
      actor: "fom-webhook-shadow",
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

/**
 * FOM kassa ombor sinxronizatsiyasi (writer ON bo‘lganda).
 * Auth: header `x-fom-secret` yoki `Authorization: Bearer <FOM_WEBHOOK_SECRET>`
 * Kill-switch: FOM_INVENTORY_WRITER_ENABLED must be true (currently hardcoded false).
 */
router.post("/integrations/fom/inventory-sync", async (req, res, next) => {
  try {
    const headerSecret =
      req.header("x-fom-secret") || req.header("authorization")?.replace(/^Bearer\s+/i, "");
    assertFomWebhookAuthorized(headerSecret);
    assertFomInventoryWriterAllowed();

    const parsed = parseFomInventoryBody(req.body || {});
    const result = await syncBranchInventoryFromFom({
      ...parsed,
      actor: "fom-webhook-sync",
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

/**
 * Filialdagi tovar yetarli bo'lmaganda muqobil filiallarni topish
 */
router.get("/catalog/products/:id/alternative-branches", async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ message: "Mahsulot ID noto‘g‘ri" });
    }

    const currentBranchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const neededQty = req.query.quantity ? Math.max(1, Number(req.query.quantity)) : 1;

    const alternatives = await findAlternativeBranchesWithStock(
      productId,
      neededQty,
      currentBranchId,
    );

    return res.json({
      productId,
      neededQuantity: neededQty,
      alternatives,
      total: alternatives.length,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
