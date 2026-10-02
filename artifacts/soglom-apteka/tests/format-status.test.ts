import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cashbackEntryLabel, cashbackSourceLabel } from '../lib/cashbackLabels';
import { createT, setCurrentLanguage } from '../lib/i18n';
import { localizedName } from '../lib/i18n/data';
import { localizeError, NETWORK_ERROR_CODE } from '../lib/i18n/errors';
import { formatDate, formatMoney, formatNumber } from '../lib/i18n/format';
import {
  deliveryStatusLabel,
  fulfillmentLabel,
  fulfillmentTypeLabel,
  paymentLabel,
  paymentMethodLabel,
  reservationLabel,
  reservationLabelShort,
} from '../lib/orderLabels';

const NBSP = '\u00A0';

describe('money / number / date formatting', () => {
  it('formats integer UZS per language', () => {
    assert.equal(formatMoney(1250000, 'uz'), `1${NBSP}250${NBSP}000 so‘m`);
    assert.equal(formatMoney(1250000, 'ru'), `1${NBSP}250${NBSP}000 сум`);
    assert.equal(formatMoney(1250000, 'en'), '1,250,000 UZS');
    assert.equal(formatMoney(0, 'en'), '0 UZS');
  });

  it('keeps money integer and handles negatives / garbage', () => {
    assert.equal(formatNumber(999.6, 'en'), '1,000');
    assert.equal(formatNumber(-12000, 'en'), '−12,000');
    assert.equal(formatNumber(Number.NaN, 'uz'), '0');
  });

  it('formats dates with localized month names', () => {
    const d = new Date(2026, 9, 1, 14, 5);
    assert.equal(formatDate(d, 'uz'), '1 oktabr 2026');
    assert.equal(formatDate(d, 'ru'), '1 октября 2026');
    assert.equal(formatDate(d, 'en'), 'Oct 1, 2026');
    assert.equal(formatDate(d, 'ru', { withTime: true }), '1 октября 2026, 14:05');
    assert.equal(formatDate(d, 'en', { withYear: false }), 'Oct 1');
    assert.equal(formatDate('not a date', 'en'), '');
  });
});

