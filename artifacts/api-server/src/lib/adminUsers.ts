/**
 * Admin management (Phase 13.16) — input validation, DTO and error factories.
 * Role/branch existence is checked by the route against auth_roles / branches (source of truth).
 * Never returns or accepts passwordHash; the plaintext password only flows into hashPassword().
 */
import type { AdminUser } from "@workspace/db";
import { normalizeAdminRole } from "./securityEnv";

export const ADMIN_STATUSES = ["active", "disabled"] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export const ADMIN_EMAIL_MAX = 254;
export const ADMIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ADMIN_NAME_MIN = 2;
export const ADMIN_NAME_MAX = 120;
/** Same minimum as the existing password rule ("Parol kamida 6 ta belgidan iborat bo‘lsin"). */
export const ADMIN_PASSWORD_MIN = 6;
export const ADMIN_PASSWORD_MAX = 128;

export const ADMIN_USERS_DEFAULT_LIMIT = 25;
export const ADMIN_USERS_MAX_LIMIT = 50;

/** Serializes admin mutations so the last-active-super-admin invariant cannot be raced. */
export const ADMIN_MUTATION_LOCK_KEY = 1316001;

type HttpError = Error & { status: number; code: string };

function httpError(status: number, code: string, message: string): HttpError {
  return Object.assign(new Error(message), { status, code });
}

export const adminInvalidError = (message: string) => httpError(422, "ADMIN_INVALID", message);
export const adminRoleInvalidError = () => httpError(422, "ADMIN_ROLE_INVALID", "Bunday rol mavjud emas.");
export const adminBranchInvalidError = (message = "Filial topilmadi.") => httpError(422, "ADMIN_BRANCH_INVALID", message);
export const adminEmailTakenError = () => httpError(409, "ADMIN_EMAIL_TAKEN", "Bu email bilan administrator allaqachon mavjud.");
export const adminNotFoundError = () => httpError(404, "ADMIN_NOT_FOUND", "Administrator topilmadi.");
export const adminSelfProtectedError = (message: string) => httpError(409, "ADMIN_SELF_PROTECTED", message);
export const adminLastSuperAdminError = () =>
  httpError(409, "ADMIN_LAST_ACTIVE_SUPER_ADMIN", "Oxirgi faol bosh administratorni o‘chirib yoki rolini o‘zgartirib bo‘lmaydi.");
export const adminScopeForbiddenError = (message = "Bu amal uchun ruxsat yo‘q") => httpError(403, "ADMIN_SCOPE_FORBIDDEN", message);

export type AdminUserDto = {
  id: number;
  email: string;
  name: string;
  role: string;
  branchId: number | null;
  branchName: string | null;
  status: AdminStatus;
  createdAt: string;
  updatedAt: string;
};

/** Explicit allow-list — passwordHash and any session material are never copied. */
export function toAdminUserDto(row: AdminUser, branchName: string | null = null): AdminUserDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: normalizeAdminRole(row.role),
    branchId: row.branchId ?? null,
    branchName: row.branchId == null ? null : branchName,
    status: row.status === "disabled" ? "disabled" : "active",
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function normalizeAdminEmail(raw: string) {
  return raw.trim().toLowerCase();
}

