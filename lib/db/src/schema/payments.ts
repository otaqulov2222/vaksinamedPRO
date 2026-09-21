import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * P7.1 payment foundation.
 * SoT for payment lifecycle: intents + attempts + captures (+ refunds/webhooks).
 * Legacy `commerce.payments` retained for API compatibility.
 */

export const paymentIntents = pgTable("payment_intents", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  provider: text("provider").notNull(),
  branchId: integer("branch_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("UZS"),
  status: text("status").notNull().default("CREATED"),
  idempotencyKey: text("idempotency_key"),
  merchantId: text("merchant_id").notNull().default(""),
  legacyPaymentId: integer("legacy_payment_id"),
  meta: text("meta").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentAttempts = pgTable("payment_attempts", {
  id: serial("id").primaryKey(),
  intentId: integer("intent_id").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("STARTED"),
  idempotencyKey: text("idempotency_key"),
  externalRef: text("external_ref").notNull().default(""),
  actor: text("actor").notNull().default(""),
  errorCode: text("error_code").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentCaptures = pgTable("payment_captures", {
  id: serial("id").primaryKey(),
  intentId: integer("intent_id").notNull(),
  orderId: integer("order_id").notNull(),
  attemptId: integer("attempt_id"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("UZS"),
  actor: text("actor").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentRefunds = pgTable("payment_refunds", {
  id: serial("id").primaryKey(),
  captureId: integer("capture_id").notNull(),
  intentId: integer("intent_id").notNull(),
  orderId: integer("order_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("UZS"),
  status: text("status").notNull().default("PENDING"),
  idempotencyKey: text("idempotency_key"),
  providerRefundId: text("provider_refund_id").notNull().default(""),
  actor: text("actor").notNull().default(""),
  reason: text("reason").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentWebhookEvents = pgTable("payment_webhook_events", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  externalEventId: text("external_event_id").notNull(),
  status: text("status").notNull().default("RECEIVED"),
  payload: text("payload").notNull().default("{}"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error").notNull().default(""),
  intentId: integer("intent_id"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type PaymentCapture = typeof paymentCaptures.$inferSelect;
export type PaymentRefund = typeof paymentRefunds.$inferSelect;
export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect;
