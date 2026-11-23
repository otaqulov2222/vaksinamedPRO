/**
 * Region chips for the customer branches map.
 * Non-Tashkent: one chip per viloyat (merge "Andijon" + "Andijon viloyati").
 * Tashkent only: keep city and viloyat separate.
 */

function norm(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[‘’ʻ`]/g, "'")
    .replace(/\s+/g, " ");
}

export type BranchRegionChip = {
  key: string;
  label: string;
};

export function branchRegionKey(region: string): string {
  const raw = norm(region);
  if (!raw) return "";
  if (raw.startsWith("toshkent shah") || raw === "toshkent" || /^г\.?\s*ташкент/.test(raw)) {
    return "toshkent-city";
  }
  if (raw.startsWith("toshkent viloyat")) {
    return "toshkent-region";
  }
  return raw.replace(/\s+viloyati$/i, "").trim();
}

export function branchRegionLabel(region: string): string {
  const key = branchRegionKey(region);
  if (key === "toshkent-city") return "Toshkent shahar";
  if (key === "toshkent-region") return "Toshkent viloyati";
  const trimmed = String(region || "").trim().replace(/\s+viloyati$/i, "").trim();
  return trimmed || region;
}

export function sameBranchRegion(a: string, b: string): boolean {
  const ka = branchRegionKey(a);
  const kb = branchRegionKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}

/** Unique chip labels from raw DB region strings, sorted. */
export function uniqueBranchRegionChips(regions: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const region of regions) {
    const key = branchRegionKey(region);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, branchRegionLabel(region));
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "uz"));
}
