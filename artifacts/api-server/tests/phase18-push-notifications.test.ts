import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applyMigrations } from "../../../lib/db/src/migrate";
import { getMigrationsFolder } from "../../../lib/db/src/migrationsPath";
import {
  customerDevices,
  customers,
  medicationReminders,
  medicationLogs,
} from "@workspace/db";
import {
  sendCustomerPushNotification,
  getOrderStatusNotificationContent,
  getMedicationReminderNotificationContent,
} from "../src/lib/pushNotifications";
import { runMedicationRemindersSweep } from "../src/lib/workers";

describe("Phase 18: Push Notifications & Device Management", () => {
  let client: PGlite;
  let testDb: any;
  let testCustomerId: number;

  before(async () => {
    client = new PGlite();
    await client.waitReady;
    testDb = drizzle(client);

    // Apply migrations up to 0018
    await applyMigrations(testDb, "pglite", getMigrationsFolder());

    // Seed customer
    const insertedCust = await testDb
      .insert(customers)
      .values({
        telegramId: "tg_push_test_user",
        firstName: "Anvar",
        lastName: "Karimov",
        phone: "+998901234567",
        language: "uz",
      })
      .returning();
    testCustomerId = insertedCust[0].id;
  });

  after(async () => {
    await client.close();
  });

  describe("1. Order Status Notification Copy Generator", () => {
    it("generates correct Uzbek order status notifications", () => {
      const conf = getOrderStatusNotificationContent("uz", "VAK-1001", "CONFIRMED");
      assert.ok(conf);
      assert.equal(conf.title, "Buyurtma tasdiqlandi");
      assert.ok(conf.body.includes("VAK-1001"));

      const prep = getOrderStatusNotificationContent("uz", "VAK-1001", "PREPARING");
      assert.ok(prep);
      assert.equal(prep.title, "Buyurtma yig'ilmoqda");

      const ready = getOrderStatusNotificationContent("uz", "VAK-1001", "READY_FOR_PICKUP");
      assert.ok(ready);
      assert.match(ready.title, /Buyurtma tayyor/);

      const out = getOrderStatusNotificationContent("uz", "VAK-1001", "OUT_FOR_DELIVERY");
      assert.ok(out);
      assert.match(out.title, /Kuryer yo'lga chiqdi/);

      const done = getOrderStatusNotificationContent("uz", "VAK-1001", "COMPLETED");
      assert.ok(done);
      assert.match(done.title, /Buyurtma topshirildi/);

      const cancel = getOrderStatusNotificationContent("uz", "VAK-1001", "CANCELLED");
      assert.ok(cancel);
      assert.match(cancel.title, /Buyurtma bekor qilindi/);
    });

    it("generates correct Russian order status notifications", () => {
      const ready = getOrderStatusNotificationContent("ru", "VAK-1002", "READY_FOR_PICKUP");
      assert.ok(ready);
      assert.match(ready.title, /Заказ готов к выдаче/);
      assert.ok(ready.body.includes("VAK-1002"));

      const out = getOrderStatusNotificationContent("ru", "VAK-1002", "OUT_FOR_DELIVERY");
      assert.ok(out);
      assert.match(out.title, /Курьер в пути/);
    });

    it("generates correct English order status notifications", () => {
      const out = getOrderStatusNotificationContent("en", "VAK-1003", "OUT_FOR_DELIVERY");
      assert.ok(out);
      assert.equal(out.title, "Out for Delivery! 🛵");
      assert.ok(out.body.includes("VAK-1003"));
    });
  });

  describe("2. Medication Reminder Copy Generator", () => {
    it("generates localized medication reminder with meal relations", () => {
      const uz = getMedicationReminderNotificationContent("uz", "Paratsetamol", "500mg", "after_meal");
      assert.match(uz.title, /Dori ichish vaqti/);
      assert.ok(uz.body.includes("Paratsetamol"));
      assert.ok(uz.body.includes("ovqatdan keyin"));

      const ru = getMedicationReminderNotificationContent("ru", "Аспирин", "100mg", "before_meal");
      assert.match(ru.title, /Время принять лекарство/);
      assert.ok(ru.body.includes("до еды"));

      const en = getMedicationReminderNotificationContent("en", "Vitamin C", "1000mg", "with_meal");
      assert.match(en.title, /Medication Reminder/);
      assert.ok(en.body.includes("with meal"));
    });
  });

  describe("3. Device Push Dispatch Engine", () => {
    it("returns sent: 0 when customer has no active registered devices", async () => {
      const outcome = await sendCustomerPushNotification(testCustomerId, {
        title: "Test",
        body: "Test body",
      }, testDb);

      assert.equal(outcome.devices, 0);
      assert.equal(outcome.sent, 0);
    });

    it("successfully registers device token and dispatches to it", async () => {
      const token = "web_push_token_test_12345";
      await testDb.insert(customerDevices).values({
        customerId: testCustomerId,
        token,
        platform: "web",
        isActive: true,
      });

      const outcome = await sendCustomerPushNotification(testCustomerId, {
        title: "Dori eslatmasi",
        body: "Iltimos dori ichishni unutmang",
        data: { type: "medication_reminder" },
      }, testDb);

      assert.equal(outcome.devices, 1);
      assert.equal(outcome.sent, 1);
      assert.equal(outcome.results[0].status, "delivered");
    });

    it("does not dispatch to deactivated devices", async () => {
      const inactiveToken = "token_deactivated_999";
      await testDb.insert(customerDevices).values({
        customerId: testCustomerId,
        token: inactiveToken,
        platform: "web",
        isActive: false,
      });

      const outcome = await sendCustomerPushNotification(testCustomerId, {
        title: "Yangi yangilik",
        body: "Matn",
      }, testDb);

      // Only the 1 active device from previous test should receive it
      assert.equal(outcome.devices, 1);
      assert.equal(outcome.sent, 1);
    });
  });

  describe("4. Medication Reminders Worker Sweep", () => {
    it("scans active reminders and triggers notifications for matching time window", async () => {
      const now = new Date();
      const tashkentOffsetMs = 5 * 60 * 60 * 1000;
      const localNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + tashkentOffsetMs);
      const year = localNow.getFullYear();
      const month = String(localNow.getMonth() + 1).padStart(2, "0");
      const day = String(localNow.getDate()).padStart(2, "0");
      const todayYMD = `${year}-${month}-${day}`;
      const currentHour = localNow.getHours();
      const currentMinute = localNow.getMinutes();
      const currentTimeStr = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

      // Insert active reminder for today at current time
      const reminder = await testDb
        .insert(medicationReminders)
        .values({
          customerId: testCustomerId,
          medicineName: "Kardiomagnil",
          dosage: "75mg",
          mealRelation: "after_meal",
          intakeTimes: JSON.stringify([currentTimeStr]),
          startDate: todayYMD,
          isActive: true,
        })
        .returning();

      const sweep = await runMedicationRemindersSweep({ now }, testDb);
      assert.ok(sweep.scanned >= 1);
      assert.ok(sweep.due >= 1);
      assert.equal(sweep.sent, 1); // Dispatched to our active device
    });
  });
});
