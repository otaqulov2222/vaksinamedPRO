import { and, eq } from "drizzle-orm";
import { auditLog, db, orders } from "@workspace/db";
import { logger } from "./logger";

export async function confirmFomSale(options: {
  orderCode?: string;
  customerQr?: string;
  receiptId: string;
  amount?: number;
  actor?: string;
}) {
  const { orderCode, receiptId, actor = "fom" } = options;
  if (!orderCode) {
    throw Object.assign(new Error("Buyurtma kodi kerak"), { status: 400 });
  }
  const found = await db.select().from(orders).where(eq(orders.code, orderCode)).limit(1);
  if (!found[0]) throw Object.assign(new Error("Buyurtma topilmadi"), { status: 404 });
  if (found[0].status === "cancelled") throw Object.assign(new Error("Buyurtma bekor qilingan"), { status: 400 });

  const updated = await db.update(orders).set({ status: "completed" }).where(and(eq(orders.id, found[0].id))).returning();
  await db.insert(auditLog).values({
    actor,
    action: "fom.sale_confirmed",
    entity: "order",
    payload: JSON.stringify({ orderCode, receiptId, amount: options.amount ?? found[0].total }),
  });
  logger.info({ orderCode, receiptId }, "FOM sale confirmed");
  return updated[0];
}
