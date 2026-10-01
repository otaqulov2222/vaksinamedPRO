/**
 * CORS origin policy.
 *
 * Env: CORS_ORIGIN — comma-separated exact browser origins (scheme://host[:port]),
 * e.g. the staging Admin web origin. Wildcards are never accepted.
 * Unset keeps the legacy reflect-any-origin behaviour so existing deployments are unchanged;
 * production-like boot logs a warning until an allowlist is configured.
 *
 * Auth is Bearer-token based (no cookies), so CORS is browser read isolation only — it is not
 * an authorization layer and does not affect non-browser clients (mobile, POS, PSP callbacks).
 */

import { isProductionLike } from "./securityEnv";

export type CorsPolicy = { mode: "allowlist"; origins: string[] } | { mode: "reflect" };

let cached: { raw: string; policy: CorsPolicy } | null = null;

export function parseCorsOrigins(raw: string | undefined, productionLike = isProductionLike()): string[] | null {
  const value = (raw || "").trim();
  if (!value) return null;
  const origins: string[] = [];
  for (const entry of value.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (entry.includes("*")) {
      throw new Error("CORS_ORIGIN must list exact origins; wildcards are not allowed");
    }
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(`CORS_ORIGIN entry is not a valid origin: ${entry}`);
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.origin !== entry) {
      throw new Error(`CORS_ORIGIN entry must be scheme://host[:port] with no path or trailing slash: ${entry}`);
    }
    if (productionLike && url.protocol !== "https:") {
      throw new Error(`CORS_ORIGIN entry must use https in production/staging: ${entry}`);
    }
    if (!origins.includes(entry)) origins.push(entry);
  }
  if (origins.length === 0) {
    throw new Error("CORS_ORIGIN is set but contains no origins");
  }
  return origins;
}

/** Throws on an invalid CORS_ORIGIN — call at boot so misconfiguration never reaches traffic. */
export function resolveCorsPolicy(): CorsPolicy {
  const raw = process.env.CORS_ORIGIN || "";
  if (cached && cached.raw === raw) return cached.policy;
  const origins = parseCorsOrigins(raw);
  const policy: CorsPolicy = origins ? { mode: "allowlist", origins } : { mode: "reflect" };
  cached = { raw, policy };
  return policy;
}

/** Per-request decision for the `cors` middleware. An invalid allowlist denies (fail closed). */
export function isCorsOriginAllowed(origin: string | undefined): boolean {
  let policy: CorsPolicy;
  try {
    policy = resolveCorsPolicy();
  } catch {
    return false;
  }
  if (policy.mode === "reflect") return true;
  if (!origin) return false;
  return policy.origins.includes(origin);
}
