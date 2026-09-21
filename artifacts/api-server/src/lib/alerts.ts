/**
 * Minimal structured alerting hooks (P12.1).
 * Emits log lines with `alert: true` + stable `alertCode` for log scrapers / SIEM.
 * Does not introduce a heavy observability platform. Never log secrets.
 */

import { logger } from "./logger";

export const ALERT = {
  PAYMENT_FAILURE: "PAYMENT_FAILURE",
  PAYMENT_WEBHOOK_VERIFY_FAIL: "PAYMENT_WEBHOOK_VERIFY_FAIL",
  PAYMENT_DUPLICATE_ATTEMPT: "PAYMENT_DUPLICATE_ATTEMPT",
  PAYMENT_STUCK_PENDING: "PAYMENT_STUCK_PENDING",
  WORKER_JOB_FAILED: "WORKER_JOB_FAILED",
  WORKER_JOB_DEAD: "WORKER_JOB_DEAD",
  WORKER_QUEUE_BACKLOG: "WORKER_QUEUE_BACKLOG",
  FOM_SALE_FAILURE: "FOM_SALE_FAILURE",
  FOM_AUTH_FAILURE: "FOM_AUTH_FAILURE",
  DELIVERY_PROVIDER_FAILURE: "DELIVERY_PROVIDER_FAILURE",
} as const;

export type AlertCode = (typeof ALERT)[keyof typeof ALERT];

const REDACT_KEY = /secret|password|token|authorization|paymekey|clicksecret|apikey/i;

function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (REDACT_KEY.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string" && v.length > 500) out[k] = `${v.slice(0, 500)}…`;
    else out[k] = v;
  }
  return out;
}

/** Fire a structured alert event (log sink). */
export function emitAlert(code: AlertCode | string, meta: Record<string, unknown> = {}) {
  logger.error(
    {
      alert: true,
      alertCode: code,
      ...sanitizeMeta(meta),
    },
    `ALERT:${code}`,
  );
}
