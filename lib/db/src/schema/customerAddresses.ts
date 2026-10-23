import { boolean, doublePrecision, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { customers } from "./customers";

export const customerAddresses = pgTable("customer_addresses", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("home"), // 'home' | 'work' | 'other'
  title: text("title").notNull().default(""), // Custom name if user names it, e.g. "Ota-onam uyi"
  formattedAddress: text("formatted_address").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  district: text("district"),
  street: text("street"),
  house: text("house"),
  apartment: text("apartment"),
  entrance: text("entrance"),
  floor: text("floor"),
  landmark: text("landmark"),
  courierNote: text("courier_note"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CustomerAddress = typeof customerAddresses.$inferSelect;
export type NewCustomerAddress = typeof customerAddresses.$inferInsert;
