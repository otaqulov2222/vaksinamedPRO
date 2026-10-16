import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { products } from "./catalog";

export const medicationReminders = pgTable("medication_reminders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  medicineName: text("medicine_name").notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  dosage: text("dosage").notNull().default("1 tabletka"),
  mealRelation: text("meal_relation").notNull().default("after_meal"), // 'before_meal' | 'with_meal' | 'after_meal' | 'independent'
  intakeTimes: text("intake_times").notNull().default('["08:00"]'), // JSON array of "HH:mm" strings
  startDate: text("start_date").notNull(), // "YYYY-MM-DD"
  endDate: text("end_date"), // "YYYY-MM-DD" nullable
  durationDays: integer("duration_days"), // null for continuous / chronic
  currentStock: integer("current_stock").notNull().default(30),
  packageSize: integer("package_size").notNull().default(30),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  refillReminderEnabled: boolean("refill_reminder_enabled").notNull().default(true),
  memberTag: text("member_tag").notNull().default("myself"), // 'myself' | 'father' | 'mother' | 'child' | 'spouse' | 'other'
  customMemberName: text("custom_member_name"),
  instructions: text("instructions").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const medicationLogs = pgTable("medication_logs", {
  id: serial("id").primaryKey(),
  reminderId: integer("reminder_id")
    .notNull()
    .references(() => medicationReminders.id, { onDelete: "cascade" }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  scheduledDate: text("scheduled_date").notNull(), // "YYYY-MM-DD"
  scheduledTime: text("scheduled_time").notNull(), // "HH:mm"
  status: text("status").notNull(), // 'taken' | 'skipped' | 'snoozed'
  actionTime: timestamp("action_time", { withTimezone: true }).defaultNow().notNull(),
  notes: text("notes"),
});

export type MedicationReminder = typeof medicationReminders.$inferSelect;
export type NewMedicationReminder = typeof medicationReminders.$inferInsert;
export type MedicationLog = typeof medicationLogs.$inferSelect;
export type NewMedicationLog = typeof medicationLogs.$inferInsert;
