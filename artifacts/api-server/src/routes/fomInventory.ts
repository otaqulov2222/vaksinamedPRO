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
import {
  syncBranchInventoryFromFom,
  findAlternativeBranchesWithStock,
} from "../lib/fomInventoryService";
import { db, productStocks, branches, products } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

/**
 * FOM kassa ombor sinxronizatsiyasi
 * Auth: header `x-fom-secret` yoki `Authorization: Bearer <FOM_WEBHOOK_SECRET>`
 */
router.post("/integrations/fom/inventory-sync", async (req, res, next) => {
  try {
    const headerSecret =
      req.header("x-fom-secret") || req.header("authorization")?.replace(/^Bearer\s+/i, "");
    assertFomWebhookAuthorized(headerSecret);

    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];

    const result = await syncBranchInventoryFromFom({
      branchId: body.branchId != null ? Number(body.branchId) : undefined,
      branchCode: body.branchCode || body.filialCode,
      batchId: body.batchId || body.syncId,
      syncMode: body.syncMode === "DELTA" ? "DELTA" : "SNAPSHOT",
      actor: "fom-webhook-sync",
      items,
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
