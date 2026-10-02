import { interpolate, isDevBuild, type Language, type TranslationParams } from './core';
import auth from './messages/auth';
import branches from './messages/branches';
import cart from './messages/cart';
import cashback from './messages/cashback';
import catalog from './messages/catalog';
import common from './messages/common';
import components from './messages/components';
import home from './messages/home';
import orders from './messages/orders';
import profile from './messages/profile';
import status from './messages/status';

export type { Language, TranslationParams };

export const FALLBACK_LANGUAGE: Language = 'uz';
export const SUPPORTED_LANGUAGES: readonly Language[] = ['uz', 'ru', 'en'];

const catalogs = {
  common,
  status,
  auth,
  home,
  catalog,
  cart,
  orders,
  profile,
  cashback,
  branches,
  components,
} as const;

type Catalogs = typeof catalogs;
export type Namespace = keyof Catalogs;
export type TranslationKey = {
  [N in Namespace]: `${N}.${keyof Catalogs[N]['uz'] & string}`;
}[Namespace];

export type TFunction = (key: TranslationKey, params?: TranslationParams) => string;

function flatten(language: Language): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ns of Object.keys(catalogs) as Namespace[]) {
    const table = catalogs[ns][language] as Record<string, string>;
    for (const key of Object.keys(table)) out[`${ns}.${key}`] = table[key];
  }
  return out;
}

const tables: Record<Language, Record<string, string>> = {
  uz: flatten('uz'),
  ru: flatten('ru'),
  en: flatten('en'),
};

const missingKeys = new Set<string>();

function reportMissing(key: string, language: Language) {
  const id = `${language}:${key}`;
  if (missingKeys.has(id)) return;
  missingKeys.add(id);
  if (isDevBuild()) console.warn(`[i18n] missing translation: ${id}`);
}

export function getMissingTranslationKeys(): string[] {
  return [...missingKeys];
}

export function hasTranslation(key: string): key is TranslationKey {
  return Object.prototype.hasOwnProperty.call(tables[FALLBACK_LANGUAGE], key);
}

export function allTranslationKeys(): TranslationKey[] {
  return Object.keys(tables[FALLBACK_LANGUAGE]) as TranslationKey[];
}

export function translationTable(language: Language): Readonly<Record<string, string>> {
  return tables[language];
}

/**
 * Resolves a key in the requested language, falling back to Uzbek.
 * Unknown keys are reported; users never see a raw key in production builds.
 */
export function translate(language: Language, key: TranslationKey | string, params?: TranslationParams): string {
  const own = tables[language]?.[key];
  if (own != null && own !== '') return interpolate(own, params);
  if (language !== FALLBACK_LANGUAGE) reportMissing(key, language);
  const fallback = tables[FALLBACK_LANGUAGE][key];
  if (fallback != null) return interpolate(fallback, params);
  reportMissing(key, FALLBACK_LANGUAGE);
  return isDevBuild() ? key : '';
}

let currentLanguage: Language = FALLBACK_LANGUAGE;
const listeners = new Set<(language: Language) => void>();

/** Mirror of the app language for code outside React (API errors, dialogs). Owned by AppContext. */
export function setCurrentLanguage(language: Language) {
  if (language === currentLanguage) return;
  currentLanguage = language;
  for (const listener of listeners) listener(language);
}

export function getCurrentLanguage(): Language {
  return currentLanguage;
}

export function onLanguageChange(listener: (language: Language) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Translate with the current app language (non-React code only). */
export const tr: TFunction = (key, params) => translate(currentLanguage, key, params);

export function createT(language: Language): TFunction {
  return (key, params) => translate(language, key, params);
}
