/**
 * Ops: read-only cashback ledger ↔ account integrity check.
 *
 * NEVER mutates balances or ledger. Safe to cron.
 *
 * Schedule examples:
 *   - Cron / ops runner: enqueue JOB_TYPES.CASHBACK_INTEGRITY then POST /workers/run-due
 *   - Direct: pnpm --filter @workspace/api-server exec tsx src/scripts/cashback-integrity-check.ts
 *
 * Exit 0 = MATCH; exit 2 = DRIFT/INVALID (alert already emitted when emitAlerts default).
 */

import { runCashbackIntegrityCheck } from "../lib/cashbackIntegrity";

async function main() {
  const report = await runCashbackIntegrityCheck();
  // Structured stdout for ops scrapers (no secrets).
  console.log(JSON.stringify(report));
  if (report.status !== "MATCH") {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
