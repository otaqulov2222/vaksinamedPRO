import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { customers } from "./customers";

export const customerDevices = pgTable("customer_devices", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull().default("web"), // 'web' | 'android' | 'ios'
  endpoint: text("endpoint"),
  authKey: text("auth_key"),
  p256dhKey: text("p256dh_key"),
  userAgent: text("user_agent"),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CustomerDevice = typeof customerDevices.$inferSelect;
export type NewCustomerDevice = typeof customerDevices.$inferInsert;
