/**
 * Ops helper — merchant secret plaintext → enc:v1 migration (dry-run by default).
 *
 * Usage (staging only, after MERCHANT_SECRET_KEK is injected):
 *   pnpm --filter @workspace/api-server exec tsx src/scripts/migrate-merchant-secrets.ts
 *   MIGRATE_MERCHANT_SECRETS_APPLY=1 ...  # actually write
 *
 * Never prints secret values. Does not invent KMS. No production run from this workspace.
 */

import { eq } from "drizzle-orm";
import { db, branches } from "@workspace/db";
import {
  isEncryptedSecretBlob,
  migrateMerchantSecretValue,
  assertProductionMerchantSecretCryptoReady,
} from "../lib/merchantSecretCrypto";

async function main() {
  const apply = ["1", "true", "yes"].includes(
    String(process.env.MIGRATE_MERCHANT_SECRETS_APPLY || "").toLowerCase(),
  );

  assertProductionMerchantSecretCryptoReady();

  const rows = await db.select({
    id: branches.id,
    code: branches.code,
    paymeKey: branches.paymeKey,
    clickSecret: branches.clickSecret,
  }).from(branches);

  let paymeChanged = 0;
  let clickChanged = 0;
  let alreadyEnc = 0;

  for (const row of rows) {
    const p = migrateMerchantSecretValue(row.paymeKey);
    const c = migrateMerchantSecretValue(row.clickSecret);
    if (p.wasEncrypted) alreadyEnc += 1;
    if (c.wasEncrypted) alreadyEnc += 1;
    if (p.changed) paymeChanged += 1;
    if (c.changed) clickChanged += 1;

    if (apply && (p.changed || c.changed)) {
      await db
        .update(branches)
        .set({
          paymeKey: p.next,
          clickSecret: c.next,
        })
        .where(eq(branches.id, row.id));
    }

    // Safe progress line — never secret material
    console.log(
      JSON.stringify({
        branchId: row.id,
        code: row.code,
        payme: {
          encrypted: isEncryptedSecretBlob(apply ? p.next : row.paymeKey),
          wouldChange: p.changed,
        },
        click: {
          encrypted: isEncryptedSecretBlob(apply ? c.next : row.clickSecret),
          wouldChange: c.changed,
        },
        mode: apply ? "APPLY" : "DRY_RUN",
      }),
    );
  }

  console.log(
    JSON.stringify({
      summary: true,
      branches: rows.length,
      paymeWouldChange: paymeChanged,
      clickWouldChange: clickChanged,
      alreadyEncryptedFieldCount: alreadyEnc,
      applied: apply,
    }),
  );
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
