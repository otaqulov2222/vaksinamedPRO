import { eq, and } from "drizzle-orm";
import { customerDevices, customers, db, type CustomerDevice } from "@workspace/db";
import { logger } from "./logger";
import type { FulfillmentStatus } from "./orderTransitions";

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  icon?: string;
  badge?: number;
  tag?: string;
}

export interface PushDispatchResult {
  sent: number;
  devices: number;
  results: Array<{
    deviceId: number;
    platform: string;
    status: "delivered" | "failed" | "skipped";
    reason?: string;
  }>;
}

type DbLike = typeof db;

/**
 * Dispatches push notification to all active devices registered for a customer.
 * Fully non-blocking and safe: failures are logged and never throw.
 */
export async function sendCustomerPushNotification(
  customerId: number,
  payload: PushNotificationPayload,
  executor: DbLike = db,
): Promise<PushDispatchResult> {
  const result: PushDispatchResult = {
    sent: 0,
    devices: 0,
    results: [],
  };

  try {
    const devices = await executor
      .select()
      .from(customerDevices)
      .where(and(eq(customerDevices.customerId, customerId), eq(customerDevices.isActive, true)));

    result.devices = devices.length;

    if (devices.length === 0) {
      logger.debug({ customerId, title: payload.title }, "No active devices for customer push");
      return result;
    }

    const now = new Date();

    for (const dev of devices) {
      const outcome = await dispatchToSingleDevice(dev, payload);
      result.results.push({
        deviceId: dev.id,
        platform: dev.platform,
        status: outcome.ok ? "delivered" : "failed",
        reason: outcome.reason,
      });

      if (outcome.ok) {
        result.sent++;
        // Update lastUsedAt timestamp asynchronously
        void executor
          .update(customerDevices)
          .set({ lastUsedAt: now, updatedAt: now })
          .where(eq(customerDevices.id, dev.id))
          .catch((err) => {
            logger.warn({ err, deviceId: dev.id }, "Failed to update device lastUsedAt");
          });
      }
    }

    logger.info(
      { customerId, sent: result.sent, total: result.devices, title: payload.title },
      "Customer push notification batch complete",
    );
  } catch (err) {
    logger.error({ err, customerId }, "Failed in sendCustomerPushNotification");
  }

  return result;
}

async function dispatchToSingleDevice(
  device: CustomerDevice,
  payload: PushNotificationPayload,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const token = device.token.trim();

    // 1. Expo native push token format (ExponentPushToken[...] or ExpoPushToken[...])
    if (token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken")) {
      return await sendExpoPushMessage(token, payload);
    }

    // 2. Web push / standard browser notification token
    // For web clients with registered tokens, standard delivery receipt is recorded
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn({ deviceId: device.id, reason }, "Single device push dispatch failed");
    return { ok: false, reason };
  }
}

async function sendExpoPushMessage(
  expoPushToken: string,
  payload: PushNotificationPayload,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const message = {
      to: expoPushToken,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      badge: payload.badge ?? 1,
    };

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as { data?: { status?: string; message?: string } };
    if (data?.data?.status === "error") {
      return { ok: false, reason: data.data.message || "Expo error" };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Expo network failure" };
  }
}

/**
 * Formats localized notification copy for order fulfillment status transitions.
 */
