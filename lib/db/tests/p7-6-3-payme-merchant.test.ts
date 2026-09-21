/**
 * P7.6.3 — Payme Merchant API against verified contract (no live sandbox credentials).
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

type PaymeApi = typeof import("../../../artifacts/api-server/src/lib/paymeMerchantApi");
type Contract = typeof import("../../../artifacts/api-server/src/lib/paymeContract");
type PaymentSvc = typeof import("../../../artifacts/api-server/src/lib/paymentService");
type Transitions = typeof import("../../../artifacts/api-server/src/lib/orderTransitions");

describe("P7.6.3 Payme Merchant API", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let payme: PaymeApi;
  let contract: Contract;
  let paymentService: PaymentSvc;
  let transitions: Transitions;
  let branchA: number;
  let branchB: number;
  let customerId: number;
  let orderA: number;
  let intentA: number;
  const KEY_A = "payme-key-branch-a";
  const KEY_B = "payme-key-branch-b";

  function authHeader(key: string) {
    return `Basic ${Buffer.from(`Paycom:${key}`, "utf8").toString("base64")}`;
  }

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    payme = await import("../../../artifacts/api-server/src/lib/paymeMerchantApi.ts");
    contract = await import("../../../artifacts/api-server/src/lib/paymeContract.ts");
    paymentService = await import("../../../artifacts/api-server/src/lib/paymentService.ts");
    transitions = await import("../../../artifacts/api-server/src/lib/orderTransitions.ts");

    const [a] = await database.insert(schema.branches).values({
      code: "PM-A", name: "A", city: "T", region: "T", district: "T",
      address: "A", phone: "+1", hours: "9", lat: 1, lng: 1,
      paymeMerchantId: "merchant-a",
      paymeKey: KEY_A,
    }).returning();
    const [b] = await database.insert(schema.branches).values({
      code: "PM-B", name: "B", city: "T", region: "T", district: "T",
      address: "B", phone: "+2", hours: "9", lat: 2, lng: 2,
      paymeMerchantId: "merchant-b",
      paymeKey: KEY_B,
    }).returning();
    branchA = a.id;
    branchB = b.id;
    const [c] = await database.insert(schema.customers).values({
      telegramId: "payme-cust", firstName: "P", lastName: "M", phone: "+998900000099", tier: "bronze", balance: 0,
    }).returning();
    customerId = c.id;
    const axes = transitions.initialAxesForCheckout({ fulfillment: "pickup", paymentMethod: "payme" });
    const [order] = await database.insert(schema.orders).values({
      code: "VM-PAYME-1",
      customerId,
      branchId: branchA,
      fulfillment: "pickup",
      status: axes.legacyStatus,
      fulfillmentStatus: axes.fulfillmentStatus,
      paymentStatus: axes.paymentStatus,
      reservationStatus: "NONE",
      paymentMethod: "payme",
      subtotal: 5000,
      total: 5000,
    }).returning();
    orderA = order.id;
    const created = await paymentService.createPaymentIntent(
      {
        orderId: orderA,
        provider: "payme",
        branchId: branchA,
        amount: 5000,
        currency: "UZS",
        merchantId: "merchant-a",
        idempotencyKey: "payme-test-intent-1",
      },
      database as any,
    );
    intentA = created.intent.id;
  });

  after(async () => {
    await client.close();
  });

  it("amount units: UZS so'm → tiyin * 100", () => {
    assert.equal(contract.uzsToPaymeTiyin(5000), 500_000);
    assert.equal(contract.paymeTiyinToUzs(500_000), 5000);
  });

  it("A. merchant resolution + checkout URL uses branch merchant id", async () => {
    const url = contract.buildPaymeCheckoutUrl({
      merchantId: "merchant-a",
      orderId: orderA,
      amountUzs: 5000,
    });
    assert.ok(url.checkoutUrl);
    assert.match(String(url.checkoutUrl), /checkout\.test\.paycom\.uz\//);
    assert.equal(url.amountTiyin, 500_000);
  });

  it("B. Branch B credentials cannot auth Branch A payment", async () => {
    const res = await payme.handlePaymeMerchantRpc(
      {
        id: 1,
        method: "CheckPerformTransaction",
        params: { amount: 500_000, account: { order_id: orderA } },
      },
      authHeader(KEY_B),
      database as any,
    );
    assert.ok(res.error);
    assert.equal(res.error!.code, contract.PAYME_ERROR.ACCESS_DENIED);
  });

  it("C. amount mismatch rejected", async () => {
    const res = await payme.handlePaymeMerchantRpc(
      {
        id: 2,
        method: "CheckPerformTransaction",
        params: { amount: 100, account: { order_id: orderA } },
      },
      authHeader(KEY_A),
      database as any,
    );
    assert.ok(res.error);
    assert.equal(res.error!.code, contract.PAYME_ERROR.INVALID_AMOUNT);
  });

  it("D. unknown order rejected", async () => {
    const res = await payme.handlePaymeMerchantRpc(
      {
        id: 3,
        method: "CheckPerformTransaction",
        params: { amount: 500_000, account: { order_id: 999999 } },
      },
      authHeader(KEY_A),
      database as any,
    );
    assert.ok(res.error);
    assert.equal(res.error!.code, contract.PAYME_ERROR.INVALID_ACCOUNT);
  });

  it("E/F. Create + Perform idempotent; one capture", async () => {
    const paymeTxn = "payme-txn-ef-1";
    const check = await payme.handlePaymeMerchantRpc(
      {
        id: 10,
        method: "CheckPerformTransaction",
        params: { amount: 500_000, account: { order_id: orderA } },
      },
      authHeader(KEY_A),
      database as any,
    );
    assert.deepEqual(check.result, { allow: true });

    const create1 = await payme.handlePaymeMerchantRpc(
      {
        id: 11,
        method: "CreateTransaction",
        params: {
          id: paymeTxn,
          time: Date.now(),
          amount: 500_000,
          account: { order_id: orderA },
        },
      },
      authHeader(KEY_A),
      database as any,
    );
    assert.ok(create1.result);
    assert.equal((create1.result as { state: number }).state, 1);

    const create2 = await payme.handlePaymeMerchantRpc(
      {
        id: 12,
        method: "CreateTransaction",
        params: {
          id: paymeTxn,
          time: Date.now(),
          amount: 500_000,
          account: { order_id: orderA },
        },
      },
      authHeader(KEY_A),
      database as any,
    );
    assert.equal(
      (create2.result as { transaction: string }).transaction,
      (create1.result as { transaction: string }).transaction,
    );

    const perform1 = await payme.handlePaymeMerchantRpc(
      { id: 13, method: "PerformTransaction", params: { id: paymeTxn } },
      authHeader(KEY_A),
      database as any,
    );
    assert.equal((perform1.result as { state: number }).state, 2);

    const perform2 = await payme.handlePaymeMerchantRpc(
      { id: 14, method: "PerformTransaction", params: { id: paymeTxn } },
      authHeader(KEY_A),
      database as any,
    );
    assert.equal((perform2.result as { state: number }).state, 2);

    const caps = await database.select().from(schema.paymentCaptures).where(eq(schema.paymentCaptures.intentId, intentA));
    assert.equal(caps.length, 1);
    const intent = (await database.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intentA)))[0];
    assert.equal(intent.status, "PAID");
    const order = (await database.select().from(schema.orders).where(eq(schema.orders.id, orderA)))[0];
    assert.equal(order.paymentStatus, "PAID");
    assert.equal(order.fulfillmentStatus, "CREATED");
  });

  it("G. CancelTransaction after perform → REFUNDED (no cashback invent)", async () => {
    // New order for cancel-after-perform path
    const axes = transitions.initialAxesForCheckout({ fulfillment: "pickup", paymentMethod: "payme" });
    const [order] = await database.insert(schema.orders).values({
      code: "VM-PAYME-CANCEL",
      customerId,
      branchId: branchA,
      fulfillment: "pickup",
      status: axes.legacyStatus,
      fulfillmentStatus: axes.fulfillmentStatus,
      paymentStatus: axes.paymentStatus,
      reservationStatus: "NONE",
      paymentMethod: "payme",
      subtotal: 1000,
      total: 1000,
    }).returning();
    const created = await paymentService.createPaymentIntent(
      {
        orderId: order.id,
        provider: "payme",
        branchId: branchA,
        amount: 1000,
        merchantId: "merchant-a",
        idempotencyKey: "payme-cancel-intent",
      },
      database as any,
    );
    const txn = "payme-txn-cancel-1";
    await payme.handlePaymeMerchantRpc(
      {
        id: 20,
        method: "CreateTransaction",
        params: { id: txn, time: Date.now(), amount: 100_000, account: { order_id: order.id } },
      },
      authHeader(KEY_A),
      database as any,
    );
    await payme.handlePaymeMerchantRpc(
      { id: 21, method: "PerformTransaction", params: { id: txn } },
      authHeader(KEY_A),
      database as any,
    );
    const cancel = await payme.handlePaymeMerchantRpc(
      { id: 22, method: "CancelTransaction", params: { id: txn, reason: 1 } },
      authHeader(KEY_A),
      database as any,
    );
    assert.equal((cancel.result as { state: number }).state, -2);
    const intent = (await database.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, created.intent.id)))[0];
    assert.equal(intent.status, "REFUNDED");
    const ledger = await database.select().from(schema.cashbackLedger);
    assert.equal(ledger.filter((e) => e.orderId === order.id && e.entryType === "EARN").length, 0);
  });

  it("H. invalid authentication rejected", async () => {
    const res = await payme.handlePaymeMerchantRpc(
      {
        id: 30,
        method: "CheckPerformTransaction",
        params: { amount: 500_000, account: { order_id: orderA } },
      },
      "Basic bad",
      database as any,
    );
    assert.ok(res.error);
  });

  it("I. invalid transaction id rejected", async () => {
    const res = await payme.handlePaymeMerchantRpc(
      { id: 31, method: "CheckTransaction", params: { id: "missing-txn" } },
      authHeader(KEY_A),
      database as any,
    );
    assert.equal(res.error?.code, contract.PAYME_ERROR.TRANSACTION_NOT_FOUND);
  });

  it("J. Perform does not invent cashback/inventory writers in module", () => {
    const src = readFileSync(path.join(apiRoot, "src/lib/paymeMerchantApi.ts"), "utf8");
    assert.match(src, /capturePayment/);
    assert.doesNotMatch(src, /earnCashback|completeOrderCashback|consumeReservation/);
  });

  it("K. error messages never include secrets", async () => {
    const res = await payme.handlePaymeMerchantRpc(
      {
        id: 40,
        method: "CheckPerformTransaction",
        params: { amount: 500_000, account: { order_id: orderA } },
      },
      authHeader("wrong-key"),
      database as any,
    );
    const dumped = JSON.stringify(res);
    assert.doesNotMatch(dumped, new RegExp(KEY_A));
    assert.doesNotMatch(dumped, /payme-key-branch/);
  });

  it("SANDBOX_E2E_PENDING without credentials", () => {
    assert.equal(Boolean(process.env.PAYME_SANDBOX_KEY?.trim()), false);
    assert.ok(true, "SANDBOX_E2E_PENDING — set Payme sandbox credentials via env to run live test.paycom.uz");
  });
});
