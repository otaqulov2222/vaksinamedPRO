import type { Language } from './core';
import { translate } from './index';

/** Manual formatting: Hermes ships partial Intl data, so output must not depend on the runtime locale tables. */

const GROUP_SEPARATOR: Record<Language, string> = { uz: '\u00A0', ru: '\u00A0', en: ',' };

const MONTHS: Record<Language, readonly string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Statement-style abbreviations; iyun/iyul need distinct forms, so these are not truncations of MONTHS. */
const MONTHS_SHORT: Record<Language, readonly string[]> = {
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'],
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export function formatNumber(value: number, language: Language): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n);
  const digits = String(Math.abs(rounded));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR[language]);
  return rounded < 0 ? `−${grouped}` : grouped;
}

/** Integer UZS amount in the app currency; never converts or rounds to decimals. */
export function formatMoney(value: number, language: Language): string {
  return translate(language, 'common.moneyAmount', { amount: formatNumber(value, language) });
}

function toDate(input: string | number | Date | null | undefined): Date | null {
  if (input == null || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatTime(input: string | number | Date | null | undefined): string {
  const d = toDate(input);
  if (!d) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `short`: ledger column form "05 okt" (day + abbreviated month, no year or time). */
export type DateFormatOptions = { withYear?: boolean; withTime?: boolean; short?: boolean };

export function formatDate(
  input: string | number | Date | null | undefined,
  language: Language,
  options: DateFormatOptions = {},
): string {
  const d = toDate(input);
  if (!d) return '';
  if (options.short) return `${pad2(d.getDate())} ${MONTHS_SHORT[language][d.getMonth()]}`;
  const { withYear = true, withTime = false } = options;
  const day = d.getDate();
  const month = MONTHS[language][d.getMonth()];
  const year = d.getFullYear();
  let out: string;
  if (language === 'en') {
    out = withYear ? `${month} ${day}, ${year}` : `${month} ${day}`;
  } else {
    out = withYear ? `${day} ${month} ${year}` : `${day} ${month}`;
  }
  return withTime ? `${out}, ${formatTime(d)}` : out;
}

export type Formatters = {
  money: (value: number) => string;
  number: (value: number) => string;
  date: (input: string | number | Date | null | undefined, options?: DateFormatOptions) => string;
  time: (input: string | number | Date | null | undefined) => string;
};

export function createFormatters(language: Language): Formatters {
  return {
    money: (value) => formatMoney(value, language),
    number: (value) => formatNumber(value, language),
    date: (input, options) => formatDate(input, language, options),
    time: (input) => formatTime(input),
  };
}
