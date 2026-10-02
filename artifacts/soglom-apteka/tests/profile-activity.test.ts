import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createT } from '../lib/i18n';
import { formatDate, formatMoney } from '../lib/i18n/format';
import { buildActivityRows, PROFILE_ACTIVITY_LIMIT, type ActivityEntry, type ActivityFormat } from '../lib/profileActivity';

const NBSP = '\u00A0';
const format = (lang: 'uz' | 'ru' | 'en'): ActivityFormat => ({
  money: (n) => formatMoney(n, lang),
  date: (input, options) => formatDate(input, lang, options),
});
const NOW = new Date(2026, 9, 2, 12, 0);

const posEarn: ActivityEntry = {
  id: 'l1',
  kind: 'earn',
  cashback: 350,
  entryType: 'EARN',
  sourceType: 'POS',
  branchName: 'Branch A',
  receiptId: 'R-1',
  createdAt: new Date(2026, 9, 1, 14, 25).toISOString(),
};
const orderUse: ActivityEntry = {
  id: 'l2',
  kind: 'use',
  cashback: -1500,
  entryType: 'USE',
  sourceType: 'ORDER',
  orderId: 42,
  orderCode: 'A-42',
  createdAt: new Date(2026, 8, 28, 9, 41).toISOString(),
};
const posVoid: ActivityEntry = { id: 'l3', kind: 'void', cashback: -350, entryType: 'REVERSAL', sourceType: 'POS', date: '2025-12-30' };

describe('profile activity view-model', () => {
  it('maps ledger entries to localized rows without inventing values', () => {
    const [earn, use, reversal] = buildActivityRows([posEarn, orderUse, posVoid], createT('uz'), format('uz'), { now: NOW });

    assert.deepEqual(earn, {
      id: 'l1',
      tone: 'earn',
      channel: 'store',
      title: 'Kassa xaridi',
      detail: 'Branch A',
      when: '1 oktabr, 14:25',
      amount: `+350 so‘m`,
      showCaption: true,
      orderId: null,
    });

    assert.equal(use.tone, 'use');
    assert.equal(use.title, 'Cashback ishlatildi');
    assert.equal(use.detail, 'Buyurtma A-42');
    assert.equal(use.amount, `−1${NBSP}500 so‘m`);
    assert.equal(use.showCaption, false);
    assert.equal(use.orderId, 42);

    assert.equal(reversal.tone, 'void');
    assert.equal(reversal.amount, '−350 so‘m');
    assert.equal(reversal.when, '30 dekabr 2025', 'other years keep the year; date-only entries have no time');
  });

  it('localizes titles and money in every language', () => {
    const ru = buildActivityRows([posEarn, orderUse], createT('ru'), format('ru'), { now: NOW });
    assert.deepEqual([ru[0].title, ru[1].title, ru[1].detail, ru[1].amount], ['Покупка на кассе', 'Списан кэшбэк', 'Заказ A-42', `−1${NBSP}500 сум`]);
    const en = buildActivityRows([posEarn, orderUse], createT('en'), format('en'), { now: NOW });
    assert.deepEqual([en[0].title, en[0].amount, en[1].title, en[1].amount], ['In-store purchase', '+350 UZS', 'Cashback used', '−1,500 UZS']);
  });

  it('limits the feed and drops malformed entries', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...posEarn, id: `e${i}` }));
    assert.equal(buildActivityRows(many, createT('uz'), format('uz')).length, PROFILE_ACTIVITY_LIMIT);
    assert.deepEqual(buildActivityRows([{ id: '' }, { id: '  ' }], createT('uz'), format('uz')), []);
    assert.deepEqual(buildActivityRows(undefined, createT('uz'), format('uz')), []);
  });

  it('falls back to the entry label when the ledger has no source', () => {
    const [row] = buildActivityRows([{ id: 'x', kind: 'earn', cashback: 100 }], createT('en'), format('en'), { now: NOW });
    assert.equal(row.title, 'Cashback earned');
    assert.equal(row.detail, '');
    assert.equal(row.when, '');
    assert.equal(row.showCaption, false, 'title already names the cashback');
    assert.equal(row.channel, 'other');
  });
});
