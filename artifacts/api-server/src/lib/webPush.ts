import webpush from "web-push";
import { logger } from "./logger";
import type { PushNotificationPayload } from "./pushNotifications";

let configured = false;

function ensureWebPushConfigured(): boolean {
  if (configured) return true;
  const publicKey = (process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = (process.env.VAPID_SUBJECT || "mailto:dev@vaksinamed.uz").trim();
  if (!publicKey || !privateKey) {
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || "").trim();
  return publicKey || null;
}

export function isWebPushConfigured(): boolean {
  return Boolean((process.env.VAPID_PUBLIC_KEY || "").trim() && (process.env.VAPID_PRIVATE_KEY || "").trim());
}

/** Test-only hook — production never sets this. */
let testSendOverride:
  | ((
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
      payload: PushNotificationPayload,
    ) => Promise<{ ok: boolean; reason?: string; statusCode?: number }>)
  | null = null;

export function setWebPushTestSendOverride(
  fn: typeof testSendOverride,
): void {
  testSendOverride = fn;
}

export async function sendWebPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushNotificationPayload,
): Promise<{ ok: boolean; reason?: string; statusCode?: number }> {
  if (testSendOverride) {
    return testSendOverride(subscription, payload);
  }

  if (!ensureWebPushConfigured()) {
    return { ok: false, reason: "vapid_not_configured" };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || "/favicon.ico",
        badge: payload.badge,
        tag: payload.tag || "vaksinamed",
        data: payload.data || {},
      }),
      {
        TTL: 60 * 60,
        urgency: "normal",
      },
    );
    return { ok: true };
  } catch (err: unknown) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? Number((err as { statusCode?: number }).statusCode)
        : undefined;
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn({ statusCode, reason, endpoint: subscription.endpoint.slice(0, 64) }, "Web Push send failed");
    return { ok: false, reason, statusCode };
  }
}
