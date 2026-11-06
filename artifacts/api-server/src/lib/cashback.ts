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
export const WELCOME_BONUS_UZS = 5_000;
export const BIRTHDAY_WINDOW_DAYS = 7;
/** Extra basis points during birthday window (500 = +5%). */
export const BIRTHDAY_EXTRA_BPS = 500;
export const GRANT_EXPIRING_SOON_DAYS = 30;
export const MIN_PURCHASE_UZS = 1_000;
/** Default production spend cap — overridable via system_settings `cashback.max_spend_ratio`. */
export const DEFAULT_MAX_SPEND_RATIO = 0.3;
/** @deprecated Prefer getMaxSpendRatio() / computeCashback({ maxSpendRatio }) — kept as default constant. */
export const MAX_SPEND_RATIO = DEFAULT_MAX_SPEND_RATIO;
export const DELIVERY_FEE = 15_000;
export const RESERVE_HOURS = 24;

/** Legacy flat rate (faqat fallback) */
export const CASHBACK_RATE = 0.05;

export type CashbackTier = "Silver" | "Gold" | "Platinum";

export type CashbackTierDef = {
  tier: CashbackTier;
  rateBps: number;
  fromTotal: number;
};

export type CashbackPolicy = {
  maxSpendRatio: number;
  minPurchase: number;
  ttlDays: number;
  tiers: CashbackTierDef[];
};

export const FIXED_TIER_NAMES: CashbackTier[] = ["Silver", "Gold", "Platinum"];

export const DEFAULT_TIERS: CashbackTierDef[] = [
  { tier: "Silver", rateBps: 300, fromTotal: 200_000 },
  { tier: "Gold", rateBps: 500, fromTotal: 1_000_000 },
  { tier: "Platinum", rateBps: 700, fromTotal: 5_000_000 },
];

export function defaultCashbackPolicy(): CashbackPolicy {
  return {
    maxSpendRatio: DEFAULT_MAX_SPEND_RATIO,
    minPurchase: MIN_PURCHASE_UZS,
    ttlDays: CASHBACK_TTL_DAYS,
    tiers: DEFAULT_TIERS.map((t) => ({ ...t })),
  };
}

