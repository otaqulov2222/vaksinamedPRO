/**
 * F-Kassa CASHBACK.exe adapter (vendor PDF protocol).
 *
 * Maps vendor verbs onto existing POS finance — does NOT invent FOM_POS identity.
 * - GetBalance → lookupPosCustomer / resolveCustomerFromScan
 * - CreateReceipt → confirmPosSale (sourceKey receipt:… / POS)
 *
 * Mount base URL for FOM SETUP: https://<host>/fom-cashback
 */

import { eq } from "drizzle-orm";
import { customers, db } from "@workspace/db";
import { confirmPosSale, lookupPosCustomer, publicQrCode } from "./pos";
import { resolveAppBranchId } from "./fomBranchMap";
import { logger } from "./logger";
import { cashbackErr, cashbackOk } from "./fomCashbackExeAuth";

export {
  authenticateCashbackExe,
  cashbackErr,
  cashbackOk,
  issueCashbackExeToken,
  verifyCashbackExeToken,
} from "./fomCashbackExeAuth";

function paymentValue(payments: unknown, name: string): number {
  if (!Array.isArray(payments)) return 0;
  for (const p of payments) {
    if (!p || typeof p !== "object") continue;
    const row = p as Record<string, unknown>;
    if (String(row.name || "").toLowerCase() === name.toLowerCase()) {
      const n = Number(row.value);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
  return 0;
}

function itemsTotal(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  let sum = 0;
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const row = it as Record<string, unknown>;
    const qty = Number(row.qty ?? 1);
    const price = Number(row.price ?? 0);
    if (Number.isFinite(qty) && Number.isFinite(price) && qty > 0 && price >= 0) {
      sum += qty * price;
    }
  }
  return Math.floor(sum);
}

export async function cashbackExeGetBalance(scanCode: string) {
  const code = String(scanCode || "").trim();
  if (!code) {
    return { http: 200 as const, body: cashbackErr("User not found by scan code!") };
  }
  try {
    const { customer } = await lookupPosCustomer(code);
    return {
      http: 200 as const,
      body: cashbackOk({
        id: customer.id,
        first_name: customer.firstName,
        last_name: customer.lastName,
        phone: customer.phoneMasked,
        balance: customer.balance,
        scan_code: code,
      }),
    };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      return { http: 200 as const, body: cashbackErr("User not found by scan code!") };
    }
    throw err;
  }
}

export async function cashbackExeCreateReceipt(params: Record<string, unknown>) {
  const receiptNo = String(params.receipt_no || params.receiptNo || "").trim();
  const type = String(params.type || "SALE").trim().toUpperCase();
  if (type && type !== "SALE") {
    return { http: 200 as const, body: cashbackErr(`Unsupported receipt type: ${type}`) };
  }
  if (!receiptNo) {
    return { http: 200 as const, body: cashbackErr("receipt_no required") };
  }

  const clientId = Number(params.client);
  if (!Number.isFinite(clientId) || clientId <= 0) {
    return { http: 200 as const, body: cashbackErr("User not found by scan code!") };
  }

  const cust = (await db.select().from(customers).where(eq(customers.id, clientId)).limit(1))[0];
  if (!cust) {
    return { http: 200 as const, body: cashbackErr("User not found by scan code!") };
  }

  const branchResolved = resolveAppBranchId(
    params.branch as string | number | null | undefined,
  );
  if (branchResolved.branchId == null) {
    return {
      http: 200 as const,
      body: cashbackErr("Branch mapping missing (set FOM_BRANCH_MAP or FOM_DEFAULT_BRANCH_ID)"),
    };
  }

  const bonus = paymentValue(params.payments, "BONUS");
  const oplata = paymentValue(params.payments, "Oplata");
  const fromItems = itemsTotal(params.items);
  const amount = Math.floor(oplata + bonus) || fromItems;
  if (!(amount > 0)) {
    return { http: 200 as const, body: cashbackErr("receipt amount required") };
  }

  try {
    await confirmPosSale({
      qr: publicQrCode(cust.id),
      amount,
      cashbackToUse: bonus,
      branchId: branchResolved.branchId,
      receiptId: `FOMCB-${receiptNo}`,
      actor: "fom-cashback-exe",
    });

    logger.info(
      {
        event: "FOM_CASHBACK_EXE_RECEIPT",
        receiptNo,
        clientId: cust.id,
        branchId: branchResolved.branchId,
        branchVia: branchResolved.via,
        amount,
        bonus,
      },
      "CASHBACK.exe CreateReceipt → confirmPosSale",
    );

    return { http: 201 as const, body: cashbackOk("OK" as const) };
  } catch (err) {
    const message = String((err as Error)?.message || "");
    const status = (err as { status?: number }).status;
    if (status === 409 || /yetarli emas|Not enough|balance/i.test(message)) {
      return { http: 200 as const, body: cashbackErr("Not enough money!") };
    }
    if (status === 404) {
      return { http: 200 as const, body: cashbackErr("User not found by scan code!") };
    }
    throw err;
  }
}
