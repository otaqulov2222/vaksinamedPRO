/**
 * FOM → app catalog sync (master-data path).
 *
 * Goal: products entered in FOM appear in the app without dual manual entry.
 * Rules:
 * - SKU required; upsert products by SKU
 * - Activate fom_product_links for SKU / BARCODE / GTIN
 * - Never write product_stocks (inventory writer remains separate kill-switch)
 * - Never invent products from sale webhook barcodes alone
 */

import { and, eq } from "drizzle-orm";
import { db, fomProductLinks, products } from "@workspace/db";
import { logger } from "./logger";

type DbLike = typeof db;

export type FomCatalogItem = {
  sku: string;
  nameUz?: string;
  nameRu?: string;
  name?: string;
  category?: string;
  manufacturer?: string;
  description?: string;
  unit?: string;
  price?: number;
  barcode?: string;
  gtin?: string;
  fomId?: string;
  analogGroup?: string;
  requiresPrescription?: boolean;
  mxikCode?: string;
  packageCode?: string;
  vatPercent?: number;
};

export type FomCatalogSyncInput = {
  items: FomCatalogItem[];
  batchId?: string;
  actor?: string;
  dryRun?: boolean;
};

export type FomCatalogLineResult = {
  sku: string;
  action: "created" | "updated" | "skipped" | "would_create" | "would_update";
  productId: number | null;
  reason?: string;
  linksActivated: string[];
};

export type FomCatalogSyncResult = {
  ok: true;
  mode: "CATALOG_SYNC";
  dryRun: boolean;
  inventoryWrites: false;
  batchId: string;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  linksActivatedCount: number;
  lines: FomCatalogLineResult[];
  timestamp: string;
  note: string;
};

function cleanSku(raw: unknown): string {
  return String(raw || "").trim();
}

