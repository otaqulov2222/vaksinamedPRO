import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  carts,
  cartItems,
  customers,
  db,
  medicationLogs,
  medicationReminders,
  products,
  productStocks,
} from "@workspace/db";
import { requireCustomer } from "../lib/auth";

const router = Router();

const VALID_MEAL_RELATIONS = ["before_meal", "with_meal", "after_meal", "independent"] as const;
const VALID_MEMBER_TAGS = ["myself", "father", "mother", "child", "spouse", "other"] as const;
const VALID_STATUSES = ["taken", "skipped", "snoozed"] as const;

function todayYMD(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseTimes(raw: unknown): string[] {
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = raw.split(",").map((s) => s.trim());
    }
  }
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  const valid = arr
    .map((t) => String(t || "").trim())
    .filter((t) => timeRegex.test(t));
  // Deduplicate and sort
  return Array.from(new Set(valid)).sort();
}

/**
 * GET /api/reminders
 * List active reminders, today's schedule, and adherence progress.
 */
router.get(["/reminders", "/api/reminders"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const dateQuery = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : todayYMD();

    const activeReminders = await db
      .select()
      .from(medicationReminders)
      .where(
        and(
          eq(medicationReminders.customerId, customer.id),
          eq(medicationReminders.isActive, true)
        )
      )
      .orderBy(desc(medicationReminders.createdAt));

    // Get logs for the requested date
    const reminderIds = activeReminders.map((r) => r.id);
    const todayLogs = reminderIds.length > 0
      ? await db
          .select()
          .from(medicationLogs)
          .where(
            and(
              eq(medicationLogs.customerId, customer.id),
              eq(medicationLogs.scheduledDate, dateQuery),
              inArray(medicationLogs.reminderId, reminderIds)
            )
          )
      : [];

    const logMap = new Map<string, typeof medicationLogs.$inferSelect>();
    for (const log of todayLogs) {
      logMap.set(`${log.reminderId}_${log.scheduledTime}`, log);
    }

    // Build the day's schedule of doses
    interface ScheduledDose {
      doseId: string;
      reminderId: number;
      medicineName: string;
      dosage: string;
      mealRelation: string;
      time: string;
      memberTag: string;
      customMemberName: string | null;
      currentStock: number;
      packageSize: number;
      productId: number | null;
      instructions: string;
      status: "taken" | "skipped" | "snoozed" | "pending";
      logId?: number;
      actionTime?: string;
    }

    const schedule: ScheduledDose[] = [];
    let takenCount = 0;
    let skippedCount = 0;
    let lowStockCount = 0;

    for (const reminder of activeReminders) {
      if (reminder.currentStock <= reminder.lowStockThreshold) {
        lowStockCount++;
      }

      // Check if reminder is active on dateQuery
      if (reminder.startDate > dateQuery) continue;
      if (reminder.endDate && reminder.endDate < dateQuery) continue;

      const times = parseTimes(reminder.intakeTimes);
      for (const time of times) {
        const key = `${reminder.id}_${time}`;
        const log = logMap.get(key);
        const status = log ? (log.status as "taken" | "skipped" | "snoozed") : "pending";

        if (status === "taken") takenCount++;
        else if (status === "skipped") skippedCount++;

        schedule.push({
          doseId: key,
          reminderId: reminder.id,
          medicineName: reminder.medicineName,
          dosage: reminder.dosage,
          mealRelation: reminder.mealRelation,
          time,
          memberTag: reminder.memberTag,
          customMemberName: reminder.customMemberName,
          currentStock: reminder.currentStock,
          packageSize: reminder.packageSize,
          productId: reminder.productId,
          instructions: reminder.instructions,
          status,
          logId: log?.id,
          actionTime: log?.actionTime ? log.actionTime.toISOString() : undefined,
        });
      }
    }

    // Sort schedule by time
    schedule.sort((a, b) => a.time.localeCompare(b.time));

    const totalDoses = schedule.length;
    const pendingDoses = Math.max(0, totalDoses - takenCount - skippedCount);
    const adherencePercent = totalDoses > 0 ? Math.round((takenCount / totalDoses) * 100) : 100;

    return res.json({
      date: dateQuery,
      reminders: activeReminders.map((r) => ({
        ...r,
        intakeTimes: parseTimes(r.intakeTimes),
      })),
      schedule,
      todayCompliance: {
        totalDoses,
        takenDoses: takenCount,
        skippedDoses: skippedCount,
        pendingDoses,
        percent: adherencePercent,
      },
      lowStockCount,
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * POST /api/reminders
 * Create a new medication reminder.
 */
router.post(["/reminders", "/api/reminders"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const {
      medicineName,
      productId,
      dosage,
      mealRelation,
      intakeTimes,
      startDate,
      endDate,
      durationDays,
      currentStock,
      packageSize,
      lowStockThreshold,
      refillReminderEnabled,
      memberTag,
      customMemberName,
      instructions,
    } = req.body;

    const trimmedName = String(medicineName || "").trim();
    if (trimmedName.length < 2) {
      return res.status(400).json({ message: "Dori nomini to‘g‘ri kiriting (kamida 2 ta belgi)" });
    }

    const times = parseTimes(intakeTimes);
    if (times.length === 0) {
      return res.status(400).json({ message: "Kamida bitta qabul qilish vaqtini tanlang (masalan, 08:00)" });
    }

    const start = String(startDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      return res.status(400).json({ message: "Boshlanish sanasi noto‘g‘ri formatda (YYYY-MM-DD)" });
    }

    const relation = VALID_MEAL_RELATIONS.includes(mealRelation) ? mealRelation : "after_meal";
    const tag = VALID_MEMBER_TAGS.includes(memberTag) ? memberTag : "myself";

    let validProductId: number | null = null;
    if (productId != null && Number.isFinite(Number(productId)) && Number(productId) > 0) {
      const prodRows = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, Number(productId)))
        .limit(1);
      if (prodRows[0]) {
        validProductId = prodRows[0].id;
      }
    }

    const stock = Number.isFinite(Number(currentStock)) && Number(currentStock) >= 0 ? Number(currentStock) : 30;
    const pkg = Number.isFinite(Number(packageSize)) && Number(packageSize) > 0 ? Number(packageSize) : stock;
    const threshold = Number.isFinite(Number(lowStockThreshold)) && Number(lowStockThreshold) >= 1 ? Number(lowStockThreshold) : 5;

    const inserted = await db
      .insert(medicationReminders)
      .values({
        customerId: customer.id,
        medicineName: trimmedName,
        productId: validProductId,
        dosage: String(dosage || "1 tabletka").trim() || "1 tabletka",
        mealRelation: relation,
        intakeTimes: JSON.stringify(times),
        startDate: start,
        endDate: typeof endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : null,
        durationDays: Number.isFinite(Number(durationDays)) && Number(durationDays) > 0 ? Number(durationDays) : null,
        currentStock: stock,
        packageSize: pkg,
        lowStockThreshold: threshold,
        refillReminderEnabled: refillReminderEnabled !== false,
        memberTag: tag,
        customMemberName: typeof customMemberName === "string" ? customMemberName.trim() : null,
        instructions: String(instructions || "").trim(),
        isActive: true,
      })
      .returning();

    const reminder = inserted[0];
    return res.status(201).json({
      ok: true,
      reminder: {
        ...reminder,
        intakeTimes: parseTimes(reminder.intakeTimes),
      },
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * PUT /api/reminders/:id
 * Update an existing reminder.
 */
router.put(["/reminders/:id", "/api/reminders/:id"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const reminderId = Number(req.params.id);
    if (!Number.isFinite(reminderId) || reminderId <= 0) {
      return res.status(400).json({ message: "Noto‘g‘ri eslatma ID" });
    }

    const existingRows = await db
      .select()
      .from(medicationReminders)
      .where(and(eq(medicationReminders.id, reminderId), eq(medicationReminders.customerId, customer.id)))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      return res.status(404).json({ message: "Eslatma topilmadi" });
    }

    const updates: Partial<typeof medicationReminders.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (req.body.medicineName != null) {
      const name = String(req.body.medicineName).trim();
      if (name.length < 2) return res.status(400).json({ message: "Dori nomi kamida 2 ta belgi bo‘lishi kerak" });
      updates.medicineName = name;
    }
    if (req.body.dosage != null) updates.dosage = String(req.body.dosage).trim();
    if (req.body.mealRelation != null && VALID_MEAL_RELATIONS.includes(req.body.mealRelation)) {
      updates.mealRelation = req.body.mealRelation;
    }
    if (req.body.intakeTimes != null) {
      const times = parseTimes(req.body.intakeTimes);
      if (times.length > 0) updates.intakeTimes = JSON.stringify(times);
    }
    if (req.body.currentStock != null && Number.isFinite(Number(req.body.currentStock))) {
      updates.currentStock = Math.max(0, Number(req.body.currentStock));
    }
    if (req.body.packageSize != null && Number.isFinite(Number(req.body.packageSize))) {
      updates.packageSize = Math.max(1, Number(req.body.packageSize));
    }
    if (req.body.lowStockThreshold != null && Number.isFinite(Number(req.body.lowStockThreshold))) {
      updates.lowStockThreshold = Math.max(1, Number(req.body.lowStockThreshold));
    }
    if (req.body.refillReminderEnabled != null) {
      updates.refillReminderEnabled = Boolean(req.body.refillReminderEnabled);
    }
    if (req.body.memberTag != null && VALID_MEMBER_TAGS.includes(req.body.memberTag)) {
      updates.memberTag = req.body.memberTag;
    }
    if (req.body.customMemberName !== undefined) {
      updates.customMemberName = req.body.customMemberName ? String(req.body.customMemberName).trim() : null;
    }
    if (req.body.instructions != null) {
      updates.instructions = String(req.body.instructions).trim();
    }
    if (req.body.isActive != null) {
      updates.isActive = Boolean(req.body.isActive);
    }

    const updated = await db
      .update(medicationReminders)
      .set(updates)
      .where(eq(medicationReminders.id, reminderId))
      .returning();

    return res.json({
      ok: true,
      reminder: {
        ...updated[0],
        intakeTimes: parseTimes(updated[0].intakeTimes),
      },
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * DELETE /api/reminders/:id
 * Deactivate / archive a reminder.
 */
router.delete(["/reminders/:id", "/api/reminders/:id"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const reminderId = Number(req.params.id);
    if (!Number.isFinite(reminderId) || reminderId <= 0) {
      return res.status(400).json({ message: "Noto‘g‘ri eslatma ID" });
    }

    const existingRows = await db
      .select({ id: medicationReminders.id })
      .from(medicationReminders)
      .where(and(eq(medicationReminders.id, reminderId), eq(medicationReminders.customerId, customer.id)))
      .limit(1);

    if (!existingRows[0]) {
      return res.status(404).json({ message: "Eslatma topilmadi" });
    }

    await db
      .update(medicationReminders)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(medicationReminders.id, reminderId));

    return res.json({ ok: true, id: reminderId });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * POST /api/reminders/:id/take
 * Mark dose as taken, skipped, or snoozed.
 * When status is 'taken', automatically decrements currentStock by 1!
 */
router.post(["/reminders/:id/take", "/api/reminders/:id/take"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const reminderId = Number(req.params.id);
    if (!Number.isFinite(reminderId) || reminderId <= 0) {
      return res.status(400).json({ message: "Noto‘g‘ri eslatma ID" });
    }

    const { scheduledDate, scheduledTime, status, notes } = req.body;
    const sDate = String(scheduledDate || "").trim();
    const sTime = String(scheduledTime || "").trim();
    const st = String(status || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(sDate)) {
      return res.status(400).json({ message: "Sana formati noto‘g‘ri (YYYY-MM-DD)" });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sTime)) {
      return res.status(400).json({ message: "Vaqt formati noto‘g‘ri (HH:mm)" });
    }
    if (!VALID_STATUSES.includes(st as any)) {
      return res.status(400).json({ message: "Noto‘g‘ri holat (taken, skipped, snoozed)" });
    }

    const existingRows = await db
      .select()
      .from(medicationReminders)
      .where(and(eq(medicationReminders.id, reminderId), eq(medicationReminders.customerId, customer.id)))
      .limit(1);

    const reminder = existingRows[0];
    if (!reminder) {
      return res.status(404).json({ message: "Eslatma topilmadi" });
    }

    // Check if a log already exists for this reminder + date + time
    const existingLog = await db
      .select()
      .from(medicationLogs)
      .where(
        and(
          eq(medicationLogs.reminderId, reminderId),
          eq(medicationLogs.customerId, customer.id),
          eq(medicationLogs.scheduledDate, sDate),
          eq(medicationLogs.scheduledTime, sTime)
        )
      )
      .limit(1);

    const previousStatus = existingLog[0]?.status;

    let savedLog: typeof medicationLogs.$inferSelect;
    if (existingLog[0]) {
      const updated = await db
        .update(medicationLogs)
        .set({
          status: st,
          actionTime: new Date(),
          notes: notes ? String(notes).trim() : existingLog[0].notes,
        })
        .where(eq(medicationLogs.id, existingLog[0].id))
        .returning();
      savedLog = updated[0];
    } else {
      const inserted = await db
        .insert(medicationLogs)
        .values({
          reminderId,
          customerId: customer.id,
          scheduledDate: sDate,
          scheduledTime: sTime,
          status: st,
          actionTime: new Date(),
          notes: notes ? String(notes).trim() : null,
        })
        .returning();
      savedLog = inserted[0];
    }

    // Adjust currentStock if newly marked as taken
    let updatedReminder = reminder;
    if (st === "taken" && previousStatus !== "taken") {
      const newStock = Math.max(0, reminder.currentStock - 1);
      const resUpdated = await db
        .update(medicationReminders)
        .set({ currentStock: newStock, updatedAt: new Date() })
        .where(eq(medicationReminders.id, reminderId))
        .returning();
      updatedReminder = resUpdated[0];
    } else if (st !== "taken" && previousStatus === "taken") {
      // Revert stock decrement if changed from taken to skipped
      const newStock = reminder.currentStock + 1;
      const resUpdated = await db
        .update(medicationReminders)
        .set({ currentStock: newStock, updatedAt: new Date() })
        .where(eq(medicationReminders.id, reminderId))
        .returning();
      updatedReminder = resUpdated[0];
    }

    return res.json({
      ok: true,
      log: savedLog,
      reminder: {
        ...updatedReminder,
        intakeTimes: parseTimes(updatedReminder.intakeTimes),
      },
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * GET /api/reminders/refill-alerts
 * Low-stock reminders that need refilling, with catalog product details.
 */
router.get(["/reminders/refill-alerts", "/api/reminders/refill-alerts"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);

    const lowStockItems = await db
      .select()
      .from(medicationReminders)
      .where(
        and(
          eq(medicationReminders.customerId, customer.id),
          eq(medicationReminders.isActive, true),
          eq(medicationReminders.refillReminderEnabled, true),
          sql`${medicationReminders.currentStock} <= ${medicationReminders.lowStockThreshold}`
        )
      )
      .orderBy(medicationReminders.currentStock);

    const enriched = [];
    for (const item of lowStockItems) {
      let product = null;
      let availableInStock = false;

      if (item.productId) {
        const prod = (await db.select().from(products).where(eq(products.id, item.productId)).limit(1))[0];
        if (prod) {
          product = prod;
          const stocks = await db
            .select()
            .from(productStocks)
            .where(eq(productStocks.productId, item.productId));
          const totalQty = stocks.reduce((sum, s) => sum + Number(s.physicalQuantity || 0), 0);
          availableInStock = totalQty > 0;
        }
      }

      // Calculate approximate days left based on doses per day
      const times = parseTimes(item.intakeTimes);
      const dosesPerDay = Math.max(1, times.length);
      const daysRemaining = Math.floor(item.currentStock / dosesPerDay);

      enriched.push({
        reminderId: item.id,
        medicineName: item.medicineName,
        currentStock: item.currentStock,
        lowStockThreshold: item.lowStockThreshold,
        dosesPerDay,
        daysRemaining,
        productId: item.productId,
        product,
        availableInStock,
      });
    }

    return res.json({
      count: enriched.length,
      alerts: enriched,
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

/**
 * POST /api/reminders/:id/refill-to-cart
 * 1-Click refill: adds the linked product directly to the customer's active cart!
 */
router.post(["/reminders/:id/refill-to-cart", "/api/reminders/:id/refill-to-cart"], async (req: Request, res: Response) => {
  try {
    const customer = await requireCustomer(req);
    const reminderId = Number(req.params.id);
    if (!Number.isFinite(reminderId) || reminderId <= 0) {
      return res.status(400).json({ message: "Noto‘g‘ri eslatma ID" });
    }

    const rows = await db
      .select()
      .from(medicationReminders)
      .where(and(eq(medicationReminders.id, reminderId), eq(medicationReminders.customerId, customer.id)))
      .limit(1);

    const reminder = rows[0];
    if (!reminder) {
      return res.status(404).json({ message: "Eslatma topilmadi" });
    }

    if (!reminder.productId) {
      return res.status(400).json({
        message: "Ushbu dori katalog mahsulotiga bog‘lanmagan. Iltimos, katalogdan qidiring.",
        code: "NO_PRODUCT_LINK",
      });
    }

    const prod = (await db.select().from(products).where(eq(products.id, reminder.productId)).limit(1))[0];
    if (!prod) {
      return res.status(404).json({ message: "Bog‘langan mahsulot katalogda topilmadi" });
    }

    // Get or create cart for customer
    let cart = (await db.select().from(carts).where(eq(carts.customerId, customer.id)).limit(1))[0];
    if (!cart) {
      const inserted = await db.insert(carts).values({ customerId: customer.id }).returning();
      cart = inserted[0];
    }

    // Check if item already in cart
    const existingCartItem = (
      await db
        .select()
        .from(cartItems)
        .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, reminder.productId)))
        .limit(1)
    )[0];

    let finalQuantity = 1;
    if (existingCartItem) {
      finalQuantity = existingCartItem.quantity + 1;
      await db
        .update(cartItems)
        .set({ quantity: finalQuantity })
        .where(eq(cartItems.id, existingCartItem.id));
    } else {
      await db.insert(cartItems).values({
        cartId: cart.id,
        productId: reminder.productId,
        quantity: 1,
      });
    }

    // Return updated cart count
    const allItems = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
    const totalCount = allItems.reduce((acc, it) => acc + it.quantity, 0);

    const productName = prod.nameUz || prod.nameRu || "Mahsulot";

    return res.json({
      ok: true,
      message: `${productName} savatga qo‘shildi`,
      productName,
      cartCount: totalCount,
    });
  } catch (error: any) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Xatolik yuz berdi" });
  }
});

export default router;
