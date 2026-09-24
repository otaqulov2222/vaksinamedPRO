/**
 * UNIVERSAL CASHBACK 2.0 — single authoritative cashback financial writer.
 *
 * Architecture (LOCKED — see docs/UNIVERSAL_CASHBACK_2_0_ARCHITECTURE_LOCK.md):
 *
 *   CUSTOMER → COMMERCIAL TRANSACTION → ENGINE (EARN|USE|REVERSAL)
 *            → CASHBACK LEDGER → cashback_accounts BALANCE → UI / TIER
 *
 * SoT: cashback_accounts + cashback_ledger (+ commercial_transactions).
 * customers.balance is mirrored for compatibility only — never independent SoT.
 *
 * Commercial identity (channel ≠ balance):
 * - ORDER:   sourceKey `order:{orders.id}` — app checkout; FOM confirm-pos earn uses SAME key.
 * - POS:     sourceKey `receipt:{receiptId}` — walk-in kassa.
 * - FOM_POS: reserved until stable external receipt identity exists (do not invent).
 * - SYSTEM:  registration / system grants — not a fake commercial sale.
 *
 * Payment method is NOT a cashback partition. PAID alone does NOT earn.
 *
 * OPEN dependency (not invented): stable FOM vendor payload field for external receipt ID
 * beyond current bridge aliases (`receiptId` / orderCode). Until guaranteed, FOM order-linked
 * earn must continue resolving through ORDER commercial identity — never a fabricated second key.
 *
 * OPEN (Q3): exact FOM pickup earn moment — do not guess.
 */

import { and, eq, sql } from "drizzle-orm";
import {
  cashbackAccounts,
  cashbackLedger,
  commercialTransactions,
  customers,
  db,
  loyaltyLedger,
  systemSettings,
  type CashbackAccount,
  type CashbackLedgerEntry,
  type CommercialTransaction,
} from "@workspace/db";
import { clampCashbackSpend, DEFAULT_MAX_SPEND_RATIO, normalizeSpendRatio } from "./cashback";
import { emitAlert, ALERT } from "./alerts";

type DbLike = typeof db;

export type CommercialSourceType = "ORDER" | "POS" | "FOM_POS" | "SYSTEM";

export type ResolveCommercialInput = {
  sourceType: CommercialSourceType;
  sourceKey: string;
  customerId: number;
  orderId?: number | null;
  receiptId?: string | null;
  amount?: number;
  meta?: Record<string, unknown>;
};

function badRequest(message: string, status = 400, code?: string) {
  return Object.assign(new Error(message), { status, code });
}

function withTx<T>(executor: DbLike, alreadyInTx: boolean, fn: (tx: DbLike) => Promise<T>): Promise<T> {
  if (alreadyInTx) return fn(executor);
  return (executor as typeof db).transaction(async (tx) => fn(tx as unknown as DbLike));
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

function isUniqueViolation(error: unknown): boolean {
  const msg = String((error as Error)?.message || error || "").toLowerCase();
  return msg.includes("unique") || msg.includes("duplicate");
}

/** P6.5 — server setting `cashback.max_spend_ratio` (default 0.30). */
export async function getMaxSpendRatio(executor: DbLike = db): Promise<number> {
  try {
    const rows = await executor
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "cashback.max_spend_ratio"))
      .limit(1);
    if (rows[0]) return normalizeSpendRatio(rows[0].value);
  } catch {
    // settings table missing on ancient DBs — fall through
  }
  return DEFAULT_MAX_SPEND_RATIO;
}

/** Ensure account exists; create with zero if missing. */
export async function ensureCashbackAccount(
  customerId: number,
  executor: DbLike = db,
  opts: { alreadyInTx?: boolean } = {},
): Promise<CashbackAccount> {
  return withTx(executor, Boolean(opts.alreadyInTx), async (tx) => {
    const existing = await tx
      .select()
      .from(cashbackAccounts)
      .where(eq(cashbackAccounts.customerId, customerId))
      .limit(1);
    if (existing[0]) return existing[0];
    try {
      const inserted = await tx
        .insert(cashbackAccounts)
        .values({ customerId, balance: 0, updatedAt: new Date() })
        .returning();
      return inserted[0];
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const again = await tx
        .select()
        .from(cashbackAccounts)
        .where(eq(cashbackAccounts.customerId, customerId))
        .limit(1);
      if (again[0]) return again[0];
      throw error;
    }
  });
}

