import { Router } from "express";
import { requireAdmin, requireCustomer } from "../lib/auth";
import {
  assertStaffBranch,
  confirmPosSale,
  issueCustomerPosCard,
  listPosSales,
  lookupPosCustomer,
  previewPosSale,
  publicQrCode,
  voidPosSale,
} from "../lib/pos";
import { rateLimit } from "../lib/rateLimit";

const router = Router();

const scanLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  key: (req) => `pos-scan:${req.ip}`,
});

const saleLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  key: (req) => `pos-sale:${req.ip}`,
});

/** Mijoz: yangilanadigan imzolangan QR */
router.get("/pos/card", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const card = await issueCustomerPosCard(customer.id);
    res.json({
      ...card,
      instructions: "Kassada QR kodni skaner qiling. Kod har 90 soniyada yangilanadi.",
    });
  } catch (error) {
    next(error);
  }
});

/** Kassa: QR / karta skan → mijoz */
router.post("/pos/lookup", scanLimiter, async (req, res, next) => {
  try {
    const staff = await requireAdmin(req);
    const qr = String(req.body?.qr || req.body?.code || "").trim();
    if (!qr) return res.status(400).json({ message: "QR kodini skanerlang" });
    const result = await lookupPosCustomer(qr);
    res.json({
      ok: true,
      staff: { id: staff.id, name: staff.name, role: staff.role, branchId: staff.branchId },
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

/** Kassa: oldindan hisob (cashback ishlatish / olish) */
router.post("/pos/preview", scanLimiter, async (req, res, next) => {
  try {
    await requireAdmin(req);
    const qr = String(req.body?.qr || "").trim();
    const amount = Number(req.body?.amount);
    const cashbackToUse = Number(req.body?.cashbackToUse || 0);
    if (!qr) return res.status(400).json({ message: "QR kodini skanerlang" });
    const result = await previewPosSale({ qr, amount, cashbackToUse });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

/** Kassa: sotuvni tasdiqlash (idempotent receiptId) */
router.post("/pos/sale", saleLimiter, async (req, res, next) => {
  try {
    const staff = await requireAdmin(req);
    const qr = String(req.body?.qr || "").trim();
    const amount = Number(req.body?.amount);
    const cashbackToUse = Number(req.body?.cashbackToUse || 0);
    const branchId = Number(req.body?.branchId || staff.branchId || 0);
    const receiptId = req.body?.receiptId ? String(req.body.receiptId) : undefined;

    if (!qr) return res.status(400).json({ message: "QR kodini skanerlang" });
    await assertStaffBranch(staff, branchId);

    const result = await confirmPosSale({
      qr,
      amount,
      cashbackToUse,
      branchId,
      receiptId,
      staffId: staff.id,
      actor: `staff:${staff.email}`,
    });

    res.status(result.idempotent ? 200 : 201).json({
      ok: true,
      message: result.idempotent ? "Chek allaqachon yozilgan" : "Sotuv tasdiqlandi",
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

/** Kassa: 15 daqiqa ichida bekor */
router.post("/pos/void", saleLimiter, async (req, res, next) => {
  try {
    const staff = await requireAdmin(req);
    const receiptId = String(req.body?.receiptId || "").trim();
    if (!receiptId) return res.status(400).json({ message: "Chek raqami kerak" });
    const result = await voidPosSale({
      receiptId,
      staffId: staff.id,
      actor: `staff:${staff.email}`,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/** Bugungi / so‘nggi kassa sotuvlari */
router.get("/pos/sales", async (req, res, next) => {
  try {
    const staff = await requireAdmin(req);
    const branchId = req.query.branchId
      ? Number(req.query.branchId)
      : staff.branchId || undefined;
    const sales = await listPosSales({
      branchId: branchId && Number.isFinite(branchId) ? branchId : undefined,
      limit: Number(req.query.limit) || 40,
    });
    res.json({ sales });
  } catch (error) {
    next(error);
  }
});

/** Mijoz profilidagi barqaror kod (fallback) */
router.get("/pos/display-code", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    res.json({ displayCode: publicQrCode(customer.id) });
  } catch (error) {
    next(error);
  }
});

export default router;
