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
import { revokeSessionFromToken } from "../lib/sessions";
import { recordAuthEvent } from "../lib/authEvents";
import { getAuthoritativeBalance } from "../lib/cashbackFinance";

const router = Router();

async function publicCustomer(user: typeof customers.$inferSelect) {
  // Authoritative spendable cashback — not customers.balance mirror alone.
  const balance = await getAuthoritativeBalance(user.id);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    language: user.language,
    tier: user.tier,
    balance,
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
    const result = await registerCustomer({ phone, password, firstName, lastName }, req);
    res.status(201).json({ token: result.token, customer: await publicCustomer(result.user) });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/login", authLimiter, async (req, res, next) => {
  try {
    const { phone, password } = req.body || {};
    const result = await loginCustomer(phone, password, req);
    res.json({ token: result.token, customer: await publicCustomer(result.user) });
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
    }, req);
    res.json({ token: result.token, customer: await publicCustomer(result.user) });
  } catch (error) {
    next(error);
  }
});

router.get("/auth/me", async (req, res, next) => {
  try {
    const user = await requireCustomer(req);
    res.json({ customer: await publicCustomer(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/logout", async (req, res, next) => {
  try {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    const result = await revokeSessionFromToken(token, { actorType: "customer" });
    await recordAuthEvent({
      actorType: "customer",
      eventType: "logout",
      success: true,
      meta: { revoked: result.revoked },
    });
    // Idempotent — do not leak whether another user's session exists
    res.json({ ok: true, revoked: result.revoked });
  } catch (error) {
    next(error);
  }
});

export default router;
