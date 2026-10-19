import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { customers } from "./customers";

export const familyMembers = pgTable("family_members", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  relationship: text("relationship").notNull().default("other"), // 'father' | 'mother' | 'child' | 'spouse' | 'other'
  birthDate: text("birth_date"), // YYYY-MM-DD
  phone: text("phone"), // +998...
  chronicConditions: text("chronic_conditions").notNull().default(""), // e.g. "Gipertoniya, Diabet"
  notes: text("notes").notNull().default(""),
  notifyCaregiver: boolean("notify_caregiver").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FamilyMember = typeof familyMembers.$inferSelect;
export type NewFamilyMember = typeof familyMembers.$inferInsert;
