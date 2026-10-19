import { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  customers,
  db,
  familyMembers,
  medicationLogs,
  medicationReminders,
  products,
} from "@workspace/db";
import { requireCustomer } from "../lib/auth";

const router = Router();

const VALID_RELATIONSHIPS = ["father", "mother", "child", "spouse", "other"] as const;

function todayYMD(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * GET /api/family or /family
 * List all family members for the authenticated customer with health/reminder stats.
 */
router.get(["/family", "/api/family"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);

    const members = await db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.customerId, customer.id))
      .orderBy(desc(familyMembers.createdAt));

    const reminders = await db
      .select()
      .from(medicationReminders)
      .where(
        and(
          eq(medicationReminders.customerId, customer.id),
          eq(medicationReminders.isActive, true)
        )
      );

    const membersWithStats = members.map((m) => {
      const memberReminders = reminders.filter((r) => r.familyMemberId === m.id);
      const lowStockCount = memberReminders.filter((r) => r.currentStock <= r.lowStockThreshold).length;

      return {
        ...m,
        activeRemindersCount: memberReminders.length,
        lowStockCount,
        hasLowStockAlert: lowStockCount > 0,
      };
    });

    return res.json({
      members: membersWithStats,
      count: membersWithStats.length,
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * POST /api/family or /family
 * Add a new family member profile.
 */
router.post(["/family", "/api/family"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const {
      fullName,
      relationship = "other",
      birthDate,
      phone,
      chronicConditions = "",
      notes = "",
      notifyCaregiver = true,
    } = req.body;

    const trimmedName = String(fullName || "").trim();
    if (!trimmedName || trimmedName.length > 100) {
      return res.status(400).json({ message: "Ism-familiya to‘liq va to‘g‘ri kiritilishi shart (maksimal 100 belgi)" });
    }

    const rel = String(relationship).trim().toLowerCase();
    if (!VALID_RELATIONSHIPS.includes(rel as any)) {
      return res.status(400).json({
        message: "Noto‘g‘ri qarindoshlik darajasi (father, mother, child, spouse, other)",
      });
    }

    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate).trim())) {
      return res.status(400).json({ message: "Tug‘ilgan sana formati noto‘g‘ri (YYYY-MM-DD)" });
    }

    const inserted = await db
      .insert(familyMembers)
      .values({
        customerId: customer.id,
        fullName: trimmedName,
        relationship: rel as (typeof VALID_RELATIONSHIPS)[number],
        birthDate: birthDate ? String(birthDate).trim() : null,
        phone: phone ? String(phone).trim() : null,
        chronicConditions: String(chronicConditions || "").trim(),
        notes: String(notes || "").trim(),
        notifyCaregiver: Boolean(notifyCaregiver),
      })
      .returning();

    return res.status(201).json({
      ok: true,
      member: {
        ...inserted[0],
        activeRemindersCount: 0,
        lowStockCount: 0,
        hasLowStockAlert: false,
      },
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * PUT /api/family/:id or /family/:id
 * Update an existing family member profile.
 */
router.put(["/family/:id", "/api/family/:id"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const memberId = Number(req.params.id);
    if (!Number.isFinite(memberId) || memberId <= 0) {
      return res.status(400).json({ message: "Noto‘g‘ri a‘zo ID" });
    }

    const existingRows = await db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.id, memberId), eq(familyMembers.customerId, customer.id)))
      .limit(1);

    if (!existingRows[0]) {
      return res.status(404).json({ message: "Oila a‘zosi topilmadi" });
    }

    const {
      fullName,
      relationship,
      birthDate,
      phone,
      chronicConditions,
      notes,
      notifyCaregiver,
    } = req.body;

    const updates: Partial<typeof familyMembers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (fullName !== undefined) {
      const trimmed = String(fullName || "").trim();
      if (!trimmed || trimmed.length > 100) {
        return res.status(400).json({ message: "Ism-familiya to‘liq kiritilishi shart (maksimal 100 belgi)" });
      }
      updates.fullName = trimmed;
    }

    if (relationship !== undefined) {
      const rel = String(relationship).trim().toLowerCase();
      if (!VALID_RELATIONSHIPS.includes(rel as any)) {
        return res.status(400).json({
          message: "Noto‘g‘ri qarindoshlik darajasi (father, mother, child, spouse, other)",
        });
      }
      updates.relationship = rel as (typeof VALID_RELATIONSHIPS)[number];
    }

    if (birthDate !== undefined) {
      if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate).trim())) {
        return res.status(400).json({ message: "Tug‘ilgan sana formati noto‘g‘ri (YYYY-MM-DD)" });
      }
      updates.birthDate = birthDate ? String(birthDate).trim() : null;
    }

    if (phone !== undefined) {
      updates.phone = phone ? String(phone).trim() : null;
    }

    if (chronicConditions !== undefined) {
      updates.chronicConditions = String(chronicConditions || "").trim();
    }

    if (notes !== undefined) {
      updates.notes = String(notes || "").trim();
    }

    if (notifyCaregiver !== undefined) {
      updates.notifyCaregiver = Boolean(notifyCaregiver);
    }

    const updated = await db
      .update(familyMembers)
      .set(updates)
      .where(eq(familyMembers.id, memberId))
      .returning();

    return res.json({
      ok: true,
      member: updated[0],
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * DELETE /api/family/:id or /family/:id
 * Delete a family member profile and unlink from reminders.
 */
router.delete(["/family/:id", "/api/family/:id"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const memberId = Number(req.params.id);
    if (!Number.isFinite(memberId) || memberId <= 0) {
      return res.status(400).json({ message: "Noto‘g‘ri a‘zo ID" });
    }

    const existingRows = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(and(eq(familyMembers.id, memberId), eq(familyMembers.customerId, customer.id)))
      .limit(1);

    if (!existingRows[0]) {
      return res.status(404).json({ message: "Oila a‘zosi topilmadi" });
    }

    // Unlink any reminders pointing to this family member
    await db
      .update(medicationReminders)
      .set({ familyMemberId: null, updatedAt: new Date() })
      .where(eq(medicationReminders.familyMemberId, memberId));

    await db.delete(familyMembers).where(eq(familyMembers.id, memberId));

    return res.json({ ok: true, id: memberId });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * GET /api/family/:id/summary or /family/:id/summary
 * Detailed health profile, today's schedule, and low stock warnings for this member.
 */
router.get(["/family/:id/summary", "/api/family/:id/summary"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const memberId = Number(req.params.id);
    if (!Number.isFinite(memberId) || memberId <= 0) {
      return res.status(400).json({ message: "Noto‘g‘ri a‘zo ID" });
    }

    const member = (
      await db
        .select()
        .from(familyMembers)
        .where(and(eq(familyMembers.id, memberId), eq(familyMembers.customerId, customer.id)))
        .limit(1)
    )[0];

    if (!member) {
      return res.status(404).json({ message: "Oila a‘zosi topilmadi" });
    }

    const reminders = await db
      .select()
      .from(medicationReminders)
      .where(
        and(
          eq(medicationReminders.customerId, customer.id),
          eq(medicationReminders.familyMemberId, memberId),
          eq(medicationReminders.isActive, true)
        )
      )
      .orderBy(desc(medicationReminders.createdAt));

    const today = todayYMD();
    const reminderIds = reminders.map((r) => r.id);
    const logs = reminderIds.length > 0
      ? await db
          .select()
          .from(medicationLogs)
          .where(
            and(
              eq(medicationLogs.customerId, customer.id),
              eq(medicationLogs.scheduledDate, today),
              sql`${medicationLogs.reminderId} IN ${reminderIds}`
            )
          )
      : [];

    const lowStockAlerts = reminders
      .filter((r) => r.currentStock <= r.lowStockThreshold && r.refillReminderEnabled)
      .map((r) => ({
        reminderId: r.id,
        medicineName: r.medicineName,
        currentStock: r.currentStock,
        lowStockThreshold: r.lowStockThreshold,
        productId: r.productId,
      }));

    return res.json({
      member,
      reminders,
      todayLogs: logs,
      lowStockAlerts,
      needsCaregiverAttention: lowStockAlerts.length > 0 && member.notifyCaregiver,
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

export default router;