/** Resolve or create commercial transaction by (source_type, source_key). */
export async function resolveCommercialTransaction(
  input: ResolveCommercialInput,
  executor: DbLike = db,
  opts: { alreadyInTx?: boolean } = {},
): Promise<{ commercial: CommercialTransaction; created: boolean }> {
  const sourceKey = String(input.sourceKey || "").trim();
  if (!sourceKey) throw badRequest("commercial sourceKey majburiy");
  if (!Number.isFinite(input.customerId) || input.customerId <= 0) {
    throw badRequest("customerId noto‘g‘ri");
  }

  return withTx(executor, Boolean(opts.alreadyInTx), async (tx) => {
    const found = await tx
      .select()
      .from(commercialTransactions)
      .where(
        and(
          eq(commercialTransactions.sourceType, input.sourceType),
          eq(commercialTransactions.sourceKey, sourceKey),
        ),
      )
      .limit(1);
    if (found[0]) return { commercial: found[0], created: false };

    try {
      const inserted = await tx
        .insert(commercialTransactions)
        .values({
          sourceType: input.sourceType,
          sourceKey,
          customerId: input.customerId,
          orderId: input.orderId ?? null,
          receiptId: input.receiptId ?? null,
          amount: Math.max(0, Math.floor(Number(input.amount) || 0)),
          meta: JSON.stringify(input.meta || {}),
        })
        .returning();
      return { commercial: inserted[0], created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const again = await tx
        .select()
        .from(commercialTransactions)
        .where(
          and(
            eq(commercialTransactions.sourceType, input.sourceType),
            eq(commercialTransactions.sourceKey, sourceKey),
          ),
        )
        .limit(1);
      if (again[0]) return { commercial: again[0], created: false };
      throw error;
    }
  });
}

async function lockAccount(tx: DbLike, accountId: number): Promise<CashbackAccount> {
  const locked = await tx.execute(sql`
    SELECT id, customer_id, balance, created_at, updated_at
    FROM cashback_accounts
    WHERE id = ${accountId}
    FOR UPDATE
  `);
  const row = rowsOf(locked)[0];
  if (!row) throw badRequest("Cashback hisob topilmadi", 404);
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id),
    balance: Number(row.balance),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

async function mirrorLegacyBalance(tx: DbLike, customerId: number, balance: number) {
  await tx
    .update(customers)
    .set({ balance })
    .where(eq(customers.id, customerId));
}

export type EarnCashbackInput = {
  customerId: number;
  amount: number;
  commercial: ResolveCommercialInput;
  actor?: string;
  reason?: string;
  idempotencyKey?: string | null;
  orderId?: number | null;
  /** Soft sync to loyalty_ledger for mobile history (non-authoritative). */
  legacyTitle?: string;
  legacyBranch?: string;
  legacyAmount?: number;
};

/**
 * ONE commercial transaction → MAXIMUM ONE EARN (DB unique enforces).
 */
export async function earnCashback(
  input: EarnCashbackInput,
  executor: DbLike = db,
  opts: { alreadyInTx?: boolean } = {},
): Promise<{
  account: CashbackAccount;
  entry: CashbackLedgerEntry;
  commercial: CommercialTransaction;
  idempotent: boolean;
}> {
  const amount = Math.floor(Number(input.amount) || 0);
  if (amount <= 0) throw badRequest("EARN miqdori musbat bo‘lishi kerak");

  return withTx(executor, Boolean(opts.alreadyInTx), async (tx) => {
    const account = await ensureCashbackAccount(input.customerId, tx, { alreadyInTx: true });
    const { commercial } = await resolveCommercialTransaction(
      {
        ...input.commercial,
        customerId: input.customerId,
        orderId: input.orderId ?? input.commercial.orderId,
        amount: input.commercial.amount ?? amount,
      },
      tx,
      { alreadyInTx: true },
    );

    const existing = await tx
      .select()
      .from(cashbackLedger)
      .where(
        and(
          eq(cashbackLedger.commercialTransactionId, commercial.id),
          eq(cashbackLedger.entryType, "EARN"),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const locked = await lockAccount(tx, account.id);
      return { account: locked, entry: existing[0], commercial, idempotent: true };
    }

    const locked = await lockAccount(tx, account.id);
    const nextBalance = locked.balance + amount;
    const idemKey = input.idempotencyKey?.trim() || `earn:commercial:${commercial.id}`;

    let entry: CashbackLedgerEntry;
    try {
      const inserted = await tx
        .insert(cashbackLedger)
        .values({
          accountId: locked.id,
          customerId: input.customerId,
          entryType: "EARN",
          amount,
          commercialTransactionId: commercial.id,
          orderId: input.orderId ?? commercial.orderId ?? null,
          actor: input.actor || "system",
          reason: input.reason || "earn",
          idempotencyKey: idemKey,
          meta: JSON.stringify({ sourceType: commercial.sourceType, sourceKey: commercial.sourceKey }),
        })
        .returning();
      entry = inserted[0];
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await tx
        .select()
        .from(cashbackLedger)
        .where(
          and(
            eq(cashbackLedger.commercialTransactionId, commercial.id),
            eq(cashbackLedger.entryType, "EARN"),
          ),
        )
        .limit(1);
      if (raced[0]) {
        emitAlert(ALERT.CASHBACK_DUPLICATE_EARN_ATTEMPT, {
          customerId: input.customerId,
          commercialTransactionId: commercial.id,
          ledgerEntryId: raced[0].id,
          operation: "EARN",
          source: "unique_race",
        });
        const again = await lockAccount(tx, account.id);
        return { account: again, entry: raced[0], commercial, idempotent: true };
      }
      emitAlert(ALERT.CASHBACK_OPERATION_FAILURE, {
        customerId: input.customerId,
        commercialTransactionId: commercial.id,
        operation: "EARN",
        reason: "unique_violation_without_row",
      });
      throw error;
    }

    const updated = await tx
      .update(cashbackAccounts)
      .set({ balance: nextBalance, updatedAt: new Date() })
      .where(eq(cashbackAccounts.id, locked.id))
      .returning();

    await mirrorLegacyBalance(tx, input.customerId, nextBalance);

    if (input.orderId) {
      try {
        await tx.insert(loyaltyLedger).values({
          customerId: input.customerId,
          orderId: input.orderId,
          externalId: String(commercial.sourceKey),
          date: new Date().toISOString().slice(0, 10),
          title: input.legacyTitle || "Buyurtma cashback",
          branch: input.legacyBranch || "Vaksina Med",
          amount: input.legacyAmount ?? amount,
          cashback: amount,
          kind: "earn",
        });
      } catch {
        // legacy display ledger best-effort; not SoT
      }
    }

    return { account: updated[0], entry, commercial, idempotent: false };
  });
}

export type UseCashbackInput = {
  customerId: number;
  amount: number;
  commercial: ResolveCommercialInput;
  actor?: string;
  reason?: string;
  idempotencyKey?: string | null;
  orderId?: number | null;
  /**
   * When set (orders/POS goods), server clamps amount to
   * min(balance, floor(eligibleGoods * maxSpendRatio)). Client amount is never authoritative.
   * Loyalty reward redemptions omit this (not goods-capped).
   */
  eligibleGoodsAmount?: number;
  maxSpendRatio?: number;
};

/** Concurrent-safe USE with optional 30% goods cap (P6.5). */
export async function useCashback(
  input: UseCashbackInput,
  executor: DbLike = db,
  opts: { alreadyInTx?: boolean } = {},
): Promise<{
  account: CashbackAccount;
  entry: CashbackLedgerEntry;
  commercial: CommercialTransaction;
  idempotent: boolean;
  clampedFrom?: number;
}> {
  const requested = Math.floor(Number(input.amount) || 0);
  if (requested <= 0) throw badRequest("USE miqdori musbat bo‘lishi kerak");

  return withTx(executor, Boolean(opts.alreadyInTx), async (tx) => {
    const account = await ensureCashbackAccount(input.customerId, tx, { alreadyInTx: true });
    const { commercial } = await resolveCommercialTransaction(
      {
        ...input.commercial,
        customerId: input.customerId,
        orderId: input.orderId ?? input.commercial.orderId,
        amount: input.commercial.amount ?? requested,
      },
      tx,
      { alreadyInTx: true },
    );

    const existing = await tx
      .select()
      .from(cashbackLedger)
      .where(
        and(
          eq(cashbackLedger.commercialTransactionId, commercial.id),
          eq(cashbackLedger.entryType, "USE"),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const locked = await lockAccount(tx, account.id);
      return { account: locked, entry: existing[0], commercial, idempotent: true };
    }

    const locked = await lockAccount(tx, account.id);
    let amount = requested;
    let clampedFrom: number | undefined;
    if (input.eligibleGoodsAmount != null) {
      const ratio = input.maxSpendRatio ?? (await getMaxSpendRatio(tx));
      const clamped = clampCashbackSpend({
        goodsAmount: input.eligibleGoodsAmount,
        balance: locked.balance,
        requested,
        maxSpendRatio: ratio,
      });
      amount = clamped.cashbackUsed;
      if (amount !== requested) clampedFrom = requested;
      if (amount <= 0) {
        throw badRequest("Cashback ishlatish limiti 0", 400, "SPEND_CAP_ZERO");
      }
    }

    if (locked.balance < amount) {
      emitAlert(ALERT.CASHBACK_NEGATIVE_BALANCE_ATTEMPT, {
        customerId: input.customerId,
        commercialTransactionId: commercial.id,
        operation: "USE",
        requested: amount,
        balance: locked.balance,
      });
      throw badRequest("Cashback balansi yetarli emas", 400, "INSUFFICIENT_CASHBACK");
    }
    const nextBalance = locked.balance - amount;
    const idemKey = input.idempotencyKey?.trim() || `use:commercial:${commercial.id}`;

    let entry: CashbackLedgerEntry;
    try {
      const inserted = await tx
        .insert(cashbackLedger)
        .values({
          accountId: locked.id,
          customerId: input.customerId,
          entryType: "USE",
          amount,
          commercialTransactionId: commercial.id,
          orderId: input.orderId ?? commercial.orderId ?? null,
          actor: input.actor || "system",
          reason: input.reason || "use",
          idempotencyKey: idemKey,
          meta: JSON.stringify({
            requested,
            eligibleGoodsAmount: input.eligibleGoodsAmount ?? null,
            clamped: clampedFrom != null,
          }),
        })
        .returning();
      entry = inserted[0];
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await tx
        .select()
        .from(cashbackLedger)
        .where(
          and(
            eq(cashbackLedger.commercialTransactionId, commercial.id),
            eq(cashbackLedger.entryType, "USE"),
          ),
        )
        .limit(1);
      if (raced[0]) {
        emitAlert(ALERT.CASHBACK_OPERATION_FAILURE, {
          customerId: input.customerId,
          commercialTransactionId: commercial.id,
          ledgerEntryId: raced[0].id,
          operation: "USE",
          source: "unique_race",
        });
        const again = await lockAccount(tx, account.id);
        return { account: again, entry: raced[0], commercial, idempotent: true };
      }
      emitAlert(ALERT.CASHBACK_OPERATION_FAILURE, {
        customerId: input.customerId,
        commercialTransactionId: commercial.id,
        operation: "USE",
        reason: "unique_violation_without_row",
      });
      throw error;
    }

    const updated = await tx
      .update(cashbackAccounts)
      .set({ balance: nextBalance, updatedAt: new Date() })
      .where(eq(cashbackAccounts.id, locked.id))
      .returning();
    await mirrorLegacyBalance(tx, input.customerId, nextBalance);
    return { account: updated[0], entry, commercial, idempotent: false, clampedFrom };
  });
}

/**
 * Reverse a ledger entry (EARN or USE) via REVERSAL — never deletes history.
 * Optional `amount` supports partial REVERSAL ≤ original (Q5 formula OPEN — caller must supply amount).
 * At most one REVERSAL per original entry (DB unique).
 */
export async function reverseCashbackEntry(
  entryId: number,
  opts: { actor?: string; reason?: string; alreadyInTx?: boolean; amount?: number } = {},
  executor: DbLike = db,
): Promise<{ account: CashbackAccount; entry: CashbackLedgerEntry; idempotent: boolean }> {
  return withTx(executor, Boolean(opts.alreadyInTx), async (tx) => {
    const rows = await tx.select().from(cashbackLedger).where(eq(cashbackLedger.id, entryId)).limit(1);
    const original = rows[0];
    if (!original) throw badRequest("Ledger yozuvi topilmadi", 404);
    if (original.entryType === "REVERSAL") {
      throw badRequest("REVERSAL yozuvini qayta reverse qilib bo‘lmaydi", 409);
    }

    const existing = await tx
      .select()
      .from(cashbackLedger)
      .where(
        and(eq(cashbackLedger.reversesEntryId, entryId), eq(cashbackLedger.entryType, "REVERSAL")),
      )
      .limit(1);
    if (existing[0]) {
      emitAlert(ALERT.CASHBACK_DUPLICATE_REVERSAL_ATTEMPT, {
        customerId: original.customerId,
        commercialTransactionId: original.commercialTransactionId,
        ledgerEntryId: existing[0].id,
        reversesEntryId: entryId,
        operation: "REVERSAL",
        source: "idempotent_existing",
      });
      const account = await lockAccount(tx, original.accountId);
      return { account, entry: existing[0], idempotent: true };
    }

    let reverseAmount = original.amount;
    if (opts.amount != null) {
      const requested = Math.floor(Number(opts.amount) || 0);
      if (requested <= 0) throw badRequest("REVERSAL miqdori musbat bo‘lishi kerak");
      if (requested > original.amount) {
        throw badRequest("REVERSAL original miqdordan oshmasligi kerak", 400, "REVERSAL_EXCEEDS_ORIGINAL");
      }
      reverseAmount = requested;
    }

    const locked = await lockAccount(tx, original.accountId);
    let nextBalance = locked.balance;
    if (original.entryType === "EARN" || original.entryType === "ADJUSTMENT") {
      if (locked.balance < reverseAmount) {
        // Q5 OPEN: debt / block / clawback — refuse unsafe negative rather than invent policy
        emitAlert(ALERT.CASHBACK_NEGATIVE_BALANCE_ATTEMPT, {
          customerId: original.customerId,
          commercialTransactionId: original.commercialTransactionId,
          ledgerEntryId: original.id,
          operation: "REVERSAL",
          requested: reverseAmount,
          balance: locked.balance,
        });
        throw badRequest("Reverse uchun balans yetarli emas", 409, "INSUFFICIENT_FOR_REVERSAL");
      }
      nextBalance = locked.balance - reverseAmount;
    } else if (original.entryType === "USE") {
      nextBalance = locked.balance + reverseAmount;
    }

    let entry: CashbackLedgerEntry;
    try {
      const inserted = await tx
        .insert(cashbackLedger)
        .values({
          accountId: locked.id,
          customerId: original.customerId,
          entryType: "REVERSAL",
          amount: reverseAmount,
          commercialTransactionId: original.commercialTransactionId,
          orderId: original.orderId,
          reversesEntryId: original.id,
          actor: opts.actor || "system",
          reason: opts.reason || "reversal",
          idempotencyKey: `reversal:entry:${original.id}`,
          meta: JSON.stringify({
            reverses: original.entryType,
            originalAmount: original.amount,
            partial: reverseAmount < original.amount,
          }),
        })
        .returning();
      entry = inserted[0];
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await tx
        .select()
        .from(cashbackLedger)
        .where(
          and(eq(cashbackLedger.reversesEntryId, entryId), eq(cashbackLedger.entryType, "REVERSAL")),
        )
        .limit(1);
      if (raced[0]) {
        emitAlert(ALERT.CASHBACK_DUPLICATE_REVERSAL_ATTEMPT, {
          customerId: original.customerId,
          commercialTransactionId: original.commercialTransactionId,
          ledgerEntryId: raced[0].id,
          reversesEntryId: entryId,
          operation: "REVERSAL",
          source: "unique_race",
        });
        const again = await lockAccount(tx, original.accountId);
        return { account: again, entry: raced[0], idempotent: true };
      }
      emitAlert(ALERT.CASHBACK_OPERATION_FAILURE, {
        customerId: original.customerId,
        commercialTransactionId: original.commercialTransactionId,
        reversesEntryId: entryId,
        operation: "REVERSAL",
        reason: "unique_violation_without_row",
      });
      throw error;
    }

    const updated = await tx
      .update(cashbackAccounts)
      .set({ balance: nextBalance, updatedAt: new Date() })
      .where(eq(cashbackAccounts.id, locked.id))
      .returning();
    await mirrorLegacyBalance(tx, original.customerId, nextBalance);
    return { account: updated[0], entry, idempotent: false };
  });
}

/** P6.2 — inspection report (no automatic deletes). */
export async function inspectCashbackIntegrity(executor: DbLike = db): Promise<{
  duplicateEarnCommercialIds: number[];
  duplicateUseCommercialIds: number[];
  accountLedgerMismatches: Array<{ customerId: number; accountBalance: number; ledgerNet: number }>;
  legacyBalanceDivergences: Array<{ customerId: number; legacyBalance: number; accountBalance: number }>;
}> {
  const dupEarn = await executor.execute(sql`
    SELECT commercial_transaction_id AS id, COUNT(*)::int AS c
    FROM cashback_ledger
    WHERE entry_type = 'EARN' AND commercial_transaction_id IS NOT NULL
    GROUP BY commercial_transaction_id
    HAVING COUNT(*) > 1
  `);
  const dupUse = await executor.execute(sql`
    SELECT commercial_transaction_id AS id, COUNT(*)::int AS c
    FROM cashback_ledger
    WHERE entry_type = 'USE' AND commercial_transaction_id IS NOT NULL
    GROUP BY commercial_transaction_id
    HAVING COUNT(*) > 1
  `);

  const accounts = await executor.select().from(cashbackAccounts);
  const accountLedgerMismatches: Array<{ customerId: number; accountBalance: number; ledgerNet: number }> = [];
  for (const account of accounts) {
    const net = await executor.execute(sql`
      SELECT COALESCE(SUM(
        CASE
          WHEN entry_type IN ('EARN', 'ADJUSTMENT') THEN amount
          WHEN entry_type = 'USE' THEN -amount
          WHEN entry_type = 'REVERSAL' THEN
            CASE
              WHEN EXISTS (
                SELECT 1 FROM cashback_ledger o
                WHERE o.id = cashback_ledger.reverses_entry_id
                  AND o.entry_type IN ('EARN', 'ADJUSTMENT')
              ) THEN -amount
              ELSE amount
            END
          ELSE 0
        END
      ), 0)::int AS net
      FROM cashback_ledger
      WHERE account_id = ${account.id}
    `);
    const ledgerNet = Number(rowsOf(net)[0]?.net ?? 0);
    if (ledgerNet !== account.balance) {
      accountLedgerMismatches.push({
        customerId: account.customerId,
        accountBalance: account.balance,
        ledgerNet,
      });
    }
  }

  const legacyBalanceDivergences: Array<{ customerId: number; legacyBalance: number; accountBalance: number }> = [];
  const custs = await executor.select().from(customers);
  for (const c of custs) {
    const acc = accounts.find((a) => a.customerId === c.id);
    const accountBalance = acc?.balance ?? 0;
    if (c.balance !== accountBalance) {
      legacyBalanceDivergences.push({
        customerId: c.id,
        legacyBalance: c.balance,
        accountBalance,
      });
    }
  }

  return {
    duplicateEarnCommercialIds: rowsOf(dupEarn).map((r) => Number(r.id)).filter(Boolean),
    duplicateUseCommercialIds: rowsOf(dupUse).map((r) => Number(r.id)).filter(Boolean),
    accountLedgerMismatches,
    legacyBalanceDivergences,
  };
}

/**
 * Reconcile a detected duplicate EARN by REVERSAL of extras (keeps earliest).
 * Never deletes ledger rows.
 */
export async function reconcileDuplicateEarn(
  commercialTransactionId: number,
  opts: { actor?: string } = {},
  executor: DbLike = db,
): Promise<{ reversedEntryIds: number[] }> {
  return withTx(executor, false, async (tx) => {
    const earns = await tx
      .select()
      .from(cashbackLedger)
      .where(
        and(
          eq(cashbackLedger.commercialTransactionId, commercialTransactionId),
          eq(cashbackLedger.entryType, "EARN"),
        ),
      );
    const sorted = [...earns].sort((a, b) => a.id - b.id);
    const reversedEntryIds: number[] = [];
    for (const extra of sorted.slice(1)) {
      const result = await reverseCashbackEntry(
        extra.id,
        { actor: opts.actor || "reconcile", reason: "DUPLICATE_RECONCILE", alreadyInTx: true },
        tx,
      );
      if (!result.idempotent) reversedEntryIds.push(extra.id);
    }
    return { reversedEntryIds };
  });
}

/** P6.8 — authoritative balance (cashback_accounts); falls back to ensuring account. */
export async function getAuthoritativeBalance(
  customerId: number,
  executor: DbLike = db,
): Promise<number> {
  const account = await ensureCashbackAccount(customerId, executor);
  return account.balance;
}

async function findOrderLedgerEntries(
  orderId: number,
  executor: DbLike,
): Promise<{ use?: CashbackLedgerEntry; earn?: CashbackLedgerEntry }> {
  const rows = await executor
    .select()
    .from(cashbackLedger)
    .where(eq(cashbackLedger.orderId, orderId));
  return {
    use: rows.find((r) => r.entryType === "USE"),
    earn: rows.find((r) => r.entryType === "EARN"),
  };
}

/**
 * P6.6 — cancel before/without earn: reverse USE only (EARN should not exist).
 * Idempotent; never deletes history.
 */
export async function reverseOrderUseOnCancel(
  orderId: number,
  opts: { actor?: string; reason?: string } = {},
  executor: DbLike = db,
): Promise<{ reversed: boolean; idempotent: boolean; entry?: CashbackLedgerEntry }> {
  const { use } = await findOrderLedgerEntries(orderId, executor);
  if (!use) return { reversed: false, idempotent: true };
  const result = await reverseCashbackEntry(
    use.id,
    { actor: opts.actor || "system", reason: opts.reason || "order_cancel" },
    executor,
  );
  return { reversed: !result.idempotent, idempotent: result.idempotent, entry: result.entry };
}

/**
 * P6.6 — refund cashback safety.
 *
 * Full refund: REVERSAL of EARN (if present). USE already spent is Q5 OPEN — not auto-clawed.
 * Partial: requires explicit earnReversalAmount (formula OPEN — do not invent).
 * Duplicate refund/reversal retries are idempotent via reverses_entry_id UNIQUE.
 */
export async function refundOrderCashback(input: {
  orderId: number;
  mode: "full" | "partial";
  /** Required for partial; ignored for full (uses full EARN amount). */
  earnReversalAmount?: number;
  actor?: string;
  reason?: string;
}, executor: DbLike = db): Promise<{
  earnReversal?: CashbackLedgerEntry;
  idempotent: boolean;
  openPolicy?: string;
}> {
  const { earn } = await findOrderLedgerEntries(input.orderId, executor);
  if (!earn) {
    return { idempotent: true, openPolicy: "NO_EARN_TO_REVERSE" };
  }

  if (input.mode === "partial") {
    if (input.earnReversalAmount == null) {
      throw badRequest(
        "Partial refund cashback formula is OPEN (Q5) — provide earnReversalAmount explicitly",
        400,
        "PARTIAL_REFUND_AMOUNT_REQUIRED",
      );
    }
    const result = await reverseCashbackEntry(
      earn.id,
      {
        actor: input.actor || "system",
        reason: input.reason || "partial_refund",
        amount: input.earnReversalAmount,
      },
      executor,
    );
    return {
      earnReversal: result.entry,
      idempotent: result.idempotent,
      openPolicy: "PARTIAL_FORMULA_CALLER_SUPPLIED",
    };
  }

  const result = await reverseCashbackEntry(
    earn.id,
    { actor: input.actor || "system", reason: input.reason || "full_refund" },
    executor,
  );
  return {
    earnReversal: result.entry,
    idempotent: result.idempotent,
    openPolicy: "USED_CASHBACK_ON_REFUND_POLICY_OPEN",
  };
}
