import { isLanguage, type Language } from '@/lib/languages';

export const DEFAULT_LANGUAGE: Language = 'uz';

/** Stored device preference, or null when none/invalid (caller falls back to DEFAULT_LANGUAGE). */
export function parseStoredLanguage(value: unknown): Language | null {
  return isLanguage(value) ? value : null;
}

export type ProfileLanguageDecision = {
  /** Language to apply locally (and persist), when the server value should be adopted. */
  adopt: Language | null;
  /** Language to PATCH to the profile, when the device preference should win. */
  push: Language | null;
};

/**
 * The device preference is authoritative once the user picked a language (also before login),
 * so logging in never silently switches the UI. The profile language is adopted only when the
 * device has no preference yet.
 */
export function decideProfileLanguage(input: {
  local: Language;
  hasLocalPreference: boolean;
  server: unknown;
}): ProfileLanguageDecision {
  const server = isLanguage(input.server) ? input.server : null;
  if (input.hasLocalPreference) {
    return { adopt: null, push: server === input.local ? null : input.local };
  }
  return { adopt: server, push: null };
}
