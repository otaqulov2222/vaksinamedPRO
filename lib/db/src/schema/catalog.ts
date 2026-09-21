import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  nameUz: text("name_uz").notNull(),
  nameRu: text("name_ru").notNull(),
  category: text("category").notNull(),
  manufacturer: text("manufacturer").notNull(),
  description: text("description").notNull(),
  unit: text("unit").notNull().default("quti"),
  price: integer("price").notNull(),
  icon: text("icon").notNull().default("pill"),
  analogGroup: text("analog_group").notNull().default(""),
  requiresPrescription: boolean("requires_prescription").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const productStocks = pgTable("product_stocks", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  branchId: integer("branch_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
});

export const rewards = pgTable("rewards", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  points: integer("points").notNull(),
  icon: text("icon").notNull(),
  accent: text("accent").notNull(),
});

export const promos = pgTable("promos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  tag: text("tag").notNull(),
  icon: text("icon").notNull(),
  background: text("background").notNull(),
  active: boolean("active").notNull().default(true),
});

export type Product = typeof products.$inferSelect;
export type ProductStock = typeof productStocks.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type Promo = typeof promos.$inferSelect;
