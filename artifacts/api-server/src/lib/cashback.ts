/**
 * Vaksina Med — yagona cashback siyosati
 *
 * FOM (dorixona kassasi) = haqiqiy sotuv manbai (skan, narx, ombor, Click/Payme/naqd).
 * Ilova = qidiruv, filial, bron, yetkazish, loyalty QR.
 * Cashback faqat "sotuv yakunlanganda" hisobga o‘tadi (qaytarish/bron bekor uchun xavfsiz).
 *
 * P6.5: max spend ratio is server-configurable (default 30% of eligible goods).
 * Client never authoritative for balance, eligibility, spend cap, or earn amount.
 */

export const CASHBACK_TTL_DAYS = 90;
export const MIN_PURCHASE_UZS = 1_000;
/** Default production spend cap — overridable via system_settings `cashback.max_spend_ratio`. */
export const DEFAULT_MAX_SPEND_RATIO = 0.3;
/** @deprecated Prefer getMaxSpendRatio() / computeCashback({ maxSpendRatio }) — kept as default constant. */
export const MAX_SPEND_RATIO = DEFAULT_MAX_SPEND_RATIO;
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

export function normalizeSpendRatio(raw: unknown): number {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_MAX_SPEND_RATIO;
  if (v > 1) return 1;
  return v;
}

/** Server-side spend clamp — never trust client amount. */
export function clampCashbackSpend(input: {
  goodsAmount: number;
  balance: number;
  requested: number;
  maxSpendRatio?: number;
}): { cashbackUsed: number; maxSpend: number; ratio: number } {
  const goodsAmount = Math.max(0, Math.floor(Number(input.goodsAmount) || 0));
  const balance = Math.max(0, Math.floor(Number(input.balance) || 0));
  const ratio = normalizeSpendRatio(input.maxSpendRatio ?? DEFAULT_MAX_SPEND_RATIO);
  const maxSpend = Math.min(balance, Math.floor(goodsAmount * ratio));
  let cashbackUsed = Math.max(0, Math.floor(Number(input.requested) || 0));
  if (cashbackUsed > maxSpend) cashbackUsed = maxSpend;
  return { cashbackUsed, maxSpend, ratio };
}

/**
 * Hisob-kitob:
 * - cashback ishlatiladi: min(balans, summa * maxSpendRatio)  — default 30%
 * - yangi cashback: (to‘langan qism) * foiz  — yetkazish haqi uchun cashback YO‘Q
 */
export function computeCashback(input: {
  goodsAmount: number;
  cashbackToUse: number;
  balance: number;
  tier: string;
  deliveryFee?: number;
  maxSpendRatio?: number;
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

  const { cashbackUsed, maxSpend, ratio } = clampCashbackSpend({
    goodsAmount,
    balance: input.balance,
    requested: input.cashbackToUse,
    maxSpendRatio: input.maxSpendRatio,
  });

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
    maxSpendRatio: ratio,
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
 *
 * Q3 OPEN: exact pickup earn moment — do not invent alternate policy here.
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

export function publicCashbackRules(maxSpendRatio: number = DEFAULT_MAX_SPEND_RATIO) {
  const ratio = normalizeSpendRatio(maxSpendRatio);
  return {
    title: "Vaksina Med — Universal Cashback",
    ttlDays: CASHBACK_TTL_DAYS,
    minPurchase: MIN_PURCHASE_UZS,
    maxSpendRatio: ratio,
    maxSpendPercent: Math.round(ratio * 100),
    deliveryFee: DELIVERY_FEE,
    tiers: [
      { tier: "Silver", rate: "3%", fromTotal: 200_000 },
      { tier: "Gold", rate: "5%", fromTotal: 1_000_000 },
      { tier: "Platinum", rate: "7%", fromTotal: 5_000_000 },
    ],
    earnWhen: [
      "Yakunlangan xaridlar (tijorat tranzaksiyasi) — to‘lov usuli emas, yakunlanish muhim",
      "Dorixona kassasi (POS/FOM): QR bilan xarid tasdiqlanganda",
      "Ilova buyurtmasi: fulfillment COMPLETED (PAID o‘zi earn bermaydi)",
    ],
    spendWhen: [
      "Ilovada rasmiylashtirishda (max foiz — server; yetkazish haqidan emas)",
      "Kassada QR skanlanganda (POS)",
    ],
    note:
      "Bitta mijoz — bitta cashback balansi. Kanal (ilova / kassa / tizim) faqat manba o‘lchovi. Balans va limit serverda.",
    fom: {
      saleEndpoint: "POST /api/integrations/fom/sale",
      fields: {
        receiptId: "FOM chek raqami (majburiy, unique) — vendor contract beyond this alias is OPEN",
        branchCode: "masalan apteka53",
        branchId: "yoki ichki filial id",
        customerQr: "mijoz QR (VM1… yoki VAKSINA-id)",
        amount: "xarid summasi (so‘m)",
        cashbackToUse: "so‘rov (server clamp; client not authoritative)",
        paymentMethod: "click | payme | cash | card",
        orderCode: "ilova buyurtmasi bo‘lsa VM-…",
      },
      openDependency: "Stable FOM vendor receipt identity beyond receiptId/orderCode aliases is not invented",
    },
  };
}

export function nextTier(totalPurchases: number, current: string) {
  if (totalPurchases >= 5_000_000) return "Platinum";
  if (totalPurchases >= 1_000_000) return "Gold";
  if (totalPurchases >= 200_000) return "Silver";
  return current || "Silver";
}
