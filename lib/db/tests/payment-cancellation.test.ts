import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

type Transitions = typeof import("../../../artifacts/api-server/src/lib/orderTransitions");

describe("Payment Cancellation Lifecycle & Idempotency", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let transitions: Transitions;
  let branchId: number;
  let customerId: number;
  let productId: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    transitions = await import("../../../artifacts/api-server/src/lib/orderTransitions.ts");

    await database.insert(schema.branches).values({
      code: "VM-TEST-PAY",
      name: "Test Branch",
      city: "Toshkent",
      region: "Toshkent shahri",
      district: "Chilonzor",
      address: "Test address",
      phone: "+998712000000",
      hours: "08:00 - 22:00",
      lat: 41.31,
      lng: 69.24,
    });
    await database.insert(schema.customers).values({
      telegramId: "test-cust-pay-cancel",
      firstName: "Test",
      lastName: "User",
      phone: "+998901234500",
      tier: "Gold",
      balance: 0,
    });
    await database.insert(schema.products).values({
      sku: "VM-TEST-MED",
      nameUz: "Dori",
      nameRu: "Lekarstvo",
      category: "Dori",
      manufacturer: "Pharma",
      description: "Test desc",
      price: 42000,
    });

    branchId = (await database.select().from(schema.branches).where(eq(schema.branches.code, "VM-TEST-PAY")))[0].id;
    customerId = (await database.select().from(schema.customers).where(eq(schema.customers.telegramId, "test-cust-pay-cancel")))[0].id;
    productId = (await database.select().from(schema.products).where(eq(schema.products.sku, "VM-TEST-MED")))[0].id;
    await database.insert(schema.productStocks).values({ productId, branchId, quantity: 50 });
  });

  after(async () => {
    await client.close();
  });

  async function createOrderWithPendingPayment(code: string, paymentMethod = "pay_at_branch", legacyStatus = "awaiting_pos") {
    const axes = transitions.initialAxesForCheckout({ fulfillment: "pickup", paymentMethod });
    const [order] = await database.insert(schema.orders).values({
      code,
      customerId,
      branchId,
      fulfillment: "pickup",
      status: axes.legacyStatus,
      fulfillmentStatus: axes.fulfillmentStatus,
      paymentStatus: "PENDING",
      reservationStatus: "NONE",
      checkoutIdempotencyKey: `key-${code}`,
      paymentMethod,
      subtotal: 42000,
      total: 42000,
    }).returning();

    const [intent] = await database.insert(schema.paymentIntents).values({
      orderId: order.id,
      provider: paymentMethod,
      branchId,
      amount: 42000,
      currency: "UZS",
      status: "CREATED",
      idempotencyKey: `intent-${code}`,
    }).returning();

    const [payment] = await database.insert(schema.payments).values({
      orderId: order.id,
      provider: paymentMethod,
      branchId,
      amount: 42000,
      currency: "UZS",
      status: legacyStatus,
      paymentIntentId: intent.id,
      externalId: `intent:${intent.id}`,
    }).returning();

    await database.update(schema.paymentIntents).set({ legacyPaymentId: payment.id }).where(eq(schema.paymentIntents.id, intent.id));
    return { order, intent, payment };
  }

  it("1. Cancelling an order with pending 'awaiting_pos' payment voids payment to 'cancelled' and intent to 'CANCELLED'", async () => {
    const { order, intent, payment } = await createOrderWithPendingPayment("VM-MV4ZFFGT", "pay_at_branch", "awaiting_pos");

    // Pre-condition check
    assert.equal(payment.status, "awaiting_pos");
    assert.equal(intent.status, "CREATED");
    assert.equal(order.paymentStatus, "PENDING");
    assert.equal(order.fulfillmentStatus, "CONFIRMED");

    // Cancel order through transition service
    const result = await transitions.applyOrderTransition(
      {
        orderId: order.id,
        toFulfillment: "CANCELLED",
        actor: "customer:1",
        actorType: "customer",
        customerId,
        reason: "customer_cancel",
        inventory: "release",
      },
      database as any,
    );

    assert.equal(result.order.fulfillmentStatus, "CANCELLED");
    assert.equal(result.order.paymentStatus, "FAILED");
    assert.equal(result.order.status, "cancelled");

    // Verify payments table record is updated to 'cancelled' (not left in 'awaiting_pos')
    const updatedPayment = (await database.select().from(schema.payments).where(eq(schema.payments.id, payment.id)))[0];
    assert.equal(updatedPayment.status, "cancelled");

    // Verify payment_intents table record is updated to 'CANCELLED'
    const updatedIntent = (await database.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intent.id)))[0];
    assert.equal(updatedIntent.status, "CANCELLED");
    const meta = JSON.parse(updatedIntent.meta || "{}");
    assert.equal(meta.cancelReason, "customer_cancel");
  });

  it("2. Cancelling an order with pending online payment voids payment and intent", async () => {
    const { order, intent, payment } = await createOrderWithPendingPayment("VM-MV4SGE3Z", "simulate", "pending");

    assert.equal(payment.status, "pending");
    assert.equal(intent.status, "CREATED");

    const result = await transitions.applyOrderTransition(
      {
        orderId: order.id,
        toFulfillment: "CANCELLED",
        actor: "staff:admin@vaksinamed.uz",
        actorType: "staff",
        reason: "admin_order_cancel",
        inventory: "release",
      },
      database as any,
    );

    assert.equal(result.order.fulfillmentStatus, "CANCELLED");
    assert.equal(result.order.paymentStatus, "FAILED");

    const updatedPayment = (await database.select().from(schema.payments).where(eq(schema.payments.id, payment.id)))[0];
    assert.equal(updatedPayment.status, "cancelled");

    const updatedIntent = (await database.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intent.id)))[0];
    assert.equal(updatedIntent.status, "CANCELLED");
  });

  it("3. Idempotent repeat cancellation is completely safe and no-op", async () => {
    const { order, intent, payment } = await createOrderWithPendingPayment("VM-REPEAT-CANCEL");

    // First cancel
    await transitions.applyOrderTransition(
      {
        orderId: order.id,
        toFulfillment: "CANCELLED",
        actor: "staff:admin",
        actorType: "staff",
        reason: "first_cancel",
      },
      database as any,
    );

    // Second cancel (repeat)
    const repeatResult = await transitions.applyOrderTransition(
      {
        orderId: order.id,
        toFulfillment: "CANCELLED",
        actor: "staff:admin",
        actorType: "staff",
        reason: "second_cancel",
      },
      database as any,
    );

    assert.equal(repeatResult.idempotent, true);
    assert.equal(repeatResult.order.fulfillmentStatus, "CANCELLED");
    assert.equal(repeatResult.order.paymentStatus, "FAILED");

    const checkPayment = (await database.select().from(schema.payments).where(eq(schema.payments.id, payment.id)))[0];
    assert.equal(checkPayment.status, "cancelled");

    const checkIntent = (await database.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intent.id)))[0];
    assert.equal(checkIntent.status, "CANCELLED");
  });

  it("4. PAID payment is NEVER cancelled when an order is cancelled (Requirement 5)", async () => {
    const { order, intent, payment } = await createOrderWithPendingPayment("VM-PAID-CANCEL");

    // Simulate payment completion
    await database.update(schema.paymentIntents).set({ status: "PAID" }).where(eq(schema.paymentIntents.id, intent.id));
    await database.update(schema.payments).set({ status: "paid" }).where(eq(schema.payments.id, payment.id));
    await database.update(schema.orders).set({ paymentStatus: "PAID" }).where(eq(schema.orders.id, order.id));

    // Cancel order
    const result = await transitions.applyOrderTransition(
      {
        orderId: order.id,
        toFulfillment: "CANCELLED",
        actor: "staff:admin",
        actorType: "staff",
        reason: "cancel_after_paid",
      },
      database as any,
    );

    assert.equal(result.order.fulfillmentStatus, "CANCELLED");
    // Payment status on order remains PAID — money was captured!
    assert.equal(result.order.paymentStatus, "PAID");

    // Payment records remain paid (not cancelled)
    const checkPayment = (await database.select().from(schema.payments).where(eq(schema.payments.id, payment.id)))[0];
    assert.equal(checkPayment.status, "paid");

    const checkIntent = (await database.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intent.id)))[0];
    assert.equal(checkIntent.status, "PAID");
  });

  it("5. voidPendingOrderPayments heals orphaned awaiting_pos records on already-cancelled orders", async () => {
    // Recreate staging scenario: order is already CANCELLED, but payment remained awaiting_pos
    const [order] = await database.insert(schema.orders).values({
      code: "VM-STAGING-ORPHAN",
      customerId,
      branchId,
      fulfillment: "pickup",
      status: "cancelled",
      fulfillmentStatus: "CANCELLED",
      paymentStatus: "PENDING",
      reservationStatus: "NONE",
      paymentMethod: "pay_at_branch",
      subtotal: 42000,
      total: 42000,
    }).returning();

    const [intent] = await database.insert(schema.paymentIntents).values({
      orderId: order.id,
      provider: "pay_at_branch",
      branchId,
      amount: 42000,
      currency: "UZS",
      status: "CREATED",
    }).returning();

    const [payment] = await database.insert(schema.payments).values({
      orderId: order.id,
      provider: "pay_at_branch",
      branchId,
      amount: 42000,
      currency: "UZS",
      status: "awaiting_pos",
      paymentIntentId: intent.id,
    }).returning();

    // Call healing function
    const voidResult = await transitions.voidPendingOrderPayments(order.id, {
      actor: "staff:heal",
      reason: "heal_staging_orphans",
    }, database as any);

    assert.equal(voidResult.cancelledIntents, 1);
    assert.equal(voidResult.cancelledLegacyPayments, 1);

    const checkPayment = (await database.select().from(schema.payments).where(eq(schema.payments.id, payment.id)))[0];
    assert.equal(checkPayment.status, "cancelled");

    const checkIntent = (await database.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intent.id)))[0];
    assert.equal(checkIntent.status, "CANCELLED");

    const checkOrder = (await database.select().from(schema.orders).where(eq(schema.orders.id, order.id)))[0];
    assert.equal(checkOrder.paymentStatus, "FAILED");
  });
});
