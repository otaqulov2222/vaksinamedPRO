/**
 * Vaksina Med — yagona cashback siyosati
 *
 * FOM (dorixona kassasi) = haqiqiy sotuv manbai (skan, narx, ombor, Click/Payme/naqd).
 * Ilova = qidiruv, filial, bron, yetkazish, loyalty QR.
 * Cashback faqat "sotuv yakunlanganda" hisobga o‘tadi (qaytarish/bron bekor uchun xavfsiz).
 */

export const CASHBACK_TTL_DAYS = 90;
export const MIN_PURCHASE_UZS = 1_000;
/** Xarid summasining necha foizigacha cashback bilan to‘lash mumkin */
export const MAX_SPEND_RATIO = 1;
export const DELIVERY_FEE = 15_000;
export const RESERVE_HOURS = 2;

/** Legacy flat rate (faqat fallback) */
export const CASHBACK_RATE = 0.05;

export type CashbackTier = "Silver" | "Gold" | "Platinum";

/** Basis points: 500 = 5.00% */
export function cashbackRateBps(tier: string): number {
  const t = String(tier || "").toLowerCase();
  if (t.includes("platinum") || t.includes("platina")) return 700;
  if (t.includes("gold") || t.includes("oltin")) return 500;
  if (t.includes("silver") || t.includes("kumush")) return 300;
  return 500;
}

export function rateLabel(bps: number) {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

export function rateFraction(tier: string) {
  return cashbackRateBps(tier) / 10_000;
}

/**
 * Hisob-kitob:
 * - cashback ishlatiladi: min(balans, summa * MAX_SPEND_RATIO)
 * - yangi cashback: (to‘langan qism) * foiz  — yetkazish haqi uchun cashback YO‘Q
 */
export function computeCashback(input: {
  goodsAmount: number;
  cashbackToUse: number;
  balance: number;
  tier: string;
  deliveryFee?: number;
}) {
  const goodsAmount = Math.max(0, Math.floor(Number(input.goodsAmount) || 0));
  const deliveryFee = Math.max(0, Math.floor(Number(input.deliveryFee) || 0));
  const bps = cashbackRateBps(input.tier);

  if (goodsAmount < MIN_PURCHASE_UZS) {
    throw Object.assign(
      new Error(`Minimal xarid: ${MIN_PURCHASE_UZS.toLocaleString("uz-UZ")} so‘m`),
      { status: 400 },
    );
  }

  const maxSpend = Math.min(input.balance, Math.floor(goodsAmount * MAX_SPEND_RATIO));
  let cashbackUsed = Math.max(0, Math.floor(Number(input.cashbackToUse) || 0));
  if (cashbackUsed > maxSpend) cashbackUsed = maxSpend;

  const payableGoods = goodsAmount - cashbackUsed;
  const payableTotal = payableGoods + deliveryFee;
  const cashbackEarned = Math.floor((payableGoods * bps) / 10_000);

  return {
    goodsAmount,
    deliveryFee,
    cashbackUsed,
    cashbackEarned,
    payableGoods,
    payableTotal,
    maxSpend,
    rateBps: bps,
    rateLabel: rateLabel(bps),
    rate: bps / 10_000,
  };
}

/**
 * Qachon cashback TUSHADI (earn)
 *
 * 1) Kassada walk-in (FOM): chek yopilganda → webhook → darhol
 * 2) Ilova bron (pickup): filial FOM’da berib + to‘lov (Click/Payme/naqd) → FOM tasdiq
 * 3) Ilova yetkazish: kuryer "delivered" qilganda
 *
 * Online Payme/Click to‘lovning o‘zi cashback bermaydi (faqat status),
 * chunki bron bekor / qaytarish bo‘lishi mumkin.
 */
export type EarnTrigger =
  | "fom_walk_in"
  | "fom_order_confirm"
  | "delivery_completed"
  | "pos_terminal";

export function earnTriggerLabel(trigger: EarnTrigger) {
  switch (trigger) {
    case "fom_walk_in":
      return "Kassada sotuv yopilganda";
    case "fom_order_confirm":
      return "Filialda buyurtma berilganda";
    case "delivery_completed":
      return "Yetkazib berilganda";
    case "pos_terminal":
      return "Kassa POS tasdiqlanganda";
    default:
      return "Sotuv yakunida";
  }
}

export function publicCashbackRules() {
  return {
    title: "Vaksina Med Cashback qoidalari",
    ttlDays: CASHBACK_TTL_DAYS,
    minPurchase: MIN_PURCHASE_UZS,
    maxSpendRatio: MAX_SPEND_RATIO,
    deliveryFee: DELIVERY_FEE,
    tiers: [
      { tier: "Silver", rate: "3%", fromTotal: 200_000 },
      { tier: "Gold", rate: "5%", fromTotal: 1_000_000 },
      { tier: "Platinum", rate: "7%", fromTotal: 5_000_000 },
    ],
    earnWhen: [
      "Dorixonada (FOM): QR ko‘rsatib xarid — chek yopilishi bilan",
      "Ilovadan bron: filialda olib ketish + to‘lovdan keyin FOM tasdiq",
      "Yetkazib berish: buyurtma yetkazilganda",
    ],
    spendWhen: [
      "Ilovada buyurtma berishda (balansdan)",
      "Kassada QR skanlanganda (FOM / Kassa POS)",
    ],
    note: "FOM — dorixona kassasi (skaner, ombor, Click/Payme/naqd). Ilova loyalty va onlayn bron/yetkazish uchun.",
    fom: {
      saleEndpoint: "POST /api/integrations/fom/sale",
      fields: {
        receiptId: "FOM chek raqami (majburiy, unique)",
        branchCode: "masalan apteka53",
        branchId: "yoki ichki filial id",
        customerQr: "mijoz QR (VM1… yoki VAKSINA-id)",
        amount: "xarid summasi (so‘m)",
        cashbackToUse: "ishlatilgan cashback (ixtiyoriy)",
        paymentMethod: "click | payme | cash | card",
        orderCode: "ilova buyurtmasi bo‘lsa VM-…",
      },
    },
  };
}

export function nextTier(totalPurchases: number, current: string) {
  if (totalPurchases >= 5_000_000) return "Platinum";
  if (totalPurchases >= 1_000_000) return "Gold";
  if (totalPurchases >= 200_000) return "Silver";
  return current || "Silver";
}
