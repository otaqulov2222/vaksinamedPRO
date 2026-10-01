/**
 * Request telemetry for auth events (Phase 13.18): the client address and User-Agent of the HTTP request
 * that produced an event. Captured once per request (after body parsing, before the router) and read by
 * recordAuthEvent; code running outside a request (workers, scripts, tests calling helpers directly) sees none.
 *
 * IP source: `req.ip`, i.e. Express's own resolution under the app's `trust proxy` setting. The app does not set
 * `trust proxy`, so this is the TCP peer address and X-Forwarded-For / X-Real-IP / Forwarded are ignored.
 * The same `req.ip` keys every rate limiter, so this setting decides both telemetry and rate-limit identity.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { isIP } from "node:net";
import type { Express, NextFunction, Request, Response } from "express";

export const AUTH_EVENT_USER_AGENT_MAX = 512;

export type RequestTelemetry = { ip: string | null; userAgent: string | null };

const storage = new AsyncLocalStorage<RequestTelemetry>();

/** Valid IPv4 / IPv6 only; IPv4-mapped IPv6 → IPv4, IPv6 lower-cased without zone id. Anything else → null. */
export function normalizeIp(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  const zone = value.indexOf("%");
  if (zone > 0) value = value.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  const family = isIP(value);
  if (family === 4) return value;
  if (family === 6) return value.toLowerCase();
  return null;
}

/** Control characters (incl. NUL, which Postgres text rejects) become spaces; cut at 512 code points; empty → null. */
export function normalizeUserAgent(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!cleaned) return null;
  return Array.from(cleaned).slice(0, AUTH_EVENT_USER_AGENT_MAX).join("").trim();
}

export function telemetryFromRequest(req: Request): RequestTelemetry {
  return { ip: normalizeIp(req.ip), userAgent: normalizeUserAgent(req.header("user-agent")) };
}

export function requestTelemetryMiddleware(req: Request, _res: Response, next: NextFunction) {
  storage.run(telemetryFromRequest(req), next);
}

export function currentRequestTelemetry(): RequestTelemetry | null {
  return storage.getStore() ?? null;
}

/**
 * No trusted-proxy topology (proxy addresses / CIDRs, hop count) is defined for any environment. Trusting forwarding
 * headers without one lets any client choose its own rate-limit key and auth-event IP, so boot refuses it.
 * Enabling it requires an explicit, address-restricted contract — never `true`, never a bare hop count.
 */
export function assertNoProxyTrust(app: Express): void {
  if (app.get("trust proxy")) {
    throw new Error("Express 'trust proxy' is enabled but no trusted-proxy configuration exists");
  }
}
