/** Batch 3F / ORDER CONFIRM 2 — labels for existing P5 axes only. No invented statuses. */
import { hasTranslation, type TFunction } from '@/lib/i18n';

function lookup(t: TFunction, prefix: string, value: string, unknownKey: Parameters<TFunction>[0]): string {
  const key = `status.${prefix}_${value}`;
  return hasTranslation(key) ? t(key) : t(unknownKey);
}

export function fulfillmentLabel(t: TFunction, status?: string | null): string {
  return lookup(t, 'fulfillment', String(status || '').toUpperCase(), 'status.fulfillment_unknown');
}

export function paymentLabel(t: TFunction, status?: string | null): string {
  return lookup(t, 'payment', String(status || '').toUpperCase(), 'status.payment_unknown');
}

/** Compact payment chip for Purchases list — same wording as paymentLabel. */
export function paymentLabelShort(t: TFunction, status?: string | null): string {
  const s = String(status || '').toUpperCase();
  if (!s) return '';
  return paymentLabel(t, s);
}

export function reservationLabel(t: TFunction, status?: string | null, expiredHint?: boolean): string {
  if (expiredHint) return t('status.reservation_EXPIRED');
  return lookup(t, 'reservation', String(status || '').toUpperCase(), 'status.reservation_unknown');
}

/** Compact reservation chip for Purchases list — omit NONE and FULFILLED (noise). */
export function reservationLabelShort(
  t: TFunction,
  status?: string | null,
  expiredHint?: boolean,
): string | null {
  if (expiredHint) return t('status.reservationShort_EXPIRED');
  const s = String(status || '').toUpperCase();
  if (s === 'FULFILLED' || s === 'NONE' || s === '') return null;
  const key = `status.reservationShort_${s}`;
  return hasTranslation(key) ? t(key) : t('status.reservation_unknown');
}

/** P8 delivery axis (lowercase API values). */
export function deliveryStatusLabel(t: TFunction, status?: string | null): string {
  return lookup(t, 'delivery', String(status || '').toLowerCase(), 'status.delivery_unknown');
}

export function fulfillmentTypeLabel(t: TFunction, fulfillment?: string | null): string {
  return String(fulfillment || '').toLowerCase() === 'delivery'
    ? t('status.fulfillmentType_delivery')
    : t('status.fulfillmentType_pickup');
}

export function paymentMethodLabel(t: TFunction, method?: string | null): string {
  return lookup(t, 'paymentMethod', String(method || '').toLowerCase(), 'status.paymentMethod_unknown');
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
