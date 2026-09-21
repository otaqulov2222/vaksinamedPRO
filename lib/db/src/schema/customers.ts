import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  passwordHash: text("password_hash").notNull().default(""),
  language: text("language").notNull().default("uz"),
  tier: text("tier").notNull().default("Gold"),
  balance: integer("balance").notNull().default(0),
  purchasesCount: integer("purchases_count").notNull().default(0),
  totalPurchases: integer("total_purchases").notNull().default(0),
  savedAmount: integer("saved_amount").notNull().default(0),
  redeemedRewards: text("redeemed_rewards").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
