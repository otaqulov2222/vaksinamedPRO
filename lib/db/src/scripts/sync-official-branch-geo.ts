/**
 * Align identity + location fields with official vaksinamed.uz catalog by branch code.
 * Inserts missing codes; updates name/region/city/district/address/phone/hours/lat/lng/isOpen/is24h.
 * NEVER deletes rows. NEVER touches payment merchant columns.
 *
 * Usage:
 *   DATABASE_URL=... pnpm --filter @workspace/db run sync:official-branch-geo
 */
import { eq } from "drizzle-orm";
import { branches, db, pool } from "../index";
import { buildOfficialBranches } from "../stagingCatalogSeed";

async function main() {
  const official = buildOfficialBranches();
  const byCode = new Map(official.map((b) => [b.code, b]));
  const existing = await db.select().from(branches);
  const existingCodes = new Set(existing.map((r) => r.code));

  const toInsert = official.filter((b) => !existingCodes.has(b.code));
  let inserted = 0;
  const CHUNK = 50;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    await db.insert(branches).values(chunk);
    inserted += chunk.length;
  }

  let updated = 0;
  let matched = 0;
  const samples: Array<{ code: string; fields: string[] }> = [];

  for (const row of existing) {
    const src = byCode.get(row.code);
    if (!src) continue;
    matched += 1;
    const patch: Record<string, unknown> = {};
    const fields: string[] = [];
    const maybe = <K extends keyof typeof src>(key: K, current: unknown) => {
      const next = src[key];
      if (key === "lat" || key === "lng") {
        if (Number(current) !== Number(next)) {
          patch[key as string] = next;
          fields.push(String(key));
        }
        return;
      }
      if (key === "is24h" || key === "isOpen") {
        if (Boolean(current) !== Boolean(next)) {
          patch[key as string] = Boolean(next);
          fields.push(String(key));
        }
        return;
      }
      if (String(current ?? "") !== String(next ?? "")) {
        patch[key as string] = next;
        fields.push(String(key));
      }
    };
    maybe("name", row.name);
    maybe("region", row.region);
    maybe("city", row.city);
    maybe("district", row.district);
    maybe("address", row.address);
    maybe("phone", row.phone);
    maybe("hours", row.hours);
    maybe("lat", row.lat);
    maybe("lng", row.lng);
    maybe("isOpen", row.isOpen);
    maybe("is24h", row.is24h);
    if (!fields.length) continue;
    await db.update(branches).set(patch).where(eq(branches.id, row.id));
    updated += 1;
    if (samples.length < 15) samples.push({ code: row.code, fields });
  }

  const after = await db.select({ code: branches.code, is24h: branches.is24h, isOpen: branches.isOpen }).from(branches);
  console.log(
    JSON.stringify({
      official: official.length,
      existingBefore: existing.length,
      matched,
      inserted,
      updated,
      totalAfter: after.length,
      is24hCount: after.filter((r) => r.is24h).length,
      openCount: after.filter((r) => r.isOpen).length,
      samples,
      insertedSample: toInsert.slice(0, 8).map((b) => ({ code: b.code, name: b.name, city: b.city })),
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
