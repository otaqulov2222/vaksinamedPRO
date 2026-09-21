import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  branchId: integer("branch_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  payload: text("payload").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AdminUser = typeof adminUsers.$inferSelect;
