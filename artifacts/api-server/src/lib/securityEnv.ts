/**
 * P2 — Production-like environment gates.
 * Fail closed for insecure development behaviors.
 */

import { emitAlert, ALERT } from "./alerts";

export function isProductionLike(): boolean {
  const app = (process.env.APP_ENV || "").toLowerCase();
  const node = (process.env.NODE_ENV || "").toLowerCase();
  return app === "production" || app === "staging" || node === "production";
}

export function flagEnabled(name: string): boolean {
  const v = (process.env[name] || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function secretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** OTP 000000 / console OTP / special demo login — never in production-like. */
export function allowOtpDevBypass(): boolean {
  if (isProductionLike()) return false;
  return flagEnabled("ALLOW_OTP_DEV_BYPASS");
}

/** Return plaintext OTP as `devCode` in API — never production-like; requires explicit flag. */
export function allowOtpDevCodeInResponse(): boolean {
  if (isProductionLike()) return false;
  return flagEnabled("ALLOW_OTP_DEV_BYPASS");
}

/** Log OTP SMS body to console — never production-like. */
export function allowOtpConsoleLog(): boolean {
  if (isProductionLike()) return false;
  return flagEnabled("ALLOW_OTP_DEV_BYPASS") || !process.env.ESKIZ_EMAIL;
}

/** Unauthenticated simulate-success — never production-like. */
export function allowPaymentSimulate(): boolean {
  if (isProductionLike()) return false;
  return flagEnabled("ALLOW_PAYMENT_SIMULATE");
}

/**
 * Telegram header auth for existing customers — allowed in non-production for local Mini App DX.
 * Auto-create remains flag-gated. Production: never.
 */
export function allowTelegramAutoProvision(): boolean {
  if (isProductionLike()) return false;
  return flagEnabled("ALLOW_TELEGRAM_AUTO_PROVISION");
}

export function allowTelegramHeaderAuth(): boolean {
  if (isProductionLike()) return false;
  return true;
}

export function requireConfiguredSecret(name: string, devFallback?: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isProductionLike()) {
    throw new Error(`${name} is required in production/staging (P2 fail-closed).`);
  }
  if (devFallback !== undefined) return devFallback;
  throw new Error(`${name} is required.`);
}

export function assertFomWebhookAuthorized(headerValue: string | undefined): void {
  const secret = process.env.FOM_WEBHOOK_SECRET?.trim();
  if (isProductionLike()) {
    if (!secret) {
      throw Object.assign(new Error("FOM webhook is not configured"), { status: 503 });
    }
    if (!headerValue || !secretsEqual(headerValue, secret)) {
      emitAlert(ALERT.FOM_AUTH_FAILURE, { reason: "auth_mismatch_or_missing" });
      throw Object.assign(new Error("FOM autentifikatsiya xatosi"), { status: 401 });
    }
    return;
  }
  // Development: if secret configured, require it; otherwise allow (local only)
  if (secret) {
    if (!headerValue || !secretsEqual(headerValue, secret)) {
      emitAlert(ALERT.FOM_AUTH_FAILURE, { reason: "auth_mismatch_or_missing" });
      throw Object.assign(new Error("FOM autentifikatsiya xatosi"), { status: 401 });
    }
  }
}

export function isHqAdminRole(role: string | null | undefined): boolean {
  const r = String(role || "").toLowerCase();
  return r === "super_admin" || r === "hq" || r === "admin";
}

/** Normalize legacy role labels without expanding privileges. */
export function normalizeAdminRole(role: string | null | undefined): string {
  const r = String(role || "").toLowerCase().trim();
  if (r === "admin" || r === "hq") return "super_admin";
  return r || "cashier";
}

/** Customer session TTL — matches prior HMAC ~30d. */
export function customerSessionTtlMs(): number {
  return 1000 * 60 * 60 * 24 * 30;
}

/** Admin session TTL — matches prior HMAC ~12h. */
export function adminSessionTtlMs(): number {
  return 1000 * 60 * 60 * 12;
}

/**
 * Dual-accept legacy HMAC tokens (pre-session).
 *
 * Migration policy (P3):
 * - New logins always issue revocable `s1.*` sessions.
 * - Legacy HMAC accepted during a bounded dual-accept window.
 * - Close the window by setting LEGACY_HMAC_DEADLINE (ISO) or ALLOW_LEGACY_HMAC_TOKENS=0.
 * - Unset deadline keeps dual-accept for mobile compatibility but is a documented residual risk
 *   until operators close it after clients refresh.
 */
export function allowLegacyHmacTokens(): boolean {
  const flag = (process.env.ALLOW_LEGACY_HMAC_TOKENS || "").toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") return false;
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  const deadline = process.env.LEGACY_HMAC_DEADLINE?.trim();
  if (deadline) {
    const ts = Date.parse(deadline);
    if (Number.isFinite(ts)) return Date.now() < ts;
  }
  // Default: dual-accept on (preserve mobile) until operator closes window
  return true;
}

export function publicAdminCustomer<T extends Record<string, unknown>>(row: T) {
  const { passwordHash: _ph, password_hash: _ph2, ...rest } = row as T & {
    passwordHash?: unknown;
    password_hash?: unknown;
  };
  return rest;
}

export function maskBranchSecrets<T extends Record<string, unknown>>(branch: T) {
  const copy = { ...branch } as Record<string, unknown>;
  if ("paymeKey" in copy) copy.paymeKey = copy.paymeKey ? "••••" : "";
  if ("clickSecret" in copy) copy.clickSecret = copy.clickSecret ? "••••" : "";
  if ("payme_key" in copy) copy.payme_key = copy.payme_key ? "••••" : "";
  if ("click_secret" in copy) copy.click_secret = copy.click_secret ? "••••" : "";
  return copy as T;
}

/** Strip payment secrets entirely from customer-facing branch payloads. */
export function publicBranch<T extends Record<string, unknown>>(branch: T) {
  const {
    paymeKey: _pk,
    clickSecret: _cs,
    payme_key: _pk2,
    click_secret: _cs2,
    ...rest
  } = branch as T & Record<string, unknown>;
  const flags = {
    hasPayme: Boolean(
      String((branch as { paymeMerchantId?: string }).paymeMerchantId || "").trim()
        && String((branch as { paymeKey?: string }).paymeKey || "").trim(),
    ),
    hasClick: Boolean(
      String((branch as { clickMerchantId?: string }).clickMerchantId || "").trim()
        && String((branch as { clickSecret?: string }).clickSecret || "").trim(),
    ),
  };
  return {
    ...rest,
    ...flags,
  };
}