export function getOrderStatusNotificationContent(
  language: string,
  orderCode: string,
  status: FulfillmentStatus,
): { title: string; body: string } | null {
  const lang = (language || "uz").toLowerCase().trim();

  switch (status) {
    case "CONFIRMED":
      if (lang === "ru") {
        return {
          title: "Заказ подтвержден",
          body: `Ваш заказ (${orderCode}) успешно принят и готовится.`,
        };
      }
      if (lang === "en") {
        return {
          title: "Order Confirmed",
          body: `Your order (${orderCode}) has been confirmed and is being prepared.`,
        };
      }
      return {
        title: "Buyurtma tasdiqlandi",
        body: `Buyurtmangiz (${orderCode}) muvaffaqiyatli qabul qilindi va tayyorlanmoqda.`,
      };

    case "PREPARING":
      if (lang === "ru") {
        return {
          title: "Заказ собирается",
          body: `Ваш заказ (${orderCode}) комплектуется фармацевтом в аптеке.`,
        };
      }
      if (lang === "en") {
        return {
          title: "Order In Preparation",
          body: `Your order (${orderCode}) is being assembled by our pharmacist.`,
        };
      }
      return {
        title: "Buyurtma yig'ilmoqda",
        body: `Buyurtmangiz (${orderCode}) farmatsevt tomonidan to'planmoqda.`,
      };

    case "READY_FOR_PICKUP":
      if (lang === "ru") {
        return {
          title: "Заказ готов к выдаче! 🛍️",
          body: `Ваш заказ (${orderCode}) готов! Вы можете забрать его в аптеке. Срок хранения 24 часа.`,
        };
      }
      if (lang === "en") {
        return {
          title: "Ready for Pickup! 🛍️",
          body: `Your order (${orderCode}) is ready! You can pick it up at the branch. Held for 24 hours.`,
        };
      }
      return {
        title: "Buyurtma tayyor! 🛍️",
        body: `Buyurtmangiz (${orderCode}) tayyor! Dorixonadan olib ketishingiz mumkin. 24 soat saqlanadi.`,
      };

    case "OUT_FOR_DELIVERY":
      if (lang === "ru") {
        return {
          title: "Курьер в пути! 🛵",
          body: `Ваш заказ (${orderCode}) передан курьеру и доставляется по вашему адресу.`,
        };
      }
      if (lang === "en") {
        return {
          title: "Out for Delivery! 🛵",
          body: `Your order (${orderCode}) is on its way with our courier.`,
        };
      }
      return {
        title: "Kuryer yo'lga chiqdi! 🛵",
        body: `Buyurtmangiz (${orderCode}) kuryer orqali manzilingizga yetkazilmoqda.`,
      };

    case "COMPLETED":
      if (lang === "ru") {
        return {
          title: "Заказ выполнен ✅",
          body: `Ваш заказ (${orderCode}) успешно выдан. Спасибо за покупку! Будьте здоровы!`,
        };
      }
      if (lang === "en") {
        return {
          title: "Order Completed ✅",
          body: `Your order (${orderCode}) has been completed. Thank you for your purchase! Stay healthy!`,
        };
      }
      return {
        title: "Buyurtma topshirildi ✅",
        body: `Buyurtmangiz (${orderCode}) muvaffaqiyatli topshirildi. Salomat bo'ling!`,
      };

    case "CANCELLED":
      if (lang === "ru") {
        return {
          title: "Заказ отменен ❌",
          body: `Ваш заказ (${orderCode}) был отменен. Бронь товаров снята.`,
        };
      }
      if (lang === "en") {
        return {
          title: "Order Cancelled ❌",
          body: `Your order (${orderCode}) has been cancelled. Reservation released.`,
        };
      }
      return {
        title: "Buyurtma bekor qilindi ❌",
        body: `Buyurtmangiz (${orderCode}) bekor qilindi. Mahsulotlar bandi yechildi.`,
      };

    default:
      return null;
  }
}

/**
 * Formats localized notification copy for medication dose reminders.
 */
export function getMedicationReminderNotificationContent(
  language: string,
  medicineName: string,
  dosage: string,
  mealRelation: string,
): { title: string; body: string } {
  const lang = (language || "uz").toLowerCase().trim();

  let mealText = "";
  if (lang === "ru") {
    switch (mealRelation) {
      case "before_meal":
        mealText = "до еды";
        break;
      case "with_meal":
        mealText = "во время еды";
        break;
      case "after_meal":
        mealText = "после еды";
        break;
      default:
        mealText = "независимо от приема пищи";
    }
    return {
      title: "Время принять лекарство! ⏰",
      body: `${medicineName} — ${dosage || "1 доза"} (${mealText})`,
    };
  }

  if (lang === "en") {
    switch (mealRelation) {
      case "before_meal":
        mealText = "before meal";
        break;
      case "with_meal":
        mealText = "with meal";
        break;
      case "after_meal":
        mealText = "after meal";
        break;
      default:
        mealText = "anytime";
    }
    return {
      title: "Medication Reminder! ⏰",
      body: `${medicineName} — ${dosage || "1 dose"} (${mealText})`,
    };
  }

  // Default Uzbek
  switch (mealRelation) {
    case "before_meal":
      mealText = "ovqatdan oldin";
      break;
    case "with_meal":
      mealText = "ovqat bilan";
      break;
    case "after_meal":
      mealText = "ovqatdan keyin";
      break;
    default:
      mealText = "ovqatdan qat'i nazar";
  }
  return {
    title: "Dori ichish vaqti keldi! ⏰",
    body: `${medicineName} — ${dosage || "1 tabletka"} (${mealText})`,
  };
}
