import { boolean, integer, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";

/** P3 server-side sessions — PostgreSQL is authority; Redis must not own session truth. */
export const authSessions = pgTable("auth_sessions", {
  id: serial("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  actorType: text("actor_type").notNull(),
  actorId: integer("actor_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  deviceLabel: text("device_label").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authRoles = pgTable("auth_roles", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authPermissions = pgTable("auth_permissions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authRolePermissions = pgTable(
  "auth_role_permissions",
  {
    roleId: integer("role_id").notNull(),
    permissionId: integer("permission_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const authEvents = pgTable("auth_events", {
  id: serial("id").primaryKey(),
  actorType: text("actor_type").notNull().default(""),
  actorId: integer("actor_id"),
  eventType: text("event_type").notNull(),
  success: boolean("success").notNull().default(true),
  reason: text("reason").notNull().default(""),
  meta: text("meta").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AuthSession = typeof authSessions.$inferSelect;
export type AuthRole = typeof authRoles.$inferSelect;
export type AuthPermission = typeof authPermissions.$inferSelect;