function moneyUzs(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

async function upsertActiveLink(
  executor: DbLike,
  input: {
    keyType: "SKU" | "BARCODE" | "GTIN" | "FOM_ID";
    externalKey: string;
    productId: number;
    meta?: Record<string, unknown>;
  },
): Promise<boolean> {
  const externalKey = String(input.externalKey || "").trim();
  if (!externalKey) return false;

  const existing = (
    await executor
      .select()
      .from(fomProductLinks)
      .where(
        and(
          eq(fomProductLinks.keyType, input.keyType),
          eq(fomProductLinks.externalKey, externalKey),
        ),
      )
      .limit(5)
  )[0];

  if (existing) {
    await executor
      .update(fomProductLinks)
      .set({
        productId: input.productId,
        status: "ACTIVE",
        lastSeenAt: new Date(),
        updatedAt: new Date(),
        meta: JSON.stringify({
          ...(input.meta || {}),
          activatedBy: "catalog-sync",
        }),
      })
      .where(eq(fomProductLinks.id, existing.id));
    return true;
  }

  await executor.insert(fomProductLinks).values({
    keyType: input.keyType,
    externalKey,
    productId: input.productId,
    branchId: null,
    status: "ACTIVE",
    meta: JSON.stringify({
      ...(input.meta || {}),
      activatedBy: "catalog-sync",
    }),
  });
  return true;
}

/**
 * Upsert catalog rows from FOM export/webhook payload.
 * Stock quantities are intentionally ignored here.
 */
export async function syncCatalogFromFom(
  input: FomCatalogSyncInput,
  executor: DbLike = db,
): Promise<FomCatalogSyncResult> {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) {
    throw Object.assign(new Error("Katalog sync uchun mahsulotlar ro‘yxati bo‘sh"), {
      status: 400,
      code: "ITEMS_REQUIRED",
    });
  }

  const dryRun = Boolean(input.dryRun);
  const batchId = String(input.batchId || `CATALOG-${Date.now()}`);
  const actor = input.actor || "fom-catalog-sync";
  const lines: FomCatalogLineResult[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let linksActivatedCount = 0;

  for (const raw of items) {
    const sku = cleanSku(raw.sku);
    if (!sku) {
      skippedCount++;
      lines.push({
        sku: "",
        action: "skipped",
        productId: null,
        reason: "SKU_REQUIRED",
        linksActivated: [],
      });
      continue;
    }

    const nameUz = String(raw.nameUz || raw.name || "").trim();
    const nameRu = String(raw.nameRu || raw.nameUz || raw.name || "").trim();
    const existing = (
      await executor.select().from(products).where(eq(products.sku, sku)).limit(1)
    )[0];

    if (!existing && !nameUz) {
      skippedCount++;
      lines.push({
        sku,
        action: "skipped",
        productId: null,
        reason: "NAME_REQUIRED_FOR_CREATE",
        linksActivated: [],
      });
      continue;
    }

    if (dryRun) {
      lines.push({
        sku,
        action: existing ? "would_update" : "would_create",
        productId: existing?.id ?? null,
        linksActivated: [],
      });
      if (existing) updatedCount++;
      else createdCount++;
      continue;
    }

    let productId: number;
    let action: "created" | "updated";

    if (existing) {
      const patch: Partial<typeof products.$inferInsert> = {};
      if (nameUz) patch.nameUz = nameUz;
      if (nameRu) patch.nameRu = nameRu;
      if (raw.category != null && String(raw.category).trim()) patch.category = String(raw.category).trim();
      if (raw.manufacturer != null && String(raw.manufacturer).trim()) {
        patch.manufacturer = String(raw.manufacturer).trim();
      }
      if (raw.description != null) patch.description = String(raw.description);
      if (raw.unit != null && String(raw.unit).trim()) patch.unit = String(raw.unit).trim();
      if (raw.price != null) patch.price = moneyUzs(raw.price);
      if (raw.analogGroup != null) patch.analogGroup = String(raw.analogGroup);
      if (raw.requiresPrescription != null) patch.requiresPrescription = Boolean(raw.requiresPrescription);
      if (raw.mxikCode != null && String(raw.mxikCode).trim()) patch.mxikCode = String(raw.mxikCode).trim();
      if (raw.packageCode != null && String(raw.packageCode).trim()) {
        patch.packageCode = String(raw.packageCode).trim();
      }
      if (raw.vatPercent != null && Number.isFinite(Number(raw.vatPercent))) {
        patch.vatPercent = Math.max(0, Math.floor(Number(raw.vatPercent)));
      }

      if (Object.keys(patch).length > 0) {
        const updated = await executor
          .update(products)
          .set(patch)
          .where(eq(products.id, existing.id))
          .returning();
        productId = updated[0].id;
      } else {
        productId = existing.id;
      }
      action = "updated";
      updatedCount++;
    } else {
      const created = await executor
        .insert(products)
        .values({
          sku,
          nameUz,
          nameRu: nameRu || nameUz,
          category: String(raw.category || "Boshqa").trim() || "Boshqa",
          manufacturer: String(raw.manufacturer || "FOM").trim() || "FOM",
          description: String(raw.description || `FOM sync · ${sku}`),
          unit: String(raw.unit || "quti").trim() || "quti",
          price: moneyUzs(raw.price),
          icon: "pill",
          analogGroup: String(raw.analogGroup || ""),
          requiresPrescription: Boolean(raw.requiresPrescription),
          mxikCode: String(raw.mxikCode || "02106001001000000").trim(),
          packageCode: String(raw.packageCode || "796").trim(),
          vatPercent:
            raw.vatPercent != null && Number.isFinite(Number(raw.vatPercent))
              ? Math.max(0, Math.floor(Number(raw.vatPercent)))
              : 0,
        })
        .returning();
      productId = created[0].id;
      action = "created";
      createdCount++;
    }

    const linksActivated: string[] = [];
    const meta = { batchId, actor, sku };
    if (await upsertActiveLink(executor, { keyType: "SKU", externalKey: sku, productId, meta })) {
      linksActivated.push(`SKU:${sku}`);
    }
    const barcode = String(raw.barcode || "").trim();
    if (barcode && (await upsertActiveLink(executor, { keyType: "BARCODE", externalKey: barcode, productId, meta }))) {
      linksActivated.push(`BARCODE:${barcode}`);
    }
    const gtin = String(raw.gtin || "").trim();
    if (gtin && (await upsertActiveLink(executor, { keyType: "GTIN", externalKey: gtin, productId, meta }))) {
      linksActivated.push(`GTIN:${gtin}`);
    }
    const fomId = String(raw.fomId || "").trim();
    if (fomId && (await upsertActiveLink(executor, { keyType: "FOM_ID", externalKey: fomId, productId, meta }))) {
      linksActivated.push(`FOM_ID:${fomId}`);
    }
    linksActivatedCount += linksActivated.length;

    lines.push({
      sku,
      action,
      productId,
      linksActivated,
    });
  }

  logger.info(
    {
      event: "FOM_CATALOG_SYNC",
      batchId,
      dryRun,
      createdCount,
      updatedCount,
      skippedCount,
      linksActivatedCount,
    },
    "FOM catalog sync completed (no stock writes)",
  );

  return {
    ok: true,
    mode: "CATALOG_SYNC",
    dryRun,
    inventoryWrites: false,
    batchId,
    processedCount: items.length,
    createdCount,
    updatedCount,
    skippedCount,
    linksActivatedCount,
    lines,
    timestamp: new Date().toISOString(),
    note: dryRun
      ? "Dry-run only — no DB writes"
      : "Catalog upserted; product_stocks untouched. Use inventory-shadow for stock diffs.",
  };
}
