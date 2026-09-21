import { boolean, doublePrecision, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const branches = pgTable("branches", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  city: text("city").notNull().default("Toshkent"),
  region: text("region").notNull().default("Toshkent shahri"),
  district: text("district").notNull().default(""),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  hours: text("hours").notNull().default("08:00 — 22:00"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  isOpen: boolean("is_open").notNull().default(true),
  is24h: boolean("is_24h").notNull().default(false),
  paymeMerchantId: text("payme_merchant_id").notNull().default(""),
  paymeKey: text("payme_key").notNull().default(""),
  clickMerchantId: text("click_merchant_id").notNull().default(""),
  clickServiceId: text("click_service_id").notNull().default(""),
  clickSecret: text("click_secret").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Branch = typeof branches.$inferSelect;
