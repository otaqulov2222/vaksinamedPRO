/**
 * Align identity + location fields with official vaksinamed.uz catalog by branch code.
 * Inserts missing codes; updates name/region/city/district/address/phone/hours/lat/lng/isOpen/is24h.
 * NEVER deletes rows. NEVER touches payment merchant columns.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @workspace/db run sync:official-branch-geo
 *   # or local PGlite:
 *   PGLITE_DIR=... pnpm --filter @workspace/db run sync:official-branch-geo
 */
import { db, pool } from "../index";
import { syncOfficialBranchGeo } from "../syncOfficialBranchGeo";
import { branches } from "../schema";

async function main() {
  const result = await syncOfficialBranchGeo(db);
  const after = await db.select({ code: branches.code, is24h: branches.is24h, isOpen: branches.isOpen }).from(branches);
  console.log(
    JSON.stringify({
      ...result,
      totalAfter: after.length,
      is24hCount: after.filter((r) => r.is24h).length,
      openCount: after.filter((r) => r.isOpen).length,
    }),
  );
  console.log("SYNC_OFFICIAL_BRANCH_GEO_OK");
}

main()
  .catch((err) => {
    console.error("SYNC_OFFICIAL_BRANCH_GEO_FAIL", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end?.().catch(() => undefined);
  });