function asBody(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function parseEmail(value: unknown) {
  if (typeof value !== "string") throw adminInvalidError("Email majburiy.");
  const email = normalizeAdminEmail(value);
  if (!email) throw adminInvalidError("Email majburiy.");
  if (email.length > ADMIN_EMAIL_MAX || !ADMIN_EMAIL_PATTERN.test(email)) throw adminInvalidError("Email noto‘g‘ri.");
  return email;
}

function parseName(value: unknown) {
  if (typeof value !== "string") throw adminInvalidError("Ism majburiy.");
  const name = value.trim();
  if (name.length < ADMIN_NAME_MIN) throw adminInvalidError(`Ism kamida ${ADMIN_NAME_MIN} ta belgidan iborat bo‘lsin.`);
  if (name.length > ADMIN_NAME_MAX) throw adminInvalidError(`Ism ${ADMIN_NAME_MAX} belgidan oshmasin.`);
  return name;
}

function parseRoleCode(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw adminRoleInvalidError();
  return value.trim();
}

/** null = HQ (no branch). Existence is checked against branches by the route. */
function parseBranchId(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  throw adminBranchInvalidError("Filial noto‘g‘ri.");
}

export function parseAdminPassword(value: unknown) {
  if (typeof value !== "string" || !value) throw adminInvalidError("Parol majburiy.");
  if (value.length < ADMIN_PASSWORD_MIN) throw adminInvalidError(`Parol kamida ${ADMIN_PASSWORD_MIN} ta belgidan iborat bo‘lsin.`);
  if (value.length > ADMIN_PASSWORD_MAX) throw adminInvalidError(`Parol ${ADMIN_PASSWORD_MAX} belgidan oshmasin.`);
  return value;
}

export type AdminCreateInput = { email: string; name: string; role: string; branchId: number | null; password: string };

export function parseAdminCreate(raw: unknown): AdminCreateInput {
  const body = asBody(raw);
  if (!("branchId" in body)) throw adminBranchInvalidError("Filial majburiy (bosh ofis uchun null).");
  return {
    name: parseName(body.name),
    email: parseEmail(body.email),
    role: parseRoleCode(body.role),
    branchId: parseBranchId(body.branchId),
    password: parseAdminPassword(body.password),
  };
}

export type AdminUpdateInput = Partial<{ email: string; name: string; role: string; branchId: number | null }>;

const UPDATE_KEYS = new Set(["email", "name", "role", "branchId"]);

/** Only keys present in the body are validated and returned; status/password have dedicated endpoints. */
export function parseAdminUpdate(raw: unknown): AdminUpdateInput {
  const body = asBody(raw);
  for (const key of Object.keys(body)) {
    if (key === "status") throw adminInvalidError("Holat PATCH /api/admin/users/:id/status orqali o‘zgartiriladi.");
    if (key === "password" || key === "passwordHash") throw adminInvalidError("Parol PATCH /api/admin/users/:id/password orqali o‘zgartiriladi.");
    if (!UPDATE_KEYS.has(key)) throw adminInvalidError(`Noma’lum maydon: ${key.slice(0, 40)}`);
  }
  const values: AdminUpdateInput = {};
  if ("name" in body) values.name = parseName(body.name);
  if ("email" in body) values.email = parseEmail(body.email);
  if ("role" in body) values.role = parseRoleCode(body.role);
  if ("branchId" in body) values.branchId = parseBranchId(body.branchId);
  if (!Object.keys(values).length) throw adminInvalidError("O‘zgartirish uchun maydon yuborilmadi.");
  return values;
}

export function parseAdminStatus(raw: unknown): AdminStatus {
  const status = asBody(raw).status;
  if (status === "active" || status === "disabled") return status;
  throw adminInvalidError("Holat 'active' yoki 'disabled' bo‘lishi kerak.");
}

export function parseAdminListStatus(raw: unknown): AdminStatus | undefined {
  if (raw == null || raw === "") return undefined;
  if (raw === "active" || raw === "disabled") return raw;
  throw adminInvalidError("Holat filtri noto‘g‘ri.");
}

export function parsePositiveIntParam(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[1-9][0-9]{0,9}$/.test(raw)) return null;
  const value = Number(raw);
  return value <= 2_147_483_647 ? value : null;
}

/** Public id of the caller's own session (never the secret) — used to keep it alive on self password change. */
export function sessionPublicIdFromBearer(authorization: string | undefined): string | null {
  const token = authorization?.replace(/^Bearer\s+/i, "") || "";
  const parts = token.split(".");
  return parts.length === 3 && parts[0] === "s1" && parts[1] ? parts[1] : null;
}
