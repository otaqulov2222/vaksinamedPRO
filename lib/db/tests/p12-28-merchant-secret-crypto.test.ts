/**
 * Phase 12.28 — encrypted merchant secrets persisted in PGlite (synthetic only).
 * Does not import branchPaymentMerchant (avoids @workspace/db auto-init + dual PGlite abort).
 * Resolver WeakMap path covered by p7-6-2 + api-server phase12-28 source tests.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

const SYN_PAYME = "TEST_PAYME_SECRET_ONLY";
const SYN_CLICK = "TEST_CLICK_SECRET_ONLY";

describe("P12.28 merchant secret ciphertext at rest (PGlite)", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let crypto: typeof import("../../../artifacts/api-server/src/lib/merchantSecretCrypto");
  let branchId: number;
  const prevKek = process.env.MERCHANT_SECRET_KEK;

  before(async () => {
    process.env.MERCHANT_SECRET_KEK = randomBytes(32).toString("base64");
    delete process.env.APP_ENV;
    delete process.env.NODE_ENV;

    crypto = await import("../../../artifacts/api-server/src/lib/merchantSecretCrypto.ts");

    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());

    const [row] = await database
      .insert(schema.branches)
      .values({
        code: "P1228-ENC",
        name: "Enc Branch",
        city: "T",
        region: "T",
        district: "T",
        address: "A",
        phone: "+99800",
        hours: "9-18",
        lat: 1,
        lng: 1,
        paymeMerchantId: "payme-m",
        paymeKey: crypto.encryptMerchantSecretForStorage(SYN_PAYME),
        clickMerchantId: "click-m",
        clickServiceId: "100",
        clickSecret: crypto.encryptMerchantSecretForStorage(SYN_CLICK),
      })
      .returning();
    branchId = row.id;
  });

  after(async () => {
    if (prevKek === undefined) delete process.env.MERCHANT_SECRET_KEK;
    else process.env.MERCHANT_SECRET_KEK = prevKek;
    await client.close();
  });

  it("columns hold enc:v1 ciphertext; decrypt recovers synthetic plaintext", async () => {
    const dbRow = (await database.select().from(schema.branches).where(eq(schema.branches.id, branchId)))[0];
    assert.ok(crypto.isEncryptedSecretBlob(dbRow.paymeKey));
    assert.ok(crypto.isEncryptedSecretBlob(dbRow.clickSecret));
    assert.doesNotMatch(dbRow.paymeKey, new RegExp(SYN_PAYME));
    assert.doesNotMatch(dbRow.clickSecret, new RegExp(SYN_CLICK));
    assert.ok(crypto.secretsMatch(crypto.decryptMerchantSecretFromStorage(dbRow.paymeKey), SYN_PAYME));
    assert.ok(crypto.secretsMatch(crypto.decryptMerchantSecretFromStorage(dbRow.clickSecret), SYN_CLICK));
  });

  it("migrateMerchantSecretValue upgrades legacy plaintext row field", async () => {
    const mig = crypto.migrateMerchantSecretValue(SYN_PAYME);
    assert.equal(mig.wasEncrypted, false);
    await database.update(schema.branches).set({ paymeKey: mig.next }).where(eq(schema.branches.id, branchId));
    const dbRow = (await database.select().from(schema.branches).where(eq(schema.branches.id, branchId)))[0];
    assert.ok(crypto.isEncryptedSecretBlob(dbRow.paymeKey));
    assert.ok(crypto.secretsMatch(crypto.decryptMerchantSecretFromStorage(dbRow.paymeKey), SYN_PAYME));
  });
});
