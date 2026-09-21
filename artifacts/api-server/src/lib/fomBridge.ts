/**
 * FOM (F-Apteka / DMED kassa) ↔ Vaksina Med ko‘prigi
 *
 * P9: commercial/sale sync only. Inventory writer DISABLED (fomAdapter).
 * barcodes accepted but never mapped to stock (FOM stock contract CONTRACT_PENDING).
 */

import { eq } from "drizzle-orm";
import { branches, db, fomSaleEvents } from "@workspace/db";
import { confirmPosSale } from "./pos";
import { confirmFomSale } from "./fom";
import { logger } from "./logger";
import { assertFomInventoryWriterDisabled, FOM_INVENTORY_WRITER_ENABLED } from "./fomAdapter";

export type FomPaymentMethod = "click" | "payme" | "cash" | "card" | "unknown";

export type FomSalePayload = {
  /** FOM chek / cheque id — idempotent kalit (vendor-provided when present) */
  receiptId: string;
  branchCode?: string;
  branchId?: number;
  customerQr?: string;
  orderCode?: string;
  amount?: number;
  cashbackToUse?: number;
  paymentMethod?: FomPaymentMethod | string;
  /** Accepted but unused for inventory — CONTRACT_PENDING stock mapping */
  barcodes?: string[];
  actor?: string;
};

export async function resolveBranchId(
  input: { branchId?: number; branchCode?: string },
  executor: typeof db = db,
) {
  if (input.branchId && Number.isFinite(input.branchId)) {
    const row = (await executor.select().from(branches).where(eq(branches.id, Number(input.branchId))).limit(1))[0];
    if (row) return row;
  }
  const code = String(input.branchCode || "").trim().toLowerCase();
  if (!code) return null;

  const all = await executor.select().from(branches);
  const exact = all.find((b) => b.code.toLowerCase() === code);
  if (exact) return exact;
  const byName = all.find((b) => b.code.toLowerCase().includes(code) || code.includes(b.code.toLowerCase()));
  if (byName) return byName;
  const num = code.replace(/\D/g, "");
  if (num) {
    const byNum = all.find((b) => b.code.replace(/\D/g, "") === num || b.code.toLowerCase().endsWith(num));
    if (byNum) return byNum;
  }
  return null;
}

function normalizePayment(raw?: string): FomPaymentMethod {
  const v = String(raw || "").toLowerCase();
  if (v.includes("click")) return "click";
  if (v.includes("payme") || v.includes("paymee")) return "payme";
  if (v.includes("cash") || v.includes("naqd") || v.includes("нал")) return "cash";
  if (v.includes("card") || v.includes("terminal") || v.includes("uzcard") || v.includes("humo")) return "card";
  return "unknown";
}

function sanitizePayload(raw: FomSalePayload): string {
  const copy = { ...raw } as Record<string, unknown>;
  for (const key of Object.keys(copy)) {
    if (/secret|password|token|authorization/i.test(key)) copy[key] = "[redacted]";
  }
  return JSON.stringify(copy);
}

/**
 * FOM sotuvini qayta ishlash (idempotent by receiptId).
 * - orderCode → confirmFomSale (reservation consume via P5, not FOM stock writer)
 * - customerQr + amount → walk-in POS
 */
