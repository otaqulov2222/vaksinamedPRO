/**
 * P8 + P9 + P10 accelerated batch — source contracts + DB integration.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../artifacts/api-server");

describe("P8–P10 accelerated batch", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let deliveryLifecycle: typeof import("../../../artifacts/api-server/src/lib/deliveryLifecycle");
  let deliveryService: typeof import("../../../artifacts/api-server/src/lib/deliveryService");
  let deliveryAdapters: typeof import("../../../artifacts/api-server/src/lib/deliveryAdapters");
  let fomAdapter: typeof import("../../../artifacts/api-server/src/lib/fomAdapter");
  let fomBridge: typeof import("../../../artifacts/api-server/src/lib/fomBridge");
  let workers: typeof import("../../../artifacts/api-server/src/lib/workers");
  let transitions: typeof import("../../../artifacts/api-server/src/lib/orderTransitions");
  let branchA: number;
  let branchB: number;
  let customerId: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    deliveryLifecycle = await import("../../../artifacts/api-server/src/lib/deliveryLifecycle.ts");
    deliveryService = await import("../../../artifacts/api-server/src/lib/deliveryService.ts");
    deliveryAdapters = await import("../../../artifacts/api-server/src/lib/deliveryAdapters.ts");
    fomAdapter = await import("../../../artifacts/api-server/src/lib/fomAdapter.ts");
    fomBridge = await import("../../../artifacts/api-server/src/lib/fomBridge.ts");
    workers = await import("../../../artifacts/api-server/src/lib/workers.ts");
    transitions = await import("../../../artifacts/api-server/src/lib/orderTransitions.ts");

    const [a] = await database.insert(schema.branches).values({
      code: "P8A", name: "A", city: "T", region: "T", district: "T",
      address: "A", phone: "+1", hours: "9", lat: 1, lng: 1,
    }).returning();
    const [b] = await database.insert(schema.branches).values({
      code: "P8B", name: "B", city: "T", region: "T", district: "T",
      address: "B", phone: "+2", hours: "9", lat: 2, lng: 2,
    }).returning();
    branchA = a.id;
    branchB = b.id;
    const [c] = await database.insert(schema.customers).values({
      telegramId: "p8-cust", firstName: "D", lastName: "L", phone: "+998900000066", tier: "bronze", balance: 0,
    }).returning();
    customerId = c.id;
  });

  after(async () => {
    await client.close();
  });

  async function createDeliveryOrder(code: string, branchId: number) {
    const axes = transitions.initialAxesForCheckout({ fulfillment: "delivery", paymentMethod: "pay_at_branch" });
    const [order] = await database.insert(schema.orders).values({
      code,
      customerId,
      branchId,
      fulfillment: "delivery",
      status: axes.legacyStatus,
      fulfillmentStatus: axes.fulfillmentStatus,
      paymentStatus: "PAID",
      reservationStatus: "NONE",
      paymentMethod: "pay_at_branch",
      subtotal: 10000,
      deliveryFee: 15000,
      total: 25000,
      address: "Tashkent street 12",
    }).returning();
    const [delivery] = await database.insert(schema.deliveries).values({
      orderId: order.id,
      address: order.address,
      status: "pending",
      mode: "internal_courier",
      provider: "internal",
    }).returning();
    return { order, delivery };
  }

  it("P8 migration tables exist", async () => {
    await database.select().from(schema.deliveryStatusHistory).limit(1);
    await database.select().from(schema.fomSaleEvents).limit(1);
    await database.select().from(schema.workerJobs).limit(1);
  });

  it("P8 invalid delivery transition rejected", () => {
    assert.throws(
      () => deliveryLifecycle.assertDeliveryTransition("pending", "delivered"),
      /ruxsat etilmagan|INVALID_DELIVERY/,
    );
  });

  it("P8 assign + status lifecycle; courier branch isolation", async () => {
    const { order } = await createDeliveryOrder("VM-P8-1", branchA);
    await assert.rejects(
      () => deliveryService.assignCourier({
        orderId: order.id,
        courierId: 1,
        courierName: "Courier B",
        courierBranchId: branchB,
        actor: "test",
        expectedOrderBranchId: order.branchId,
      }, database as any),
      (e: any) => e.code === "COURIER_BRANCH_MISMATCH",
    );
    const assigned = await deliveryService.assignCourier({
      orderId: order.id,
      courierId: 9,
      courierName: "Courier A",
      courierBranchId: branchA,
      actor: "test",
      expectedOrderBranchId: order.branchId,
    }, database as any);
    assert.equal(assigned.status, "assigned");

    const out = await deliveryService.transitionDelivery({
      orderId: order.id,
      toStatus: "on_the_way",
      actor: "test",
    }, database as any);
    assert.equal(out.status, "on_the_way");

    const dup = await assert.rejects(
      () => deliveryService.transitionDelivery({
        orderId: order.id,
        toStatus: "assigned",
        actor: "test",
      }, database as any),
    );
    void dup;

    const delivered = await deliveryService.transitionDelivery({
      orderId: order.id,
      toStatus: "delivered",
      actor: "test",
    }, database as any);
    assert.equal(delivered.status, "delivered");
    const orderAfter = (await database.select().from(schema.orders).where(eq(schema.orders.id, order.id)))[0];
    assert.equal(orderAfter.fulfillmentStatus, "COMPLETED");
    // Payment must not be flipped by delivery from already PAID
    assert.equal(orderAfter.paymentStatus, "PAID");
  });

  it("P8 cancelled order cannot become delivered", async () => {
    const { order } = await createDeliveryOrder("VM-P8-2", branchA);
    await database.update(schema.orders).set({ fulfillmentStatus: "CANCELLED" }).where(eq(schema.orders.id, order.id));
    await assert.rejects(
      () => deliveryService.transitionDelivery({
        orderId: order.id,
        toStatus: "delivered",
        actor: "test",
      }, database as any),
      (e: any) => e.code === "ORDER_CANCELLED" || /Bekor/.test(e.message),
    );
  });

  it("P8 external delivery adapter CONTRACT_PENDING", async () => {
    const ext = deliveryAdapters.getDeliveryAdapter("external");
    const r = await ext.createDelivery({ deliveryId: 1, orderId: 1, address: "x" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "CONTRACT_PENDING");
  });

  it("P9 FOM inventory writer remains disabled", () => {
    assert.equal(fomAdapter.FOM_INVENTORY_WRITER_ENABLED, false);
    assert.doesNotThrow(() => fomAdapter.assertFomInventoryWriterDisabled());
    const bridge = readFileSync(path.join(apiRoot, "src/lib/fomBridge.ts"), "utf8");
    assert.doesNotMatch(bridge, /productStocks|adjustStock|physicalQuantity/);
    assert.match(bridge, /assertFomInventoryWriterDisabled/);
  });

  it("P9 FOM receipt required; unknown branch fails safely", async () => {
    await assert.rejects(
      () => fomBridge.processFomSale({ receiptId: "" } as any, database as any),
      (e: any) => e.code === "FOM_RECEIPT_REQUIRED" || /receiptId/.test(e.message),
    );
    await assert.rejects(
      () => fomBridge.processFomSale({
        receiptId: "R-UNKNOWN-BRANCH",
        customerQr: "qr-x",
        amount: 1000,
        branchCode: "no-such-branch-zzz",
      }, database as any),
      (e: any) => e.code === "FOM_BRANCH_REQUIRED" || /branchCode/.test(e.message),
    );
  });

  it("P10 worker enqueue idempotent + notification job", async () => {
    const a = await workers.enqueueJob({
      jobType: workers.JOB_TYPES.NOTIFICATION,
      entityKey: "n1",
      idempotencyKey: "p10-notify-1",
      payload: { channel: "noop" },
    }, database as any);
    const b = await workers.enqueueJob({
      jobType: workers.JOB_TYPES.NOTIFICATION,
      entityKey: "n1",
      idempotencyKey: "p10-notify-1",
      payload: { channel: "noop" },
    }, database as any);
    assert.equal(a.idempotent, false);
    assert.equal(b.idempotent, true);
    assert.equal(a.job.id, b.job.id);

    const run = await workers.runDueWorkerJobs({ limit: 5, workerId: "test" }, database as any);
    assert.ok(run.processed >= 1);
    const job = (await database.select().from(schema.workerJobs).where(eq(schema.workerJobs.id, a.job.id)))[0];
    assert.equal(job.status, "SUCCEEDED");
  });

  it("P9 FOM routes require receiptId (no Date.now invent)", () => {
    const integrations = readFileSync(path.join(apiRoot, "src/routes/integrations.ts"), "utf8");
    assert.doesNotMatch(integrations, /FOM-\$\{Date\.now/);
    assert.match(integrations, /FOM_RECEIPT_REQUIRED|receiptId.*majburiy/);
  });

  it("P10 delivery routes moved off payments.ts", () => {
    const payments = readFileSync(path.join(apiRoot, "src/routes/payments.ts"), "utf8");
    assert.doesNotMatch(payments, /\/deliveries\/:orderId\/status/);
    const deliveries = readFileSync(path.join(apiRoot, "src/routes/deliveries.ts"), "utf8");
    assert.match(deliveries, /\/deliveries\/:orderId\/status/);
    assert.match(deliveries, /assertBranchScope/);
    assert.match(deliveries, /delivery:update/);
  });
});
