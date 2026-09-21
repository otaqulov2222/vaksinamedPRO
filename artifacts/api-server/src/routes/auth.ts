import { Router } from "express";
import {
  loginCustomer,
  registerCustomer,
  createOtp,
  verifyOtpAndAuth,
  requireCustomer,
} from "../lib/auth";
import { customers } from "@workspace/db";
import { rateLimit } from "../lib/rateLimit";
import { loyaltyCardNumber, publicQrCode } from "../lib/pos";

const router = Router();

function publicCustomer(user: typeof customers.$inferSelect) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    language: user.language,
    tier: user.tier,
    balance: user.balance,
    purchasesCount: user.purchasesCount,
    totalPurchases: user.totalPurchases,
    savedAmount: user.savedAmount,
    qrCode: publicQrCode(user.id),
    cardNumber: loyaltyCardNumber(user.id),
  };
}

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  key: (req) => `otp:${req.ip}:${String(req.body?.phone || "")}`,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  key: (req) => `auth:${req.ip}`,
});

router.post("/auth/register", authLimiter, async (req, res, next) => {
  try {
    const { phone, password, firstName, lastName } = req.body || {};
    const result = await registerCustomer({ phone, password, firstName, lastName });
    res.status(201).json({ token: result.token, customer: publicCustomer(result.user) });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/login", authLimiter, async (req, res, next) => {
  try {
    const { phone, password } = req.body || {};
    const result = await loginCustomer(phone, password);
    res.json({ token: result.token, customer: publicCustomer(result.user) });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/otp/request", otpLimiter, async (req, res, next) => {
  try {
    const purpose = req.body?.purpose === "register" ? "register" : "login";
    const result = await createOtp(req.body?.phone || "", purpose);
    res.json({
      ok: true,
      ...result,
      message: "SMS orqali tasdiqlash kodi yuborildi",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/otp/verify", authLimiter, async (req, res, next) => {
  try {
    const purpose = req.body?.purpose === "register" ? "register" : "login";
    const result = await verifyOtpAndAuth({
      phone: req.body?.phone || "",
      code: String(req.body?.code || ""),
      purpose,
      firstName: req.body?.firstName,
      password: req.body?.password,
    });
    res.json({ token: result.token, customer: publicCustomer(result.user) });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/me", async (req, res, next) => {
  try {
    const user = await requireCustomer(req);
    res.json({ customer: publicCustomer(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/logout", async (_req, res) => {
  res.json({ ok: true });
});

export default router;
