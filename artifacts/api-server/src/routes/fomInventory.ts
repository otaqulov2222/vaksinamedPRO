/**
 * FOM Ombor Integratsiyasi Marshrutlari
 *
 * - POST /api/integrations/fom/catalog-sync: FOM mahsulot katalogi → app products (stock yozilmaydi)
 * - POST /api/integrations/fom/site-xml: SITE.exe XML → catalog upsert (stock yozilmaydi)
 * - POST /api/integrations/fom/catalog-from-report: REPORT_ID=188 JSON → catalog upsert
 * - POST /api/integrations/fom/inventory-shadow: qoldiq farq hisobot
 * - POST /api/integrations/fom/inventory-sync: Kassa / FOM dan qoldiq sinxronizatsiyasi (writer OFF)
 * - GET /api/catalog/products/:id/alternative-branches: Muqobil filiallar ro'yxati
 */

import { Router } from "express";
import { assertFomWebhookAuthorized } from "../lib/securityEnv";
import { assertFomInventoryWriterAllowed } from "../lib/fomAdapter";
import {
  syncBranchInventoryFromFom,
  shadowReconcileBranchInventoryFromFom,
  findAlternativeBranchesWithStock,
} from "../lib/fomInventoryService";
import { syncCatalogFromFom } from "../lib/fomCatalogService";
import {
  extractXmlPayload,
  parseReport188ToCatalog,
  parseSiteXmlToCatalog,
} from "../lib/fomVendorFormats";
import { parseFomBranchMap, resolveAppBranchId } from "../lib/fomBranchMap";

const router = Router();

function fomAuthSecret(req: { header: (name: string) => string | undefined; query?: Record<string, unknown> }) {
  const q = req.query || {};
  const fromQuery =
    (typeof q.token === "string" && q.token) ||
    (typeof q.TOCING === "string" && q.TOCING) ||
    (typeof q.tocing === "string" && q.tocing) ||
    undefined;
  return (
    req.header("x-fom-secret") ||
    req.header("x-tocing") ||
    req.header("authorization")?.replace(/^Bearer\s+/i, "") ||
    fromQuery
  );
}

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
 * Catalog sync — FOM master products → app catalog (no stock writes).
 * Auth: header `x-fom-secret` yoki `Authorization: Bearer <FOM_WEBHOOK_SECRET>`
 * Body: { items: [{ sku, nameUz|name, price?, barcode?, gtin?, ... }], dryRun?: boolean }
 */
router.post("/integrations/fom/catalog-sync", async (req, res, next) => {
  try {
    assertFomWebhookAuthorized(fomAuthSecret(req));

    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const result = await syncCatalogFromFom({
      items,
      batchId: body.batchId || body.syncId,
      dryRun: Boolean(body.dryRun),
      actor: "fom-webhook-catalog",
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

/**
 * SITE.exe receiver — F-Apteka pushes filial stock XML on a timer.
 * SETUP.ini example:
 *   URL=https://host/api/integrations/fom/site-xml?token=<FOM_WEBHOOK_SECRET>
 *   TOCING=<same secret>
 *
 * Parses <V I N R K P O IK UP UN/> → upserts catalog by sku FOM-{I}.
 * Stock lines (K/O) are returned for visibility; product_stocks NOT written.
 * Demo/VM products are left untouched.
 */
router.post("/integrations/fom/site-xml", async (req, res, next) => {
  try {
    assertFomWebhookAuthorized(fomAuthSecret(req));

    const dryRun =
      req.query.dryRun === "1" ||
      req.query.dryRun === "true" ||
      (typeof req.body === "object" && req.body && Boolean((req.body as { dryRun?: boolean }).dryRun));

    const xml = extractXmlPayload(req.body);
    if (!xml.trim()) {
      return res.status(400).json({
        message: "SITE XML bo‘sh — raw text/xml yoki { xml: \"...\" } yuboring",
        code: "XML_REQUIRED",
      });
    }

    const parsed = parseSiteXmlToCatalog(xml);
    if (!parsed.catalogItems.length) {
      return res.status(400).json({
        message: "XML ichida yaroqli <V .../> mahsulot topilmadi",
        code: "NO_CATALOG_ROWS",
        skippedCount: parsed.skippedCount,
      });
    }

    const catalog = await syncCatalogFromFom({
      items: parsed.catalogItems,
      batchId: `SITE-${Date.now()}`,
      dryRun: Boolean(dryRun),
      actor: "fom-site-xml",
    });

    const fomBranches = [...new Set(parsed.stockLines.map((l) => l.branchExternalId))];
    const branchMapConfigured = Object.keys(parseFomBranchMap()).length > 0;
    const branchResolution = fomBranches.map((fomKey) => {
      const r = resolveAppBranchId(fomKey);
      return { fomFilialId: fomKey, appBranchId: r.branchId, via: r.via };
    });

    return res.json({
      ok: true,
      source: parsed.source,
      inventoryWrites: false as const,
      catalog,
      stockPreview: {
        lineCount: parsed.stockLines.length,
        distinctBranches: fomBranches,
        branchMapConfigured,
        branchResolution,
        note: branchMapConfigured
          ? "Qoldiq preview; product_stocks yozilmaydi (writer OFF). Filial map bor — shadow keyin."
          : "Qoldiq preview; FOM_BRANCH_MAP / FOM_DEFAULT_BRANCH_ID hali yo‘q — stock yozilmaydi",
        sample: parsed.stockLines.slice(0, 5),
      },
      parseSkippedCount: parsed.skippedCount,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Bridge for SERVICEREPORTS spravochnik (REPORT_ID=188).
 * Body: { rows|items: [{ I, N, P, E, C }], dryRun?: boolean }
 * SKU = FOM-{I}; stock yozilmaydi.
 */
router.post("/integrations/fom/catalog-from-report", async (req, res, next) => {
  try {
    assertFomWebhookAuthorized(fomAuthSecret(req));

    const body = (req.body || {}) as Record<string, unknown>;
    const rows = Array.isArray(body.rows)
      ? body.rows
      : Array.isArray(body.items)
        ? body.items
        : Array.isArray(body.data)
          ? body.data
          : [];

    const parsed = parseReport188ToCatalog(rows);
    if (!parsed.catalogItems.length) {
      return res.status(400).json({
        message: "Report 188 qatorlari bo‘sh yoki yaroqsiz (I + N kerak)",
        code: "NO_CATALOG_ROWS",
        skippedCount: parsed.skippedCount,
      });
    }

    const catalog = await syncCatalogFromFom({
      items: parsed.catalogItems,
      batchId: body.batchId || body.syncId || `R188-${Date.now()}`,
      dryRun: Boolean(body.dryRun),
      actor: "fom-report-188",
    });

    return res.json({
      ok: true,
      source: parsed.source,
      inventoryWrites: false as const,
      catalog,
      parseSkippedCount: parsed.skippedCount,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * Phase 1 — shadow recon (no product_stocks writes).
 * Auth: header `x-fom-secret` yoki `Authorization: Bearer <FOM_WEBHOOK_SECRET>`
 * Quarantines unmapped SKU/barcode into fom_product_links only.
 */
router.post("/integrations/fom/inventory-shadow", async (req, res, next) => {
  try {
    assertFomWebhookAuthorized(fomAuthSecret(req));

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
    assertFomWebhookAuthorized(fomAuthSecret(req));
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
