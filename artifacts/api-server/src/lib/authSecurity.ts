/**
 * Auth events + admin sessions (Phase 13.17) — query parsing, DTOs and error factories.
 * auth_events stores ip_address / user_agent since 0013 (Phase 13.18; older rows are NULL); the raw User-Agent is
 * never returned, only a browser / OS summary. auth_sessions stores user_agent + device_label only (no IP).
 * Session DTOs use the numeric row id — public_id is part of the bearer token and is never returned.
 */
import type { AuthSession } from "@workspace/db";
import { sanitizeAuditPayload, tashkentBusinessDayUtcRange } from "./adminOrderOps";
import { normalizeIp } from "./requestTelemetry";

export const AUTH_EVENTS_DEFAULT_LIMIT = 25;
export const AUTH_EVENTS_MAX_LIMIT = 50;
export const ADMIN_SESSIONS_DEFAULT_LIMIT = 10;
export const ADMIN_SESSIONS_MAX_LIMIT = 50;
export const SESSION_STATUSES = ["active", "expired", "revoked"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * Scalar meta keys written by recordAuthEvent callers that are safe to show; everything else is dropped.
 * Session references (sessionPublicId, sessionId) never pass: the scrubber drops every key containing "session".
 */
const EVENT_DETAIL_KEYS = ["permission", "role", "resourceBranchId", "count", "revoked", "byAdminId", "expiresAt"] as const;

type HttpError = Error & { status: number; code: string };

function httpError(status: number, code: string, message: string): HttpError {
  return Object.assign(new Error(message), { status, code });
}

export const authEventFilterError = (message: string) => httpError(422, "AUTH_EVENT_FILTER_INVALID", message);
export const sessionFilterError = (message: string) => httpError(422, "SESSION_FILTER_INVALID", message);
export const sessionNotFoundError = () => httpError(404, "SESSION_NOT_FOUND", "Sessiya topilmadi.");

export function parsePage(query: Record<string, unknown>, defaults: { limit: number; max: number }) {
  const limitRaw = Number(query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(defaults.max, Math.floor(limitRaw)) : defaults.limit;
  const offsetRaw = Number(query.offset);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  return { limit, offset };
}

export function pagination(limit: number, offset: number, returned: number, total: number) {
  const hasMore = offset + returned < total;
  return { limit, offset, total, hasMore, nextOffset: hasMore ? offset + returned : null };
}

export type AuthEventFilters = {
  adminId?: number;
  event?: string;
  success?: boolean;
  from?: Date;
  toExclusive?: Date;
};

function present(value: unknown) {
  return value != null && value !== "";
}

export function parseAuthEventFilters(query: Record<string, unknown>): AuthEventFilters {
  const out: AuthEventFilters = {};
  if (present(query.adminId)) {
    const raw = String(query.adminId);
    if (!/^[1-9][0-9]{0,9}$/.test(raw) || Number(raw) > 2_147_483_647) throw authEventFilterError("Admin filtri noto‘g‘ri.");
    out.adminId = Number(raw);
  }
  if (present(query.event)) {
    const raw = String(query.event);
    if (!/^[a-z][a-z_]{0,30}(\.[a-z][a-z_]{0,30})?$/.test(raw)) throw authEventFilterError("Hodisa filtri noto‘g‘ri.");
    out.event = raw;
  }
  if (present(query.success)) {
    if (query.success !== "true" && query.success !== "false") throw authEventFilterError("Natija filtri noto‘g‘ri.");
    out.success = query.success === "true";
  }
  if (present(query.dateFrom)) {
    const range = tashkentBusinessDayUtcRange(String(query.dateFrom));
    if (!range) throw authEventFilterError("Boshlanish sanasi noto‘g‘ri (YYYY-MM-DD).");
    out.from = range.start;
  }
  if (present(query.dateTo)) {
    const range = tashkentBusinessDayUtcRange(String(query.dateTo));
    if (!range) throw authEventFilterError("Tugash sanasi noto‘g‘ri (YYYY-MM-DD).");
    out.toExclusive = range.endExclusive;
  }
  if (out.from && out.toExclusive && out.from >= out.toExclusive) throw authEventFilterError("Sana oralig‘i noto‘g‘ri.");
  return out;
}

export function parseSessionStatus(raw: unknown): SessionStatus | undefined {
  if (!present(raw)) return undefined;
  if ((SESSION_STATUSES as readonly unknown[]).includes(raw)) return raw as SessionStatus;
  throw sessionFilterError("Sessiya holati filtri noto‘g‘ri.");
}

/** Recursive scrub (sensitive keys at any depth), then keep only known scalar keys — raw meta is never returned. */
export function authEventDetails(rawMeta: string): Record<string, string | number | boolean> {
  const meta = sanitizeAuditPayload(rawMeta);
  const out: Record<string, string | number | boolean> = {};
  for (const key of EVENT_DETAIL_KEYS) {
    const value = meta[key];
    if (typeof value === "number" || typeof value === "boolean") out[key] = value;
    else if (typeof value === "string" && value) out[key] = value.slice(0, 80);
  }
  return out;
}

export type AuthEventRow = {
  id: number;
  eventType: string;
  success: boolean;
  reason: string;
  meta: string;
  actorId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date | string;
  adminName: string | null;
  adminEmail: string | null;
};

export function toAuthEventDto(row: AuthEventRow) {
  return {
    id: row.id,
    event: row.eventType,
    success: row.success,
    reason: row.reason || null,
    adminId: row.actorId ?? null,
    admin: row.actorId != null && row.adminEmail != null
      ? { id: row.actorId, name: row.adminName || "", email: row.adminEmail }
      : null,
    details: authEventDetails(row.meta),
    ip: { stored: row.ipAddress != null, value: normalizeIp(row.ipAddress) },
    userAgent: userAgentSummary(row.userAgent),
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function browserOf(ua: string): string | null {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\/|CriOS\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  if (/^curl\//i.test(ua)) return "curl";
  return null;
}

function osOf(ua: string): string | null {
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

/** Browser / OS of a stored User-Agent; `summary` is null when neither is recognized (the UI then says "stored"). */
export function userAgentSummary(raw: string | null) {
  const ua = (raw || "").trim();
  if (!ua) return { stored: false, summary: null, recognized: false };
  const parts = [browserOf(ua), osOf(ua)].filter((p): p is string => Boolean(p));
  return { stored: true, summary: parts.length ? parts.join(" · ") : null, recognized: parts.length > 0 };
}

/** Summary of what was stored at login (device_label / user_agent). Null when nothing was stored. */
export function sessionDevice(row: Pick<AuthSession, "deviceLabel" | "userAgent">) {
  const label = (row.deviceLabel || "").trim().slice(0, 120) || null;
  const ua = (row.userAgent || "").trim();
  const browser = ua ? browserOf(ua) : null;
  const os = ua ? osOf(ua) : null;
  if (!label && !browser && !os) return ua ? { label: null, browser: null, os: null, recognized: false } : null;
  return { label, browser, os, recognized: true };
}

export function sessionStatusOf(row: Pick<AuthSession, "revokedAt" | "expiresAt">, now: Date): SessionStatus {
  if (row.revokedAt) return "revoked";
  return new Date(row.expiresAt).getTime() <= now.getTime() ? "expired" : "active";
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

export function toSessionDto(row: AuthSession, now: Date, currentPublicId: string | null) {
  return {
    id: row.id,
    status: sessionStatusOf(row, now),
    current: currentPublicId != null && row.publicId === currentPublicId,
    createdAt: iso(row.createdAt),
    expiresAt: iso(row.expiresAt),
    revokedAt: iso(row.revokedAt),
    lastSeenAt: iso(row.lastSeenAt),
    device: sessionDevice(row),
  };
}
