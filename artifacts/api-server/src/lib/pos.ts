import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { adminUsers, branches, cashbackLedger, commercialTransactions, customers, db, loyaltyLedger, posSales } from "@workspace/db";
import { formatDate } from "./money";
import {
  MIN_PURCHASE_UZS,
  computeCashback,
  cashbackRateBps,
  rateLabel,
  nextTier,
} from "./cashback";
import { logger } from "./logger";
import { isHqAdminRole, requireConfiguredSecret } from "./securityEnv";
import { earnCashback, useCashback, reverseCashbackEntry, ensureCashbackAccount, getMaxSpendRatio } from "./cashbackFinance";

const POS_SECRET = requireConfiguredSecret(
  "POS_SECRET",
  process.env.CUSTOMER_SECRET || "vaksinamed-pos-secret",
);
const QR_TTL_MS = 90_000;
const VOID_WINDOW_MS = 15 * 60 * 1000;

export function loyaltyCardNumber(customerId: number) {
  return `VM-${String(customerId).padStart(8, "0")}`;
}

export function publicQrCode(customerId: number) {
  return `VAKSINA-${customerId}`;
}

function maskPhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 9) return phone;
  const tail = digits.slice(-4);
  return `+998 ** *** ${tail.slice(0, 2)} ${tail.slice(2)}`;
}

function signPayload(body: string) {
  return createHmac("sha256", POS_SECRET).update(body).digest("base64url");
}

/** Imzolangan, muddatli QR: VM1.{customerId}.{exp}.{sig} */
export function issuePosToken(customerId: number, ttlMs = QR_TTL_MS) {
  const exp = Date.now() + ttlMs;
  const body = `VM1.${customerId}.${exp}`;
  const sig = signPayload(body);
  return {
    qrPayload: `${body}.${sig}`,
    cardNumber: loyaltyCardNumber(customerId),
    displayCode: publicQrCode(customerId),
    expiresAt: new Date(exp).toISOString(),
    expiresIn: Math.floor(ttlMs / 1000),
  };
}

export function verifyPosToken(raw: string): { customerId: number } | null {
  const parts = String(raw || "").trim().split(".");
  if (parts.length !== 4 || parts[0] !== "VM1") return null;
  const customerId = Number(parts[1]);
  const exp = Number(parts[2]);
  const sig = parts[3];
  if (!Number.isFinite(customerId) || !Number.isFinite(exp) || !sig) return null;
  if (exp < Date.now()) return null;
  const body = `VM1.${customerId}.${exp}`;
  const expected = signPayload(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { customerId };
}

async function findCustomerByStaticCode(raw: string) {
  const text = String(raw || "").trim().toUpperCase();

  // VAKSINA-123 or VAKSINA-APP:998...
  const vak = text.match(/^VAKSINA-(.+)$/i);
  if (vak) {
    const key = vak[1];
    if (/^\d+$/.test(key)) {
      const byId = await db.select().from(customers).where(eq(customers.id, Number(key))).limit(1);
      if (byId[0]) return byId[0];
    }
    const byTg = await db.select().from(customers).where(eq(customers.telegramId, key.toLowerCase())).limit(1);
    if (byTg[0]) return byTg[0];
    const byTgExact = await db.select().from(customers).where(eq(customers.telegramId, key)).limit(1);
    if (byTgExact[0]) return byTgExact[0];
  }

  // VM-00000123
  const card = text.match(/^VM-0*(\d+)$/i);
  if (card) {
    const byId = await db.select().from(customers).where(eq(customers.id, Number(card[1]))).limit(1);
    if (byId[0]) return byId[0];
  }

  return null;
}

export async function resolveCustomerFromScan(raw: string) {
  const token = verifyPosToken(raw);
  if (token) {
    const rows = await db.select().from(customers).where(eq(customers.id, token.customerId)).limit(1);
    if (!rows[0]) throw Object.assign(new Error("Mijoz topilmadi"), { status: 404 });
    return { customer: rows[0], source: "signed_qr" as const };
  }

  const staticCustomer = await findCustomerByStaticCode(raw);
  if (staticCustomer) return { customer: staticCustomer, source: "card" as const };

  throw Object.assign(new Error("QR yoki karta kodi noto‘g‘ri / muddati tugagan"), { status: 404 });
}

function customerPosView(customer: typeof customers.$inferSelect) {
  const bps = cashbackRateBps(customer.tier);
  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    name: `${customer.firstName} ${customer.lastName}`.trim(),
    phoneMasked: maskPhone(customer.phone),
    tier: customer.tier,
    balance: customer.balance,
    purchasesCount: customer.purchasesCount,
    cardNumber: loyaltyCardNumber(customer.id),
    displayCode: publicQrCode(customer.id),
    cashbackRate: bps / 10000,
    cashbackRateLabel: rateLabel(bps),
    rateBps: bps,
  };
}

