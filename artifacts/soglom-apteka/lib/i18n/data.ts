import type { Language } from './core';

type LocalizedNameSource = { nameUz?: unknown; nameRu?: unknown } | null | undefined;

/** Server catalog data only has uz/ru names; English falls back to the Latin-script Uzbek name. */
export function localizedName(language: Language, item: LocalizedNameSource): string {
  const uz = item?.nameUz != null ? String(item.nameUz).trim() : '';
  const ru = item?.nameRu != null ? String(item.nameRu).trim() : '';
  return language === 'ru' ? ru || uz : uz || ru;
}
