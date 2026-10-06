import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translate } from '../lib/i18n';
import { formatMoney, formatNumber } from '../lib/i18n/format';
import { buildProfileSummary, EMPTY_VALUE, formatPhone, matchTierRate, type ProfileFormat } from '../lib/profileSummary';

const NBSP = '\u00A0';
const format = (lang: 'uz' | 'ru' | 'en'): ProfileFormat => ({
  money: (n) => formatMoney(n, lang),
  number: (n) => formatNumber(n, lang),
  currency: translate(lang, 'common.currency'),
});
const money = { uz: format('uz'), ru: format('ru'), en: format('en') };

describe('profile summary view-model', () => {
  it('renders real account data', () => {
    const s = buildProfileSummary(
      { ready: true, name: ' qa user ', phone: '998957056423', tier: 'Silver', purchases: 4, balance: 5000, tierRate: '3%' },
      money.uz,
    );
    assert.deepEqual(s, {
      displayName: 'qa user',
      initial: 'Q',
      phone: '+998 95 705 64 23',
      balance: `5${NBSP}000 so‘m`,
      balanceAmount: `5${NBSP}000`,
      currency: 'so‘m',
      hasTier: true,
      tier: 'Silver',
      rate: '3%',
      purchases: '4',
    });
  });

  it('formats the balance per language and keeps it integer', () => {
    const input = { ready: true, balance: 1250000.9 };
    assert.equal(buildProfileSummary(input, money.uz).balance, `1${NBSP}250${NBSP}000 so‘m`);
    assert.equal(buildProfileSummary(input, money.ru).balance, `1${NBSP}250${NBSP}000 сум`);
    assert.equal(buildProfileSummary(input, money.en).balance, '1,250,000 UZS');
    assert.equal(buildProfileSummary({ ready: true, balance: -10 }, money.en).balance, '0 UZS');
    for (const lang of ['uz', 'ru', 'en'] as const) {
      const s = buildProfileSummary(input, money[lang]);
      assert.equal(`${s.balanceAmount} ${s.currency}`, s.balance, `split wallet figure matches money format (${lang})`);
    }
  });

  it('never invents values: missing data and loading render as a dash', () => {
    const loading = buildProfileSummary({ ready: false, balance: 9000, purchases: 7, tier: 'Gold', tierRate: '5%' }, money.uz);
    assert.equal(loading.balance, EMPTY_VALUE);
    assert.equal(loading.balanceAmount, EMPTY_VALUE);
    assert.equal(loading.currency, '');
    assert.equal(loading.purchases, EMPTY_VALUE);
    assert.equal(loading.rate, EMPTY_VALUE);

    const empty = buildProfileSummary({ ready: true }, money.uz);
    assert.equal(empty.displayName, EMPTY_VALUE);
    assert.equal(empty.initial, EMPTY_VALUE);
    assert.equal(empty.phone, EMPTY_VALUE);
    assert.equal(empty.hasTier, false);
    assert.equal(empty.tier, EMPTY_VALUE);
    assert.equal(empty.rate, EMPTY_VALUE, 'no rate without a tier');
    assert.equal(empty.purchases, '0');
  });

  it('formats Uzbek phone numbers and passes unknown formats through', () => {
    assert.equal(formatPhone('957056423'), '+998 95 705 64 23');
    assert.equal(formatPhone('+998 (95) 705-64-23'), '+998 95 705 64 23');
    assert.equal(formatPhone('12345'), '12345');
    assert.equal(formatPhone(''), EMPTY_VALUE);
  });

  it('matches the tier rate from cashback rules only when the tier is known', () => {
    const tiers = [
      { tier: 'Silver daraja', rate: '3%' },
      { tier: 'Gold', rate: ' 5% ' },
      { tier: 'Platinum', rate: null },
    ];
    assert.equal(matchTierRate(tiers, 'Silver'), '3%');
    assert.equal(matchTierRate(tiers, 'gold'), '5%');
    assert.equal(matchTierRate(tiers, 'Platinum'), null);
    assert.equal(matchTierRate(tiers, 'Bronze'), null);
    assert.equal(matchTierRate(tiers, ''), null);
    assert.equal(matchTierRate(undefined, 'Silver'), null);
  });
});

describe('product detail add-to-cart behavior', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const filePath = join(__dirname, '../app/product/[id].tsx');
  const source = readFileSync(filePath, 'utf8');

  it('successful add-to-cart does NOT automatically navigate to /cart', () => {
    const onAddMatch = source.match(/const onAdd = async \(\) => {([\s\S]*?)\n  };/);
    assert.ok(onAddMatch, 'onAdd function must exist in product/[id].tsx');
    const onAddBody = onAddMatch[1];

    assert.doesNotMatch(
      onAddBody,
      /router\.(push|replace)\(['"]\/cart['"]\)/,
      'onAdd must not automatically navigate to /cart upon success',
    );
    assert.match(onAddBody, /await api\.addToCart\(/, 'onAdd must call api.addToCart');
    assert.match(onAddBody, /await refresh\(\)/, 'onAdd must call refresh to update cart badge');
    assert.match(onAddBody, /setAddedBanner\(true\)/, 'onAdd must display in-page success banner');
  });

  it('provides an optional manual link to open cart', () => {
    assert.match(
      source,
      /router\.push\(['"]\/cart['"]\)/,
      'Manual link to open /cart must exist in ProductScreen',
    );
    assert.match(
      source,
      /catalog\.viewCart/,
      'Must use catalog.viewCart localization for optional cart button',
    );
  });
});

