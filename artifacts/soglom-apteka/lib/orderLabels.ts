/** Batch 3F / ORDER CONFIRM 2 — labels for existing P5 axes only. No invented statuses. */

export function fulfillmentLabel(status?: string | null): string {
  switch (String(status || '').toUpperCase()) {
    case 'CREATED':
      return 'Qabul qilindi';
    case 'CONFIRMED':
      return 'Tasdiqlandi';
    case 'PREPARING':
      return 'Tayyorlanmoqda';
    case 'READY_FOR_PICKUP':
      return 'Olib ketishga tayyor';
    case 'OUT_FOR_DELIVERY':
      return 'Yetkazilmoqda';
    case 'COMPLETED':
      return 'Yakunlangan';
    case 'CANCELLED':
      return 'Bekor qilingan';
    default:
      return status ? String(status) : 'Noma’lum';
  }
}

export function paymentLabel(status?: string | null): string {
  switch (String(status || '').toUpperCase()) {
    case 'PENDING':
      return 'To‘lov kutilmoqda';
    case 'PAID':
      return 'To‘langan';
    case 'FAILED':
      return 'To‘lov amalga oshmadi';
    case 'REFUNDED':
      return 'Qaytarilgan';
    case 'PARTIALLY_REFUNDED':
      return 'Qisman qaytarilgan';
    default:
      return status ? String(status) : 'To‘lov holati noma’lum';
  }
}

/** Compact payment chip for Purchases list — same wording as paymentLabel. */
export function paymentLabelShort(status?: string | null): string {
  const s = String(status || '').toUpperCase();
  if (!s) return '';
  if (!['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(s)) {
    return status ? String(status) : '';
  }
  return paymentLabel(status);
}

export function reservationLabel(status?: string | null, expiredHint?: boolean): string {
  if (expiredHint) return 'Mahsulot band qilish muddati tugagan';
  switch (String(status || '').toUpperCase()) {
    case 'NONE':
      return 'Band qilinmagan';
    case 'ACTIVE':
      return 'Mahsulotlar band qilindi';
    case 'EXPIRED':
      return 'Mahsulot band qilish muddati tugagan';
    case 'CANCELLED':
      return 'Mahsulot band qilinishi bekor qilingan';
    case 'FULFILLED':
      return 'Mahsulotlar buyurtmaga berilgan';
    default:
      return status ? String(status) : 'Zaxira holati noma’lum';
  }
}

/** Compact reservation chip for Purchases list — omit NONE and FULFILLED (noise). */
export function reservationLabelShort(
  status?: string | null,
  expiredHint?: boolean,
): string | null {
  if (expiredHint) return 'Muddati tugagan';
  switch (String(status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'Band qilingan';
    case 'EXPIRED':
      return 'Muddati tugagan';
    case 'CANCELLED':
      return 'Band bekor';
    case 'FULFILLED':
    case 'NONE':
    case '':
      return null;
    default:
      return status ? String(status) : null;
  }
}

/** Progress track step 0–3 from fulfillment axis (delivery-oriented). */
export function fulfillmentProgressStep(status?: string | null): number {
  switch (String(status || '').toUpperCase()) {
    case 'COMPLETED':
      return 3;
    case 'OUT_FOR_DELIVERY':
      return 2;
    case 'PREPARING':
    case 'READY_FOR_PICKUP':
      return 1;
    case 'CREATED':
    case 'CONFIRMED':
      return 0;
    default:
      return 0;
  }
}

export function isFulfillmentDelivered(status?: string | null, legacy?: string | null): boolean {
  const f = String(status || '').toUpperCase();
  if (f === 'COMPLETED') return true;
  return /completed|delivered|yetkaz/i.test(String(legacy || ''));
}

export function isFulfillmentCancelled(status?: string | null, legacy?: string | null): boolean {
  const f = String(status || '').toUpperCase();
  if (f === 'CANCELLED') return true;
  return /cancel|bekor/i.test(String(legacy || ''));
}

export function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return '00:00:00';
  const totalSec = Math.floor(msLeft / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