export function computePosPreview(input: {
  amount: number;
  cashbackToUse: number;
  balance: number;
  rateBps: number;
  tier?: string;
  maxSpendRatio?: number;
}) {
  const calc = computeCashback({
    goodsAmount: input.amount,
    cashbackToUse: input.cashbackToUse,
    balance: input.balance,
    tier: input.tier || (input.rateBps >= 700 ? "Platinum" : input.rateBps >= 500 ? "Gold" : "Silver"),
    maxSpendRatio: input.maxSpendRatio,
  });
  return {
    amount: calc.goodsAmount,
    cashbackUsed: calc.cashbackUsed,
    cashbackEarned: calc.cashbackEarned,
    payable: calc.payableTotal,
    maxSpend: calc.maxSpend,
    maxSpendRatio: calc.maxSpendRatio,
    earnBase: calc.payableGoods,
    balanceAfter: input.balance - calc.cashbackUsed + calc.cashbackEarned,
    rateBps: calc.rateBps,
    cashbackRateLabel: calc.rateLabel,
    minPurchase: MIN_PURCHASE_UZS,
  };
}

export async function lookupPosCustomer(qrRaw: string) {
  const { customer, source } = await resolveCustomerFromScan(qrRaw);
  return { customer: customerPosView(customer), scanSource: source };
}

export async function previewPosSale(input: { qr: string; amount: number; cashbackToUse?: number }) {
  const { customer, source } = await resolveCustomerFromScan(input.qr);
  const view = customerPosView(customer);
  const maxSpendRatio = await getMaxSpendRatio();
  const preview = computePosPreview({
    amount: input.amount,
    cashbackToUse: input.cashbackToUse ?? 0,
    balance: customer.balance,
    rateBps: view.rateBps,
    tier: customer.tier,
    maxSpendRatio,
  });
  return { customer: view, preview, scanSource: source };
}

function makeReceiptId(branchId: number) {
  const stamp = Date.now().toString(36).toUpperCase();
  const rnd = randomBytes(3).toString("hex").toUpperCase();
  return `POS-${branchId}-${stamp}-${rnd}`;
}

