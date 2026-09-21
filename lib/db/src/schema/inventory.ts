import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * P4.1 inventory foundation.
 * available_quantity is STORED GENERATED in SQL (not writable).
 * Legacy `quantity` remains for P4.1 writers; bridged to physical_quantity via DB trigger until P4.5.
 */
export const reservations = pgTable("reservations", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id"),
  customerId: integer("customer_id"),
  branchId: integer("branch_id").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reservationItems = pgTable("reservation_items", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull(),
  productId: integer("product_id").notNull(),
  movementType: text("movement_type").notNull(),
  quantity: integer("quantity").notNull().default(0),
  physicalDelta: integer("physical_delta").notNull().default(0),
  reservedDelta: integer("reserved_delta").notNull().default(0),
  reservationId: integer("reservation_id"),
  orderId: integer("order_id"),
  actor: text("actor").notNull().default(""),
  reason: text("reason").notNull().default(""),
  idempotencyKey: text("idempotency_key"),
  meta: text("meta").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Reservation = typeof reservations.$inferSelect;
export type ReservationItem = typeof reservationItems.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
