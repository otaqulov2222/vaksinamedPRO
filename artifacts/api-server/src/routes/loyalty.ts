import { Router } from "express";
import { eq } from "drizzle-orm";
import { customers, db, loyaltyLedger, rewards } from "@workspace/db";
import { requireCustomer } from "../lib/auth";
import { loyaltyCardNumber, publicQrCode } from "../lib/pos";
import { earnCashback, useCashback, getAuthoritativeBalance } from "../lib/cashbackFinance";

const router = Router();

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
    const welcome = telegramId === "firdavs" ? 125500 : 0;
    customer = (await db.insert(customers).values({
      telegramId,
      firstName: telegramId === "firdavs" ? "Firdavs" : "Mijoz",
      lastName: "",
      phone: "+998 90 123 45 67",
      balance: 0,
    }).returning())[0];
    if (welcome > 0) {
      await earnCashback({
        customerId: customer.id,
        amount: welcome,
        commercial: {
          sourceType: "SYSTEM",
          sourceKey: `welcome:customer:${customer.id}`,
          customerId: customer.id,
          amount: welcome,
        },
        actor: "loyalty:profile",
        reason: "demo_opening",
        idempotencyKey: `welcome:customer:${customer.id}`,
      });
      customer = (await db.select().from(customers).where(eq(customers.id, customer.id)).limit(1))[0];
    }
  }
  const transactions = await db.select().from(loyaltyLedger).where(eq(loyaltyLedger.customerId, customer.id));
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
    transactions: transactions.map((item) => ({
      id: item.externalId,
      date: item.date,
      title: item.title,
      branch: item.branch,
      amount: item.amount,
      cashback: item.cashback,
      kind: item.kind === "use" ? "use" : item.kind === "void" ? "void" : "earn",
    })),
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

router.patch("/loyalty/profile", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const language = req.body.language;
    if (language && ["uz", "ru", "en"].includes(language)) {
      await db.update(customers).set({ language }).where(eq(customers.id, customer.id));
    }
    return res.json(await profileFor(customer.telegramId));
  } catch (error) {
    return next(error);
  }
});

router.post("/loyalty/redeem", async (req, res, next) => {
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
