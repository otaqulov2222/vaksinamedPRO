import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allTranslationKeys,
  createT,
  FALLBACK_LANGUAGE,
  getCurrentLanguage,
  getMissingTranslationKeys,
  hasTranslation,
  setCurrentLanguage,
  SUPPORTED_LANGUAGES,
  tr,
  translate,
  translationTable,
} from '../lib/i18n';
import { interpolate } from '../lib/i18n/core';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** Values that are legitimately identical across languages (brands, symbols, loanwords). */
const IDENTICAL_ALLOWED = /^(OK|Payme|Click|Cashback|Bonus|Professional|Vaksina Med|VAKSINA MED.*|—|Rx|QR|24\/7|English|Gold|Silver|Platinum|Telegram|СОХРАНЯЯ ЗДОРОВЬЕ,\nДАРИМ РАДОСТЬ ЖИЗНИ!|.*\{\w+\}.*%?)$/;

describe('i18n catalog completeness', () => {
  const uz = translationTable('uz');
  const keys = Object.keys(uz);

  it('has a non-trivial catalog', () => {
    assert.ok(keys.length > 400, `expected a full catalog, got ${keys.length} keys`);
    assert.equal(allTranslationKeys().length, keys.length);
  });

  for (const lang of SUPPORTED_LANGUAGES) {
    it(`${lang}: has exactly the uz key set with non-empty values`, () => {
      const table = translationTable(lang);
      assert.deepEqual(Object.keys(table).sort(), [...keys].sort());
      const empty = Object.entries(table).filter(([, v]) => typeof v !== 'string' || v.trim() === '');
      assert.deepEqual(empty, [], `empty values in ${lang}`);
    });

    it(`${lang}: placeholders match uz for every key`, () => {
      const table = translationTable(lang);
      const mismatched = keys.filter((k) => placeholders(table[k]).join() !== placeholders(uz[k]).join());
      assert.deepEqual(mismatched, []);
    });

    it(`${lang}: no value looks like a raw key`, () => {
      const table = translationTable(lang);
      const raw = Object.entries(table).filter(([k, v]) => v === k || /^[a-z]+\.[a-zA-Z_]+$/.test(v));
      assert.deepEqual(raw, []);
    });
  }

  it('ru/en are actually translated (identical-to-uz values are limited to brands/symbols)', () => {
    const suspicious: string[] = [];
    for (const lang of ['ru', 'en'] as const) {
      const table = translationTable(lang);
      for (const k of keys) {
        if (table[k] === uz[k] && !IDENTICAL_ALLOWED.test(uz[k])) suspicious.push(`${lang}:${k}=${uz[k]}`);
      }
    }
    console.log(`UNTRANSLATED KEYS: ${suspicious.length}`);
    assert.deepEqual(suspicious, []);
  });

  it('ru values are Cyrillic and uz/en values are Latin (spot check on nav titles)', () => {
    for (const k of keys.filter((key) => key.startsWith('common.nav') && key !== 'common.navCashback')) {
      assert.match(translationTable('ru')[k], /[А-Яа-яЁё]/, `ru ${k}`);
      assert.doesNotMatch(translationTable('en')[k], /[А-Яа-яЁё]/, `en ${k}`);
      assert.doesNotMatch(translationTable('uz')[k], /[А-Яа-яЁё]/, `uz ${k}`);
    }
  });
});

describe('glossary', () => {
  const glossary: Record<string, [string, string, string]> = {
    'common.navOrders': ['Buyurtmalar', 'Заказы', 'Orders'],
    'common.navBranches': ['Dorixonalar', 'Аптеки', 'Pharmacies'],
    'common.navCashback': ['Cashback', 'Кэшбэк', 'Cashback'],
    'common.navProfile': ['Profil', 'Профиль', 'Profile'],
    'common.navNotifications': ['Bildirishnomalar', 'Уведомления', 'Notifications'],
    'common.navHelp': ['Yordam markazi', 'Центр помощи', 'Help Center'],
    'common.logout': ['Chiqish', 'Выйти', 'Log out'],
  };
  for (const [key, [uzV, ruV, enV]] of Object.entries(glossary)) {
    it(key, () => {
      assert.equal(translate('uz', key), uzV);
      assert.equal(translate('ru', key), ruV);
      assert.equal(translate('en', key), enV);
    });
  }
});

describe('translate / fallback / current language', () => {
  it('defaults to Uzbek', () => {
    assert.equal(FALLBACK_LANGUAGE, 'uz');
    assert.equal(getCurrentLanguage(), 'uz');
    assert.equal(tr('common.navOrders'), 'Buyurtmalar');
  });

  it('switches immediately via the current-language mirror', () => {
    setCurrentLanguage('ru');
    assert.equal(tr('common.navOrders'), 'Заказы');
    setCurrentLanguage('en');
    assert.equal(tr('common.navOrders'), 'Orders');
    setCurrentLanguage('uz');
  });

  it('interpolates params and leaves unknown placeholders intact', () => {
    assert.equal(interpolate('a {x} b {y}', { x: 1 }), 'a 1 b {y}');
    assert.equal(createT('en')('common.moneyAmount', { amount: '1,000' }), '1,000 UZS');
  });

  it('falls back to Uzbek when a language lacks a key', () => {
    const table = translationTable('ru') as Record<string, string>;
    const original = table['common.navOrders'];
    delete table['common.navOrders'];
    try {
      assert.equal(translate('ru', 'common.navOrders'), 'Buyurtmalar');
      assert.ok(getMissingTranslationKeys().includes('ru:common.navOrders'));
    } finally {
      table['common.navOrders'] = original;
    }
  });

  it('never shows a raw key to users in production builds', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.equal(translate('en', 'nope.missingKey'), '');
    } finally {
      process.env.NODE_ENV = prev;
    }
    assert.ok(getMissingTranslationKeys().includes('uz:nope.missingKey'));
  });

  it('hasTranslation guards dynamic keys', () => {
    assert.equal(hasTranslation('status.payment_PAID'), true);
    assert.equal(hasTranslation('status.payment_WHATEVER'), false);
  });
});
