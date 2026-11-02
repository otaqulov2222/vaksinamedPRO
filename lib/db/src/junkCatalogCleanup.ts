import { eq } from "drizzle-orm";
import { orderItems } from "./schema/commerce";
import { products } from "./schema/catalog";
import { reservationItems } from "./schema/inventory";
import { deleteProductGraph } from "./productDelete";
import { STAGING_CATALOG_PRODUCTS } from "./stagingCatalogSeed";

export type JunkCleanupMode = "dry-run" | "apply";

export type JunkCatalogCandidate = {
  id: number;
  sku: string;
  nameUz: string;
  reason: string;
  blockedBy: "order" | "reservation" | null;
};

export type JunkCatalogCleanupResult = {
  ok: boolean;
  mode: JunkCleanupMode;
  scanned: number;
  matched: number;
  deleted: number;
  skippedProtected: number;
  skippedBlocked: number;
  candidates: JunkCatalogCandidate[];
};

const PROTECTED_SKUS = new Set(
  STAGING_CATALOG_PRODUCTS.map((p) => p.sku.trim().toLowerCase()),
);

function flagEnabled(name: string): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Staging-only junk cleanup. Production is always refused. */
export function assertJunkCatalogCleanupAllowed(): void {
  const appEnv = (process.env.APP_ENV || "").trim().toLowerCase();
  if (appEnv !== "staging") {
    throw new Error(
      `[junk-catalog-cleanup] Refusing execution: APP_ENV must be "staging" (current: "${process.env.APP_ENV || ""}").`,
    );
  }
  if (!flagEnabled("STAGING_JUNK_CATALOG_CLEANUP_ENABLED")) {
    throw new Error(
      "[junk-catalog-cleanup] Refusing execution: STAGING_JUNK_CATALOG_CLEANUP_ENABLED must be true.",
    );
  }
}

export function isProtectedCatalogSku(sku: string): boolean {
  return PROTECTED_SKUS.has(String(sku || "").trim().toLowerCase());
}

/**
 * Operator-created junk from live staging (2026-11-02):
 * TEST-MED-*, VM-TEST-*, sku=test, sku=safdfcxadfad, name "test dmidrol".
 * Official demo seed SKUs (VM-D3-60 …) are never junk.
 */
export function junkCatalogReason(sku: string, nameUz: string): string | null {
  if (isProtectedCatalogSku(sku)) return null;
  const s = String(sku || "").trim().toLowerCase();
  const n = String(nameUz || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "test" || n === "test") return "sku_or_name_test";
  if (s === "safdfcxadfad") return "keyboard_mash_sku";
  if (s.startsWith("test-med-")) return "test_med_prefix";
  if (s.startsWith("vm-test-")) return "vm_test_prefix";
  if (n.includes("dmidrol")) return "dmidrol_name";
  return null;
}

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

export async function planJunkCatalogCleanup(db: DbLike): Promise<JunkCatalogCandidate[]> {
  const rows = (await db.select().from(products)) as Array<{
    id: number;
    sku: string;
    nameUz: string;
  }>;

  const matched: JunkCatalogCandidate[] = [];
  for (const row of rows) {
    const reason = junkCatalogReason(row.sku, row.nameUz);
    if (!reason) continue;

    const orderHits = (await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.productId, row.id))
      .limit(1)) as Array<{ id: number }>;
    if (orderHits[0]) {
      matched.push({ id: row.id, sku: row.sku, nameUz: row.nameUz, reason, blockedBy: "order" });
      continue;
    }

    const reservationHits = (await db
      .select({ id: reservationItems.id })
      .from(reservationItems)
      .where(eq(reservationItems.productId, row.id))
      .limit(1)) as Array<{ id: number }>;
    if (reservationHits[0]) {
      matched.push({
        id: row.id,
        sku: row.sku,
        nameUz: row.nameUz,
        reason,
        blockedBy: "reservation",
      });
      continue;
    }

    matched.push({ id: row.id, sku: row.sku, nameUz: row.nameUz, reason, blockedBy: null });
  }
  return matched;
}

export async function cleanupJunkCatalog(
  db: DbLike,
  mode: JunkCleanupMode = "dry-run",
): Promise<JunkCatalogCleanupResult> {
  assertJunkCatalogCleanupAllowed();

  const all = (await db.select({ sku: products.sku }).from(products)) as Array<{ sku: string }>;
  const candidates = await planJunkCatalogCleanup(db);
  const blocked = candidates.filter((c) => c.blockedBy);
  const deletable = candidates.filter((c) => !c.blockedBy);

  let deleted = 0;
  if (mode === "apply" && deletable.length) {
    await withTx(db, async (tx) => {
      for (const item of deletable) {
        await deleteProductGraph(tx, item.id);
        deleted += 1;
      }
    });
  }

  return {
    ok: true,
    mode,
    scanned: all.length,
    matched: candidates.length,
    deleted: mode === "apply" ? deleted : 0,
    skippedProtected: all.filter((r) => isProtectedCatalogSku(r.sku)).length,
    skippedBlocked: blocked.length,
    candidates,
  };
}

export async function runJunkCatalogCleanup(mode: JunkCleanupMode): Promise<JunkCatalogCleanupResult> {
  assertJunkCatalogCleanupAllowed();
  const { isPostgresUrl, resolveDatabaseUrl } = await import("./env");
  const url = resolveDatabaseUrl();
  if (!isPostgresUrl(url)) {
    throw new Error(
      "[junk-catalog-cleanup] DATABASE_URL=postgres://... is required (PGlite is not a staging database).",
    );
  }
  const pg = (await import("pg")).default;
  const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const database = drizzlePg(pool);
    return await cleanupJunkCatalog(database as unknown as DbLike, mode);
  } finally {
    await pool.end();
  }
}

/** Exported for tests — official seed SKUs must never match junk rules. */
export function protectedStagingSkus(): string[] {
  return [...PROTECTED_SKUS];
}
