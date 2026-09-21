/**
 * P7.6.2 — branch merchant resolver + secret access (no PSP protocol).
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../artifacts/api-server");

type Merchant = typeof import("../../../artifacts/api-server/src/lib/branchPaymentMerchant");

describe("P7.6.2 branch payment merchant resolver", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let merchant: Merchant;
  let branchA: number;
  let branchB: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    merchant = await import("../../../artifacts/api-server/src/lib/branchPaymentMerchant.ts");

    const [a] = await database.insert(schema.branches).values({
      code: "P762-A", name: "Branch A", city: "T", region: "T", district: "T",
      address: "A1", phone: "+99811", hours: "9-18", lat: 1, lng: 1,
      paymeMerchantId: "payme-a-merchant",
      paymeKey: "PAYME_SECRET_A_DO_NOT_LOG",
      clickMerchantId: "click-a-merchant",
      clickServiceId: "click-a-service",
      clickSecret: "CLICK_SECRET_A_DO_NOT_LOG",
    }).returning();
    const [b] = await database.insert(schema.branches).values({
      code: "P762-B", name: "Branch B", city: "T", region: "T", district: "T",
      address: "B1", phone: "+99822", hours: "9-18", lat: 2, lng: 2,
      paymeMerchantId: "payme-b-merchant",
      paymeKey: "PAYME_SECRET_B_DO_NOT_LOG",
      clickMerchantId: "",
      clickServiceId: "",
      clickSecret: "",
    }).returning();
    branchA = a.id;
    branchB = b.id;
  });

  after(async () => {
    await client.close();
  });

  it("A. Payme branch isolation — A gets A config only", async () => {
    const cfg = await merchant.resolvePaymentMerchantConfig(
      { branchId: branchA, provider: "payme", expectedBranchId: branchA },
      database as any,
    );
    assert.equal(cfg.branchId, branchA);
    assert.equal(cfg.provider, "payme");
    assert.equal(cfg.configured, true);
    assert.equal(cfg.merchantId, "payme-a-merchant");
    const pub = merchant.toPublicMerchantSummary(cfg);
    assert.equal(pub.merchantId, "payme-a-merchant");
    assert.equal("paymeKey" in pub, false);
    const secrets = merchant.getPaymentMerchantSecretMaterial(cfg);
    assert.equal(secrets.paymeKey, "PAYME_SECRET_A_DO_NOT_LOG");
  });

  it("A2. expectedBranchId mismatch rejects cross-branch", async () => {
    await assert.rejects(
      () => merchant.resolvePaymentMerchantConfig(
        { branchId: branchA, provider: "payme", expectedBranchId: branchB },
        database as any,
      ),
      (err: any) => err?.code === "BRANCH_MERCHANT_MISMATCH",
    );
  });

  it("A3. Branch A cannot silently receive Branch B merchant id", async () => {
    const cfgA = await merchant.resolvePaymentMerchantConfig(
      { branchId: branchA, provider: "payme" },
      database as any,
    );
    const cfgB = await merchant.resolvePaymentMerchantConfig(
      { branchId: branchB, provider: "payme" },
      database as any,
    );
    assert.notEqual(cfgA.merchantId, cfgB.merchantId);
    assert.equal(cfgA.branchId, branchA);
    assert.equal(cfgB.branchId, branchB);
  });

  it("B. Click branch isolation", async () => {
    const cfg = await merchant.resolvePaymentMerchantConfig(
      { branchId: branchA, provider: "click", expectedBranchId: branchA },
      database as any,
    );
    assert.equal(cfg.provider, "click");
    assert.equal(cfg.configured, true);
    assert.equal(cfg.merchantId, "click-a-merchant");
    assert.equal(cfg.serviceId, "click-a-service");
    const secrets = merchant.getPaymentMerchantSecretMaterial(cfg);
    assert.equal(secrets.clickSecret, "CLICK_SECRET_A_DO_NOT_LOG");
    assert.equal(secrets.paymeKey, "");
  });

  it("C. Missing Payme configuration is deterministic", async () => {
    const [empty] = await database.insert(schema.branches).values({
      code: "P762-EMPTY", name: "Empty", city: "T", region: "T", district: "T",
      address: "E", phone: "+99833", hours: "9-18", lat: 3, lng: 3,
    }).returning();
    const soft = await merchant.resolvePaymentMerchantConfig(
      { branchId: empty.id, provider: "payme", requireConfigured: false },
      database as any,
    );
    assert.equal(soft.configured, false);
    await assert.rejects(
      () => merchant.resolvePaymentMerchantConfig(
        { branchId: empty.id, provider: "payme", requireConfigured: true },
        database as any,
      ),
      (err: any) => err?.code === "MERCHANT_CONFIG_MISSING",
    );
  });

  it("D. Missing Click configuration is deterministic", async () => {
    await assert.rejects(
      () => merchant.resolvePaymentMerchantConfig(
        { branchId: branchB, provider: "click", requireConfigured: true },
        database as any,
      ),
      (err: any) => err?.code === "MERCHANT_CONFIG_MISSING",
    );
  });

  it("E. Unsupported provider fails safely", async () => {
    await assert.rejects(
      () => merchant.resolvePaymentMerchantConfig(
        { branchId: branchA, provider: "stripe" },
        database as any,
      ),
      (err: any) => err?.code === "UNSUPPORTED_PAYMENT_PROVIDER",
    );
  });

  it("F. Public summary and admin DTO never contain raw secrets", async () => {
    const cfg = await merchant.resolvePaymentMerchantConfig(
      { branchId: branchA, provider: "payme" },
      database as any,
    );
    const pub = JSON.stringify(merchant.toPublicMerchantSummary(cfg));
    assert.doesNotMatch(pub, /PAYME_SECRET|CLICK_SECRET|paymeKey|clickSecret/);
    const row = (await database.select().from(schema.branches).where(eq(schema.branches.id, branchA)))[0];
    const adminDto = JSON.stringify(merchant.toAdminBranchPaymentDto(row));
    assert.match(adminDto, /••••/);
    assert.doesNotMatch(adminDto, /PAYME_SECRET_A|CLICK_SECRET_A/);
  });

  it("I. No provider HTTP / protocol invented in resolver module", () => {
    const src = readFileSync(path.join(apiRoot, "src/lib/branchPaymentMerchant.ts"), "utf8");
    assert.doesNotMatch(src, /fetch\(|axios|CheckPerform|CreateTransaction|sign_string|checkout\.paycom|click\.uz/i);
    assert.match(src, /SECRET_ENCRYPTION_AT_REST_FOLLOW_UP/);
    const adapters = readFileSync(path.join(apiRoot, "src/lib/paymentAdapters.ts"), "utf8");
    assert.match(adapters, /buildPaymeCheckoutUrl|buildClickCheckoutUrl|CONTRACT_PENDING/);
  });
});
