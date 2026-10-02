import type { Language } from '@/lib/languages';

export type { Language };

export type TranslationParams = Record<string, string | number>;

/**
 * Declares one namespace of UI copy. `uz` is the source of truth; `ru` and `en`
 * must contain exactly the same keys (missing or extra keys are type errors).
 */
export function defineMessages<const U extends Record<string, string>>(messages: {
  uz: U;
  ru: { [K in keyof U]: string };
  en: { [K in keyof U]: string };
}) {
  return messages;
}

export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

export function isDevBuild(): boolean {
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  if (typeof dev === 'boolean') return dev;
  return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
}
