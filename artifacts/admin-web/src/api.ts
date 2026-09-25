export type AdminUser = {
  id: number;
  email: string;
  name: string;
  role: string;
  branchId: number | null;
};

export type ApiError = Error & { status?: number; code?: string };

const API = "";

export async function request(path: string, token: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${API}${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error((data as { message?: string }).message || `HTTP ${response.status}`) as ApiError;
    err.status = response.status;
    if ((data as { code?: string }).code) err.code = String((data as { code: string }).code);
    throw err;
  }
  return data;
}

export async function softRequest(path: string, token: string | null) {
  try {
    return await request(path, token);
  } catch {
    return null;
  }
}

/** Uzbek-friendly money: `125 500 so‘m` (space thousands). Display only — not authority. */
export function money(value: number) {
  const n = Math.round(Number(value) || 0);
  const abs = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 ? "−" : ""}${abs} so‘m`;
}

export function isHqRole(role: string) {
  const r = String(role || "").toLowerCase();
  return r === "super_admin" || r === "admin" || r === "hq";
}

export function fmtDate(value: unknown) {
  if (!value) return "—";
  try {
    return new Date(String(value)).toLocaleString("uz-UZ");
  } catch {
    return String(value);
  }
}