export async function processFomSale(raw: FomSalePayload, executor: typeof db = db) {
  assertFomInventoryWriterDisabled();

  const receiptId = String(raw.receiptId || "").trim();
  if (!receiptId) {
    throw Object.assign(new Error("receiptId (FOM chek) majburiy — vendor identity yaratilmaydi"), {
      status: 400,
      code: "FOM_RECEIPT_REQUIRED",
    });
  }

  const existing = await executor.select().from(fomSaleEvents).where(eq(fomSaleEvents.receiptId, receiptId)).limit(1);
  if (existing[0]) {
    let prior: Record<string, unknown> = {};
    try {
      prior = JSON.parse(existing[0].resultMeta || "{}");
    } catch {
      prior = {};
    }
    let order = null;
    if (existing[0].orderId) {
      const { orders } = await import("@workspace/db");
      order = (await executor.select().from(orders).where(eq(orders.id, existing[0].orderId)).limit(1))[0] || null;
    }
    return {
      mode: (existing[0].mode || "order") as "order" | "walk_in",
      idempotent: true as const,
      inventoryWriter: "DISABLED" as const,
      barcodesProcessed: false as const,
      fomInventoryWriterEnabled: FOM_INVENTORY_WRITER_ENABLED,
      receiptId,
      order,
      paymentMethod: prior.paymentMethod,
      branch: prior.branchId
        ? { id: prior.branchId }
        : null,
      message: "FOM sale allaqachon qayta ishlangan (idempotent)",
    };
  }

  const orderCode = String(raw.orderCode || "").trim();
  const customerQr = String(raw.customerQr || "").trim();
  const amount = Math.floor(Number(raw.amount) || 0);
  const cashbackToUse = Math.floor(Number(raw.cashbackToUse) || 0);
  const paymentMethod = normalizePayment(raw.paymentMethod);
  const actor = raw.actor || `fom:${paymentMethod}`;
  const barcodes = Array.isArray(raw.barcodes) ? raw.barcodes : [];

  // Unknown barcodes: quarantine metadata only — no silent product mapping
  if (barcodes.length > 0) {
    logger.info(
      { receiptId, barcodeCount: barcodes.length, inventoryWriter: "DISABLED" },
      "FOM barcodes received — ignored (stock contract CONTRACT_PENDING)",
    );
  }

  const branch = await resolveBranchId({
    branchId: raw.branchId,
    branchCode: raw.branchCode,
  }, executor);

  logger.info(
    { receiptId, orderCode: orderCode || null, branchId: branch?.id, paymentMethod, amount },
    "FOM sale received",
  );

  let result: Record<string, unknown>;

  if (orderCode) {
    const order = await confirmFomSale({
      orderCode,
      customerQr: customerQr || undefined,
      receiptId,
      amount: amount || undefined,
      actor,
    });
    result = {
      mode: "order" as const,
      order,
      paymentMethod,
      branch: branch ? { id: branch.id, code: branch.code, name: branch.name } : null,
      earnTrigger: "fom_order_confirm" as const,
      message: "Buyurtma FOM’da tasdiqlandi. Cashback hisobga o‘tkaziladi.",
    };
  } else if (customerQr && amount > 0) {
    if (!branch) {
      throw Object.assign(new Error("branchCode yoki branchId kerak (masalan apteka53)"), {
        status: 400,
        code: "FOM_BRANCH_REQUIRED",
      });
    }
    const pos = await confirmPosSale({
      qr: customerQr,
      amount,
      cashbackToUse,
      branchId: branch.id,
      receiptId,
      actor,
    });
    result = {
      mode: "walk_in" as const,
      ...pos,
      paymentMethod,
      branch: { id: branch.id, code: branch.code, name: branch.name },
      earnTrigger: "fom_walk_in" as const,
      message: "Kassada sotuv yopildi. Cashback balansga tushdi.",
    };
  } else {
    throw Object.assign(new Error("orderCode yoki (customerQr + amount) yuboring"), { status: 400 });
  }

  try {
    await executor.insert(fomSaleEvents).values({
      receiptId,
      branchId: branch?.id ?? null,
      orderId: result.mode === "order" && result.order && typeof result.order === "object"
        ? Number((result.order as { id?: number }).id) || null
        : null,
      mode: String(result.mode || ""),
      status: "PROCESSED",
      payload: sanitizePayload(raw),
      resultMeta: JSON.stringify({
        mode: result.mode,
        paymentMethod,
        branchId: branch?.id ?? null,
        inventoryWriter: "DISABLED",
        barcodesProcessed: false,
      }),
      actor,
    });
  } catch (error) {
    // Race: another worker inserted same receipt — treat as idempotent
    const raced = await executor.select().from(fomSaleEvents).where(eq(fomSaleEvents.receiptId, receiptId)).limit(1);
    if (raced[0]) {
      return {
        ...result,
        idempotent: true as const,
        inventoryWriter: "DISABLED" as const,
        barcodesProcessed: false as const,
        fomInventoryWriterEnabled: FOM_INVENTORY_WRITER_ENABLED,
        receiptId,
        message: "FOM sale concurrent idempotent",
      };
    }
    throw error;
  }

  return {
    ...result,
    idempotent: false as const,
    inventoryWriter: "DISABLED" as const,
    barcodesProcessed: false as const,
    fomInventoryWriterEnabled: FOM_INVENTORY_WRITER_ENABLED,
    receiptId,
  };
}
