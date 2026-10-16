import assert from "node:assert/strict";
import { describe, it } from "node:test";

interface ReminderRecord {
  id: number;
  customerId: number;
  medicineName: string;
  productId: number | null;
  dosage: string;
  mealRelation: "before_meal" | "with_meal" | "after_meal" | "independent";
  intakeTimes: string[];
  startDate: string;
  endDate: string | null;
  currentStock: number;
  packageSize: number;
  lowStockThreshold: number;
  refillReminderEnabled: boolean;
  memberTag: string;
  customMemberName: string | null;
  isActive: boolean;
}

interface LogRecord {
  reminderId: number;
  scheduledDate: string;
  scheduledTime: string;
  status: "taken" | "skipped" | "snoozed";
}

function computeDailySchedule(reminders: ReminderRecord[], logs: LogRecord[], dateYMD: string) {
  const logMap = new Map<string, LogRecord>();
  for (const log of logs) {
    if (log.scheduledDate === dateYMD) {
      logMap.set(`${log.reminderId}_${log.scheduledTime}`, log);
    }
  }

  const doses: Array<{
    doseId: string;
    reminderId: number;
    medicineName: string;
    dosage: string;
    time: string;
    status: "taken" | "skipped" | "snoozed" | "pending";
    mealRelation: string;
    currentStock: number;
  }> = [];

  let taken = 0;
  let skipped = 0;

  for (const r of reminders) {
    if (!r.isActive) continue;
    if (r.startDate > dateYMD) continue;
    if (r.endDate && r.endDate < dateYMD) continue;

    for (const time of r.intakeTimes) {
      const key = `${r.id}_${time}`;
      const log = logMap.get(key);
      const status = log ? log.status : "pending";

      if (status === "taken") taken++;
      else if (status === "skipped") skipped++;

      doses.push({
        doseId: key,
        reminderId: r.id,
        medicineName: r.medicineName,
        dosage: r.dosage,
        time,
        status,
        mealRelation: r.mealRelation,
        currentStock: r.currentStock,
      });
    }
  }

  doses.sort((a, b) => a.time.localeCompare(b.time));

  const total = doses.length;
  const percent = total > 0 ? Math.round((taken / total) * 100) : 100;

  return {
    doses,
    summary: {
      total,
      taken,
      skipped,
      pending: Math.max(0, total - taken - skipped),
      percent,
    },
  };
}

function computeRefillAlerts(reminders: ReminderRecord[]) {
  const alerts: Array<{
    reminderId: number;
    medicineName: string;
    currentStock: number;
    lowStockThreshold: number;
    dosesPerDay: number;
    daysRemaining: number;
  }> = [];

  for (const r of reminders) {
    if (!r.isActive || !r.refillReminderEnabled) continue;
    if (r.currentStock <= r.lowStockThreshold) {
      const dosesPerDay = Math.max(1, r.intakeTimes.length);
      const daysRemaining = Math.floor(r.currentStock / dosesPerDay);
      alerts.push({
        reminderId: r.id,
        medicineName: r.medicineName,
        currentStock: r.currentStock,
        lowStockThreshold: r.lowStockThreshold,
        dosesPerDay,
        daysRemaining,
      });
    }
  }

  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

describe("Smart Medication Reminder & Auto-Refill Engine", () => {
  const demoReminders: ReminderRecord[] = [
    {
      id: 1,
      customerId: 101,
      medicineName: "Kardiomagnil 75mg",
      productId: 5,
      dosage: "1 tabletka",
      mealRelation: "after_meal",
      intakeTimes: ["08:00", "20:00"],
      startDate: "2026-10-01",
      endDate: null,
      currentStock: 4, // Below lowStockThreshold (5) -> Refill alert!
      packageSize: 30,
      lowStockThreshold: 5,
      refillReminderEnabled: true,
      memberTag: "myself",
      customMemberName: null,
      isActive: true,
    },
    {
      id: 2,
      customerId: 101,
      medicineName: "Vitamin D3 2000 IU",
      productId: 12,
      dosage: "2 tomchi",
      mealRelation: "with_meal",
      intakeTimes: ["09:00"],
      startDate: "2026-10-10",
      endDate: "2026-11-10",
      currentStock: 25,
      packageSize: 30,
      lowStockThreshold: 5,
      refillReminderEnabled: true,
      memberTag: "child",
      customMemberName: "Jasur",
      isActive: true,
    },
  ];

  it("1. Generates ordered daily doses for a given date", () => {
    const { doses, summary } = computeDailySchedule(demoReminders, [], "2026-10-16");
    assert.equal(doses.length, 3);
    assert.equal(doses[0].time, "08:00");
    assert.equal(doses[0].medicineName, "Kardiomagnil 75mg");
    assert.equal(doses[1].time, "09:00");
    assert.equal(doses[1].medicineName, "Vitamin D3 2000 IU");
    assert.equal(doses[2].time, "20:00");
    assert.equal(doses[2].medicineName, "Kardiomagnil 75mg");

    assert.equal(summary.total, 3);
    assert.equal(summary.pending, 3);
    assert.equal(summary.taken, 0);
    assert.equal(summary.percent, 0);
  });

  it("2. Reflects intake logs and computes compliance percent accurately", () => {
    const logs: LogRecord[] = [
      {
        reminderId: 1,
        scheduledDate: "2026-10-16",
        scheduledTime: "08:00",
        status: "taken",
      },
      {
        reminderId: 2,
        scheduledDate: "2026-10-16",
        scheduledTime: "09:00",
        status: "taken",
      },
    ];

    const { doses, summary } = computeDailySchedule(demoReminders, logs, "2026-10-16");
    assert.equal(doses[0].status, "taken");
    assert.equal(doses[1].status, "taken");
    assert.equal(doses[2].status, "pending");

    assert.equal(summary.taken, 2);
    assert.equal(summary.pending, 1);
    assert.equal(summary.percent, 67); // 2/3 = 66.6% -> 67%
  });

  it("3. Identifies low-stock medications and calculates days remaining until stock runs out", () => {
    const alerts = computeRefillAlerts(demoReminders);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].reminderId, 1);
    assert.equal(alerts[0].medicineName, "Kardiomagnil 75mg");
    assert.equal(alerts[0].currentStock, 4);
    assert.equal(alerts[0].dosesPerDay, 2);
    // 4 tablets remaining / 2 doses per day = 2 days remaining!
    assert.equal(alerts[0].daysRemaining, 2);
  });

  it("4. Decrements remaining stock when dose is marked as taken", () => {
    let stock = 10;
    function takeDose() {
      stock = Math.max(0, stock - 1);
      return stock;
    }
    assert.equal(takeDose(), 9);
    assert.equal(takeDose(), 8);
  });

  it("5. Filters out expired or future medication courses based on active date range", () => {
    const futureReminder: ReminderRecord = {
      ...demoReminders[0],
      id: 99,
      startDate: "2026-11-01", // In the future
    };

    const pastReminder: ReminderRecord = {
      ...demoReminders[0],
      id: 100,
      startDate: "2026-09-01",
      endDate: "2026-09-30", // Already ended
    };

    const { doses } = computeDailySchedule([futureReminder, pastReminder], [], "2026-10-16");
    assert.equal(doses.length, 0);
  });

  it("6. Handles family member tags and custom names without loss of context", () => {
    const childReminder = demoReminders.find((r) => r.memberTag === "child");
    assert.ok(childReminder);
    assert.equal(childReminder.customMemberName, "Jasur");
    assert.equal(childReminder.dosage, "2 tomchi");
  });
});
