/**
 * Read-only cashback integrity check (ops hardening).
 *
 * NEVER updates cashback_accounts, NEVER deletes/rewrites ledger.
 * Uses inspectCashbackIntegrity SoT math; emits alert codes for SIEM scrapers.
 *
 * Schedule: enqueue JOB_TYPES.CASHBACK_INTEGRITY via workers, or run:
 *   pnpm --filter @workspace/api-server exec tsx src/scripts/cashback-integrity-check.ts
 */

import { cashbackAccounts, db } from "@workspace/db";
import { emitAlert, ALERT } from "./alerts";
import { inspectCashbackIntegrity } from "./cashbackFinance";

type DbLike = typeof db;

export type CashbackIntegrityReport = {
  at: string;
  status: "MATCH" | "DRIFT" | "INVALID";
  accountsChecked: number;
  matchCount: number;
  driftCount: number;
  invalidSignals: {
    duplicateEarnCommercialIds: number[];
    duplicateUseCommercialIds: number[];
  };
  drifts: Array<{
    customerId: number;
    accountBalance: number;
    ledgerNet: number;
    status: "DRIFT";
  }>;
  legacyMirrorDivergences: number;
  /** Always false — this checker never mutates. */
  autoRepaired: false;
};

/**
 * Read-only integrity pass. Safe to run repeatedly.
 * Emits CASHBACK_LEDGER_DRIFT / duplicate alerts when findings exist.
 */
export async function runCashbackIntegrityCheck(
  executor: DbLike = db,
  opts: { emitAlerts?: boolean } = {},
): Promise<CashbackIntegrityReport> {
  const emit = opts.emitAlerts !== false;
  const raw = await inspectCashbackIntegrity(executor);

  const drifts = raw.accountLedgerMismatches.map((m) => ({
    customerId: m.customerId,
    accountBalance: m.accountBalance,
    ledgerNet: m.ledgerNet,
    status: "DRIFT" as const,
  }));

  const allAccounts = await executor.select().from(cashbackAccounts);
  const driftIds = new Set(drifts.map((d) => d.customerId));
  const matchCount = allAccounts.filter((a: { customerId: number }) => !driftIds.has(a.customerId)).length;

  const hasDup =
    raw.duplicateEarnCommercialIds.length > 0 || raw.duplicateUseCommercialIds.length > 0;
  const hasDrift = drifts.length > 0;

  let status: CashbackIntegrityReport["status"] = "MATCH";
  if (hasDup) status = "INVALID";
  else if (hasDrift) status = "DRIFT";

  if (emit) {
    if (hasDrift) {
      emitAlert(ALERT.CASHBACK_LEDGER_DRIFT, {
        driftCount: drifts.length,
        sampleCustomerIds: drifts.slice(0, 10).map((d) => d.customerId),
        sample: drifts.slice(0, 5),
      });
    }
    if (raw.duplicateEarnCommercialIds.length > 0) {
      emitAlert(ALERT.CASHBACK_DUPLICATE_EARN_ATTEMPT, {
        commercialTransactionIds: raw.duplicateEarnCommercialIds.slice(0, 20),
        source: "integrity_scan",
      });
    }
    if (raw.duplicateUseCommercialIds.length > 0) {
      emitAlert(ALERT.CASHBACK_OPERATION_FAILURE, {
        reason: "duplicate_use_commercial",
        commercialTransactionIds: raw.duplicateUseCommercialIds.slice(0, 20),
        source: "integrity_scan",
      });
    }
  }

  return {
    at: new Date().toISOString(),
    status,
    accountsChecked: allAccounts.length,
    matchCount,
    driftCount: drifts.length,
    invalidSignals: {
      duplicateEarnCommercialIds: raw.duplicateEarnCommercialIds,
      duplicateUseCommercialIds: raw.duplicateUseCommercialIds,
    },
    drifts,
    legacyMirrorDivergences: raw.legacyBalanceDivergences.length,
    autoRepaired: false,
  };
}
