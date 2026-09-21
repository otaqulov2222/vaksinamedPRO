import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../artifacts/api-server");

describe("P4.9 integration regression (service + source contracts)", () => {
  let client: PGlite;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let inv: typeof import("../../../artifacts/api-server/src/lib/inventory");
  let branchId: number;
  let productId: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    database = drizzle(client, { schema });
    await applyMigrations(database, "pglite", getMigrationsFolder());
    inv = await import("../../../artifacts/api-server/src/lib/inventory.ts");

    await database.insert(schema.branches).values({
      code: "VM-P49",
      name: "P49",
      city: "T",
      region: "T",
      district: "T",
      address: "A",
      phone: "+998",
      hours: "9-18",
      lat: 1,
      lng: 1,
    });
    await database.insert(schema.products).values({
      sku: "P49-A", nameUz: "A", nameRu: "A", category: "C", manufacturer: "M", description: "D", price: 1000,
    });
    const branch = (await database.select().from(schema.branches).where(eq(schema.branches.code, "VM-P49")))[0];
    const product = (await database.select().from(schema.products).where(eq(schema.products.sku, "P49-A")))[0];
    branchId = branch.id;
    productId = product.id;
    await database.insert(schema.productStocks).values({ productId, branchId, quantity: 20 });
  });

  after(async () => {
    await client.close();
  });

  it("unpaid / create path reserves without consuming physical", async () => {
    const before = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    const reserved = await inv.reserveStock(
      { branchId, items: [{ productId, quantity: 3 }], idempotencyKey: "p49-unpaid" },
      database as any,
    );
    const after = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(reserved.reservation.status, "ACTIVE");
    assert.equal(after.physicalQuantity, before.physicalQuantity);
    assert.equal(after.reservedQuantity, before.reservedQuantity + 3);
  });

  it("cancellation releases; fulfillment consumes", async () => {
    const cancelRes = await inv.reserveStock(
      { branchId, items: [{ productId, quantity: 2 }], idempotencyKey: "p49-cancel" },
      database as any,
    );
    const beforeCancel = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    await inv.releaseReservation(cancelRes.reservation.id, { actor: "cancel" }, database as any);
    const afterCancel = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(afterCancel.reservedQuantity, beforeCancel.reservedQuantity - 2);
    assert.equal(afterCancel.physicalQuantity, beforeCancel.physicalQuantity);

    const fulfillRes = await inv.reserveStock(
      { branchId, items: [{ productId, quantity: 2 }], idempotencyKey: "p49-fulfill" },
      database as any,
    );
    const beforeF = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    await inv.consumeReservation(fulfillRes.reservation.id, { actor: "fulfill" }, database as any);
    const afterF = (await database.select().from(schema.productStocks).where(eq(schema.productStocks.productId, productId)))[0];
    assert.equal(afterF.physicalQuantity, beforeF.physicalQuantity - 2);
    assert.equal(afterF.reservedQuantity, beforeF.reservedQuantity - 2);
  });

  it("retry does not double reserve or double consume", async () => {
    const first = await inv.reserveStock(
      { branchId, items: [{ productId, quantity: 1 }], idempotencyKey: "p49-retry" },
      database as any,
    );
    const second = await inv.reserveStock(
      { branchId, items: [{ productId, quantity: 1 }], idempotencyKey: "p49-retry" },
      database as any,
    );
    assert.equal(second.idempotent, true);
    assert.equal(second.reservation.id, first.reservation.id);

    assert.equal((await inv.consumeReservation(first.reservation.id, {}, database as any)).consumed, true);
    assert.equal((await inv.consumeReservation(first.reservation.id, {}, database as any)).consumed, false);
  });

  it("FOM bridge source does not mutate inventory tables", () => {
    const fomBridge = readFileSync(path.join(apiRoot, "src/lib/fomBridge.ts"), "utf8");
    const fom = readFileSync(path.join(apiRoot, "src/lib/fom.ts"), "utf8");
    const integrations = readFileSync(path.join(apiRoot, "src/routes/integrations.ts"), "utf8");
    for (const src of [fomBridge, fom, integrations]) {
      assert.doesNotMatch(src, /productStocks|product_stocks|adjustStock|reserveStock|consumeReservation|physical_quantity/);
    }
    assert.match(fom, /confirmFomSale/);
    assert.match(fomBridge, /processFomSale/);
  });

  it("payment mark-paid path does not consume inventory", () => {
    const paymentsLib = readFileSync(path.join(apiRoot, "src/lib/payments.ts"), "utf8");
    const paymentsRoute = readFileSync(path.join(apiRoot, "src/routes/payments.ts"), "utf8");
    assert.doesNotMatch(paymentsLib, /consumeReservation|productStocks|physical_quantity/);
    assert.match(paymentsRoute, /markPaymentPaid/);
    // delivery completion may consume — payment simulate must not
    const simulateBlock = paymentsRoute.slice(
      paymentsRoute.indexOf("simulate-success"),
      paymentsRoute.indexOf("payme/webhook"),
    );
    assert.doesNotMatch(simulateBlock, /consumeReservation/);
  });

  it("checkout creates reservation; confirm-pos/delivery consume; cancel releases", () => {
    const orders = readFileSync(path.join(apiRoot, "src/routes/orders.ts"), "utf8");
    const deliverySvc = readFileSync(path.join(apiRoot, "src/lib/deliveryService.ts"), "utf8");
    assert.match(orders, /reserveStock/);
    assert.match(orders, /applyOrderTransition/);
    assert.match(orders, /inventory:\s*"release"/);
    assert.match(orders, /inventory:\s*"consume"/);
    assert.match(deliverySvc, /inventory:\s*"consume"/);
    assert.match(deliverySvc, /toStatus === \"delivered\"/);
  });

  it("admin adjust requires inventory:adjust + branch scope; customer routes have no adjust", () => {
    const admin = readFileSync(path.join(apiRoot, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/inventory\/adjust/);
    assert.match(admin, /inventory:adjust/);
    assert.match(admin, /assertBranchScope/);
    assert.match(admin, /adjustStock/);
    assert.match(admin, /expireDueReservations/);

    const customerish = [
      readFileSync(path.join(apiRoot, "src/routes/catalog.ts"), "utf8"),
      readFileSync(path.join(apiRoot, "src/routes/cart.ts"), "utf8"),
      readFileSync(path.join(apiRoot, "src/routes/loyalty.ts"), "utf8"),
    ].join("\n");
    assert.doesNotMatch(customerish, /adjustStock|inventory:adjust|\/admin\/inventory/);
  });

  it("migration seeds inventory:adjust for super_admin only", () => {
    const sql = readFileSync(path.join(getMigrationsFolder(), "0004_inventory_adjust_permission.sql"), "utf8");
    assert.match(sql, /inventory:adjust/);
    assert.match(sql, /super_admin/);
    assert.doesNotMatch(sql, /WHERE r\.code = 'cashier'/);
  });

  it("permission inventory:adjust present after migrate; cashier role lacks it", async () => {
    const perms = await database.select().from(schema.authPermissions);
    assert.ok(perms.some((p) => p.code === "inventory:adjust"));
    const roles = await database.select().from(schema.authRoles);
    const cashier = roles.find((r) => r.code === "cashier");
    const hq = roles.find((r) => r.code === "super_admin");
    assert.ok(cashier && hq);
    const links = await database.select().from(schema.authRolePermissions);
    const adjust = perms.find((p) => p.code === "inventory:adjust")!;
    assert.ok(links.some((l) => l.roleId === hq!.id && l.permissionId === adjust.id));
    assert.ok(!links.some((l) => l.roleId === cashier!.id && l.permissionId === adjust.id));
  });
});
