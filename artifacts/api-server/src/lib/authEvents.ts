import { authEvents, db } from "@workspace/db";

/** Safe auth audit — never record passwords, OTP, tokens, or secrets. */
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
  try {
    await db.insert(authEvents).values({
      actorType: input.actorType || "",
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      success: input.success !== false,
      reason: (input.reason || "").slice(0, 240),
      meta: JSON.stringify(meta),
    });
  } catch {
    // Audit must not break auth flows
  }
}
