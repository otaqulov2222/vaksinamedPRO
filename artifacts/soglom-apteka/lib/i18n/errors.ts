import { FALLBACK_LANGUAGE, getCurrentLanguage, type TFunction, type TranslationKey } from './index';

export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

type ErrorLike = { status?: number; code?: string; message?: string } | null | undefined;

export type ErrorOverrides = {
  byStatus?: Partial<Record<number, TranslationKey>>;
  byCode?: Record<string, TranslationKey>;
  /** Shown when nothing more specific matches. Defaults to common.errorGeneric. */
  fallback?: TranslationKey;
};

export function isNetworkError(err: unknown): boolean {
  const e = err as ErrorLike;
  if (!e) return false;
  if (e.code === NETWORK_ERROR_CODE) return true;
  return !e.status && /Failed to fetch|Network request failed|NetworkError/i.test(String(e.message || ''));
}

/**
 * Converts an API/network error into user-facing copy in the active language.
 * Backend messages are authored in Uzbek, so they are only surfaced verbatim
 * when the UI language is Uzbek and no localized mapping applies.
 */
export function localizeError(err: unknown, t: TFunction, overrides: ErrorOverrides = {}): string {
  const e = (err ?? {}) as NonNullable<ErrorLike>;
  if (e.code && overrides.byCode?.[e.code]) return t(overrides.byCode[e.code]);
  if (isNetworkError(e)) return t('common.errorNetwork');
  const status = typeof e.status === 'number' ? e.status : undefined;
  const byStatus = status != null ? overrides.byStatus?.[status] : undefined;
  if (byStatus) return t(byStatus);
  if (status === 429) return t('common.errorTooManyAttempts');
  if (status != null && status >= 500) return t('common.errorServer');
  const serverMessage = String(e.message || '').trim();
  if (
    getCurrentLanguage() === FALLBACK_LANGUAGE
    && status != null
    && serverMessage
    && !/^HTTP \d+$/.test(serverMessage)
  ) {
    return serverMessage;
  }
  if (status === 401) return t('common.errorSessionExpired');
  if (status === 403) return t('common.errorForbidden');
  if (status === 404) return t('common.errorNotFound');
  return t(overrides.fallback ?? 'common.errorGeneric');
}
