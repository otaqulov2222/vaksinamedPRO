/**
 * F-Apteka / FOM vendor document formats → app catalog items.
 *
 * Sources (PDF docs in "FOM keraklilar"):
 * - SITE.exe XML push: <V I N R K P O IK UP UN .../>
 * - SERVICEREPORTS spravochnik REPORT_ID=188: I N P(manufacturer) E(unit) C(IKPU)
 * - SERVICEREPORTS остатки REPORT_ID=6: G P(price) E(expiry) O(filial) Q(qty)
 *
 * Stock quantities are parsed for ops visibility / later shadow — catalog path never writes product_stocks.
 */

import type { FomCatalogItem } from "./fomCatalogService";

export type FomSiteStockLine = {
  fomId: string;
  sku: string;
  branchExternalId: string;
  quantity: number;
  price: number;
  name?: string;
};

export type FomSiteXmlParseResult = {
  source: "SITE_XML";
  catalogItems: FomCatalogItem[];
  stockLines: FomSiteStockLine[];
  skippedCount: number;
};

export type FomReport188ParseResult = {
  source: "REPORT_188";
  catalogItems: FomCatalogItem[];
  skippedCount: number;
};

function clean(raw: unknown): string {
  return String(raw ?? "").trim();
}

function moneyUzs(raw: unknown): number {
  const n = Number(String(raw ?? "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function qty(raw: unknown): number {
  const n = Number(String(raw ?? "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Stable app SKU from FOM internal product id — avoids colliding with demo/VM skus. */
export function fomSkuFromId(fomId: string): string {
  const id = clean(fomId);
  if (!id) return "";
  if (id.toUpperCase().startsWith("FOM-")) return id;
  return `FOM-${id}`;
}

function parseXmlAttributes(fragment: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_][\w]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) {
    out[m[1]] = m[2] ?? m[3] ?? "";
  }
  return out;
}

/**
 * Parse SITE.exe stock/catalog XML body.
 * Example:
 * <V I="2053" N="НООФЕН КАПС 500 МГ № 24" R="ОЛАЙНФАРМ, ЛАТВИЯ" K="0.374999" P="226400.00" O="1" IK="03004133005001001" UP="1117203" UN="Qadoq"/>
 */
export function parseSiteXmlToCatalog(xml: string): FomSiteXmlParseResult {
  const text = String(xml || "");
  const catalogBySku = new Map<string, FomCatalogItem>();
  const stockLines: FomSiteStockLine[] = [];
  let skippedCount = 0;

  const tagRe = /<V\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(text))) {
    const attrs = parseXmlAttributes(match[1] || "");
    const fomId = clean(attrs.I);
    const name = clean(attrs.N);
    if (!fomId || !name) {
      skippedCount++;
      continue;
    }

    const sku = fomSkuFromId(fomId);
    const manufacturer = clean(attrs.R) || "FOM";
    const price = moneyUzs(attrs.P);
    const mxikCode = clean(attrs.IK);
    const packageCode = clean(attrs.UP);
    const unit = clean(attrs.UN) || "quti";
    const branchExternalId = clean(attrs.O);
    const quantity = qty(attrs.K);

    if (!catalogBySku.has(sku)) {
      catalogBySku.set(sku, {
        sku,
        fomId,
        nameUz: name,
        nameRu: name,
        name,
        manufacturer,
        price,
        unit,
        mxikCode: mxikCode || undefined,
        packageCode: packageCode || undefined,
        category: "FOM",
      });
    } else {
      // Prefer max retail price across batches/filials for catalog display.
      const prev = catalogBySku.get(sku)!;
      if (price > (prev.price || 0)) {
        catalogBySku.set(sku, { ...prev, price });
      }
    }

    if (branchExternalId) {
      stockLines.push({
        fomId,
        sku,
        branchExternalId,
        quantity,
        price,
        name,
      });
    }
  }

  return {
    source: "SITE_XML",
    catalogItems: [...catalogBySku.values()],
    stockLines,
    skippedCount,
  };
}

/**
 * Map SERVICEREPORTS spravochnik (REPORT_ID=188) rows to catalog items.
 * Keys: I=id, N=name, P=manufacturer, E=unit, C=IKPU
 */
export function parseReport188ToCatalog(rows: unknown[]): FomReport188ParseResult {
  const catalogBySku = new Map<string, FomCatalogItem>();
  let skippedCount = 0;

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") {
      skippedCount++;
      continue;
    }
    const row = raw as Record<string, unknown>;
    const fomId = clean(row.I ?? row.i ?? row.id ?? row.G ?? row.g);
    const name = clean(row.N ?? row.n ?? row.name ?? row.nameUz);
    if (!fomId || !name) {
      skippedCount++;
      continue;
    }

    const sku = fomSkuFromId(fomId);
    const manufacturer = clean(row.P ?? row.p ?? row.manufacturer) || "FOM";
    const unit = clean(row.E ?? row.e ?? row.unit) || "quti";
    const mxikCode = clean(row.C ?? row.c ?? row.IK ?? row.ik ?? row.mxikCode);

    catalogBySku.set(sku, {
      sku,
      fomId,
      nameUz: name,
      nameRu: name,
      name,
      manufacturer,
      unit,
      mxikCode: mxikCode || undefined,
      category: "FOM",
      // Report 188 has no retail price; leave undefined so sync won't zero existing prices.
    });
  }

  return {
    source: "REPORT_188",
    catalogItems: [...catalogBySku.values()],
    skippedCount,
  };
}

/**
 * Extract XML string from request body (raw string, or JSON { xml|data|body }).
 */
export function extractXmlPayload(body: unknown): string {
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.xml === "string") return o.xml;
    if (typeof o.data === "string") return o.data;
    if (typeof o.body === "string") return o.body;
    if (typeof o.content === "string") return o.content;
  }
  return "";
}
