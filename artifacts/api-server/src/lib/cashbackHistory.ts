/**
 * UNIVERSAL CASHBACK 2.0 — customer cashback history read-model (SoT projection).
 *
 * READ ONLY against cashback_ledger + commercial_transactions (+ optional order/POS/branch).
 * Does not write ledger, does not change EARN/USE/REVERSAL, does not invent sources.
 *
 * @see docs/UNIVERSAL_CASHBACK_2_0_ARCHITECTURE_LOCK.md
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import {
  branches,
  cashbackLedger,
  commercialTransactions,
  db,
  orders,
  posSales,
} from "@workspace/db";

/** Optional executor for tests (PGlite) — defaults to process SoT `db`. */
type HistoryDb = typeof db;

export type CommercialSourceTypeDto = "ORDER" | "POS" | "SYSTEM" | "FOM_POS";

export type CashbackHistoryItemDto = {
  /** Stable id for UI keys — ledger row id as string. */
  id: string;
  ledgerId: number;
  /** Authoritative ledger entry type (unchanged amounts). */
  entryType: string;
  /** Absolute ledger amount (so'm). */
  amount: number;
  /**
   * Signed cashback for display (legacy loyalty_ledger shape):
   * EARN +, USE −, REVERSAL depends on reversed entry type in meta.
   */
  cashback: number;
  createdAt: string;
  /** Real commercial sourceType or null when no commercial link. */
  sourceType: CommercialSourceTypeDto | null;
  sourceKey: string | null;
  commercialTransactionId: number | null;
  orderId: number | null;
  orderCode: string | null;
  receiptId: string | null;
  branchId: number | null;
  branchName: string | null;
  /**
   * Honest channel label from sourceType — never inferred from branch alone.
   * SYSTEM → Bonus (not a purchase).
   */
  sourceLabel: string;
  /**
   * Present when sourceType is FOM_POS but stable external receipt identity
   * is missing — architecture CONTRACT_PENDING (do not invent).
   */
  sourceContract?: "CONTRACT_PENDING";
  /** Legacy display fields (profile.transactions compat). */
  date: string;
  title: string;
  branch: string;
  kind: "earn" | "use" | "void";
};

export type CashbackHistoryPage = {
  items: CashbackHistoryItemDto[];
  limit: number;
  offset: number;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const KNOWN_SOURCES = new Set<string>(["ORDER", "POS", "SYSTEM", "FOM_POS"]);

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asSourceType(raw: string | null | undefined): CommercialSourceTypeDto | null {
  const t = String(raw || "").trim().toUpperCase();
  if (!KNOWN_SOURCES.has(t)) return null;
  return t as CommercialSourceTypeDto;
}

/** Pure: map authoritative sourceType → honest Uzbek label (no branch inference). */
export function sourceLabelFor(
  sourceType: CommercialSourceTypeDto | null,
  entryType: string,
): string {
  const et = String(entryType || "").toUpperCase();
  if (sourceType === "SYSTEM") return "Bonus";
  if (sourceType === "POS") {
    if (et === "USE") return "Kassa xaridi";
    if (et === "REVERSAL") return "Kassa bekor";
    return "Kassa xaridi";
  }
  if (sourceType === "ORDER") {
    if (et === "USE") return "Ilova buyurtmasi";
    if (et === "REVERSAL") return "Ilova buyurtmasi";
    return "Ilova xaridi";
  }
  if (sourceType === "FOM_POS") {
    return "FOM_POS";
  }
  if (et === "USE") return "Cashback ishlatildi";
  if (et === "REVERSAL") return "Cashback bekor qilindi";
  return "Cashback";
}

function titleFor(
  sourceType: CommercialSourceTypeDto | null,
  entryType: string,
  sourceLabel: string,
): string {
  const et = String(entryType || "").toUpperCase();
  if (et === "USE") return "Cashback ishlatildi";
  if (et === "REVERSAL") return "Cashback bekor qilindi";
  if (sourceType === "SYSTEM") return "Bonus";
  return sourceLabel;
}

function kindFor(entryType: string): "earn" | "use" | "void" {
  const et = String(entryType || "").toUpperCase();
  if (et === "USE") return "use";
  if (et === "REVERSAL") return "void";
  return "earn";
}

function signedCashback(entryType: string, amount: number, meta: Record<string, unknown>): number {
  const abs = Math.abs(Math.floor(Number(amount) || 0));
  const et = String(entryType || "").toUpperCase();
  if (et === "EARN" || et === "ADJUSTMENT") return abs;
  if (et === "USE") return -abs;
  if (et === "REVERSAL") {
    const reverses = String(meta.reverses || "").toUpperCase();
    // Reversing EARN removes credit → negative display; reversing USE restores → positive.
    if (reverses === "USE") return abs;
    return -abs;
  }
  return abs;
}

function clampPage(limitRaw?: number, offsetRaw?: number) {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(Number(limitRaw) || DEFAULT_LIMIT)),
  );
  const offset = Math.max(0, Math.floor(Number(offsetRaw) || 0));
  return { limit, offset };
}

/**
 * Customer-owned cashback history from SoT.
 * `customerId` MUST come from authenticated session — never from client body/query for auth.
 */
