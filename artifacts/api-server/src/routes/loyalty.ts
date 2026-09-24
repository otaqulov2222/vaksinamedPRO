import { Router } from "express";
import { eq } from "drizzle-orm";
import { customers, db, rewards } from "@workspace/db";
import { requireCustomer } from "../lib/auth";
import { loyaltyCardNumber, publicQrCode } from "../lib/pos";
import { earnCashback, useCashback, getAuthoritativeBalance } from "../lib/cashbackFinance";
import { getCustomerCashbackHistory } from "../lib/cashbackHistory";
import { allowDemoCashbackSeed } from "../lib/securityEnv";
import { rateLimit } from "../lib/rateLimit";

const router = Router();

/** History scraping protection — Redis-backed in production. */
const cashbackHistoryLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  key: (req) => `cashback-history:${req.ip}:${String(req.header("authorization") || "").slice(0, 24)}`,
});

const redeemLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  key: (req) => `loyalty-redeem:${req.ip}`,
});

function parseRewards(raw: string) {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

async function profileFor(telegramId: string) {
  let customer = (await db.select().from(customers).where(eq(customers.telegramId, telegramId)).limit(1))[0];
  if (!customer) {
    // Demo Firdavs welcome — NEVER production-like (allowDemoCashbackSeed).
    const demoWelcome =
      allowDemoCashbackSeed() && telegramId === "firdavs" ? 125500 : 0;
    customer = (await db.insert(customers).values({
      telegramId,
      firstName: demoWelcome > 0 ? "Firdavs" : "Mijoz",
      lastName: "",
      phone: "+998 90 123 45 67",
      balance: 0,
    }).returning())[0];
    if (demoWelcome > 0) {
      await earnCashback({
        customerId: customer.id,
        amount: demoWelcome,
        commercial: {
          sourceType: "SYSTEM",
          sourceKey: `welcome:customer:${customer.id}`,
          customerId: customer.id,
          amount: demoWelcome,
        },
        actor: "loyalty:profile",
        reason: "demo_opening",
        idempotencyKey: `welcome:customer:${customer.id}`,
      });
      customer = (await db.select().from(customers).where(eq(customers.id, customer.id)).limit(1))[0];
    }
  }
  // SoT history (cashback_ledger ⨝ commercial_transactions) — not loyalty_ledger soft mirror.
  const history = await getCustomerCashbackHistory(customer.id, { limit: 50, offset: 0 });
  const catalog = await db.select().from(rewards);
  const balance = await getAuthoritativeBalance(customer.id);
  return {
    telegramId: customer.telegramId,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    language: customer.language,
    tier: customer.tier,
    balance,
    purchasesCount: customer.purchasesCount,
    totalPurchases: customer.totalPurchases,
    savedAmount: customer.savedAmount,
    qrCode: publicQrCode(customer.id),
    cardNumber: loyaltyCardNumber(customer.id),
    redeemedRewards: parseRewards(customer.redeemedRewards),
    transactions: history.items,
    rewards: catalog.map((item) => ({
      id: item.code,
      title: item.title,
      subtitle: item.subtitle,
      points: item.points,
      icon: item.icon,
      accent: item.accent,
    })),
  };
}

router.get("/loyalty/profile", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    return res.json(await profileFor(customer.telegramId));
  } catch (error) {
    return next(error);
  }
});

/**
 * Source-aware cashback history from SoT.
 * Ownership: session customer only — never authorize via client customerId/sourceKey/orderId.
 */
router.get("/loyalty/cashback-history", cashbackHistoryLimiter, async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    const page = await getCustomerCashbackHistory(customer.id, { limit, offset });
    return res.json(page);
  } catch (error) {
    return next(error);
  }
});

router.patch("/loyalty/profile", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const body = req.body || {};
    const patch: { language?: string; firstName?: string; lastName?: string } = {};

    if (body.language != null) {
      const language = String(body.language);
      if (!["uz", "ru", "en"].includes(language)) {
        return res.status(400).json({ message: "Til noto‘g‘ri. Faqat uz, ru yoki en." });
      }
      patch.language = language;
    }

    if (body.firstName != null) {
      const firstName = String(body.firstName).trim();
      if (firstName.length < 2) {
        return res.status(400).json({ message: "Ism kamida 2 ta belgidan iborat bo‘lsin" });
      }
      if (firstName.length > 80) {
        return res.status(400).json({ message: "Ism juda uzun" });
      }
      patch.firstName = firstName;
    }

    if (body.lastName != null) {
      const lastName = String(body.lastName).trim();
      if (lastName.length > 80) {
        return res.status(400).json({ message: "Familiya juda uzun" });
      }
      patch.lastName = lastName;
    }

    // Phone is identity-controlled — never accept phone changes here.
    if (Object.keys(patch).length > 0) {
      await db.update(customers).set(patch).where(eq(customers.id, customer.id));
    }
    return res.json(await profileFor(customer.telegramId));
  } catch (error) {
    return next(error);
  }
});

router.post("/loyalty/redeem", redeemLimiter, async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const rewardId = String(req.body.rewardId || "");
    const reward = (await db.select().from(rewards).where(eq(rewards.code, rewardId)).limit(1))[0];
    if (!reward) return res.status(400).json({ message: "Mukofot topilmadi" });
    const redeemed = parseRewards(customer.redeemedRewards);
    if (redeemed.includes(reward.code)) return res.status(400).json({ message: "Mukofot avval olingan" });
    const balance = await getAuthoritativeBalance(customer.id);
    if (balance < reward.points) return res.status(400).json({ message: "Ball yetarli emas" });
    const nextRedeemed = [...redeemed, reward.code];
    const used = await useCashback({
      customerId: customer.id,
      amount: reward.points,
      commercial: {
        sourceType: "SYSTEM",
        sourceKey: `reward:${customer.id}:${reward.code}`,
        customerId: customer.id,
        amount: reward.points,
      },
      actor: `customer:${customer.id}`,
      reason: "loyalty_redeem",
      idempotencyKey: `reward:${customer.id}:${reward.code}`,
    });
    await db.update(customers).set({
      redeemedRewards: JSON.stringify(nextRedeemed),
    }).where(eq(customers.id, customer.id));
    return res.json({ balance: used.account.balance, rewardId: reward.code });
  } catch (error) {
    return next(error);
  }
});

export default router;
export { profileFor };
