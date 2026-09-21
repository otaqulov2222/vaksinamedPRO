import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * P6.1 cashback financial foundation.
 * SoT: cashback_accounts + cashback_ledger.
 * customers.balance is legacy mirror only.
 */

export const commercialTransactions = pgTable("commercial_transactions", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceKey: text("source_key").notNull(),
  customerId: integer("customer_id").notNull(),
  orderId: integer("order_id"),
  receiptId: text("receipt_id"),
  amount: integer("amount").notNull().default(0),
  meta: text("meta").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cashbackAccounts = pgTable("cashback_accounts", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().unique(),
  balance: integer("balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cashbackLedger = pgTable("cashback_ledger", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  customerId: integer("customer_id").notNull(),
  entryType: text("entry_type").notNull(),
  amount: integer("amount").notNull(),
  commercialTransactionId: integer("commercial_transaction_id"),
  orderId: integer("order_id"),
  reversesEntryId: integer("reverses_entry_id"),
  idempotencyKey: text("idempotency_key"),
  actor: text("actor").notNull().default(""),
  reason: text("reason").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CommercialTransaction = typeof commercialTransactions.$inferSelect;
export type CashbackAccount = typeof cashbackAccounts.$inferSelect;
export type CashbackLedgerEntry = typeof cashbackLedger.$inferSelect;
