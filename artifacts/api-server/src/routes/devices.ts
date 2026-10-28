import { Router, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { customerDevices, customers, db } from "@workspace/db";
import { requireCustomer } from "../lib/auth";
import { logger } from "../lib/logger";
import { sendCustomerPushNotification } from "../lib/pushNotifications";

export const devicesRouter = Router();

const ALLOWED_PLATFORMS = ["web", "android", "ios"] as const;

/**
 * POST /api/customer/devices/push-token
 * Register or refresh a push token for the authenticated customer.
 */
devicesRouter.post(
  ["/customer/devices/push-token", "/api/customer/devices/push-token"],
  async (req: Request, res: Response) => {
    try {
      const customer = await requireCustomer(req);
      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      if (!token) {
        return res.status(400).json({ code: "TOKEN_REQUIRED", message: "Push token talab qilinadi" });
      }

      const rawPlatform = typeof req.body?.platform === "string" ? req.body.platform.toLowerCase().trim() : "web";
      const platform = (ALLOWED_PLATFORMS.includes(rawPlatform as any) ? rawPlatform : "web") as "web" | "android" | "ios";
      const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : null;
      const userAgent = typeof req.body?.userAgent === "string" ? req.body.userAgent.slice(0, 500) : (req.headers["user-agent"]?.slice(0, 500) || null);

      const keys = req.body?.keys && typeof req.body.keys === "object" ? req.body.keys : {};
      const authKey = typeof keys.auth === "string" ? keys.auth.trim() : null;
      const p256dhKey = typeof keys.p256dh === "string" ? keys.p256dh.trim() : null;

      const now = new Date();

      // Check existing token
      const existing = await db
        .select()
        .from(customerDevices)
        .where(eq(customerDevices.token, token))
        .limit(1);

      let deviceId: number;

      if (existing.length > 0) {
        deviceId = existing[0].id;
        await db
          .update(customerDevices)
          .set({
            customerId: customer.id,
            platform,
            endpoint,
            authKey,
            p256dhKey,
            userAgent,
            isActive: true,
            lastUsedAt: now,
            updatedAt: now,
          })
          .where(eq(customerDevices.id, deviceId));
      } else {
        const inserted = await db
          .insert(customerDevices)
          .values({
            customerId: customer.id,
            token,
            platform,
            endpoint,
            authKey,
            p256dhKey,
            userAgent,
            isActive: true,
            lastUsedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        deviceId = inserted[0].id;
      }

      logger.info({ customerId: customer.id, deviceId, platform }, "Device push token registered");

      return res.status(200).json({
        success: true,
        deviceId,
        token,
        platform,
      });
    } catch (err: any) {
      if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
      logger.error({ err }, "Failed to register push token");
      return res.status(500).json({ code: "INTERNAL_ERROR", message: "Push token saqlashda xatolik" });
    }
  },
);

/**
 * DELETE /api/customer/devices/push-token
 * Deactivates a push token when logging out or turning notifications off.
 */
devicesRouter.delete(
  ["/customer/devices/push-token", "/api/customer/devices/push-token"],
  async (req: Request, res: Response) => {
    try {
      const customer = await requireCustomer(req);
      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      if (!token) {
        return res.status(400).json({ code: "TOKEN_REQUIRED", message: "Token kiritilmadi" });
      }

      await db
        .update(customerDevices)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(and(eq(customerDevices.token, token), eq(customerDevices.customerId, customer.id)));

      return res.status(200).json({ success: true });
    } catch (err: any) {
      if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
      return res.status(500).json({ code: "INTERNAL_ERROR", message: "Tokenni o'chirishda xatolik" });
    }
  },
);

/**
 * GET /api/customer/devices
 * Lists active registered devices for the authenticated customer.
 */
devicesRouter.get(
  ["/customer/devices", "/api/customer/devices"],
  async (req: Request, res: Response) => {
    try {
      const customer = await requireCustomer(req);
      const devices = await db
        .select({
          id: customerDevices.id,
          platform: customerDevices.platform,
          userAgent: customerDevices.userAgent,
          isActive: customerDevices.isActive,
          lastUsedAt: customerDevices.lastUsedAt,
          createdAt: customerDevices.createdAt,
        })
        .from(customerDevices)
        .where(and(eq(customerDevices.customerId, customer.id), eq(customerDevices.isActive, true)))
        .orderBy(desc(customerDevices.lastUsedAt));

      return res.status(200).json({ devices });
    } catch (err: any) {
      if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
      return res.status(500).json({ code: "INTERNAL_ERROR", message: "Qurilmalarni yuklashda xatolik" });
    }
  },
);

/**
 * POST /api/customer/devices/test
 * Sends a test push notification to verify push delivery to the user's active devices.
 */
devicesRouter.post(
  ["/customer/devices/test", "/api/customer/devices/test"],
  async (req: Request, res: Response) => {
    try {
      const customer = await requireCustomer(req);
      const lang = (customer.language || "uz").toLowerCase();

      let title = "Sinov xabarnomasi 🔔";
      let body = "VaksinaMed bildirishnomalari faollashtirildi! Buyurtma va eslatmalarni o'z vaqtida olasiz.";
      if (lang === "ru") {
        title = "Тестовое уведомление 🔔";
        body = "Push-уведомления VaksinaMed активны! Вы будете получать обновления заказов и напоминания.";
      } else if (lang === "en") {
        title = "Test Notification 🔔";
        body = "VaksinaMed push notifications are active! You will receive order updates and reminders.";
      }

      const dispatch = await sendCustomerPushNotification(customer.id, {
        title,
        body,
        data: {
          type: "test_notification",
          timestamp: new Date().toISOString(),
        },
      });

      return res.status(200).json({
        success: true,
        sent: dispatch.sent,
        totalDevices: dispatch.devices,
        title,
        body,
      });
    } catch (err: any) {
      if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
      logger.error({ err }, "Test push notification failed");
      return res.status(500).json({ code: "INTERNAL_ERROR", message: "Sinov xabarini yuborishda xatolik" });
    }
  },
);
