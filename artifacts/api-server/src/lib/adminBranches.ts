/**
 * Admin branch write validation (POST / PATCH /admin/branches).
 * Merchant secrets are handled by the route (mask guard + encryption), never here.
 */

export type BranchWritable = {
  code: string;
  name: string;
  region: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  hours: string;
  lat: number;
  lng: number;
  isOpen: boolean;
  is24h: boolean;
  paymeMerchantId: string;
  clickMerchantId: string;
  clickServiceId: string;
};

type TextRule = { key: keyof BranchWritable; label: string; max: number; required?: boolean; pattern?: RegExp; patternMessage?: string };

export const BRANCH_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/;
export const BRANCH_PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,24}$/;

const TEXT_RULES: TextRule[] = [
  { key: "code", label: "Kod", max: 32, required: true, pattern: BRANCH_CODE_PATTERN, patternMessage: "Kod faqat lotin harf, raqam, - va _ dan iborat bo‘lsin (2–32 belgi)." },
  { key: "name", label: "Nomi", max: 120, required: true },
  { key: "region", label: "Hudud", max: 80, required: true },
  { key: "city", label: "Shahar", max: 80 },
  { key: "district", label: "Tuman", max: 80 },
  { key: "address", label: "Manzil", max: 240, required: true },
  { key: "phone", label: "Telefon", max: 32, required: true, pattern: BRANCH_PHONE_PATTERN, patternMessage: "Telefon raqami noto‘g‘ri (masalan, +998 71 123-45-67)." },
  { key: "hours", label: "Ish vaqti", max: 80 },
  { key: "paymeMerchantId", label: "Payme merchant ID", max: 64 },
  { key: "clickMerchantId", label: "Click merchant ID", max: 64 },
  { key: "clickServiceId", label: "Click service ID", max: 64 },
];

const COORD_RULES: { key: "lat" | "lng"; label: string; limit: number }[] = [
  { key: "lat", label: "Kenglik", limit: 90 },
  { key: "lng", label: "Uzunlik", limit: 180 },
];

const BOOL_KEYS: ("isOpen" | "is24h")[] = ["isOpen", "is24h"];

export type BranchInputResult =
  | { ok: true; values: Partial<BranchWritable> }
  | { ok: false; message: string };

/**
 * create: every required field must be present and valid; defaults fill the rest.
 * update: only keys present in the body are validated and returned.
 */
export function parseBranchInput(raw: unknown, mode: "create" | "update"): BranchInputResult {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const values: Partial<BranchWritable> = {};

  for (const rule of TEXT_RULES) {
    const present = body[rule.key] !== undefined;
    if (!present) {
      if (mode === "create" && rule.required) return { ok: false, message: `${rule.label} majburiy.` };
      continue;
    }
    if (typeof body[rule.key] !== "string") return { ok: false, message: `${rule.label} matn bo‘lishi kerak.` };
    const value = (body[rule.key] as string).trim();
    if (rule.required && !value) return { ok: false, message: `${rule.label} majburiy.` };
    if (value.length > rule.max) return { ok: false, message: `${rule.label} ${rule.max} belgidan oshmasin.` };
    if (value && rule.pattern && !rule.pattern.test(value)) return { ok: false, message: rule.patternMessage || `${rule.label} noto‘g‘ri.` };
    (values as Record<string, unknown>)[rule.key] = value;
  }

  for (const rule of COORD_RULES) {
    const present = body[rule.key] !== undefined;
    if (!present) {
      if (mode === "create") return { ok: false, message: `${rule.label} majburiy.` };
      continue;
    }
    const value = body[rule.key];
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > rule.limit) {
      return { ok: false, message: `${rule.label} −${rule.limit}…${rule.limit} oralig‘idagi son bo‘lsin.` };
    }
    values[rule.key] = value;
  }

  for (const key of BOOL_KEYS) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "boolean") return { ok: false, message: "Holat qiymati noto‘g‘ri." };
    values[key] = body[key] as boolean;
  }

  if (mode === "create") {
    if (!values.city) values.city = values.region;
    if (values.isOpen === undefined) values.isOpen = true;
    if (values.is24h === undefined) values.is24h = false;
    if (!values.hours) values.hours = values.is24h ? "24/7" : "08:00 — 22:00";
  }

  return { ok: true, values };
}

export function branchValidationError(message: string) {
  return Object.assign(new Error(message), { status: 400, code: "BRANCH_INVALID" });
}

export function branchCodeTakenError() {
  return Object.assign(new Error("Bu kod bilan filial allaqachon mavjud."), { status: 409, code: "BRANCH_CODE_TAKEN" });
}

export type BranchReference = { label: string; count: number };

/** Human summary of linked records that block a hard delete. */
export function branchInUseMessage(refs: BranchReference[]) {
  const parts = refs.filter((r) => r.count > 0).map((r) => `${r.count} ta ${r.label}`);
  return `Filialni o‘chirib bo‘lmaydi: unga ${parts.join(", ")} bog‘langan. Uning o‘rniga filialni yoping.`;
}

export function isUniqueViolation(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
