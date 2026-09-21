export function formatDate(value = new Date()) {
  return new Intl.DateTimeFormat("uz-UZ").format(value);
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function orderCode() {
  return `VM-${Date.now().toString(36).toUpperCase()}`;
}

export {
  CASHBACK_RATE,
  DELIVERY_FEE,
  RESERVE_HOURS,
  MIN_PURCHASE_UZS as MIN_PURCHASE,
  computeCashback,
  cashbackRateBps,
  rateLabel,
  nextTier,
  publicCashbackRules,
} from "./cashback";
