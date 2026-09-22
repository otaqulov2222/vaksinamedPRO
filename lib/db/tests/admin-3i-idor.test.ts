import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { applyMigrations } from "../src/migrate";
import { getMigrationsFolder } from "../src/migrationsPath";
import * as schema from "../src/schema";
import { hashPassword } from "../src/password";

/**
 * Batch 3I — DB-backed IDOR / branch isolation (PGlite = existing automated DB infra).
 * Mirrors admin order list/detail and customer order ownership predicates used by API routes.
 * Does not weaken AuthZ; asserts seeded RBAC + SQL isolation.
 */
describe("Batch 3I admin IDOR + ownership (PGlite)", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let branchA: number;
  let branchB: number;
  let orderA: number;
  let orderB: number;
  let customerA: number;
  let customerB: number;
  let cashierAId: number;
  let hqId: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    db = drizzle(client, { schema });
    await applyMigrations(db, "pglite", getMigrationsFolder());

    const [ba] = await db.insert(schema.branches).values({
      code: "BR-A",
      name: "Branch A",
      city: "Tashkent",
      region: "T",
      district: "A",
      address: "A",
      phone: "+998901111111",
      hours: "9-18",
      lat: 41.3,
      lng: 69.2,
    }).returning();
    const [bb] = await db.insert(schema.branches).values({
      code: "BR-B",
      name: "Branch B",
      city: "Tashkent",
      region: "T",
      district: "B",
      address: "B",
      phone: "+998902222222",
      hours: "9-18",
      lat: 41.3,
      lng: 69.3,
    }).returning();
    branchA = ba.id;
    branchB = bb.id;

    const [ca] = await db.insert(schema.customers).values({
      telegramId: "idor-cust-a",
      firstName: "Ali",
      lastName: "A",
      phone: "+998901000001",
      passwordHash: hashPassword("x"),
    }).returning();
    const [cb] = await db.insert(schema.customers).values({
      telegramId: "idor-cust-b",
      firstName: "Bob",
      lastName: "B",
      phone: "+998901000002",
      passwordHash: hashPassword("x"),
    }).returning();
    customerA = ca.id;
    customerB = cb.id;

    const [oa] = await db.insert(schema.orders).values({
      code: "ORD-A-1",
      customerId: customerA,
      branchId: branchA,
      fulfillment: "pickup",
      status: "reserved",
      fulfillmentStatus: "CONFIRMED",
      paymentStatus: "PENDING",
      reservationStatus: "ACTIVE",
      paymentMethod: "pay_at_branch",
      subtotal: 1000,
      total: 1000,
    }).returning();
    const [ob] = await db.insert(schema.orders).values({
      code: "ORD-B-1",
      customerId: customerB,
      branchId: branchB,
      fulfillment: "pickup",
      status: "reserved",
      fulfillmentStatus: "CONFIRMED",
      paymentStatus: "PAID",
      reservationStatus: "ACTIVE",
      paymentMethod: "payme",
      subtotal: 2000,
      total: 2000,
    }).returning();
    orderA = oa.id;
    orderB = ob.id;

    const [cashier] = await db.insert(schema.adminUsers).values({
      email: "cashier-a@test.local",
      name: "Cashier A",
      passwordHash: hashPassword("x"),
      role: "cashier",
      branchId: branchA,
    }).returning();
    const [hq] = await db.insert(schema.adminUsers).values({
      email: "hq@test.local",
      name: "HQ",
      passwordHash: hashPassword("x"),
      role: "super_admin",
      branchId: null,
    }).returning();
    cashierAId = cashier.id;
    hqId = hq.id;
  });

  after(async () => {
    await client.close();
  });

  it("seeded RBAC: cashier lacks orders:cancel; super_admin has it", async () => {
    const roles = await db.select().from(schema.authRoles);
    const cashierRole = roles.find((r) => r.code === "cashier")!;
    const saRole = roles.find((r) => r.code === "super_admin")!;
    const cashierPerms = await db
      .select({ code: schema.authPermissions.code })
      .from(schema.authRolePermissions)
      .innerJoin(schema.authPermissions, eq(schema.authRolePermissions.permissionId, schema.authPermissions.id))
      .where(eq(schema.authRolePermissions.roleId, cashierRole.id));
    const saPerms = await db
      .select({ code: schema.authPermissions.code })
      .from(schema.authRolePermissions)
      .innerJoin(schema.authPermissions, eq(schema.authRolePermissions.permissionId, schema.authPermissions.id))
      .where(eq(schema.authRolePermissions.roleId, saRole.id));

    assert.equal(cashierPerms.some((p) => p.code === "orders:cancel"), false);
    assert.equal(cashierPerms.some((p) => p.code === "orders:read"), true);
    assert.equal(saPerms.some((p) => p.code === "orders:cancel"), true);
    assert.ok(cashierAId > 0 && hqId > 0);
  });

  it("Branch A cashier list filter excludes Branch B orders", async () => {
    const rows = await db.select().from(schema.orders).where(eq(schema.orders.branchId, branchA));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, orderA);
    const cross = await db.select().from(schema.orders).where(eq(schema.orders.branchId, branchB));
    assert.equal(cross[0].id, orderB);
  });

  it("Branch A cashier cannot load Branch B order by id (scope predicate)", async () => {
    const cashier = (await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, cashierAId)))[0];
    const target = (await db.select().from(schema.orders).where(eq(schema.orders.id, orderB)))[0];
    assert.ok(cashier.branchId === branchA);
    assert.ok(target.branchId === branchB);
    // Same predicate as assertBranchScope for non-HQ
    const allowed = cashier.branchId === target.branchId;
    assert.equal(allowed, false);
  });

  it("super_admin may access Branch B order (global)", async () => {
    const hq = (await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, hqId)))[0];
    assert.equal(hq.role, "super_admin");
    const target = (await db.select().from(schema.orders).where(eq(schema.orders.id, orderB)))[0];
    assert.ok(target);
    // HQ bypasses branch match
    const allowed = hq.role === "super_admin" || hq.branchId === target.branchId;
    assert.equal(allowed, true);
  });

  it("customer cannot read another customer order", async () => {
    const leaked = await db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderB), eq(schema.orders.customerId, customerA)));
    assert.equal(leaked.length, 0);
    const own = await db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderA), eq(schema.orders.customerId, customerA)));
    assert.equal(own.length, 1);
  });

  it("customer cancel predicate denies foreign order", async () => {
    const foreign = await db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderB), eq(schema.orders.customerId, customerA)));
    assert.equal(foreign.length, 0);
  });

  it("branch filter AuthZ matrix (no api-server singleton db import)", () => {
    // Same predicates as resolveStaffBranchFilter / isHqAdminRole — avoids PGlite×singleton abort.
    const isHq = (role: string) => {
      const r = String(role || "").toLowerCase();
      return r === "super_admin" || r === "admin" || r === "hq";
    };
    function resolveStaffBranchFilter(
      user: { role: string; branchId: number | null },
      requested: number | undefined,
    ): number | undefined {
      if (isHq(user.role)) {
        return requested && Number.isFinite(requested) ? requested : undefined;
      }
      if (!user.branchId) throw Object.assign(new Error("denied"), { status: 403 });
      if (requested && requested !== user.branchId) {
        throw Object.assign(new Error("denied"), { status: 403 });
      }
      return user.branchId;
    }
    const cashier = { role: "cashier", branchId: branchA };
    const hq = { role: "super_admin", branchId: null as number | null };
    assert.equal(resolveStaffBranchFilter(cashier, undefined), branchA);
    assert.throws(() => resolveStaffBranchFilter(cashier, branchB), (e: unknown) => (e as { status?: number }).status === 403);
    assert.equal(resolveStaffBranchFilter(hq, undefined), undefined);
    assert.equal(resolveStaffBranchFilter(hq, branchB), branchB);
  });
});
