import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

type Transitions = typeof import("../../../artifacts/api-server/src/lib/orderTransitions");
type Inventory = typeof import("../../../artifacts/api-server/src/lib/inventory");

describe("P5.5–P5.7 staff paths + full order matrix", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let transitions: Transitions;
  let inventory: Inventory;
  let branchId: number;
  let customerId: number;
  let productId: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    transitions = await import("../../../artifacts/api-server/src/lib/orderTransitions.ts");
    inventory = await import("../../../artifacts/api-server/src/lib/inventory.ts");

    await database.insert(schema.branches).values({
      code: "P57-B", name: "B", city: "T", region: "T", district: "T",
      address: "A", phone: "+998", hours: "9-18", lat: 1, lng: 1,
    });
    await database.insert(schema.customers).values({
      telegramId: "p57-c", firstName: "P", lastName: "5", phone: "+998901110057", tier: "bronze", balance: 0,
    });
    await database.insert(schema.products).values({
      sku: "P57-SKU", nameUz: "P", nameRu: "P", category: "C", manufacturer: "M", description: "D", price: 1000,
    });
    branchId = (await database.select().from(schema.branches).where(eq(schema.branches.code, "P57-B")))[0].id;
    customerId = (await database.select().from(schema.customers).where(eq(schema.customers.telegramId, "p57-c")))[0].id;
    productId = (await database.select().from(schema.products).where(eq(schema.products.sku, "P57-SKU")))[0].id;
    await database.insert(schema.productStocks).values({ productId, branchId, quantity: 50 });
  });

  after(async () => {
    await client.close();
  });

  async function seedOrder(key: string, fulfillment: "pickup" | "delivery") {
    const axes = transitions.initialAxesForCheckout({ fulfillment, paymentMethod: "pay_at_branch" });
    const reserved = await inventory.reserveStock(
      {
        branchId,
        customerId,
        items: [{ productId, quantity: 1 }],
        idempotencyKey: key,
      },
      database as any,
    );
    const [order] = await database.insert(schema.orders).values({
      code: `VM-${key}`,
      customerId,
      branchId,
      fulfillment,
      status: axes.legacyStatus,
      fulfillmentStatus: axes.fulfillmentStatus,
      paymentStatus: axes.paymentStatus,
      reservationStatus: axes.reservationStatus,
      checkoutIdempotencyKey: key,
      paymentMethod: "pay_at_branch",
      subtotal: 1000,
      total: 1000,
      reservationId: reserved.reservation.id,
    }).returning();
    await inventory.bindReservationOrder(reserved.reservation.id, order.id, database as any);
    return order;
  }

  it("1–3 create reserves; payment independent", async () => {
    const before = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    const order = await seedOrder("p57-create", "pickup");
    assert.equal(order.fulfillmentStatus, "CONFIRMED");
    assert.equal(order.reservationStatus, "ACTIVE");
    const mid = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(mid.physicalQuantity, before.physicalQuantity);
    assert.equal(mid.reservedQuantity, before.reservedQuantity + 1);

    const paid = await transitions.markOrderPaymentPaid(order.id, { actor: "pay" }, database as any);
    assert.equal(paid.order.paymentStatus, "PAID");
    assert.equal(paid.order.fulfillmentStatus, "CONFIRMED");
    const afterPay = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(afterPay.physicalQuantity, mid.physicalQuantity);
    assert.equal(afterPay.reservedQuantity, mid.reservedQuantity);
  });

  it("4–8 pickup path: PREPARING → READY → COMPLETE; delivery: PREPARING → OUT → COMPLETE", async () => {
    const pickup = await seedOrder("p57-pickup", "pickup");
    await transitions.applyOrderTransition(
      { orderId: pickup.id, toFulfillment: "PREPARING", actor: "s", actorType: "staff" },
      database as any,
    );
    await transitions.applyOrderTransition(
      { orderId: pickup.id, toFulfillment: "READY_FOR_PICKUP", actor: "s", actorType: "staff" },
      database as any,
    );
    const done = await transitions.applyOrderTransition(
      { orderId: pickup.id, toFulfillment: "COMPLETED", actor: "s", actorType: "staff", inventory: "consume" },
      database as any,
    );
    assert.equal(done.order.fulfillmentStatus, "COMPLETED");
    assert.equal(done.order.status, "completed");
    assert.equal(done.order.reservationStatus, "FULFILLED");

    const delivery = await seedOrder("p57-del", "delivery");
    await transitions.applyOrderTransition(
      { orderId: delivery.id, toFulfillment: "PREPARING", actor: "s", actorType: "staff" },
      database as any,
    );
    await transitions.applyOrderTransition(
      { orderId: delivery.id, toFulfillment: "OUT_FOR_DELIVERY", actor: "s", actorType: "staff" },
      database as any,
    );
    const dDone = await transitions.applyOrderTransition(
      { orderId: delivery.id, toFulfillment: "COMPLETED", actor: "s", actorType: "staff", inventory: "consume" },
      database as any,
    );
    assert.equal(dDone.order.fulfillmentStatus, "COMPLETED");
  });

  it("9 invalid pickup/delivery channel transitions", async () => {
    const pickup = await seedOrder("p57-bad-p", "pickup");
    await transitions.applyOrderTransition(
      { orderId: pickup.id, toFulfillment: "PREPARING", actor: "s", actorType: "staff" },
      database as any,
    );
    await assert.rejects(
      () => transitions.applyOrderTransition(
        { orderId: pickup.id, toFulfillment: "OUT_FOR_DELIVERY", actor: "s", actorType: "staff" },
        database as any,
      ),
      (err: { code?: string }) => err.code === "INVALID_TRANSITION",
    );

    const delivery = await seedOrder("p57-bad-d", "delivery");
    await transitions.applyOrderTransition(
      { orderId: delivery.id, toFulfillment: "PREPARING", actor: "s", actorType: "staff" },
      database as any,
    );
    await assert.rejects(
      () => transitions.applyOrderTransition(
        { orderId: delivery.id, toFulfillment: "READY_FOR_PICKUP", actor: "s", actorType: "staff" },
        database as any,
      ),
      (err: { code?: string }) => err.code === "INVALID_TRANSITION",
    );

    // READY_FOR_PICKUP → OUT_FOR_DELIVERY is channel-invalid (never allowed)
    const pickup2 = await seedOrder("p57-ready-out", "pickup");
    await transitions.applyOrderTransition(
      { orderId: pickup2.id, toFulfillment: "PREPARING", actor: "s", actorType: "staff" },
      database as any,
    );
    await transitions.applyOrderTransition(
      { orderId: pickup2.id, toFulfillment: "READY_FOR_PICKUP", actor: "s", actorType: "staff" },
      database as any,
    );
    await assert.rejects(
      () => transitions.applyOrderTransition(
        { orderId: pickup2.id, toFulfillment: "OUT_FOR_DELIVERY", actor: "s", actorType: "staff" },
        database as any,
      ),
      (err: { code?: string }) => err.code === "INVALID_TRANSITION",
    );
  });

  it("13–15 idempotent repeat; cancelled/completed terminal", async () => {
    const order = await seedOrder("p57-idem", "pickup");
    const a = await transitions.applyOrderTransition(
      { orderId: order.id, toFulfillment: "PREPARING", actor: "s", actorType: "staff" },
      database as any,
    );
    const b = await transitions.applyOrderTransition(
      { orderId: order.id, toFulfillment: "PREPARING", actor: "s", actorType: "staff" },
      database as any,
    );
    assert.equal(a.changed, true);
    assert.equal(b.idempotent, true);

    await transitions.applyOrderTransition(
      { orderId: order.id, toFulfillment: "CANCELLED", actor: "c", actorType: "customer", customerId, inventory: "release" },
      database as any,
    );
    await assert.rejects(
      () => transitions.applyOrderTransition(
        { orderId: order.id, toFulfillment: "PREPARING", actor: "s", actorType: "staff" },
        database as any,
      ),
      (err: { code?: string }) => err.code === "TERMINAL_STATE",
    );

    const done = await seedOrder("p57-term", "pickup");
    await transitions.applyOrderTransition(
      { orderId: done.id, toFulfillment: "COMPLETED", actor: "s", actorType: "staff", inventory: "consume" },
      database as any,
    );
    const again = await transitions.applyOrderTransition(
      { orderId: done.id, toFulfillment: "COMPLETED", actor: "s", actorType: "staff", inventory: "consume" },
      database as any,
    );
    assert.equal(again.idempotent, true);
  });

  it("16–18 payment fail path does not consume; complete/cancel inventory once", async () => {
    const order = await seedOrder("p57-failpay", "pickup");
    const before = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    await transitions.applyOrderTransition(
      { orderId: order.id, toPayment: "FAILED", actor: "pay", actorType: "system" },
      database as any,
    );
    const afterFail = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(afterFail.physicalQuantity, before.physicalQuantity);
    assert.equal(afterFail.reservedQuantity, before.reservedQuantity);

    const toComplete = await seedOrder("p57-once-c", "pickup");
    const b2 = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    await transitions.applyOrderTransition(
      { orderId: toComplete.id, toFulfillment: "COMPLETED", actor: "s", actorType: "staff", inventory: "consume" },
      database as any,
    );
    await transitions.applyOrderTransition(
      { orderId: toComplete.id, toFulfillment: "COMPLETED", actor: "s", actorType: "staff", inventory: "consume" },
      database as any,
    );
    const a2 = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(a2.physicalQuantity, b2.physicalQuantity - 1);
    assert.equal(a2.reservedQuantity, b2.reservedQuantity - 1);

    const toCancel = await seedOrder("p57-once-r", "pickup");
    const b3 = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    await transitions.applyOrderTransition(
      { orderId: toCancel.id, toFulfillment: "CANCELLED", actor: "c", actorType: "customer", customerId, inventory: "release" },
      database as any,
    );
    await transitions.applyOrderTransition(
      { orderId: toCancel.id, toFulfillment: "CANCELLED", actor: "c", actorType: "customer", customerId, inventory: "release" },
      database as any,
    );
    const a3 = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(a3.reservedQuantity, b3.reservedQuantity - 1);
    assert.equal(a3.physicalQuantity, b3.physicalQuantity);
  });

  it("19 legacy status stays synchronized with axes", async () => {
    const order = await seedOrder("p57-legacy", "delivery");
    const prep = await transitions.applyOrderTransition(
      { orderId: order.id, toFulfillment: "PREPARING", actor: "s", actorType: "staff" },
      database as any,
    );
    assert.equal(prep.order.status, "awaiting_delivery");
    const out = await transitions.applyOrderTransition(
      { orderId: order.id, toFulfillment: "OUT_FOR_DELIVERY", actor: "s", actorType: "staff" },
      database as any,
    );
    assert.equal(out.order.status, "awaiting_delivery");
    const done = await transitions.applyOrderTransition(
      { orderId: order.id, toFulfillment: "COMPLETED", actor: "s", actorType: "staff", inventory: "consume" },
      database as any,
    );
    assert.equal(done.order.status, "completed");
  });

  it("22–23 sequential contention does not oversell / double mutate", async () => {
    const order = await seedOrder("p57-race", "pickup");
    const first = await transitions.applyOrderTransition(
      { orderId: order.id, toFulfillment: "COMPLETED", actor: "a", actorType: "staff", inventory: "consume" },
      database as any,
    );
    const second = await transitions.applyOrderTransition(
      { orderId: order.id, toFulfillment: "COMPLETED", actor: "b", actorType: "staff", inventory: "consume" },
      database as any,
    );
    assert.equal(first.changed, true);
    assert.equal(second.idempotent, true);
    assert.equal(second.order.reservationStatus, "FULFILLED");
  });
});