export async function getCustomerCashbackHistory(
  customerId: number,
  opts: { limit?: number; offset?: number; executor?: HistoryDb } = {},
): Promise<CashbackHistoryPage> {
  if (!Number.isFinite(customerId) || customerId <= 0) {
    return { items: [], limit: DEFAULT_LIMIT, offset: 0 };
  }
  const { limit, offset } = clampPage(opts.limit, opts.offset);
  const executor = (opts.executor ?? db) as HistoryDb;

  const rows = await executor
    .select({
      ledgerId: cashbackLedger.id,
      entryType: cashbackLedger.entryType,
      amount: cashbackLedger.amount,
      createdAt: cashbackLedger.createdAt,
      commercialTransactionId: cashbackLedger.commercialTransactionId,
      ledgerOrderId: cashbackLedger.orderId,
      ledgerMeta: cashbackLedger.meta,
      sourceType: commercialTransactions.sourceType,
      sourceKey: commercialTransactions.sourceKey,
      ctOrderId: commercialTransactions.orderId,
      receiptId: commercialTransactions.receiptId,
      ctMeta: commercialTransactions.meta,
    })
    .from(cashbackLedger)
    .leftJoin(
      commercialTransactions,
      eq(cashbackLedger.commercialTransactionId, commercialTransactions.id),
    )
    .where(eq(cashbackLedger.customerId, customerId))
    .orderBy(desc(cashbackLedger.createdAt), desc(cashbackLedger.id))
    .limit(limit)
    .offset(offset);

  const orderIdSet = new Set<number>();
  const receiptIdSet = new Set<string>();
  const branchIdFromMeta = new Set<number>();

  for (const row of rows) {
    const oid = row.ledgerOrderId ?? row.ctOrderId;
    if (oid != null && Number.isFinite(oid) && oid > 0) orderIdSet.add(oid);
    const rid = row.receiptId != null ? String(row.receiptId).trim() : "";
    if (rid) receiptIdSet.add(rid);
    const ctMeta = parseMeta(row.ctMeta);
    const bid = Number(ctMeta.branchId);
    if (Number.isFinite(bid) && bid > 0) branchIdFromMeta.add(bid);
  }

  const orderIds = [...orderIdSet];
  const receiptIds = [...receiptIdSet];

  const orderRows =
    orderIds.length > 0
      ? await executor
          .select({
            id: orders.id,
            code: orders.code,
            branchId: orders.branchId,
            customerId: orders.customerId,
          })
          .from(orders)
          .where(and(eq(orders.customerId, customerId), inArray(orders.id, orderIds)))
      : [];

  const orderById = new Map(orderRows.map((o) => [o.id, o]));

  const posRows =
    receiptIds.length > 0
      ? await executor
          .select({
            receiptId: posSales.receiptId,
            branchId: posSales.branchId,
            customerId: posSales.customerId,
          })
          .from(posSales)
          .where(and(eq(posSales.customerId, customerId), inArray(posSales.receiptId, receiptIds)))
      : [];

  const posByReceipt = new Map(posRows.map((p) => [p.receiptId, p]));

  for (const o of orderRows) {
    if (o.branchId > 0) branchIdFromMeta.add(o.branchId);
  }
  for (const p of posRows) {
    if (p.branchId > 0) branchIdFromMeta.add(p.branchId);
  }

  const branchIds = [...branchIdFromMeta];
  const branchRows =
    branchIds.length > 0
      ? await executor
          .select({ id: branches.id, name: branches.name })
          .from(branches)
          .where(inArray(branches.id, branchIds))
      : [];
  const branchById = new Map(branchRows.map((b) => [b.id, b]));

  const items: CashbackHistoryItemDto[] = rows.map((row) => {
    const sourceType = asSourceType(row.sourceType);
    const sourceKey = row.sourceKey != null ? String(row.sourceKey) : null;
    const entryType = String(row.entryType || "");
    const ledgerMeta = parseMeta(row.ledgerMeta);
    const absAmount = Math.abs(Math.floor(Number(row.amount) || 0));
    const cashback = signedCashback(entryType, absAmount, ledgerMeta);
    const createdAt =
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt || "");

    let orderId: number | null = null;
    let orderCode: string | null = null;
    let branchId: number | null = null;
    let branchName: string | null = null;
    let receiptId: string | null =
      row.receiptId != null && String(row.receiptId).trim()
        ? String(row.receiptId).trim()
        : null;

    const candidateOrderId = row.ledgerOrderId ?? row.ctOrderId;
    if (candidateOrderId != null && orderById.has(candidateOrderId)) {
      const o = orderById.get(candidateOrderId)!;
      orderId = o.id;
      orderCode = o.code;
      branchId = o.branchId;
    }

    if (receiptId && posByReceipt.has(receiptId)) {
      const p = posByReceipt.get(receiptId)!;
      if (branchId == null) branchId = p.branchId;
    }

    if (branchId == null) {
      const ctMeta = parseMeta(row.ctMeta);
      const bid = Number(ctMeta.branchId);
      if (Number.isFinite(bid) && bid > 0) branchId = bid;
    }

    if (branchId != null && branchById.has(branchId)) {
      branchName = branchById.get(branchId)!.name;
    }

    // FOM_POS reserved: expose type only if present; mark CONTRACT_PENDING without receipt.
    let sourceContract: "CONTRACT_PENDING" | undefined;
    if (sourceType === "FOM_POS" && !receiptId) {
      sourceContract = "CONTRACT_PENDING";
    }

    const sourceLabel = sourceLabelFor(sourceType, entryType);
    const title = titleFor(sourceType, entryType, sourceLabel);
    const kind = kindFor(entryType);

    const item: CashbackHistoryItemDto = {
      id: String(row.ledgerId),
      ledgerId: row.ledgerId,
      entryType,
      amount: absAmount,
      cashback,
      createdAt,
      sourceType,
      sourceKey,
      commercialTransactionId: row.commercialTransactionId ?? null,
      orderId,
      orderCode,
      receiptId,
      branchId,
      branchName,
      sourceLabel,
      date: createdAt.slice(0, 10),
      title,
      branch: branchName || "",
      kind,
    };
    if (sourceContract) item.sourceContract = sourceContract;
    return item;
  });

  return { items, limit, offset };
}
