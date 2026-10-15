import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as schema from "@workspace/db";
import { applyMigrations } from "@workspace/db";
import {
  calculateFiscalItems,
  generateSoliqFiscalReceipt,
  createFiscalCheque,
  getFiscalChequeByOrderId,
  refundFiscalCheque,
} from "../src/lib/fiscalService";
import {
  syncBranchInventoryFromFom,
  findAlternativeBranchesWithStock,
} from "../src/lib/fomInventoryService";
import { assignCourier, serializeDeliveryPublic } from "../src/lib/deliveryService";

describe("Phase 14 — Soliq OFD, FOM Inventory Sync, and Regional Logistics", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle>;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    db = drizzle(client, { schema });
    await applyMigrations(db, "pglite");

    // Seed test branches
    await db.insert(schema.branches).values([
      {
        id: 101,
        code: "TOSHKENT-CHILONZOR",
        name: "Vaksina Med Chilonzor",
        address: "Chilonzor 9-mavze",
        phone: "+998712000101",
        region: "Toshkent shahri",
        district: "Chilonzor",
        lat: 41.2858,
        lng: 69.2036,
      },
      {
        id: 102,
        code: "SAMARQAND-MARKAZ",
        name: "Vaksina Med Samarqand Markaz",
        address: "Registon ko'chasi 15",
        phone: "+998662000102",
        region: "Samarqand viloyati",
        district: "Samarqand shahar",
        lat: 39.6542,
        lng: 66.9597,
      },
      {
        id: 103,
        code: "BUXORO-MARKAZ",
        name: "Vaksina Med Buxoro Markaz",
        address: "Mustaqillik ko'chasi 4",
        phone: "+998652000103",
        region: "Buxoro viloyati",
        district: "Buxoro shahar",
        lat: 39.7747,
        lng: 64.4286,
      },
    ]);

    // Seed test products with MXIK codes
    await db.insert(schema.products).values([
      {
        id: 201,
        sku: "PAR-500",
        nameUz: "Paratsetamol 500mg",
        nameRu: "Парацетамол 500мг",
        category: "Og'riq qoldiruvchi",
        manufacturer: "DoriDarmon",
        description: "Og'riq qoldiruvchi vosita",
        price: 10000,
        mxikCode: "02106001001000000",
        packageCode: "796",
        vatPercent: 0,
      },
      {
        id: 202,
        sku: "VIT-C-1000",
        nameUz: "Vitamin C 1000mg",
        nameRu: "Витамин C 1000мг",
        category: "Vitaminlar",
        manufacturer: "Bionorica",
        description: "Immunitetni mustahkamlovchi",
        price: 40000,
        mxikCode: "02106001002000000",
        packageCode: "796",
        vatPercent: 12,
      },
    ]);

    // Seed customer
    await db.insert(schema.customers).values({
      id: 301,
      telegramId: "301",
      phone: "+998901112233",
      firstName: "Anvar",
      lastName: "Karimov",
    });
  });

  after(async () => {
    await client.close();
  });

  describe("Module 1: OFD / Soliq (GNK) Fiscalization Engine", () => {
    it("pro-rates discount proportionally across items and satisfies exact sum balance", () => {
      const items = [
        { productId: 201, title: "Paratsetamol", price: 10000, quantity: 2, vatPercent: 0 }, // 20,000
        { productId: 202, title: "Vitamin C", price: 40000, quantity: 2, vatPercent: 12 },    // 80,000
      ]; // Gross sum: 100,000 UZS

      const cashbackDiscount = 15000; // 15,000 UZS cashback used
      const { items: calculated, totalNet, totalVat } = calculateFiscalItems(items, cashbackDiscount);

      assert.equal(calculated.length, 2);
      // Item 1 gross: 20,000 -> 20% of 15,000 = 3,000 discount -> net: 17,000
      assert.equal(calculated[0].discountAmount, 3000);
      assert.equal(calculated[0].netAmount, 17000);
      assert.equal(calculated[0].vatAmount, 0); // 0% VAT

      // Item 2 gross: 80,000 -> 80% of 15,000 = 12,000 discount -> net: 68,000
      assert.equal(calculated[1].discountAmount, 12000);
      assert.equal(calculated[1].netAmount, 68000);
      // 12% VAT: round(68000 * 12 / 112) = round(7285.71) = 7286
      assert.equal(calculated[1].vatAmount, Math.round((68000 * 12) / 112));

      // Sum of net amounts must EXACTLY equal gross - discount
      assert.equal(totalNet, 100000 - 15000);
      assert.equal(totalNet, 85000);
    });

    it("generates Soliq official receipt payload with verifiable QR URL", () => {
      const receipt = generateSoliqFiscalReceipt({
        orderId: 501,
        totalAmount: 85000,
        terminalId: "VK_VAKSINAMED_01",
        receiptTimestamp: 1740000000000,
      });

      assert.ok(receipt.receiptNumber.startsWith("CHEK-501-"));
      assert.ok(receipt.fiscalSign.length >= 16);
      assert.ok(receipt.qrUrl.startsWith("https://ofd.soliq.uz/check?t=VK_VAKSINAMED_01&r=CHEK-501-"));
      assert.ok(receipt.qrUrl.includes("&s="));
    });

    it("creates, retrieves, and refunds electronic fiscal cheque in database", async () => {
      // 1. Create order in DB
      const order = (
        await db
          .insert(schema.orders)
          .values({
            id: 401,
            code: "ORD-SOLIQ-01",
            customerId: 301,
            branchId: 101,
            fulfillment: "delivery",
            status: "paid",
            fulfillmentStatus: "CONFIRMED",
            paymentStatus: "PAID",
            paymentMethod: "payme",
            subtotal: 50000,
            deliveryFee: 10000,
            cashbackUsed: 5000,
            total: 55000,
            address: "Toshkent, Chilonzor 9",
          })
          .returning()
      )[0];

      // Insert order items
      await db.insert(schema.orderItems).values([
        {
          orderId: order.id,
          productId: 201,
          title: "Paratsetamol 500mg",
          price: 10000,
          quantity: 1,
        },
        {
          orderId: order.id,
          productId: 202,
          title: "Vitamin C 1000mg",
          price: 40000,
          quantity: 1,
        },
      ]);

      // Generate fiscal cheque
      const result = await createFiscalCheque({ orderId: order.id, actor: "test-runner" }, db as any);
      assert.equal(result.idempotent, false);
      assert.equal(result.cheque.orderId, order.id);
      assert.equal(result.cheque.status, "REGISTERED");
      assert.equal(result.cheque.totalAmount, 55000);

      // Verify idempotency
      const secondCall = await createFiscalCheque({ orderId: order.id }, db as any);
      assert.equal(secondCall.idempotent, true);
      assert.equal(secondCall.cheque.receiptNumber, result.cheque.receiptNumber);

      // Retrieve by order ID
      const retrieved = await getFiscalChequeByOrderId(order.id, db as any);
      assert.ok(retrieved);
      assert.equal(retrieved.items.length, 3); // 2 products + 1 delivery fee
      assert.equal(retrieved.items[0].mxikCode, "02106001001000000");

      // Refund cheque
      const refunded = await refundFiscalCheque(order.id, "customer_return", db as any);
      assert.ok(refunded);
      assert.equal(refunded.status, "REFUNDED");
    });
  });

  describe("Module 2: FOM Inventory Reconciliation & Stock Discrepancy Prevention", () => {
    it("synchronizes physical stock safely in SNAPSHOT mode", async () => {
      const syncResult = await syncBranchInventoryFromFom(
        {
          branchId: 101,
          batchId: "BATCH-TEST-01",
          syncMode: "SNAPSHOT",
          items: [
            { productId: 201, physicalQuantity: 50 },
            { productId: 202, physicalQuantity: 30 },
          ],
        },
        db as any,
      );

      assert.equal(syncResult.ok, true);
      assert.equal(syncResult.syncedCount, 2);
      assert.equal(syncResult.discrepancies.length, 0);

      // Check stock rows
      const stock1 = (
        await db
          .select()
          .from(schema.productStocks)
          .where(and(eq(schema.productStocks.branchId, 101), eq(schema.productStocks.productId, 201)))
      )[0];
      assert.equal(stock1.physicalQuantity, 50);
      assert.equal(stock1.reservedQuantity, 0);
    });

    it("synchronizes stock in DELTA mode", async () => {
      const deltaResult = await syncBranchInventoryFromFom(
        {
          branchId: 101,
          batchId: "BATCH-TEST-02",
          syncMode: "DELTA",
          items: [{ productId: 201, deltaQuantity: 15 }], // 50 + 15 = 65
        },
        db as any,
      );

      assert.equal(deltaResult.ok, true);
      const stock = (
        await db
          .select()
          .from(schema.productStocks)
          .where(and(eq(schema.productStocks.branchId, 101), eq(schema.productStocks.productId, 201)))
      )[0];
      assert.equal(stock.physicalQuantity, 65);
    });

    it("detects stock discrepancy (reported < reserved) and protects DB constraint", async () => {
      // Simulate an active reservation of 20 units
      await db
        .update(schema.productStocks)
        .set({ physicalQuantity: 30, reservedQuantity: 20, quantity: 30 })
        .where(and(eq(schema.productStocks.branchId, 101), eq(schema.productStocks.productId, 202)));

      // FOM reports that store only physically has 10 units!
      // (10 < 20 reserved -> discrepancy!)
      const result = await syncBranchInventoryFromFom(
        {
          branchId: 101,
          batchId: "BATCH-DISCREPANCY-01",
          syncMode: "SNAPSHOT",
          items: [{ productId: 202, physicalQuantity: 10 }],
        },
        db as any,
      );

      assert.equal(result.ok, true);
      assert.equal(result.discrepancies.length, 1);
      assert.equal(result.discrepancies[0].shortage, 10);
      assert.equal(result.discrepancies[0].reservedQuantity, 20);
      assert.equal(result.discrepancies[0].appliedPhysical, 20); // Clamped to reserved to uphold database check constraint

      // Stock physical quantity clamped to reserved
      const stock = (
        await db
          .select()
          .from(schema.productStocks)
          .where(and(eq(schema.productStocks.branchId, 101), eq(schema.productStocks.productId, 202)))
      )[0];
      assert.equal(stock.physicalQuantity, 20);
      assert.equal(stock.reservedQuantity, 20);
    });

    it("finds alternative branches with sufficient stock", async () => {
      // Seed stock in Branch 102 (Samarkand)
      await db.insert(schema.productStocks).values({
        branchId: 102,
        productId: 201,
        physicalQuantity: 40,
        reservedQuantity: 5,
        quantity: 40,
      });

      const alternatives = await findAlternativeBranchesWithStock(201, 10, 101, db as any);
      assert.ok(alternatives.length >= 1);
      assert.equal(alternatives[0].branchId, 102);
      assert.equal(alternatives[0].branchName, "Vaksina Med Samarqand Markaz");
      assert.ok(alternatives[0].availableQuantity >= 10);
    });
  });

  describe("Module 3: Regional Logistics & Branch Courier Model", () => {
    it("assigns internal branch courier with name and phone number", async () => {
      // Create delivery record
      const delivery = (
        await db
          .insert(schema.deliveries)
          .values({
            orderId: 401,
            address: "Samarqand, Registon 15",
            mode: "internal_courier",
            provider: "internal",
            status: "pending",
          })
          .returning()
      )[0];

      // Assign courier
      const assigned = await assignCourier(
        {
          orderId: 401,
          courierId: 88,
          courierName: "Bobur Mirzayev",
          courierPhone: "+998935004455",
          courierBranchId: 101,
          actor: "branch_manager",
          expectedOrderBranchId: 101,
        },
        db as any,
      );

      assert.equal(assigned.status, "assigned");
      assert.equal(assigned.courierName, "Bobur Mirzayev");

      // Verify public serialization exposes courier phone
      const pub = serializeDeliveryPublic(assigned);
      assert.equal(pub.courierName, "Bobur Mirzayev");
      assert.equal(pub.courierPhone, "+998935004455");
      assert.equal(pub.mode, "internal_courier");
    });
  });
});
