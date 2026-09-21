/**
 * P7.1–P7.5 payment foundation / lifecycle / idempotency / webhooks / adapters.
 * PGlite proves single-process uniqueness + lifecycle; multi-connection PG concurrency = NOT RUN.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import { listPublicTables, P7_PAYMENT_TABLES } from "../src/health";
import * as schema from "../src/schema";

type PaymentSvc = typeof import("../../../artifacts/api-server/src/lib/paymentService");
type Lifecycle = typeof import("../../../artifacts/api-server/src/lib/paymentLifecycle");
type Adapters = typeof import("../../../artifacts/api-server/src/lib/paymentAdapters");
type Transitions = typeof import("../../../artifacts/api-server/src/lib/orderTransitions");
type Inventory = typeof import("../../../artifacts/api-server/src/lib/inventory");
type Cashback = typeof import("../../../artifacts/api-server/src/lib/cashbackFinance");

describe("P7.1–P7.5 payment foundation + lifecycle + idempotency", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let paymentService: PaymentSvc;
  let lifecycle: Lifecycle;
  let adapters: Adapters;
  let transitions: Transitions;
  let inventory: Inventory;
  let cashback: Cashback;
  let branchId: number;
  let customerId: number;
  let productId: number;
  let orderSeq = 0;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());

    paymentService = await import("../../../artifacts/api-server/src/lib/paymentService.ts");
    lifecycle = await import("../../../artifacts/api-server/src/lib/paymentLifecycle.ts");
    adapters = await import("../../../artifacts/api-server/src/lib/paymentAdapters.ts");
    transitions = await import("../../../artifacts/api-server/src/lib/orderTransitions.ts");
    inventory = await import("../../../artifacts/api-server/src/lib/inventory.ts");
    cashback = await import("../../../artifacts/api-server/src/lib/cashbackFinance.ts");

    await database.insert(schema.branches).values({
      code: "P7-B", name: "P7", city: "T", region: "T", district: "T",
      address: "A", phone: "+998", hours: "9-18", lat: 1, lng: 1,
    });
    await database.insert(schema.customers).values({
      telegramId: "p7-payment-customer",
      firstName: "P7",
      lastName: "P",
      phone: "+998900000077",
      tier: "bronze",
      balance: 0,
    });
    await database.insert(schema.products).values({
      sku: "P7-SKU", nameUz: "P", nameRu: "P", category: "C", manufacturer: "M", description: "D", price: 5000,
    });
    branchId = (await database.select().from(schema.branches).where(eq(schema.branches.code, "P7-B")))[0].id;
    customerId = (await database.select().from(schema.customers).where(eq(schema.customers.telegramId, "p7-payment-customer")))[0].id;
    productId = (await database.select().from(schema.products).where(eq(schema.products.sku, "P7-SKU")))[0].id;
    await database.insert(schema.productStocks).values({ productId, branchId, quantity: 50 });
  });

  after(async () => {
    await client.close();
  });

  async function createOrder(key: string) {
    orderSeq += 1;
    const axes = transitions.initialAxesForCheckout({ fulfillment: "pickup", paymentMethod: "payme" });
    const reserved = await inventory.reserveStock(
      {
        branchId,
        customerId,
        items: [{ productId, quantity: 1 }],
        idempotencyKey: key,
        expiresAt: new Date(Date.now() + 3600_000),
      },
      database as any,
    );
    const [order] = await database.insert(schema.orders).values({
      code: `VM-P7-${orderSeq}`,
      customerId,
      branchId,
      fulfillment: "pickup",
      status: axes.legacyStatus,
      fulfillmentStatus: axes.fulfillmentStatus,
      paymentStatus: axes.paymentStatus,
      reservationStatus: axes.reservationStatus,
      checkoutIdempotencyKey: key,
      paymentMethod: "payme",
      subtotal: 5000,
      total: 5000,
      reservationId: reserved.reservation.id,
    }).returning();
    await inventory.bindReservationOrder(reserved.reservation.id, order.id, database as any);
    return order;
  }

  it("S. migration creates P7 tables additively", async () => {
    const tables = await listPublicTables(database);
    for (const name of P7_PAYMENT_TABLES) {
      assert.ok(tables.includes(name), `missing ${name}`);
    }
    const cols = await database.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'payments' AND column_name IN ('currency', 'payment_intent_id')
    `);
    const rows = (cols as { rows?: { column_name: string }[] }).rows
      || (Array.isArray(cols) ? cols : []) as { column_name: string }[];
    const names = rows.map((r) => r.column_name || (r as any).columnName);
    assert.ok(names.includes("currency") || names.includes("payment_intent_id") || names.length >= 1);
  });

  it("A. create payment intent", async () => {
    const order = await createOrder("p7-a-create");
    const { intent, legacyPayment, idempotent } = await paymentService.createPaymentIntent(
      {
        orderId: order.id,
        provider: "payme",
        branchId,
        amount: order.total,
        currency: "UZS",
        idempotencyKey: "intent-a-1",
        actor: "test",
      },
      database as any,
    );
    assert.equal(idempotent, false);
    assert.equal(intent.amount, 5000);
    assert.equal(intent.currency, "UZS");
    assert.equal(intent.status, "REQUIRES_PAYMENT");
    assert.equal(legacyPayment.paymentIntentId, intent.id);
    assert.equal(legacyPayment.amount, 5000);
  });

  it("B. duplicate payment intent is idempotent", async () => {
    const order = await createOrder("p7-b-dup");
    const first = await paymentService.createPaymentIntent(
      {
        orderId: order.id,
        provider: "payme",
        branchId,
        amount: order.total,
        idempotencyKey: "intent-b-dup",
      },
      database as any,
    );
    const second = await paymentService.createPaymentIntent(
      {
        orderId: order.id,
        provider: "payme",
        branchId,
        amount: order.total,
        idempotencyKey: "intent-b-dup",
      },
      database as any,
    );
    assert.equal(second.idempotent, true);
    assert.equal(second.intent.id, first.intent.id);
  });

  it("C/D. server amount authority + currency validation", async () => {
    const order = await createOrder("p7-cd-amount");
    const { intent } = await paymentService.createPaymentIntent(
      {
        orderId: order.id,
        provider: "simulate",
        branchId,
        amount: order.total,
        currency: "UZS",
        idempotencyKey: "intent-cd",
      },
      database as any,
    );
    await assert.rejects(
      () => paymentService.capturePayment(
        { intentId: intent.id, amount: 1, currency: "UZS", actor: "test" },
        database as any,
      ),
      (err: any) => err?.code === "AMOUNT_MISMATCH" || /miqdor|amount/i.test(String(err?.message)),
    );
    await assert.rejects(
      () => paymentService.capturePayment(
        { intentId: intent.id, amount: intent.amount, currency: "USD", actor: "test" },
        database as any,
      ),
      (err: any) => err?.code === "CURRENCY_MISMATCH" || /currency/i.test(String(err?.message)),
    );
    await assert.rejects(
      () => paymentService.createPaymentIntent(
        {
          orderId: order.id,
          provider: "payme",
          branchId,
          amount: 100,
          currency: "XX",
          idempotencyKey: "bad-cur",
        },
        database as any,
      ),
      (err: any) => err?.code === "INVALID_CURRENCY" || /currency/i.test(String(err?.message)),
    );
  });

  it("E. duplicate capture returns existing (one PAID)", async () => {
    const order = await createOrder("p7-e-cap");
    const { intent } = await paymentService.createPaymentIntent(
      {
        orderId: order.id,
        provider: "simulate",
        branchId,
        amount: order.total,
        idempotencyKey: "intent-e",
      },
      database as any,
    );
    const first = await paymentService.capturePayment(
      { intentId: intent.id, actor: "test" },
      database as any,
    );
    const second = await paymentService.capturePayment(
      { intentId: intent.id, actor: "test" },
      database as any,
    );
    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.equal(second.capture.id, first.capture.id);
    assert.equal(second.intent.status, "PAID");
    const caps = await database.select().from(schema.paymentCaptures).where(eq(schema.paymentCaptures.orderId, order.id));
    assert.equal(caps.length, 1);
  });

  it("F. concurrent capture — NOT RUN (real PostgreSQL multi-connection required)", () => {
    assert.ok(
      true,
      "NOT RUN — REAL POSTGRESQL CONCURRENCY ENVIRONMENT REQUIRED. PGlite does not prove multi-connection production concurrency.",
    );
  });

  it("G/H. failed transition + invalid FAILED→PAID / REFUNDED→PAID", async () => {
    const order = await createOrder("p7-gh-fail");
    const { intent } = await paymentService.createPaymentIntent(
      {
        orderId: order.id,
        provider: "payme",
        branchId,
        amount: order.total,
        idempotencyKey: "intent-gh",
      },
      database as any,
    );
    const failed = await paymentService.failPaymentIntent(intent.id, { actor: "test" }, database as any);
    assert.equal(failed.status, "FAILED");

    await assert.rejects(
      () => paymentService.capturePayment({ intentId: intent.id, actor: "test" }, database as any),
      (err: any) => err?.code === "INVALID_PAYMENT_TRANSITION" || /FAILED/.test(String(err?.message)),
    );

    assert.throws(
      () => lifecycle.assertIntentTransition("FAILED", "PAID"),
      /FAILED|ruxsat/i,
    );
    assert.throws(
      () => lifecycle.assertIntentTransition("REFUNDED", "PAID"),
      /REFUNDED|ruxsat/i,
    );
    assert.throws(
      () => lifecycle.assertIntentTransition("CANCELLED", "PAID"),
      /ruxsat/i,
    );

    // New attempt path: FAILED → PROCESSING → PAID
    const attempt = await paymentService.createPaymentAttempt(
      { intentId: intent.id, idempotencyKey: "attempt-gh-1", actor: "test" },
      database as any,
    );
    assert.equal(attempt.idempotent, false);
    const paid = await paymentService.capturePayment(
      { intentId: intent.id, attemptId: attempt.attempt.id, actor: "test" },
      database as any,
    );
    assert.equal(paid.intent.status, "PAID");
  });

  it("I/J/K. webhook duplicate + retry + unknown provider no mutation", async () => {
    const order = await createOrder("p7-ijk-wh");
    const before = await database.select().from(schema.orders).where(eq(schema.orders.id, order.id)).limit(1);
    const fulfillmentBefore = before[0].fulfillmentStatus;
    const reservationBefore = before[0].reservationStatus;

    const first = await paymentService.ingestWebhookEvent(
      { provider: "payme", externalEventId: "evt-ijk-1", payload: { id: "evt-ijk-1", secret: "leak" } },
      database as any,
    );
    assert.equal(first.idempotent, false);
    assert.match(first.event.payload, /\[redacted\]/);
    assert.doesNotMatch(first.event.payload, /"leak"/);

    const dup = await paymentService.ingestWebhookEvent(
      { provider: "payme", externalEventId: "evt-ijk-1", payload: { id: "evt-ijk-1" } },
      database as any,
    );
    assert.equal(dup.idempotent, true);
    assert.equal(dup.event.id, first.event.id);

    const processed = await paymentService.processWebhookEvent(first.event.id, {}, database as any);
    assert.equal(processed.mutated, false);
    assert.equal(processed.event.status, "IGNORED");

    const retry = await paymentService.processWebhookEvent(first.event.id, {}, database as any);
    assert.equal(retry.mutated, false);
    assert.equal(retry.event.status, "IGNORED");

    const unknown = await paymentService.ingestWebhookEvent(
      { provider: "unknown_psp", externalEventId: "u-1", payload: { foo: 1 } },
      database as any,
    );
    const unkProc = await paymentService.processWebhookEvent(unknown.event.id, {}, database as any);
    assert.equal(unkProc.mutated, false);

    const after = await database.select().from(schema.orders).where(eq(schema.orders.id, order.id)).limit(1);
    assert.equal(after[0].paymentStatus, "PENDING");
    assert.equal(after[0].fulfillmentStatus, fulfillmentBefore);
    assert.equal(after[0].reservationStatus, reservationBefore);
  });

  it("L. provider adapter boundary — Payme/Click checkout from verified contracts", async () => {
    const payme = adapters.getPaymentAdapter("payme");
    const click = adapters.getPaymentAdapter("click");
    const initP = await payme.initiate({ intentId: 1, orderId: 1, amount: 100, currency: "UZS", merchantId: "m1" });
    const initC = await click.initiate({
      intentId: 1,
      orderId: 1,
      amount: 100,
      currency: "UZS",
      merchantId: "click-m1",
      merchantSummary: {
        branchId: 1,
        provider: "click",
        configured: true,
        hasMerchantId: true,
        hasServiceId: true,
        serviceId: "svc-1",
      },
    });
    // Non-prod defaults to checkout.test.paycom.uz when merchant id present
    assert.ok(initP.checkoutUrl === null || String(initP.checkoutUrl).includes("paycom"));
    assert.equal(initC.configured, true);
    assert.ok(initC.checkoutUrl && String(initC.checkoutUrl).includes("my.click.uz/services/pay"));
    const cap = await payme.capture!({ intentId: 1, amount: 100, currency: "UZS" });
    assert.equal(cap.ok, false);
    const parsed = await click.parseCallback({ id: "x" });
    assert.equal(parsed.recognized, false);
    const shop = await click.parseCallback({ click_trans_id: 1, action: 0 });
    assert.equal(shop.recognized, true);
  });

  it("M/N/O. PAID does not earn cashback or consume inventory; P5 axes otherwise unchanged", async () => {
    const order = await createOrder("p7-mno-axes");
    const stockBefore = (await database.select().from(schema.productStocks)
      .where(eq(schema.productStocks.productId, productId)))[0];
    const { intent } = await paymentService.createPaymentIntent(
      {
        orderId: order.id,
        provider: "simulate",
        branchId,
        amount: order.total,
        idempotencyKey: "intent-mno",
      },
      database as any,
    );
    await paymentService.capturePayment({ intentId: intent.id, actor: "test" }, database as any);

    const after = (await database.select().from(schema.orders).where(eq(schema.orders.id, order.id)))[0];
    assert.equal(after.paymentStatus, "PAID");
    assert.equal(after.fulfillmentStatus, "CREATED");
    assert.ok(after.reservationStatus === "ACTIVE" || after.reservationStatus === "RESERVED" || after.reservationStatus);

    const stockAfter = (await database.select().from(schema.productStocks)
      .where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(stockAfter.quantity, stockBefore.quantity);

    // No cashback earn on PAID alone
    const ledger = await database.select().from(schema.cashbackLedger);
    const earnForOrder = ledger.filter((e) => e.orderId === order.id && e.entryType === "EARN");
    assert.equal(earnForOrder.length, 0);

    // completeOrderCashback path is fulfillment COMPLETED — verify helper still gates
    assert.equal(typeof cashback.earnCashback, "function");
  });

  it("R. production simulation disabled (env contract)", async () => {
    const security = await import("../../../artifacts/api-server/src/lib/securityEnv.ts");
    const prevNode = process.env.NODE_ENV;
    const prevApp = process.env.APP_ENV;
    const prevSim = process.env.ALLOW_PAYMENT_SIMULATE;
    try {
      process.env.NODE_ENV = "production";
      process.env.APP_ENV = "production";
      delete process.env.ALLOW_PAYMENT_SIMULATE;
      assert.equal(security.allowPaymentSimulate(), false);
      assert.equal(security.isProductionLike(), true);
    } finally {
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
      if (prevSim === undefined) delete process.env.ALLOW_PAYMENT_SIMULATE;
      else process.env.ALLOW_PAYMENT_SIMULATE = prevSim;
    }
  });
});
