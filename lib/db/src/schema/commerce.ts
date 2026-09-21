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
  status: text("status").notNull(),
  paymentMethod: text("payment_method").notNull(),
  subtotal: integer("subtotal").notNull(),
  deliveryFee: integer("delivery_fee").notNull().default(0),
  cashbackUsed: integer("cashback_used").notNull().default(0),
  cashbackEarned: integer("cashback_earned").notNull().default(0),
  total: integer("total").notNull(),
  address: text("address").notNull().default(""),
  comment: text("comment").notNull().default(""),
  reservedUntil: timestamp("reserved_until", { withTimezone: true }),
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

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  provider: text("provider").notNull(),
  branchId: integer("branch_id").notNull(),
  merchantId: text("merchant_id").notNull().default(""),
  externalId: text("external_id").notNull().default(""),
  status: text("status").notNull(),
  amount: integer("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique(),
  address: text("address").notNull(),
  timeWindow: text("time_window").notNull().default("Bugun 10:00 — 18:00"),
  status: text("status").notNull().default("pending"),
  courierName: text("courier_name").notNull().default(""),
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