export async function confirmPosSale(input: {
  qr: string;
  amount: number;
  cashbackToUse?: number;
  branchId: number;
  receiptId?: string;
  staffId?: number | null;
  actor?: string;
}) {
  const branchId = Number(input.branchId);
  if (!Number.isFinite(branchId) || branchId <= 0) {
    throw Object.assign(new Error("Filial tanlang"), { status: 400 });
  }

  const branch = (await db.select().from(branches).where(eq(branches.id, branchId)).limit(1))[0];
  if (!branch) throw Object.assign(new Error("Filial topilmadi"), { status: 404 });

  const receiptId = String(input.receiptId || "").trim() || makeReceiptId(branchId);

  const existing = await db.select().from(posSales).where(eq(posSales.receiptId, receiptId)).limit(1);
  if (existing[0]) {
    const cust = (await db.select().from(customers).where(eq(customers.id, existing[0].customerId)).limit(1))[0];
    return {
      idempotent: true,
      sale: existing[0],
      customer: cust ? customerPosView(cust) : null,
      receipt: serializeReceipt(existing[0], cust, branch),
    };
  }

  const { customer } = await resolveCustomerFromScan(input.qr);
  const view = customerPosView(customer);
  await ensureCashbackAccount(customer.id);
  const fresh = (await db.select().from(customers).where(eq(customers.id, customer.id)).limit(1))[0];
  if (!fresh) throw Object.assign(new Error("Mijoz topilmadi"), { status: 404 });

  const preview = computePosPreview({
    amount: input.amount,
    cashbackToUse: input.cashbackToUse ?? 0,
    balance: fresh.balance,
    rateBps: view.rateBps,
    tier: customer.tier,
    maxSpendRatio: await getMaxSpendRatio(),
  });

  if (fresh.balance < preview.cashbackUsed) {
    throw Object.assign(new Error("Cashback balansi yetarli emas"), { status: 409 });
  }

  const commercial = {
    sourceType: "POS" as const,
    sourceKey: `receipt:${receiptId}`,
    customerId: fresh.id,
    receiptId,
    amount: preview.amount,
    meta: { branchId },
  };

  try {
    await db.transaction(async (tx) => {
      const executor = tx as unknown as typeof db;
      if (preview.cashbackUsed > 0) {
        await useCashback(
          {
            customerId: fresh.id,
            amount: preview.cashbackUsed,
            eligibleGoodsAmount: preview.amount,
            maxSpendRatio: preview.maxSpendRatio,
            commercial,
            actor: input.actor || "kassa",
            reason: "pos_use",
            idempotencyKey: `use:receipt:${receiptId}`,
          },
          executor,
          { alreadyInTx: true },
        );
      }
      if (preview.cashbackEarned > 0) {
        await earnCashback(
          {
            customerId: fresh.id,
            amount: preview.cashbackEarned,
            commercial,
            actor: input.actor || "kassa",
            reason: "pos_earn",
            idempotencyKey: `earn:receipt:${receiptId}`,
            legacyTitle: "Kassada cashback",
            legacyBranch: branch.name,
            legacyAmount: preview.payable,
          },
          executor,
          { alreadyInTx: true },
        );
      }

      await executor.update(customers).set({
        purchasesCount: fresh.purchasesCount + 1,
        totalPurchases: fresh.totalPurchases + preview.amount,
        savedAmount: fresh.savedAmount + preview.cashbackEarned,
        tier: nextTier(fresh.totalPurchases + preview.amount, fresh.tier),
      }).where(eq(customers.id, fresh.id));

      await executor.insert(posSales).values({
        receiptId,
        customerId: fresh.id,
        branchId,
        staffId: input.staffId ?? null,
        amount: preview.amount,
        cashbackUsed: preview.cashbackUsed,
        cashbackEarned: preview.cashbackEarned,
        payable: preview.payable,
        rateBps: preview.rateBps,
        status: "completed",
        actor: input.actor || "kassa",
      });

      if (preview.cashbackUsed > 0) {
        try {
          await executor.insert(loyaltyLedger).values({
            customerId: fresh.id,
            orderId: null,
            externalId: `${receiptId}:use`,
            date: formatDate(),
            title: "Kassada cashback ishlatildi",
            branch: branch.name,
            amount: preview.amount,
            cashback: -preview.cashbackUsed,
            kind: "use",
          });
        } catch {
          /* display only */
        }
      }
      if (preview.cashbackEarned > 0) {
        try {
          await executor.insert(loyaltyLedger).values({
            customerId: fresh.id,
            orderId: null,
            externalId: `${receiptId}:earn`,
            date: formatDate(),
            title: "Kassada cashback",
            branch: branch.name,
            amount: preview.payable,
            cashback: preview.cashbackEarned,
            kind: "earn",
          });
        } catch {
          /* display only — earnCashback may already soft-write for orderId paths */
        }
      }

      await executor.execute(sql`
        INSERT INTO audit_log (actor, action, entity, payload)
        VALUES (
          ${input.actor || "kassa"},
          ${"pos.sale"},
          ${"pos_sale"},
          ${JSON.stringify({
            receiptId,
            customerId: fresh.id,
            branchId,
            amount: preview.amount,
            cashbackUsed: preview.cashbackUsed,
            cashbackEarned: preview.cashbackEarned,
            payable: preview.payable,
          })}
        )
      `);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await db.select().from(posSales).where(eq(posSales.receiptId, receiptId)).limit(1);
      if (raced[0]) {
        const cust = (await db.select().from(customers).where(eq(customers.id, raced[0].customerId)).limit(1))[0];
        return {
          idempotent: true,
          sale: raced[0],
          customer: cust ? customerPosView(cust) : null,
          receipt: serializeReceipt(raced[0], cust, branch),
        };
      }
    }
    throw error;
  }

  const sale = (await db.select().from(posSales).where(eq(posSales.receiptId, receiptId)).limit(1))[0];
  const updated = (await db.select().from(customers).where(eq(customers.id, fresh.id)).limit(1))[0];
  logger.info({ receiptId, customerId: fresh.id, amount: preview.amount }, "POS sale confirmed");

  return {
    idempotent: false,
    sale,
    customer: customerPosView(updated),
    receipt: serializeReceipt(sale, updated, branch),
  };
}

function isUniqueViolation(error: unknown): boolean {
  const msg = String((error as Error)?.message || error || "").toLowerCase();
  return msg.includes("unique") || msg.includes("duplicate");
}

function serializeReceipt(
  sale: typeof posSales.$inferSelect,
  customer: typeof customers.$inferSelect | null | undefined,
  branch: typeof branches.$inferSelect,
) {
  return {
    receiptId: sale.receiptId,
    status: sale.status,
    createdAt: sale.createdAt,
    branch: { id: branch.id, name: branch.name, address: branch.address },
    customer: customer
      ? {
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          cardNumber: loyaltyCardNumber(customer.id),
          phoneMasked: maskPhone(customer.phone),
          tier: customer.tier,
          balance: customer.balance,
        }
      : null,
    amount: sale.amount,
    cashbackUsed: sale.cashbackUsed,
    cashbackEarned: sale.cashbackEarned,
    payable: sale.payable,
    rateLabel: rateLabel(sale.rateBps),
    actor: sale.actor,
  };
}

export async function voidPosSale(input: { receiptId: string; staffId?: number | null; actor?: string }) {
  const receiptId = String(input.receiptId || "").trim();
  const sale = (await db.select().from(posSales).where(eq(posSales.receiptId, receiptId)).limit(1))[0];
  if (!sale) throw Object.assign(new Error("Chek topilmadi"), { status: 404 });
  if (sale.status === "voided") {
    throw Object.assign(new Error("Chek allaqachon bekor qilingan"), { status: 409 });
  }
  const age = Date.now() - new Date(sale.createdAt).getTime();
  if (age > VOID_WINDOW_MS) {
    throw Object.assign(new Error("Bekor qilish muddati tugagan (15 daqiqa)"), { status: 400 });
  }

  const customer = (await db.select().from(customers).where(eq(customers.id, sale.customerId)).limit(1))[0];
  if (!customer) throw Object.assign(new Error("Mijoz topilmadi"), { status: 404 });

  const commercialKey = `receipt:${receiptId}`;
  const commercial = (await db
    .select()
    .from(commercialTransactions)
    .where(
      and(
        eq(commercialTransactions.sourceType, "POS"),
        eq(commercialTransactions.sourceKey, commercialKey),
      ),
    )
    .limit(1))[0];

  if (commercial) {
    const related = await db
      .select()
      .from(cashbackLedger)
      .where(eq(cashbackLedger.commercialTransactionId, commercial.id));
    for (const entry of related.filter((r) => r.entryType === "EARN")) {
      await reverseCashbackEntry(entry.id, {
        actor: input.actor || "kassa",
        reason: "pos_void",
      });
    }
    for (const entry of related.filter((r) => r.entryType === "USE")) {
      await reverseCashbackEntry(entry.id, {
        actor: input.actor || "kassa",
        reason: "pos_void",
      });
    }
  }

  await db.update(customers).set({
    purchasesCount: Math.max(0, customer.purchasesCount - 1),
    totalPurchases: Math.max(0, customer.totalPurchases - sale.amount),
    savedAmount: Math.max(0, customer.savedAmount - sale.cashbackEarned),
  }).where(eq(customers.id, customer.id));

  await db.update(posSales).set({ status: "voided" }).where(eq(posSales.id, sale.id));

  const branch = (await db.select().from(branches).where(eq(branches.id, sale.branchId)).limit(1))[0];
  await db.insert(loyaltyLedger).values({
    customerId: customer.id,
    orderId: null,
    externalId: `${receiptId}:void`,
    date: formatDate(),
    title: "Kassa cheki bekor qilindi",
    branch: branch?.name ?? "Vaksina Med",
    amount: sale.amount,
    cashback: sale.cashbackUsed - sale.cashbackEarned,
    kind: "void",
  });

  await db.execute(sql`
    INSERT INTO audit_log (actor, action, entity, payload)
    VALUES (
      ${input.actor || "kassa"},
      ${"pos.void"},
      ${"pos_sale"},
      ${JSON.stringify({ receiptId, staffId: input.staffId })}
    )
  `);

  return { ok: true, receiptId, status: "voided" };
}

export async function listPosSales(options: { branchId?: number; limit?: number }) {
  const limit = Math.min(100, Math.max(1, options.limit || 40));
  let rows;
  if (options.branchId) {
    rows = await db
      .select()
      .from(posSales)
      .where(and(eq(posSales.branchId, options.branchId)))
      .orderBy(desc(posSales.createdAt))
      .limit(limit);
  } else {
    rows = await db.select().from(posSales).orderBy(desc(posSales.createdAt)).limit(limit);
  }

  const result = [];
  for (const sale of rows) {
    const customer = (await db.select().from(customers).where(eq(customers.id, sale.customerId)).limit(1))[0];
    const branch = (await db.select().from(branches).where(eq(branches.id, sale.branchId)).limit(1))[0];
    result.push({
      ...sale,
      customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : "—",
      cardNumber: customer ? loyaltyCardNumber(customer.id) : "—",
      branchName: branch?.name ?? "—",
      rateLabel: rateLabel(sale.rateBps),
    });
  }
  return result;
}

export async function issueCustomerPosCard(customerId: number) {
  const customer = (await db.select().from(customers).where(eq(customers.id, customerId)).limit(1))[0];
  if (!customer) throw Object.assign(new Error("Mijoz topilmadi"), { status: 404 });
  const token = issuePosToken(customer.id);
  const view = customerPosView(customer);
  return {
    ...token,
    balance: view.balance,
    tier: view.tier,
    name: view.name,
    cashbackRateLabel: view.cashbackRateLabel,
  };
}

export async function assertStaffBranch(staff: typeof adminUsers.$inferSelect, branchId: number) {
  // P2: null branchId is HQ only for explicit HQ roles — not cashiers
  if (isHqAdminRole(staff.role)) return;
  if (!staff.branchId || staff.branchId !== branchId) {
    throw Object.assign(new Error("Bu filial uchun ruxsat yo‘q"), { status: 403 });
  }
}
