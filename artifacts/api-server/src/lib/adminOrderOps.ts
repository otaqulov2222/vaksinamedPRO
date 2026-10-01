/**
 * Batch 3I/3J — admin order list/detail helpers.
 * Asia/Tashkent is UTC+5 year-round (no DST). DB timestamps remain timestamptz/UTC.
 */

/** Minimum operational customer identity for staff — no passwordHash / secrets. */
export function adminCustomerIdentity(
  row: {
    id: number;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  },
  opts?: { includePhone?: boolean },
) {
  const base = {
    id: row.id,
    firstName: String(row.firstName || ""),
    lastName: String(row.lastName || ""),
  };
  // List rows omit phone (ops minimum). Detail may include phone pending POLICY E (OPEN).
  if (opts?.includePhone === false) return base;
  return { ...base, phone: String(row.phone || "") };
}

/** Strip LIKE metacharacters; keep search bounded. */
export function sanitizeAdminOrderSearch(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/[%_\\]/g, "")
    .slice(0, 64);
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse YYYY-MM-DD as Asia/Tashkent business-day bounds → UTC Instant.
 * Returns [startInclusive, endExclusive).
 */
export function tashkentBusinessDayUtcRange(dateStr: string): { start: Date; endExclusive: Date } | null {
  const m = YMD.exec(String(dateStr || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const offsetMs = 5 * 60 * 60 * 1000;
  const start = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0) - offsetMs);
  const endExclusive = new Date(Date.UTC(y, mo - 1, d + 1, 0, 0, 0, 0) - offsetMs);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) return null;
  return { start, endExclusive };
}

const SENSITIVE_KEY = /password|otp|token|secret|authorization|cookie|session|hmac|merchant.?key|payme.?key|click.?secret|api.?key/i;
const AUDIT_MAX_DEPTH = 4;

function scrubAuditValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (!value || typeof value !== "object") return value;
  if (depth >= AUDIT_MAX_DEPTH) return "…";
  if (Array.isArray(value)) return value.map((item) => scrubAuditValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k)) continue;
    out[k] = scrubAuditValue(v, depth + 1);
  }
  return out;
}

/** Read-only audit payload scrubber — never invent event types. Sensitive keys are dropped at every depth. */
export function sanitizeAuditPayload(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return scrubAuditValue(parsed, 0) as Record<string, unknown>;
}
