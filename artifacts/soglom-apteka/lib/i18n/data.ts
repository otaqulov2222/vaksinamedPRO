import type { Language } from './core';

type LocalizedNameSource = { nameUz?: unknown; nameRu?: unknown } | null | undefined;

/** Server catalog data only has uz/ru names; English falls back to the Latin-script Uzbek name. */
export function localizedName(language: Language, item: LocalizedNameSource): string {
  const uz = item?.nameUz != null ? String(item.nameUz).trim() : '';
  const ru = item?.nameRu != null ? String(item.nameRu).trim() : '';
  return language === 'ru' ? ru || uz : uz || ru;
}

const CYR_TO_LAT: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo', Ж: 'J', З: 'Z', И: 'I', Й: 'Y',
  К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F',
  Х: 'X', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Sh', Ъ: "'", Ы: 'I', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
  Ў: "O‘", Қ: 'Q', Ғ: "G‘", Ҳ: 'H',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'x', ц: 'ts', ч: 'ch', sh: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: "o‘", қ: 'q', ғ: "g‘", ҳ: 'h',
};

export function toLatin(str: string): string {
  if (!str) return '';
  const isAllCaps = str === str.toUpperCase();
  let res = str.replace(/[А-Яа-яЎўҚқҒғҲҳЁё]/g, (ch) => CYR_TO_LAT[ch] || ch);
  if (isAllCaps) {
    res = res.toUpperCase();
  }
  return res;
}

export function localizedBranchName(language: Language, name?: string): string {
  const clean = String(name || '').replace(/^Vaksina Med\s*[·•\-]\s*/i, '').trim();
  if (!clean) return '';
  if (language === 'ru') return clean;
  return toLatin(clean);
}

export function localizedBranchAddress(language: Language, address?: string): string {
  const raw = String(address || '').trim();
  if (!raw) return '';
  if (language === 'ru') return raw;
  const s = raw
    .replace(/^г\.\s*Ташкент/i, 'Toshkent sh.')
    .replace(/Яккасарайский район/i, 'Yakkasaroy t.')
    .replace(/Чиланзарский район/i, 'Chilonzor t.')
    .replace(/Мирзо-Улугбекский район/i, 'Mirzo Ulug‘bek t.')
    .replace(/Юнусабадский район/i, 'Yunusobod t.')
    .replace(/Шайхантахурский район/i, 'Shayxontohur t.')
    .replace(/Яшнабадский район/i, 'Yashnobod t.')
    .replace(/Мирабадский район/i, 'Mirobod t.')
    .replace(/Учтепинский район/i, 'Uchtepa t.')
    .replace(/Алмазарский район/i, 'Olmazor t.')
    .replace(/Сергелийский район/i, 'Sergeli t.')
    .replace(/ул\.\s*/gi, '')
    .replace(/дом\s*(\d+)/gi, '$1-uy')
    .replace(/шахар/gi, 'sh.')
    .replace(/шаҳар/gi, 'sh.')
    .replace(/тумани/gi, 't.')
    .replace(/кўчаси/gi, 'k.')
    .replace(/кучаси/gi, 'k.')
    .replace(/МФЙ/gi, 'MFY')
    .replace(/мавзеси/gi, 'mavzesi');
  return toLatin(s);
}
