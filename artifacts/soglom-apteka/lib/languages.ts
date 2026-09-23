/** Canonical customer-facing language metadata. Single source for flags/codes/labels. */

export type Language = 'uz' | 'ru' | 'en';

export type LanguageMeta = {
  code: Language;
  /** Uppercase UI code shown in badges (UZ / RU / EN). */
  shortCode: string;
  /** Native / primary display name. */
  nativeName: string;
  /** Secondary label (often English or role description). */
  displayName: string;
};

export const LANGUAGES: readonly LanguageMeta[] = [
  {
    code: 'uz',
    shortCode: 'UZ',
    nativeName: 'O‘zbekcha',
    displayName: 'Asosiy til',
  },
  {
    code: 'ru',
    shortCode: 'RU',
    nativeName: 'Русский',
    displayName: 'Russian',
  },
  {
    code: 'en',
    shortCode: 'EN',
    nativeName: 'English',
    displayName: 'English',
  },
] as const;

export function isLanguage(value: unknown): value is Language {
  return value === 'uz' || value === 'ru' || value === 'en';
}

export function getLanguageMeta(code: Language | string | null | undefined): LanguageMeta {
  const match = LANGUAGES.find((item) => item.code === code);
  return match ?? LANGUAGES[0];
}
