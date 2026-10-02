/** Canonical customer-facing language metadata. Single source for flags/codes/labels. */

export type Language = 'uz' | 'ru' | 'en';

export type LanguageMeta = {
  code: Language;
  /** Uppercase UI code shown in badges (UZ / RU / EN). */
  shortCode: string;
  /** Endonym — always shown in its own language so users can find it from any UI language. */
  nativeName: string;
  /** Translation key for the language name in the current UI language. */
  nameKey: `common.languageName_${Language}`;
};

export const LANGUAGES: readonly LanguageMeta[] = [
  { code: 'uz', shortCode: 'UZ', nativeName: 'O‘zbekcha', nameKey: 'common.languageName_uz' }, // i18n-ignore: endonym
  { code: 'ru', shortCode: 'RU', nativeName: 'Русский', nameKey: 'common.languageName_ru' }, // i18n-ignore: endonym
  { code: 'en', shortCode: 'EN', nativeName: 'English', nameKey: 'common.languageName_en' }, // i18n-ignore: endonym
] as const;

export function isLanguage(value: unknown): value is Language {
  return value === 'uz' || value === 'ru' || value === 'en';
}

export function getLanguageMeta(code: Language | string | null | undefined): LanguageMeta {
  const match = LANGUAGES.find((item) => item.code === code);
  return match ?? LANGUAGES[0];
}
