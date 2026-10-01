import { authEvents, db } from "@workspace/db";
import { logger } from "./logger";
import { currentRequestTelemetry } from "./requestTelemetry";

/**
 * Safe auth audit — never record passwords, OTP, tokens, or secrets.
 * Admin events also store the IP / User-Agent of the current request (Phase 13.18); outside a request both stay NULL.
 * Customer events are not given telemetry: storing end-user addresses is a separate privacy decision.
 */
export async function recordAuthEvent(input: {
  actorType?: string;
  actorId?: number | null;
  eventType: string;
  success?: boolean;
  reason?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const meta = { ...(input.meta || {}) };
  for (const key of Object.keys(meta)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("password")
      || lower.includes("otp")
      || lower.includes("token")
      || lower.includes("secret")
      || lower.includes("authorization")
    ) {
      delete meta[key];
    }
  }
  const telemetry = input.actorType === "admin" ? currentRequestTelemetry() : null;
  try {
    await db.insert(authEvents).values({
      actorType: input.actorType || "",
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      success: input.success !== false,
      reason: (input.reason || "").slice(0, 240),
      meta: JSON.stringify(meta),
      ipAddress: telemetry?.ip ?? null,
      userAgent: telemetry?.userAgent ?? null,
    });
  } catch (err) {
    // Audit must not break auth flows. Only the SQLSTATE is logged: the driver error carries bound params (meta, UA, IP).
    const code = (err as { cause?: { code?: unknown }; code?: unknown })?.cause?.code ?? (err as { code?: unknown })?.code;
    logger.warn({ eventType: input.eventType, code: typeof code === "string" ? code : undefined }, "auth event not recorded");
  }
}
