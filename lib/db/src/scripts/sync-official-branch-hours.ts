/**
 * Align hours + is24h with official vaksinamed.uz catalog by branch code.
 * Does not insert/delete rows and does not touch coordinates, phones, or names.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @workspace/db run sync:official-branch-hours
 */
import { eq } from "drizzle-orm";
import { branches, db, pool } from "../index";
import { buildOfficialBranches } from "../stagingCatalogSeed";

async function main() {
  const official = buildOfficialBranches();
  const byCode = new Map(official.map((b) => [b.code, b]));
  const existing = await db
    .select({
      id: branches.id,
      code: branches.code,
      hours: branches.hours,
      is24h: branches.is24h,
    })
    .from(branches);

  let updated = 0;
  let matched = 0;
  const samples: Array<{ code: string; hours: string; is24h: boolean }> = [];

  for (const row of existing) {
    const src = byCode.get(row.code);
    if (!src) continue;
    matched += 1;
    if (row.hours === src.hours && Boolean(row.is24h) === Boolean(src.is24h)) continue;
    await db
      .update(branches)
      .set({ hours: src.hours, is24h: Boolean(src.is24h) })
      .where(eq(branches.id, row.id));
    updated += 1;
    if (samples.length < 12) {
      samples.push({ code: row.code, hours: src.hours, is24h: Boolean(src.is24h) });
    }
  }

  const after = await db.select({ is24h: branches.is24h }).from(branches);
  const is24hCount = after.filter((r) => r.is24h).length;

  console.log(
    JSON.stringify({
      official: official.length,
      matched,
      updated,
      is24hCount,
      samples,
    }),
  );
  console.log("SYNC_OFFICIAL_BRANCH_HOURS_OK");
}

main()
  .catch((err) => {
    console.error("SYNC_OFFICIAL_BRANCH_HOURS_FAIL", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end?.().catch(() => undefined);
  });
