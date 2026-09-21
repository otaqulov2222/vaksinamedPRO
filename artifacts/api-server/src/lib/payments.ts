import { eq } from "drizzle-orm";
import { db, payments, type Branch } from "@workspace/db";

export async function createBranchPayment(options: {
  orderId: number;
  branch: Branch;
  provider: "payme" | "click" | "pay_at_branch" | "cod";
  amount: number;
}) {
  const { orderId, branch, provider, amount } = options;
  const merchantId = provider === "payme" ? branch.paymeMerchantId : provider === "click" ? branch.clickMerchantId : branch.code;
  const configured = provider === "payme" ? Boolean(branch.paymeMerchantId && branch.paymeKey)
    : provider === "click" ? Boolean(branch.clickMerchantId && branch.clickSecret)
    : true;

  const inserted = await db.insert(payments).values({
    orderId,
    provider,
    branchId: branch.id,
    merchantId: merchantId || "",
    externalId: `${provider}-${orderId}-${Date.now()}`,
    status: provider === "payme" || provider === "click" ? (configured ? "pending" : "pending_keys") : "awaiting_pos",
    amount,
  }).returning();

  const payment = inserted[0];
  const checkoutPath = provider === "payme" || provider === "click"
    ? `/api/payments/${provider}/checkout/${payment.id}`
    : null;

  return {
    payment,
    configured,
    checkoutUrl: checkoutPath,
    message: configured
      ? `${branch.name} kassasining ${provider.toUpperCase()} to‘lovi`
      : `${branch.name} uchun ${provider.toUpperCase()} kalitlari hali kiritilmagan. Admin paneldan merchant ID/key qo‘shing.`,
  };
}

export async function markPaymentPaid(paymentId: number) {
  const rows = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!rows[0]) throw Object.assign(new Error("To‘lov topilmadi"), { status: 404 });
  const updated = await db.update(payments).set({ status: "paid" }).where(eq(payments.id, paymentId)).returning();
  return updated[0];
}
