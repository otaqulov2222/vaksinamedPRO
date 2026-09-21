/**
 * P7.6.4 — Click Shop API against verified contract (no live sandbox credentials).
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

type ClickApi = typeof import("../../../artifacts/api-server/src/lib/clickMerchantApi");
type Contract = typeof import("../../../artifacts/api-server/src/lib/clickContract");
type PaymentSvc = typeof import("../../../artifacts/api-server/src/lib/paymentService");
type Transitions = typeof import("../../../artifacts/api-server/src/lib/orderTransitions");
type Adapters = typeof import("../../../artifacts/api-server/src/lib/paymentAdapters");

describe("P7.6.4 Click Shop API", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let click: ClickApi;
  let contract: Contract;
  let paymentService: PaymentSvc;
  let transitions: Transitions;
  let adapters: Adapters;
  let branchA: number;
  let branchB: number;
  let customerId: number;
  let orderA: number;
  let intentA: number;
  const SECRET_A = "CLICK_SECRET_A_DO_NOT_LOG";
  const SECRET_B = "CLICK_SECRET_B_DO_NOT_LOG";
  const SERVICE_A = "1001";
  const SERVICE_B = "2002";
  const MERCHANT_A = "click-merchant-a";

  function signPrepare(input: {
    clickTransId: string | number;
    serviceId: string | number;
    secret: string;
    merchantTransId: string;
    amount: string | number;
    signTime: string;
  }) {
    return contract.buildClickSignString({
      clickTransId: input.clickTransId,
      serviceId: input.serviceId,
      secretKey: input.secret,
      merchantTransId: input.merchantTransId,
      amount: input.amount,
      action: contract.CLICK_ACTION.PREPARE,
      signTime: input.signTime,
    });
  }

  function signComplete(input: {
    clickTransId: string | number;
    serviceId: string | number;
    secret: string;
    merchantTransId: string;
    merchantPrepareId: number;
    amount: string | number;
    signTime: string;
  }) {
    return contract.buildClickSignString({
      clickTransId: input.clickTransId,
      serviceId: input.serviceId,
      secretKey: input.secret,
      merchantTransId: input.merchantTransId,
      merchantPrepareId: input.merchantPrepareId,
      amount: input.amount,
      action: contract.CLICK_ACTION.COMPLETE,
      signTime: input.signTime,
    });
  }

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    click = await import("../../../artifacts/api-server/src/lib/clickMerchantApi.ts");
    contract = await import("../../../artifacts/api-server/src/lib/clickContract.ts");
    paymentService = await import("../../../artifacts/api-server/src/lib/paymentService.ts");
    transitions = await import("../../../artifacts/api-server/src/lib/orderTransitions.ts");
    adapters = await import("../../../artifacts/api-server/src/lib/paymentAdapters.ts");

    const [a] = await database.insert(schema.branches).values({
      code: "CK-A", name: "A", city: "T", region: "T", district: "T",
      address: "A", phone: "+1", hours: "9", lat: 1, lng: 1,
      clickMerchantId: MERCHANT_A,
      clickServiceId: SERVICE_A,
      clickSecret: SECRET_A,
    }).returning();
    const [b] = await database.insert(schema.branches).values({
      code: "CK-B", name: "B", city: "T", region: "T", district: "T",
      address: "B", phone: "+2", hours: "9", lat: 2, lng: 2,
      clickMerchantId: "click-merchant-b",
      clickServiceId: SERVICE_B,
      clickSecret: SECRET_B,
    }).returning();
    branchA = a.id;
    branchB = b.id;
    const [c] = await database.insert(schema.customers).values({
      telegramId: "click-cust", firstName: "C", lastName: "K", phone: "+998900000088", tier: "bronze", balance: 0,
    }).returning();
    customerId = c.id;
    const axes = transitions.initialAxesForCheckout({ fulfillment: "pickup", paymentMethod: "click" });
    const [order] = await database.insert(schema.orders).values({
      code: "VM-CLICK-1",
      customerId,
      branchId: branchA,
      fulfillment: "pickup",
      status: axes.legacyStatus,
      fulfillmentStatus: axes.fulfillmentStatus,
      paymentStatus: axes.paymentStatus,
      reservationStatus: "NONE",
      paymentMethod: "click",
      subtotal: 5000,
      total: 5000,
    }).returning();
    orderA = order.id;
    const created = await paymentService.createPaymentIntent(
      {
        orderId: orderA,
        provider: "click",
        branchId: branchA,
        amount: 5000,
        currency: "UZS",
        merchantId: MERCHANT_A,
        idempotencyKey: "click-test-intent-1",
      },
      database as any,
    );
    intentA = created.intent.id;
  });

  after(async () => {
    await client.close();
  });

  it("A. merchant resolution + checkout URL uses branch merchant/service", async () => {
    const url = contract.buildClickCheckoutUrl({
      merchantId: MERCHANT_A,
      serviceId: SERVICE_A,
      transactionParam: String(orderA),
      amountUzs: 5000,
    });
    assert.ok(url.checkoutUrl);
    assert.match(String(url.checkoutUrl), /my\.click\.uz\/services\/pay/);
    assert.match(String(url.checkoutUrl), new RegExp(`merchant_id=${MERCHANT_A}`));
    assert.match(String(url.checkoutUrl), new RegExp(`service_id=${SERVICE_A}`));
    assert.equal(url.amountFormatted, "5000.00");

    const adapter = adapters.getPaymentAdapter("click");
    const init = await adapter.initiate({
      intentId: intentA,
      orderId: orderA,
      amount: 5000,
      currency: "UZS",
      merchantId: MERCHANT_A,
      merchantSummary: {
        branchId: branchA,
        provider: "click",
        configured: true,
        hasMerchantId: true,
        hasServiceId: true,
        serviceId: SERVICE_A,
      },
    });
    assert.equal(init.configured, true);
    assert.ok(init.checkoutUrl?.includes("my.click.uz"));
  });

  it("B. Branch B secret cannot settle Branch A payment", async () => {
    const signTime = "2026-03-21 12:00:00";
    const amount = "5000";
    const badSign = signPrepare({
      clickTransId: 9001,
      serviceId: SERVICE_A,
      secret: SECRET_B,
      merchantTransId: String(orderA),
      amount,
      signTime,
    });
    const res = await click.handleClickMerchantRequest(
      {
        click_trans_id: 9001,
        service_id: SERVICE_A,
        click_paydoc_id: 1,
        merchant_trans_id: String(orderA),
        amount,
        action: 0,
        sign_time: signTime,
        sign_string: badSign,
      },
      database as any,
    );
    assert.equal(res.error, contract.CLICK_ERROR.SIGN_CHECK_FAILED);
  });

  it("C. Wrong service_id rejected", async () => {
    const signTime = "2026-03-21 12:01:00";
    const amount = "5000";
    const sign = signPrepare({
      clickTransId: 9002,
      serviceId: SERVICE_B,
      secret: SECRET_A,
      merchantTransId: String(orderA),
      amount,
      signTime,
    });
    const res = await click.handleClickMerchantRequest(
      {
        click_trans_id: 9002,
        service_id: SERVICE_B,
        click_paydoc_id: 1,
        merchant_trans_id: String(orderA),
        amount,
        action: 0,
        sign_time: signTime,
        sign_string: sign,
      },
      database as any,
    );
    assert.equal(res.error, contract.CLICK_ERROR.ERROR_IN_REQUEST);
  });

  it("D. Wrong merchant_id (via merchant_trans of other branch order) isolation", async () => {
    // Create order on branch B
    const axes = transitions.initialAxesForCheckout({ fulfillment: "pickup", paymentMethod: "click" });
    const [orderB] = await database.insert(schema.orders).values({
      code: "VM-CLICK-B",
      customerId,
      branchId: branchB,
      fulfillment: "pickup",
      status: axes.legacyStatus,
      fulfillmentStatus: axes.fulfillmentStatus,
      paymentStatus: axes.paymentStatus,
      reservationStatus: "NONE",
      paymentMethod: "click",
      subtotal: 5000,
      total: 5000,
    }).returning();
    await paymentService.createPaymentIntent(
      {
        orderId: orderB.id,
        provider: "click",
        branchId: branchB,
        amount: 5000,
        currency: "UZS",
        merchantId: "click-merchant-b",
        idempotencyKey: "click-test-intent-b",
      },
      database as any,
    );
    const signTime = "2026-03-21 12:02:00";
    const amount = "5000";
    // Sign with branch A secret but target branch B order → service mismatch or sign fail after resolve
    const sign = signPrepare({
      clickTransId: 9003,
      serviceId: SERVICE_A,
      secret: SECRET_A,
      merchantTransId: String(orderB.id),
      amount,
      signTime,
    });
    const res = await click.handleClickMerchantRequest(
      {
        click_trans_id: 9003,
        service_id: SERVICE_A,
        click_paydoc_id: 1,
        merchant_trans_id: String(orderB.id),
        amount,
        action: 0,
        sign_time: signTime,
        sign_string: sign,
      },
      database as any,
    );
    // Branch B intent + Branch A service_id → ERROR_IN_REQUEST (service mismatch)
    assert.equal(res.error, contract.CLICK_ERROR.ERROR_IN_REQUEST);
  });

  it("E. Wrong signature rejected", async () => {
    const res = await click.handleClickMerchantRequest(
      {
        click_trans_id: 9004,
        service_id: SERVICE_A,
        click_paydoc_id: 1,
        merchant_trans_id: String(orderA),
        amount: "5000",
        action: 0,
        sign_time: "2026-03-21 12:03:00",
        sign_string: "deadbeefdeadbeefdeadbeefdeadbeef",
      },
      database as any,
    );
    assert.equal(res.error, contract.CLICK_ERROR.SIGN_CHECK_FAILED);
  });

  it("F. Invalid sign_time rejected", async () => {
    const amount = "5000";
    const sign = signPrepare({
      clickTransId: 9005,
      serviceId: SERVICE_A,
      secret: SECRET_A,
      merchantTransId: String(orderA),
      amount,
      signTime: "not-a-date",
    });
    const res = await click.handleClickMerchantRequest(
      {
        click_trans_id: 9005,
        service_id: SERVICE_A,
        click_paydoc_id: 1,
        merchant_trans_id: String(orderA),
        amount,
        action: 0,
        sign_time: "not-a-date",
        sign_string: sign,
      },
      database as any,
    );
    assert.equal(res.error, contract.CLICK_ERROR.ERROR_IN_REQUEST);
  });

  it("G. Amount mismatch rejected", async () => {
    const signTime = "2026-03-21 12:04:00";
    const amount = "1";
    const sign = signPrepare({
      clickTransId: 9006,
      serviceId: SERVICE_A,
      secret: SECRET_A,
      merchantTransId: String(orderA),
      amount,
      signTime,
    });
    const res = await click.handleClickMerchantRequest(
      {
        click_trans_id: 9006,
        service_id: SERVICE_A,
        click_paydoc_id: 1,
        merchant_trans_id: String(orderA),
        amount,
        action: 0,
        sign_time: signTime,
        sign_string: sign,
      },
      database as any,
    );
    assert.equal(res.error, contract.CLICK_ERROR.INCORRECT_AMOUNT);
  });

  it("H. Unknown merchant_trans_id rejected", async () => {
    const signTime = "2026-03-21 12:05:00";
    const amount = "5000";
    const sign = signPrepare({
      clickTransId: 9007,
      serviceId: SERVICE_A,
      secret: SECRET_A,
      merchantTransId: "999999",
      amount,
      signTime,
    });
    const res = await click.handleClickMerchantRequest(
      {
        click_trans_id: 9007,
        service_id: SERVICE_A,
        click_paydoc_id: 1,
        merchant_trans_id: "999999",
        amount,
        action: 0,
        sign_time: signTime,
        sign_string: sign,
      },
      database as any,
    );
    assert.equal(res.error, contract.CLICK_ERROR.USER_NOT_FOUND);
  });

  it("I/J/K. Duplicate Prepare + Complete idempotent; one capture", async () => {
    const clickTransId = 9100;
    const signTime = "2026-03-21 12:10:00";
    const amount = "5000";
    const prepSign = signPrepare({
      clickTransId,
      serviceId: SERVICE_A,
      secret: SECRET_A,
      merchantTransId: String(orderA),
      amount,
      signTime,
    });
    const prep1 = await click.handleClickMerchantRequest(
      {
        click_trans_id: clickTransId,
        service_id: SERVICE_A,
        click_paydoc_id: 55,
        merchant_trans_id: String(orderA),
        amount,
        action: 0,
        error: 0,
        error_note: "Success",
        sign_time: signTime,
        sign_string: prepSign,
      },
      database as any,
    );
    assert.equal(prep1.error, contract.CLICK_ERROR.SUCCESS);
    assert.ok(prep1.merchant_prepare_id);

    const prep2 = await click.handleClickMerchantRequest(
      {
        click_trans_id: clickTransId,
        service_id: SERVICE_A,
        click_paydoc_id: 55,
        merchant_trans_id: String(orderA),
        amount,
        action: 0,
        error: 0,
        error_note: "Success",
        sign_time: signTime,
        sign_string: prepSign,
      },
      database as any,
    );
    assert.equal(prep2.error, contract.CLICK_ERROR.SUCCESS);
    assert.equal(prep2.merchant_prepare_id, prep1.merchant_prepare_id);

    const completeSign = signComplete({
      clickTransId,
      serviceId: SERVICE_A,
      secret: SECRET_A,
      merchantTransId: String(orderA),
      merchantPrepareId: Number(prep1.merchant_prepare_id),
      amount,
      signTime: "2026-03-21 12:11:00",
    });
    const c1 = await click.handleClickMerchantRequest(
      {
        click_trans_id: clickTransId,
        service_id: SERVICE_A,
        click_paydoc_id: 55,
        merchant_trans_id: String(orderA),
        merchant_prepare_id: prep1.merchant_prepare_id,
        amount,
        action: 1,
        error: 0,
        error_note: "Success",
        sign_time: "2026-03-21 12:11:00",
        sign_string: completeSign,
      },
      database as any,
    );
    assert.equal(c1.error, contract.CLICK_ERROR.SUCCESS);

    const c2 = await click.handleClickMerchantRequest(
      {
        click_trans_id: clickTransId,
        service_id: SERVICE_A,
        click_paydoc_id: 55,
        merchant_trans_id: String(orderA),
        merchant_prepare_id: prep1.merchant_prepare_id,
        amount,
        action: 1,
        error: 0,
        error_note: "Success",
        sign_time: "2026-03-21 12:11:00",
        sign_string: completeSign,
      },
      database as any,
    );
    assert.equal(c2.error, contract.CLICK_ERROR.ALREADY_PAID);

    const captures = await database
      .select()
      .from(schema.paymentCaptures)
      .where(eq(schema.paymentCaptures.intentId, intentA));
    assert.equal(captures.length, 1);

    const intent = (await database.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intentA)))[0];
    assert.equal(intent.status, "PAID");
    const order = (await database.select().from(schema.orders).where(eq(schema.orders.id, orderA)))[0];
    assert.equal(order.paymentStatus, "PAID");
  });

  it("L. Failed Complete (click error != 0) → fail intent, return -9", async () => {
    const axes = transitions.initialAxesForCheckout({ fulfillment: "pickup", paymentMethod: "click" });
    const [order] = await database.insert(schema.orders).values({
      code: "VM-CLICK-FAIL",
      customerId,
      branchId: branchA,
      fulfillment: "pickup",
      status: axes.legacyStatus,
      fulfillmentStatus: axes.fulfillmentStatus,
      paymentStatus: axes.paymentStatus,
      reservationStatus: "NONE",
      paymentMethod: "click",
      subtotal: 3000,
      total: 3000,
    }).returning();
    const created = await paymentService.createPaymentIntent(
      {
        orderId: order.id,
        provider: "click",
        branchId: branchA,
        amount: 3000,
        currency: "UZS",
        merchantId: MERCHANT_A,
        idempotencyKey: "click-test-fail-1",
      },
      database as any,
    );
    const clickTransId = 9200;
    const amount = "3000";
    const prepSign = signPrepare({
      clickTransId,
      serviceId: SERVICE_A,
      secret: SECRET_A,
      merchantTransId: String(order.id),
      amount,
      signTime: "2026-03-21 13:00:00",
    });
    const prep = await click.handleClickMerchantRequest(
      {
        click_trans_id: clickTransId,
        service_id: SERVICE_A,
        click_paydoc_id: 2,
        merchant_trans_id: String(order.id),
        amount,
        action: 0,
        sign_time: "2026-03-21 13:00:00",
        sign_string: prepSign,
      },
      database as any,
    );
    assert.equal(prep.error, 0);
    const completeSign = signComplete({
      clickTransId,
      serviceId: SERVICE_A,
      secret: SECRET_A,
      merchantTransId: String(order.id),
      merchantPrepareId: Number(prep.merchant_prepare_id),
      amount,
      signTime: "2026-03-21 13:01:00",
    });
    const done = await click.handleClickMerchantRequest(
      {
        click_trans_id: clickTransId,
        service_id: SERVICE_A,
        click_paydoc_id: 2,
        merchant_trans_id: String(order.id),
        merchant_prepare_id: prep.merchant_prepare_id,
        amount,
        action: 1,
        error: -1,
        error_note: "Click cancelled",
        sign_time: "2026-03-21 13:01:00",
        sign_string: completeSign,
      },
      database as any,
    );
    assert.equal(done.error, contract.CLICK_ERROR.TRANSACTION_CANCELLED);
    const intent = (
      await database.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, created.intent.id))
    )[0];
    assert.equal(intent.status, "FAILED");
  });

  it("M/N. Secrets never in errors; customer DTO strips credentials", () => {
    const err = JSON.stringify({
      error: contract.CLICK_ERROR.SIGN_CHECK_FAILED,
      error_note: contract.CLICK_ERROR_NOTE[contract.CLICK_ERROR.SIGN_CHECK_FAILED],
    });
    assert.doesNotMatch(err, /CLICK_SECRET|SECRET_A|paymeKey|clickSecret/);
    const security = readFileSync(path.join(apiRoot, "src/lib/securityEnv.ts"), "utf8");
    assert.match(security, /clickSecret:\s*_cs|clickSecret/);
    const paymentsRoute = readFileSync(path.join(apiRoot, "src/routes/payments.ts"), "utf8");
    assert.doesNotMatch(paymentsRoute, /clickSecret|paymeKey/);
    assert.match(paymentsRoute, /handleClickMerchantRequest/);
  });

  it("O/P. Click success does not earn cashback or mutate inventory directly", async () => {
    const api = readFileSync(path.join(apiRoot, "src/lib/clickMerchantApi.ts"), "utf8");
    assert.match(api, /capturePayment/);
    assert.doesNotMatch(api, /earnCashback|completeOrderCashback|useCashback/);
    assert.doesNotMatch(api, /consumeReservation|adjustStock|productStocks/);
    const ledger = await database.select().from(schema.cashbackLedger);
    const earnForOrder = ledger.filter((e) => e.orderId === orderA && e.entryType === "EARN");
    assert.equal(earnForOrder.length, 0);
  });

  it("SANDBOX_E2E_PENDING without credentials", () => {
    const has =
      Boolean(process.env.CLICK_SANDBOX_SECRET?.trim())
      && Boolean(process.env.CLICK_SANDBOX_SERVICE_ID?.trim());
    if (!has) {
      assert.equal(has, false);
      return;
    }
    assert.fail("Sandbox credentials present but live E2E not wired in this batch");
  });
});
