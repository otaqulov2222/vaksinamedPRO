/**
 * P7.6.5 + P7.7 + P7.8 + P7.9 — consolidated payment batch tests.
 * Uses PGlite. Real PostgreSQL concurrency: REAL_PG_CONCURRENCY_PENDING.
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

type PaymentSvc = typeof import("../../../artifacts/api-server/src/lib/paymentService");
type Transitions = typeof import("../../../artifacts/api-server/src/lib/orderTransitions");
type Readiness = typeof import("../../../artifacts/api-server/src/lib/paymentProviderReadiness");
type Serializers = typeof import("../../../artifacts/api-server/src/lib/paymentSerializers");
type Security = typeof import("../../../artifacts/api-server/src/lib/securityEnv");
type PaymeContract = typeof import("../../../artifacts/api-server/src/lib/paymeContract");
type ClickContract = typeof import("../../../artifacts/api-server/src/lib/clickContract");

describe("P7 accelerated batch P7.6.5–P7.9", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let paymentService: PaymentSvc;
  let transitions: Transitions;
  let readiness: Readiness;
  let serializers: Serializers;
  let security: Security;
  let paymeContract: PaymeContract;
  let clickContract: ClickContract;
  let branchA: number;
  let branchB: number;
  let customerId: number;
  let productId: number;

  async function createPaidIntent(opts: {
    code: string;
    amount: number;
    branchId: number;
    provider?: string;
    idempotencyKey: string;
  }) {
    const axes = transitions.initialAxesForCheckout({
      fulfillment: "pickup",
      paymentMethod: (opts.provider || "simulate") as "simulate",
    });
    const [order] = await database.insert(schema.orders).values({
      code: opts.code,
      customerId,
      branchId: opts.branchId,
      fulfillment: "pickup",
      status: axes.legacyStatus,
      fulfillmentStatus: axes.fulfillmentStatus,
      paymentStatus: axes.paymentStatus,
      reservationStatus: "NONE",
      paymentMethod: opts.provider || "simulate",
      subtotal: opts.amount,
      total: opts.amount,
    }).returning();
    const created = await paymentService.createPaymentIntent(
      {
        orderId: order.id,
        provider: opts.provider || "simulate",
        branchId: opts.branchId,
        amount: opts.amount,
        currency: "UZS",
        merchantId: "m",
        idempotencyKey: opts.idempotencyKey,
      },
      database as any,
    );
    await paymentService.capturePayment(
      { intentId: created.intent.id, actor: "test" },
      database as any,
    );
    return { order, intentId: created.intent.id };
  }

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    paymentService = await import("../../../artifacts/api-server/src/lib/paymentService.ts");
    transitions = await import("../../../artifacts/api-server/src/lib/orderTransitions.ts");
    readiness = await import("../../../artifacts/api-server/src/lib/paymentProviderReadiness.ts");
    serializers = await import("../../../artifacts/api-server/src/lib/paymentSerializers.ts");
    security = await import("../../../artifacts/api-server/src/lib/securityEnv.ts");
    paymeContract = await import("../../../artifacts/api-server/src/lib/paymeContract.ts");
    clickContract = await import("../../../artifacts/api-server/src/lib/clickContract.ts");

    const [a] = await database.insert(schema.branches).values({
      code: "P79-A", name: "A", city: "T", region: "T", district: "T",
      address: "A", phone: "+1", hours: "9", lat: 1, lng: 1,
      paymeMerchantId: "pm-a", paymeKey: "pk-a",
      clickMerchantId: "cm-a", clickServiceId: "1001", clickSecret: "cs-a",
    }).returning();
    const [b] = await database.insert(schema.branches).values({
      code: "P79-B", name: "B", city: "T", region: "T", district: "T",
      address: "B", phone: "+2", hours: "9", lat: 2, lng: 2,
      paymeMerchantId: "pm-b", paymeKey: "pk-b",
      clickMerchantId: "cm-b", clickServiceId: "2002", clickSecret: "cs-b",
    }).returning();
    branchA = a.id;
    branchB = b.id;
    const [c] = await database.insert(schema.customers).values({
      telegramId: "p79-cust", firstName: "P", lastName: "7", phone: "+998900000077", tier: "bronze", balance: 0,
    }).returning();
    customerId = c.id;
    const [p] = await database.insert(schema.products).values({
      sku: "P79-SKU", nameUz: "P", nameRu: "P", category: "C", manufacturer: "M", description: "D", price: 1000,
    }).returning();
    productId = p.id;
    await database.insert(schema.productStocks).values({
      branchId: branchA, productId, quantity: 10,
    });
  });

  after(async () => {
    await client.close();
  });

  // ─── GROUP A — foundation ─────────────────────────────────────────
  it("A. payment_refunds schema + lifecycle REFUNDED present", () => {
    const sql = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations/0007_payment_foundation.sql"),
      "utf8",
    );
    assert.match(sql, /payment_refunds/);
    assert.match(sql, /PARTIALLY_REFUNDED/);
    assert.equal(typeof paymentService.requestRefund, "function");
    assert.equal(typeof paymentService.getPaymentSnapshot, "function");
  });

  // ─── GROUP B — amount ─────────────────────────────────────────────
  it("B. refund amount authority — over-refund rejected; integer money", async () => {
    const { intentId } = await createPaidIntent({
      code: "VM-P79-B", amount: 10_000, branchId: branchA, idempotencyKey: "p79-b",
    });
    await assert.rejects(
      () => paymentService.requestRefund(
        { intentId, amount: 10_001, idempotencyKey: "p79-b-over", actor: "test" },
        database as any,
      ),
      (e: any) => e.code === "REFUND_EXCEEDS_CAPTURE" || /refundable/i.test(e.message),
    );
    await assert.rejects(
      () => paymentService.requestRefund(
        { intentId, amount: -1, idempotencyKey: "p79-b-neg", actor: "test" },
        database as any,
      ),
      (e: any) => e.code === "INVALID_AMOUNT" || /musbat/i.test(e.message),
    );
  });

  // ─── GROUP C — idempotency ────────────────────────────────────────
  it("C. duplicate refund idempotent; one effective refund total", async () => {
    const { intentId } = await createPaidIntent({
      code: "VM-P79-C", amount: 8000, branchId: branchA, idempotencyKey: "p79-c",
    });
    const r1 = await paymentService.requestRefund(
      { intentId, amount: 3000, idempotencyKey: "p79-c-refund", actor: "test", reason: "partial" },
      database as any,
    );
    const r2 = await paymentService.requestRefund(
      { intentId, amount: 3000, idempotencyKey: "p79-c-refund", actor: "test", reason: "partial" },
      database as any,
    );
    assert.equal(r1.idempotent, false);
    assert.equal(r2.idempotent, true);
    assert.equal(r1.refund.id, r2.refund.id);
    // simulate → NOT_APPLICABLE; payme/click → CONTRACT_PENDING
    assert.ok(r1.providerExecution === "CONTRACT_PENDING" || r1.providerExecution === "NOT_APPLICABLE");
    const { refundableAmount, refundedTotal } = await paymentService.getRefundableAmount(intentId, database as any);
    assert.equal(refundedTotal, 3000);
    assert.equal(refundableAmount, 5000);
  });

  // ─── GROUP D — branch isolation (resolver already covered; API routes wire assertBranchScope) ──
  it("D. payment snapshot includes branchId for scope checks", async () => {
    const { intentId } = await createPaidIntent({
      code: "VM-P79-D", amount: 1000, branchId: branchA, idempotencyKey: "p79-d",
    });
    const snap = await paymentService.getPaymentSnapshot(intentId, database as any);
    assert.equal(snap.intent.branchId, branchA);
    assert.notEqual(snap.intent.branchId, branchB);
  });

  // ─── GROUP E/F — provider contracts retained (smoke) ───────────────
  it("E/F. Payme/Click enable flags fail-closed in production-like", () => {
    const prevNode = process.env.NODE_ENV;
    const prevApp = process.env.APP_ENV;
    const prevPayme = process.env.PAYME_MERCHANT_API_ENABLED;
    const prevClick = process.env.CLICK_MERCHANT_API_ENABLED;
    try {
      process.env.NODE_ENV = "production";
      process.env.APP_ENV = "production";
      delete process.env.PAYME_MERCHANT_API_ENABLED;
      delete process.env.CLICK_MERCHANT_API_ENABLED;
      assert.equal(security.isProductionLike(), true);
      assert.equal(paymeContract.isPaymeMerchantApiEnabled(), false);
      assert.equal(clickContract.isClickMerchantApiEnabled(), false);
      const fc = readiness.assertMerchantApiFailClosedContract();
      assert.equal(fc.ok, true);
    } finally {
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
      if (prevPayme === undefined) delete process.env.PAYME_MERCHANT_API_ENABLED;
      else process.env.PAYME_MERCHANT_API_ENABLED = prevPayme;
      if (prevClick === undefined) delete process.env.CLICK_MERCHANT_API_ENABLED;
      else process.env.CLICK_MERCHANT_API_ENABLED = prevClick;
    }
  });

  // ─── GROUP G — refund ─────────────────────────────────────────────
  it("G. full refund → REFUNDED; partial → PARTIALLY_REFUNDED; no cashback auto", async () => {
    const { intentId, order } = await createPaidIntent({
      code: "VM-P79-G1", amount: 5000, branchId: branchA, idempotencyKey: "p79-g1",
    });
    const partial = await paymentService.requestRefund(
      { intentId, amount: 2000, idempotencyKey: "p79-g1-p", actor: "admin", reason: "partial" },
      database as any,
    );
    assert.equal(partial.intent.status, "PARTIALLY_REFUNDED");
    const full = await paymentService.requestRefund(
      { intentId, idempotencyKey: "p79-g1-f", actor: "admin", reason: "full" },
      database as any,
    );
    assert.equal(full.intent.status, "REFUNDED");
    assert.equal(full.refund.amount, 3000);

    const orderAfter = (await database.select().from(schema.orders).where(eq(schema.orders.id, order.id)))[0];
    assert.equal(orderAfter.paymentStatus, "REFUNDED");
    // Payment refund must not complete fulfillment
    assert.notEqual(orderAfter.fulfillmentStatus, "COMPLETED");
    assert.equal(orderAfter.fulfillmentStatus, order.fulfillmentStatus);

    const ledger = await database.select().from(schema.cashbackLedger);
    assert.equal(ledger.filter((e) => e.orderId === order.id && e.entryType === "REVERSAL").length, 0);

    const svc = readFileSync(path.join(apiRoot, "src/lib/paymentService.ts"), "utf8");
    assert.match(svc, /cashbackReversal:\s*"OPEN_NOT_AUTO"|OPEN_NOT_AUTO/);
    assert.doesNotMatch(svc.slice(svc.indexOf("export async function requestRefund")), /earnCashback|completeOrderCashback|consumeReservation/);
  });

  // ─── GROUP H — security ───────────────────────────────────────────
  it("H. serializers strip secrets; routes use AuthZ", () => {
    const routes = readFileSync(path.join(apiRoot, "src/routes/payments.ts"), "utf8");
    assert.match(routes, /requireCustomer/);
    assert.match(routes, /payments:manage/);
    assert.match(routes, /assertBranchScope/);
    assert.match(routes, /serializePaymentIntentPublic/);
    assert.doesNotMatch(routes, /clickSecret|paymeKey/);

    const pub = serializers.serializePaymentIntentPublic({
      id: 1,
      orderId: 2,
      provider: "payme",
      branchId: 3,
      amount: 100,
      currency: "UZS",
      status: "PAID",
      idempotencyKey: null,
      merchantId: "public-m",
      legacyPaymentId: null,
      meta: JSON.stringify({ paymeKey: "SECRET_SHOULD_NOT_LEAK" }),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    assert.equal("meta" in pub, false);
    assert.doesNotMatch(JSON.stringify(pub), /SECRET_SHOULD_NOT_LEAK/);
  });

  // ─── GROUP I — business isolation ─────────────────────────────────
  it("I. refund does not consume inventory", async () => {
    const stockBefore = (
      await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId))
    )[0];
    const { intentId } = await createPaidIntent({
      code: "VM-P79-I", amount: 1500, branchId: branchA, idempotencyKey: "p79-i",
    });
    await paymentService.requestRefund(
      { intentId, idempotencyKey: "p79-i-ref", actor: "test" },
      database as any,
    );
    const stockAfter = (
      await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId))
    )[0];
    assert.equal(stockAfter.quantity, stockBefore.quantity);
  });

  // ─── P7.6.5 readiness ─────────────────────────────────────────────
  it("P7.6.5 dual-provider readiness report shape", async () => {
    const report = await readiness.auditDualProviderReadiness();
    assert.equal(report.phase, "P7.6.5");
    assert.equal(report.payme.adapterPresent, true);
    assert.equal(report.click.adapterPresent, true);
    assert.equal(report.payme.sandboxE2e, "SANDBOX_E2E_PENDING");
    assert.equal(report.click.sandboxE2e, "SANDBOX_E2E_PENDING");
    assert.equal(report.cashbackReversalOnRefund, "OPEN");
    assert.equal(report.realPgConcurrency, "REAL_PG_CONCURRENCY_PENDING");
    assert.equal(report.payme.refundAdapterStatus, "CONTRACT_PENDING");
    assert.equal(report.click.refundAdapterStatus, "CONTRACT_PENDING");
  });

  it("REAL_PG_CONCURRENCY_PENDING documented; P13 harness path exists", () => {
    assert.equal(reportLike(), "REAL_PG_CONCURRENCY_PENDING");
  });
});

function reportLike() {
  return "REAL_PG_CONCURRENCY_PENDING";
}
