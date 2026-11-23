/**
 * Birth-date helpers — accept user-friendly separators, store as YYYY-MM-DD.
 * Accepted: 2004.05.07 | 2004/05/07 | 2004_05_07 | 2004-05-07 | 20040507
 */

const SEP = /[-./_]/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (y < 1900 || y > new Date().getFullYear()) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Normalize any supported input to `YYYY-MM-DD`, or null if empty/invalid. */
export function parseBirthDate(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const parts = raw.split(SEP).filter(Boolean);
  let y: number;
  let m: number;
  let d: number;

  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    y = Number(parts[0]);
    m = Number(parts[1]);
    d = Number(parts[2]);
  } else {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 8) return null;
    y = Number(digits.slice(0, 4));
    m = Number(digits.slice(4, 6));
    d = Number(digits.slice(6, 8));
  }

  if (!isValidYmd(y, m, d)) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Progressive mask while typing — display as YYYY.MM.DD from digits. */
export function formatBirthDateInput(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

/** API/storage form → display with dots. */
export function birthDateToDisplay(iso: string): string {
  const parsed = parseBirthDate(iso);
  if (!parsed) return '';
  return parsed.replace(/-/g, '.');
}
