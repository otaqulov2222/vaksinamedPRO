import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  branchId: integer("branch_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  /** 0011_admin_management: 'active' | 'disabled' (CHECK constraint). */
  status: text("status").notNull().default("active"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  payload: text("payload").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const adminWebauthnCredentials = pgTable("admin_webauthn_credentials", {
  id: serial("id").primaryKey(),
  adminUserId: integer("admin_user_id").notNull(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  signCount: integer("sign_count").notNull().default(0),
  transports: text("transports").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const adminLoginChallenges = pgTable("admin_login_challenges", {
  id: serial("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  tokenHash: text("token_hash").notNull().unique(),
  adminUserId: integer("admin_user_id").notNull(),
  purpose: text("purpose").notNull(),
  challenge: text("challenge").notNull(),
  origin: text("origin").notNull().default(""),
  rpId: text("rp_id").notNull().default(""),
  ip: text("ip").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminWebauthnCredential = typeof adminWebauthnCredentials.$inferSelect;
export type AdminLoginChallenge = typeof adminLoginChallenges.$inferSelect;
