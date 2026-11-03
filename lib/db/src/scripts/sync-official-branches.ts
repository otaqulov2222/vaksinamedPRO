/**
 * Idempotent: inserts official network branches that are missing by code.
 * Never updates or deletes existing rows (live hours / staff bindings stay intact).
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @workspace/db run sync:official-branches
 */
import { branches, db, pool } from "../index";
import { buildOfficialBranches } from "../stagingCatalogSeed";

async function main() {
  const candidates = buildOfficialBranches();
  const existing = await db.select({ code: branches.code }).from(branches);
  const existingCodes = new Set(existing.map((r) => r.code));
  const toInsert = candidates.filter((b) => !existingCodes.has(b.code));

  console.log(
    JSON.stringify({
      official: candidates.length,
      existing: existing.length,
      missing: toInsert.length,
    }),
  );

  if (!toInsert.length) {
    console.log("SYNC_OFFICIAL_BRANCHES_OK nothing_to_insert");
    return;
  }

  const CHUNK = 50;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    await db.insert(branches).values(chunk);
    inserted += chunk.length;
  }

  console.log(
    JSON.stringify({
      inserted,
      sample: toInsert.slice(0, 8).map((b) => ({ code: b.code, name: b.name, city: b.city })),
    }),
  );
  console.log("SYNC_OFFICIAL_BRANCHES_OK");
}

main()
  .catch((err) => {
    console.error("SYNC_OFFICIAL_BRANCHES_FAIL", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end?.().catch(() => undefined);
  });
