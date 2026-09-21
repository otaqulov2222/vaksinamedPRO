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

describe("P5.2–P5.4 order transitions + inventory", () => {
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
      code: "P5-T", name: "T", city: "T", region: "T", district: "T",
      address: "A", phone: "+998", hours: "9-18", lat: 1, lng: 1,
    });
    await database.insert(schema.customers).values({
      telegramId: "p5-transitions-customer",
      firstName: "P5",
      lastName: "T",
      phone: "+998900000055",
      tier: "bronze",
      balance: 0,
    });
    await database.insert(schema.products).values({
      sku: "P5-SKU", nameUz: "P", nameRu: "P", category: "C", manufacturer: "M", description: "D", price: 1000,
    });
    branchId = (await database.select().from(schema.branches).where(eq(schema.branches.code, "P5-T")))[0].id;
    customerId = (await database.select().from(schema.customers).where(eq(schema.customers.telegramId, "p5-transitions-customer")))[0].id;
    productId = (await database.select().from(schema.products).where(eq(schema.products.sku, "P5-SKU")))[0].id;
    await database.insert(schema.productStocks).values({ productId, branchId, quantity: 20 });
  });

  after(async () => {
    await client.close();
  });

  async function createReservedOrder(key: string, fulfillment: "pickup" | "delivery" = "pickup") {
    const axes = transitions.initialAxesForCheckout({ fulfillment, paymentMethod: "pay_at_branch" });
    const reserved = await inventory.reserveStock(
      {
        branchId,
        customerId,
        items: [{ productId, quantity: 2 }],
        idempotencyKey: key,
        expiresAt: new Date(Date.now() + 3600_000),
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
      subtotal: 2000,
      total: 2000,
      reservationId: reserved.reservation.id,
    }).returning();
    await inventory.bindReservationOrder(reserved.reservation.id, order.id, database as any);
    return order;
  }

  it("valid transitions and legacy dual-write", async () => {
    const order = await createReservedOrder("tr-valid");
    const done = await transitions.applyOrderTransition(
      {
        orderId: order.id,
        toFulfillment: "COMPLETED",
        actor: "staff:t",
        actorType: "staff",
        inventory: "consume",
        reason: "confirm_pos",
      },
      database as any,
    );
    assert.equal(done.order.fulfillmentStatus, "COMPLETED");
    assert.equal(done.order.status, "completed");
    assert.equal(done.order.reservationStatus, "FULFILLED");
  });

  it("invalid transitions rejected; cancelled cannot complete; completed cannot cancel", async () => {
    const order = await createReservedOrder("tr-inv");
    await assert.rejects(
      () => transitions.applyOrderTransition(
        {
          orderId: order.id,
          toFulfillment: "READY_FOR_PICKUP",
          actor: "s",
          actorType: "staff",
        },
        database as any,
      ),
      (err: { code?: string }) => err.code === "INVALID_TRANSITION",
    );

    await transitions.applyOrderTransition(
      {
        orderId: order.id,
        toFulfillment: "CANCELLED",
        actor: "c",
        actorType: "customer",
        customerId,
        inventory: "release",
      },
      database as any,
    );
    await assert.rejects(
      () => transitions.applyOrderTransition(
        {
          orderId: order.id,
          toFulfillment: "COMPLETED",
          actor: "s",
          actorType: "staff",
          inventory: "consume",
        },
        database as any,
      ),
      (err: { code?: string }) => err.code === "TERMINAL_STATE",
    );

    const order2 = await createReservedOrder("tr-done");
    await transitions.applyOrderTransition(
      {
        orderId: order2.id,
        toFulfillment: "COMPLETED",
        actor: "s",
        actorType: "staff",
        inventory: "consume",
      },
      database as any,
    );
    await assert.rejects(
      () => transitions.applyOrderTransition(
        {
          orderId: order2.id,
          toFulfillment: "CANCELLED",
          actor: "c",
          actorType: "customer",
          customerId,
          inventory: "release",
        },
        database as any,
      ),
      (err: { code?: string }) => err.code === "TERMINAL_STATE",
    );
  });

  it("payment state independent — PAID does not consume", async () => {
    const order = await createReservedOrder("tr-pay");
    const before = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    const paid = await transitions.markOrderPaymentPaid(order.id, { actor: "pay" }, database as any);
    assert.equal(paid.order.paymentStatus, "PAID");
    assert.equal(paid.order.fulfillmentStatus, "CONFIRMED");
    const after = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(after.physicalQuantity, before.physicalQuantity);
    assert.equal(after.reservedQuantity, before.reservedQuantity);
  });

  it("create reserves; cancel releases idempotent; complete consumes idempotent", async () => {
    const before = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    const order = await createReservedOrder("tr-inv-flow");
    const mid = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(mid.physicalQuantity, before.physicalQuantity);
    assert.equal(mid.reservedQuantity, before.reservedQuantity + 2);

    const c1 = await transitions.applyOrderTransition(
      {
        orderId: order.id,
        toFulfillment: "CANCELLED",
        actor: "c",
        actorType: "customer",
        customerId,
        inventory: "release",
      },
      database as any,
    );
    assert.equal(c1.changed, true);
    const c2 = await transitions.applyOrderTransition(
      {
        orderId: order.id,
        toFulfillment: "CANCELLED",
        actor: "c",
        actorType: "customer",
        customerId,
        inventory: "release",
      },
      database as any,
    );
    assert.equal(c2.idempotent, true);
    const afterCancel = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(afterCancel.reservedQuantity, before.reservedQuantity);

    const order2 = await createReservedOrder("tr-inv-complete");
    const beforeC = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    const d1 = await transitions.applyOrderTransition(
      {
        orderId: order2.id,
        toFulfillment: "COMPLETED",
        actor: "s",
        actorType: "staff",
        inventory: "consume",
      },
      database as any,
    );
    assert.equal(d1.changed, true);
    const d2 = await transitions.applyOrderTransition(
      {
        orderId: order2.id,
        toFulfillment: "COMPLETED",
        actor: "s",
        actorType: "staff",
        inventory: "consume",
      },
      database as any,
    );
    assert.equal(d2.idempotent, true);
    const afterC = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(afterC.physicalQuantity, beforeC.physicalQuantity - 2);
    assert.equal(afterC.reservedQuantity, beforeC.reservedQuantity - 2);
  });

  it("checkout axes + multi-item reserve + duplicate checkout key", async () => {
    const axes = transitions.initialAxesForCheckout({ fulfillment: "delivery", paymentMethod: "payme" });
    assert.equal(axes.fulfillmentStatus, "CREATED");
    assert.equal(axes.paymentStatus, "PENDING");
    assert.equal(axes.legacyStatus, "pending_payment");

    await database.insert(schema.products).values({
      sku: "P5-SKU-B", nameUz: "B", nameRu: "B", category: "C", manufacturer: "M", description: "D", price: 500,
    });
    const productB = (await database.select().from(schema.products).where(eq(schema.products.sku, "P5-SKU-B")))[0];
    await database.insert(schema.productStocks).values({ productId: productB.id, branchId, quantity: 5 });

    const reserved = await inventory.reserveStock(
      {
        branchId,
        items: [
          { productId, quantity: 1 },
          { productId: productB.id, quantity: 1 },
        ],
        idempotencyKey: "multi-co",
      },
      database as any,
    );
    assert.equal(reserved.items.length, 2);
    const again = await inventory.reserveStock(
      {
        branchId,
        items: [
          { productId, quantity: 1 },
          { productId: productB.id, quantity: 1 },
        ],
        idempotencyKey: "multi-co",
      },
      database as any,
    );
    assert.equal(again.idempotent, true);
    assert.equal(again.reservation.id, reserved.reservation.id);
  });

  it("deriveLegacyStatus is deterministic", () => {
    assert.equal(
      transitions.deriveLegacyStatus({
        fulfillment: "pickup",
        fulfillmentStatus: "CONFIRMED",
        paymentStatus: "PENDING",
        paymentMethod: "pay_at_branch",
      }),
      "reserved",
    );
    assert.equal(
      transitions.deriveLegacyStatus({
        fulfillment: "delivery",
        fulfillmentStatus: "CONFIRMED",
        paymentStatus: "PAID",
        paymentMethod: "payme",
      }),
      "paid",
    );
    assert.equal(
      transitions.deriveLegacyStatus({
        fulfillment: "pickup",
        fulfillmentStatus: "COMPLETED",
        paymentStatus: "PAID",
        paymentMethod: "pay_at_branch",
      }),
      "completed",
    );
  });
});
