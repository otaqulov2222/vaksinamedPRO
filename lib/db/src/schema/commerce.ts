import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const carts = pgTable("carts", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().unique(),
  branchId: integer("branch_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  cartId: integer("cart_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  branchId: integer("branch_id").notNull(),
  fulfillment: text("fulfillment").notNull(),
  /** Legacy compatibility only — not long-term SoT (P5 / Q2). */
  status: text("status").notNull(),
  /** P5 axis A — authoritative fulfillment lifecycle. */
  fulfillmentStatus: text("fulfillment_status").notNull().default("CREATED"),
  /** P5 axis B — denormalized; payments table remains payment truth. */
  paymentStatus: text("payment_status").notNull().default("PENDING"),
  /** P5 axis C — denormalized mirror of reservations.status | NONE. */
  reservationStatus: text("reservation_status").notNull().default("NONE"),
  /** Checkout idempotency (P5.3) — unique when present. */
  checkoutIdempotencyKey: text("checkout_idempotency_key"),
  paymentMethod: text("payment_method").notNull(),
  subtotal: integer("subtotal").notNull(),
  deliveryFee: integer("delivery_fee").notNull().default(0),
  cashbackUsed: integer("cashback_used").notNull().default(0),
  cashbackEarned: integer("cashback_earned").notNull().default(0),
  total: integer("total").notNull(),
  address: text("address").notNull().default(""),
  comment: text("comment").notNull().default(""),
  /** Legacy/cache display only — not reservation authority (P4). */
  reservedUntil: timestamp("reserved_until", { withTimezone: true }),
  /** Nullable FK to reservations — set when checkout holds stock (P4.5+). */
  reservationId: integer("reservation_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  title: text("title").notNull(),
  price: integer("price").notNull(),
  quantity: integer("quantity").notNull(),
});

/** Legacy payment row — API compatibility. P7 SoT is payment_intents + captures. */
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  provider: text("provider").notNull(),
  branchId: integer("branch_id").notNull(),
  merchantId: text("merchant_id").notNull().default(""),
  externalId: text("external_id").notNull().default(""),
  status: text("status").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("UZS"),
  paymentIntentId: integer("payment_intent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique(),
  address: text("address").notNull(),
  timeWindow: text("time_window").notNull().default("Bugun 10:00 — 18:00"),
  status: text("status").notNull().default("pending"),
  courierName: text("courier_name").notNull().default(""),
  courierId: integer("courier_id"),
  courierBranchId: integer("courier_branch_id"),
  provider: text("provider").notNull().default("internal"),
  providerRef: text("provider_ref").notNull().default(""),
  mode: text("mode").notNull().default("internal_courier"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
  outAt: timestamp("out_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  meta: text("meta").notNull().default("{}"),
});

export const deliveryStatusHistory = pgTable("delivery_status_history", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").notNull(),
  orderId: integer("order_id").notNull(),
  fromStatus: text("from_status").notNull().default(""),
  toStatus: text("to_status").notNull(),
  actor: text("actor").notNull().default(""),
  actorType: text("actor_type").notNull().default("system"),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fomSaleEvents = pgTable("fom_sale_events", {
  id: serial("id").primaryKey(),
  receiptId: text("receipt_id").notNull(),
  branchId: integer("branch_id"),
  orderId: integer("order_id"),
  mode: text("mode").notNull().default(""),
  status: text("status").notNull().default("PROCESSED"),
  payload: text("payload").notNull().default("{}"),
  resultMeta: text("result_meta").notNull().default("{}"),
  actor: text("actor").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workerJobs = pgTable("worker_jobs", {
  id: serial("id").primaryKey(),
  jobType: text("job_type").notNull(),
  entityKey: text("entity_key").notNull().default(""),
  status: text("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by").notNull().default(""),
  lastError: text("last_error").notNull().default(""),
  payload: text("payload").notNull().default("{}"),
  result: text("result").notNull().default("{}"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const loyaltyLedger = pgTable("loyalty_ledger", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  orderId: integer("order_id"),
  externalId: text("external_id").notNull(),
  date: text("date").notNull(),
  title: text("title").notNull(),
  branch: text("branch").notNull(),
  amount: integer("amount").notNull(),
  cashback: integer("cashback").notNull(),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Kassada walk-in sotuv (Korzinka uslubi): QR → summa → cashback */
export const posSales = pgTable("pos_sales", {
  id: serial("id").primaryKey(),
  receiptId: text("receipt_id").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  branchId: integer("branch_id").notNull(),
  staffId: integer("staff_id"),
  amount: integer("amount").notNull(),
  cashbackUsed: integer("cashback_used").notNull().default(0),
  cashbackEarned: integer("cashback_earned").notNull().default(0),
  payable: integer("payable").notNull(),
  rateBps: integer("rate_bps").notNull().default(500),
  status: text("status").notNull().default("completed"),
  actor: text("actor").notNull().default("kassa"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const staffRatings = pgTable("staff_ratings", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  branchId: integer("branch_id").notNull(),
  employeeName: text("employee_name").notNull(),
  rating: integer("rating").notNull(),
  tags: text("tags").notNull().default("[]"),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Cart = typeof carts.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