/** Basis points: 500 = 5.00%. Optional policy tiers override the built-in rates. */
export function cashbackRateBps(tier: string, tiers: CashbackTierDef[] = DEFAULT_TIERS): number {
  const name = String(tier || "").toLowerCase();
  for (const row of tiers) {
    const label = row.tier.toLowerCase();
    if (name === label || name.includes(label)) return row.rateBps;
  }
  // Legacy Uzbek aliases when matching against default names
  if (name.includes("platinum") || name.includes("platina")) {
    return tiers.find((t) => t.tier === "Platinum")?.rateBps ?? 700;
  }
  if (name.includes("gold") || name.includes("oltin")) {
    return tiers.find((t) => t.tier === "Gold")?.rateBps ?? 500;
  }
  if (name.includes("silver") || name.includes("kumush")) {
    return tiers.find((t) => t.tier === "Silver")?.rateBps ?? 300;
  }
  return tiers.find((t) => t.tier === "Gold")?.rateBps ?? 500;
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
  extraBps?: number;
  minPurchase?: number;
  tiers?: CashbackTierDef[];
}) {
  const goodsAmount = Math.max(0, Math.floor(Number(input.goodsAmount) || 0));
  const deliveryFee = Math.max(0, Math.floor(Number(input.deliveryFee) || 0));
  const extra = Math.max(0, Math.floor(Number(input.extraBps) || 0));
  const minPurchase = Math.max(
    0,
    Math.floor(Number(input.minPurchase ?? MIN_PURCHASE_UZS) || MIN_PURCHASE_UZS),
  );
  const bps = cashbackRateBps(input.tier, input.tiers) + extra;

  if (goodsAmount < minPurchase) {
    throw Object.assign(
      new Error(`Minimal xarid: ${minPurchase.toLocaleString("uz-UZ")} so‘m`),
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

/** Accept full policy or legacy maxSpendRatio number. */
export function publicCashbackRules(policyOrRatio: CashbackPolicy | number = DEFAULT_MAX_SPEND_RATIO) {
  const policy: CashbackPolicy =
    typeof policyOrRatio === "number"
      ? { ...defaultCashbackPolicy(), maxSpendRatio: normalizeSpendRatio(policyOrRatio) }
      : policyOrRatio;
  const ratio = normalizeSpendRatio(policy.maxSpendRatio);
  return {
    title: "Vaksina Med — Universal Cashback",
    ttlDays: policy.ttlDays,
    ttlEnforced: true,
    ttlAppliesTo: "new_grants_only" as const,
    fifo: true,
    welcomeBonus: WELCOME_BONUS_UZS,
    birthdayWindowDays: BIRTHDAY_WINDOW_DAYS,
    birthdayExtraBps: BIRTHDAY_EXTRA_BPS,
    birthdayExtraPercent: Math.round(BIRTHDAY_EXTRA_BPS / 100),
    minPurchase: policy.minPurchase,
    maxSpendRatio: ratio,
    maxSpendPercent: Math.round(ratio * 100),
    deliveryFee: DELIVERY_FEE,
    tiers: policy.tiers.map((t) => ({
      tier: t.tier,
      rate: rateLabel(t.rateBps),
      rateBps: t.rateBps,
      fromTotal: t.fromTotal,
    })),
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

export function nextTier(
  totalPurchases: number,
  current: string,
  tiers: CashbackTierDef[] = DEFAULT_TIERS,
): string {
  const spent = Math.max(0, Math.floor(Number(totalPurchases) || 0));
  const sorted = [...tiers].sort((a, b) => b.fromTotal - a.fromTotal);
  for (const t of sorted) {
    if (spent >= t.fromTotal) return t.tier;
  }
  return current || "Silver";
}

export function tierProgress(
  totalPurchases: number,
  current: string,
  tiers: CashbackTierDef[] = DEFAULT_TIERS,
) {
  const spent = Math.max(0, Math.floor(Number(totalPurchases) || 0));
  const ascending = [...tiers].sort((a, b) => a.fromTotal - b.fromTotal);
  const currentTier = nextTier(spent, current, tiers);
  const next = ascending.find((t) => spent < t.fromTotal) || null;
  const remaining = next ? Math.max(0, next.fromTotal - spent) : 0;
  const progress = next ? Math.min(1, Math.max(0, spent / Math.max(1, next.fromTotal))) : 1;
  return {
    current: currentTier,
    next: next?.tier ?? null,
    nextFromTotal: next?.fromTotal ?? null,
    remaining,
    progress,
    totalPurchases: spent,
  };
}

function parseBirthDate(raw: string | Date | null | undefined): { month: number; day: number } | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return { month: raw.getUTCMonth(), day: raw.getUTCDate() };
  }
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day) || month < 0 || month > 11 || day < 1 || day > 31) {
    return null;
  }
  return { month, day };
}

export function isBirthdayWindow(birthDate: string | Date | null | undefined, now = new Date()): boolean {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return false;
  const startThis = new Date(now.getFullYear(), parsed.month, parsed.day);
  const startLast = new Date(now.getFullYear() - 1, parsed.month, parsed.day);
  const endThis = new Date(startThis);
  endThis.setDate(endThis.getDate() + BIRTHDAY_WINDOW_DAYS);
  const endLast = new Date(startLast);
  endLast.setDate(endLast.getDate() + BIRTHDAY_WINDOW_DAYS);
  return (now >= startThis && now < endThis) || (now >= startLast && now < endLast);
}

export function birthdayExtraBps(birthDate: string | Date | null | undefined, now = new Date()): number {
  return isBirthdayWindow(birthDate, now) ? BIRTHDAY_EXTRA_BPS : 0;
}

/** New grants only — existing expires_at rows are never rewritten by TTL policy changes. */
export function grantExpiryDate(from = new Date(), ttlDays: number = CASHBACK_TTL_DAYS): Date {
  const days = Number.isFinite(ttlDays) && ttlDays > 0 ? Math.floor(ttlDays) : CASHBACK_TTL_DAYS;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
