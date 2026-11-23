/**
 * Region chips for Dorixonalar.
 * Non-Tashkent: one chip (merge "Andijon" + "Andijon viloyati").
 * Tashkent only: "Toshkent shahar" + "Toshkent viloyati".
 */

function norm(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[‘’ʻ`]/g, "'")
    .replace(/\s+/g, ' ');
}

export function branchRegionKey(region: string): string {
  const raw = norm(region);
  if (!raw) return '';
  if (raw.startsWith('toshkent shah') || raw === 'toshkent' || /^г\.?\s*ташкент/.test(raw)) { // i18n-ignore — endonym matcher
    return 'toshkent-city';
  }
  if (raw.startsWith('toshkent viloyat')) { // i18n-ignore — endonym matcher
    return 'toshkent-region';
  }
  return raw.replace(/\s+viloyati$/i, '').trim();
}

export function branchRegionLabel(region: string): string {
  const key = branchRegionKey(region);
  if (key === 'toshkent-city') return 'Toshkent shahar'; // i18n-ignore — chip endonym
  if (key === 'toshkent-region') return 'Toshkent viloyati'; // i18n-ignore — chip endonym
  const trimmed = String(region || '')
    .trim()
    .replace(/\s+viloyati$/i, '')
    .trim();
  return trimmed || region;
}

export function uniqueBranchRegionChips(regions: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const region of regions) {
    const key = branchRegionKey(region);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, branchRegionLabel(region));
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'uz'));
}