describe('backend enum display mappings', () => {
  const langs = ['uz', 'ru', 'en'] as const;
  const fulfillment = ['CREATED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'];
  const payment = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'];
  const reservation = ['NONE', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'FULFILLED'];
  const delivery = ['pending', 'assigned', 'picked_up', 'on_the_way', 'delivered', 'cancelled', 'failed'];

  for (const lang of langs) {
    const t = createT(lang);
    it(`${lang}: every known status has its own label (never the raw enum, never "unknown")`, () => {
      const check = (label: string, raw: string, unknown: string) => {
        assert.ok(label && label !== raw, `${raw} -> ${label}`);
        assert.notEqual(label, unknown, raw);
      };
      for (const s of fulfillment) check(fulfillmentLabel(t, s), s, fulfillmentLabel(t, 'X'));
      for (const s of payment) check(paymentLabel(t, s), s, paymentLabel(t, 'X'));
      for (const s of reservation) check(reservationLabel(t, s), s, reservationLabel(t, 'X'));
      for (const s of delivery) check(deliveryStatusLabel(t, s), s, deliveryStatusLabel(t, 'X'));
      for (const m of ['pay_at_branch', 'cod']) check(paymentMethodLabel(t, m), m, paymentMethodLabel(t, 'x'));
    });

    it(`${lang}: unknown values map to a localized unknown label`, () => {
      assert.equal(fulfillmentLabel(t, 'ON_HOLD'), t('status.fulfillment_unknown'));
      assert.equal(paymentLabel(t, null), t('status.payment_unknown'));
      assert.equal(deliveryStatusLabel(t, 'teleported'), t('status.delivery_unknown'));
    });
  }

  it('status labels are case-insensitive on the API value and keep enum semantics', () => {
    const t = createT('en');
    assert.equal(fulfillmentLabel(t, 'completed'), 'Completed');
    assert.equal(deliveryStatusLabel(t, 'ON_THE_WAY'), 'On the way');
    assert.equal(reservationLabelShort(t, 'NONE'), null);
    assert.equal(reservationLabelShort(t, 'FULFILLED'), null);
    assert.equal(reservationLabelShort(t, 'ACTIVE', true), 'Expired');
    assert.equal(fulfillmentTypeLabel(t, 'delivery'), 'Delivery');
    assert.equal(fulfillmentTypeLabel(t, 'pickup'), 'Pickup from pharmacy');
  });

  it('cashback source labels mirror the server mapping (uz) and translate (ru/en)', () => {
    const uz = createT('uz');
    assert.equal(cashbackSourceLabel(uz, 'SYSTEM', 'EARN'), 'Bonus');
    assert.equal(cashbackSourceLabel(uz, 'POS', 'EARN'), 'Kassa xaridi');
    assert.equal(cashbackSourceLabel(uz, 'POS', 'REVERSAL'), 'Kassa bekor');
    assert.equal(cashbackSourceLabel(uz, 'ORDER', 'EARN'), 'Ilova xaridi');
    assert.equal(cashbackSourceLabel(uz, 'ORDER', 'USE'), 'Ilova buyurtmasi');
    assert.equal(cashbackSourceLabel(uz, null, 'USE'), 'Cashback ishlatildi');
    const ru = createT('ru');
    assert.equal(cashbackSourceLabel(ru, 'POS', 'EARN'), 'Покупка на кассе');
    assert.equal(cashbackEntryLabel(ru, 'void'), 'Кэшбэк отменён');
    assert.equal(cashbackEntryLabel(createT('en'), 'use'), 'Cashback used');
  });

  it('localizedName prefers the UI language and falls back', () => {
    const p = { nameUz: 'Paratsetamol', nameRu: 'Парацетамол' };
    assert.equal(localizedName('ru', p), 'Парацетамол');
    assert.equal(localizedName('uz', p), 'Paratsetamol');
    assert.equal(localizedName('en', p), 'Paratsetamol');
    assert.equal(localizedName('ru', { nameUz: 'Faqat uz' }), 'Faqat uz');
  });
});

describe('API error localization', () => {
  const err = (status?: number, message = '', code?: string) => Object.assign(new Error(message), { status, code });

  it('maps network / 429 / 5xx centrally in every language', () => {
    for (const lang of ['uz', 'ru', 'en'] as const) {
      setCurrentLanguage(lang);
      const t = createT(lang);
      assert.equal(localizeError(err(undefined, 'x', NETWORK_ERROR_CODE), t), t('common.errorNetwork'));
      assert.equal(localizeError(new TypeError('Failed to fetch'), t), t('common.errorNetwork'));
      assert.equal(localizeError(err(429, 'Juda ko‘p'), t), t('common.errorTooManyAttempts'));
      assert.equal(localizeError(err(503, 'down'), t), t('common.errorServer'));
    }
    setCurrentLanguage('uz');
  });

  it('screen overrides win over server text', () => {
    setCurrentLanguage('uz');
    const t = createT('uz');
    assert.equal(
      localizeError(err(401, 'Telefon yoki parol noto‘g‘ri'), t, { byStatus: { 401: 'common.errorSessionExpired' } }),
      t('common.errorSessionExpired'),
    );
    assert.equal(
      localizeError(err(409, 'x', 'STOCK_UNAVAILABLE'), t, { byCode: { STOCK_UNAVAILABLE: 'common.errorNotFound' } }),
      t('common.errorNotFound'),
    );
  });

  it('shows Uzbek server text only when the UI is Uzbek; otherwise a localized fallback', () => {
    setCurrentLanguage('uz');
    assert.equal(localizeError(err(400, 'Ismni kiriting'), createT('uz')), 'Ismni kiriting');
    setCurrentLanguage('ru');
    assert.equal(localizeError(err(400, 'Ismni kiriting'), createT('ru')), createT('ru')('common.errorGeneric'));
    setCurrentLanguage('en');
    assert.equal(localizeError(err(401, 'Kirish talab qilinadi'), createT('en')), 'Your session has expired. Please log in again.');
    setCurrentLanguage('uz');
  });
});
