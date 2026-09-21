/**
 * FOM (F-Apteka / DMED kassa) ↔ Vaksina Med ko‘prigi
 *
 * Dorixonadagi dastur: shtrix-kod skan, narx, qoldiq, seriya/muddat,
 * Click / Payme / naqd — hammasi FOMda qoladi.
 * Bizga kerak: sotuv yopilganda loyalty cashback va ilova bronini bog‘lash.
 */

import { eq } from "drizzle-orm";
import { branches, db } from "@workspace/db";
import { confirmPosSale } from "./pos";
import { confirmFomSale } from "./fom";
import { logger } from "./logger";

export type FomPaymentMethod = "click" | "payme" | "cash" | "card" | "unknown";

export type FomSalePayload = {
  /** FOM chek / cheque id — idempotent kalit */
  receiptId: string;
  /** apteka53 yoki branches.code */
  branchCode?: string;
  branchId?: number;
  /** Mijoz loyalty QR */
  customerQr?: string;
  /** Ilova buyurtma kodi VM-… */
  orderCode?: string;
  /** Xarid summasi (tovarlar, so‘m) */
  amount?: number;
  cashbackToUse?: number;
  paymentMethod?: FomPaymentMethod | string;
  /** Ixtiyoriy: skanlangan shtrix-kodlar */
  barcodes?: string[];
  actor?: string;
};

export async function resolveBranchId(input: { branchId?: number; branchCode?: string }) {
  if (input.branchId && Number.isFinite(input.branchId)) {
    const row = (await db.select().from(branches).where(eq(branches.id, Number(input.branchId))).limit(1))[0];
    if (row) return row;
  }
  const code = String(input.branchCode || "").trim().toLowerCase();
  if (!code) return null;

  // apteka53 → code match; also try numeric suffix
  const all = await db.select().from(branches);
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

/**
 * FOM sotuvini qayta ishlash:
 * - orderCode bor → ilova bronini completed + cashback (caller completeOrderCashback)
 * - customerQr + amount → walk-in POS cashback
 */
export async function processFomSale(raw: FomSalePayload) {
  const receiptId = String(raw.receiptId || "").trim();
  if (!receiptId) {
    throw Object.assign(new Error("receiptId (FOM chek) majburiy"), { status: 400 });
  }

  const orderCode = String(raw.orderCode || "").trim();
  const customerQr = String(raw.customerQr || "").trim();
  const amount = Math.floor(Number(raw.amount) || 0);
  const cashbackToUse = Math.floor(Number(raw.cashbackToUse) || 0);
  const paymentMethod = normalizePayment(raw.paymentMethod);
  const actor = raw.actor || `fom:${paymentMethod}`;

  const branch = await resolveBranchId({
    branchId: raw.branchId,
    branchCode: raw.branchCode,
  });

  logger.info(
    { receiptId, orderCode: orderCode || null, branchId: branch?.id, paymentMethod, amount },
    "FOM sale received",
  );

  // 1) Ilova buyurtmasi (bron / onlayn)
  if (orderCode) {
    const order = await confirmFomSale({
      orderCode,
      customerQr: customerQr || undefined,
      receiptId,
      amount: amount || undefined,
      actor,
    });
    return {
      mode: "order" as const,
      order,
      paymentMethod,
      branch: branch ? { id: branch.id, code: branch.code, name: branch.name } : null,
      earnTrigger: "fom_order_confirm" as const,
      message: "Buyurtma FOM’da tasdiqlandi. Cashback hisobga o‘tkaziladi.",
    };
  }

  // 2) Walk-in: mijoz QR + summa (FOM skan → to‘lov → chek)
  if (customerQr && amount > 0) {
    if (!branch) {
      throw Object.assign(new Error("branchCode yoki branchId kerak (masalan apteka53)"), { status: 400 });
    }
    const result = await confirmPosSale({
      qr: customerQr,
      amount,
      cashbackToUse,
      branchId: branch.id,
      receiptId,
      actor,
    });
    return {
      mode: "walk_in" as const,
      ...result,
      paymentMethod,
      branch: { id: branch.id, code: branch.code, name: branch.name },
      earnTrigger: "fom_walk_in" as const,
      message: "Kassada sotuv yopildi. Cashback balansga tushdi.",
    };
  }

  throw Object.assign(
    new Error("orderCode yoki (customerQr + amount) yuboring"),
    { status: 400 },
  );
}
