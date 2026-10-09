import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, orders, payments } from "@workspace/db";
import { markPaymentPaid } from "../lib/payments";
import { serializeOrder } from "./orders";
import { requireAdmin, requireCustomer } from "../lib/auth";
import { allowPaymentSimulate, isProductionLike } from "../lib/securityEnv";
import { requirePermission, assertBranchScope } from "../lib/rbac";
import { markOrderPaymentPaid } from "../lib/orderTransitions";
import {
  findIntentByOrderId,
  getPaymentSnapshot,
  ingestWebhookEvent,
  processWebhookEvent,
  requestRefund,
} from "../lib/paymentService";
import { getPaymentAdapter } from "../lib/paymentAdapters";
import { handlePaymeMerchantRpc } from "../lib/paymeMerchantApi";
import { handleClickMerchantRequest } from "../lib/clickMerchantApi";
import { CLICK_ACTION } from "../lib/clickContract";
import {
  serializePaymentAttemptPublic,
  serializePaymentCapturePublic,
  serializePaymentIntentPublic,
  serializePaymentRefundPublic,
} from "../lib/paymentSerializers";

const router = Router();

function snapshotBody(snap: Awaited<ReturnType<typeof getPaymentSnapshot>>) {
  return {
    intent: serializePaymentIntentPublic(snap.intent),
    attempts: snap.attempts.map(serializePaymentAttemptPublic),
    capture: snap.capture ? serializePaymentCapturePublic(snap.capture) : null,
    refunds: snap.refunds.map(serializePaymentRefundPublic),
    refundableAmount: snap.refundableAmount,
    orderPaymentStatus: snap.orderPaymentStatus,
    axes: {
      paymentStatus: snap.orderPaymentStatus,
      note: "payment_axis_only" as const,
    },
  };
}

/**
 * Payme Merchant API (JSON-RPC) — Payme servers call this endpoint.
 * Official methods: CheckPerform / Create / Perform / Cancel / Check.
 * Auth: Basic Paycom:<branch payme_key> resolved via payment intent branch.
 */
router.post("/payments/payme/merchant", async (req, res, next) => {
  try {
    const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
    const response = await handlePaymeMerchantRpc(req.body, authorization);
    return res.status(200).json(response);
  } catch (error) {
    return next(error);
  }
});

/**
 * Click Shop API — Click servers call Prepare (action=0) / Complete (action=1).
 * Auth: MD5 sign_string with branch click_secret (resolved via merchant_trans_id → intent → branch).
 */
router.post("/payments/click/merchant", async (req, res, next) => {
  try {
    const response = await handleClickMerchantRequest(req.body);
    return res.status(200).json(response);
  } catch (error) {
    return next(error);
  }
});

/**
 * P7.8 — customer payment status by intent (own order only).
 * Does not expose secrets or merchant keys.
 */
router.get("/payments/intents/:id", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const intentId = Number(req.params.id);
    if (!Number.isFinite(intentId) || intentId <= 0) {
      return res.status(400).json({ message: "Intent ID noto‘g‘ri" });
    }
    const snap = await getPaymentSnapshot(intentId);
    const order = (
      await db.select().from(orders).where(eq(orders.id, snap.intent.orderId)).limit(1)
    )[0];
    if (!order || order.customerId !== customer.id) {
      return res.status(404).json({ message: "To‘lov topilmadi" });
    }
    return res.json(snapshotBody(snap));
  } catch (error) {
    return next(error);
  }
});

/**
 * P7.8 — customer payment status by order (own order only).
 */
router.get("/orders/:orderId/payment", async (req, res, next) => {
  try {
    const customer = await requireCustomer(req);
    const orderId = Number(req.params.orderId);
    const order = (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!order || order.customerId !== customer.id) {
      return res.status(404).json({ message: "Buyurtma topilmadi" });
    }
    const intent = await findIntentByOrderId(orderId);
    if (!intent) {
      return res.json({
        intent: null,
        attempts: [],
        capture: null,
        refunds: [],
        refundableAmount: 0,
        orderPaymentStatus: order.paymentStatus,
        axes: { paymentStatus: order.paymentStatus, note: "payment_axis_only" as const },
      });
    }
    const snap = await getPaymentSnapshot(intent.id);
    return res.json(snapshotBody(snap));
  } catch (error) {
    return next(error);
  }
});

/**
 * P7.8 / P7.7 — admin refund (payments:manage + branch scope).
 * Provider PSP refund remains CONTRACT_PENDING; cashback not auto-reversed.
 */
router.post("/admin/payments/intents/:id/refund", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "payments:manage");
    const intentId = Number(req.params.id);
    const snap = await getPaymentSnapshot(intentId);
    await assertBranchScope(admin, snap.intent.branchId);

    const idempotencyKey =
      typeof req.body?.idempotencyKey === "string" && req.body.idempotencyKey.trim()
        ? req.body.idempotencyKey.trim()
        : `admin-refund:${intentId}:${admin.id}:${req.body?.amount ?? "full"}`;

    const result = await requestRefund({
      intentId,
      amount: req.body?.amount != null ? Number(req.body.amount) : null,
      idempotencyKey,
      actor: admin.email,
      reason: typeof req.body?.reason === "string" ? req.body.reason : "admin_refund",
    });

    return res.json({
      ok: true,
      refund: serializePaymentRefundPublic(result.refund),
      intent: serializePaymentIntentPublic(result.intent),
      idempotent: result.idempotent,
      providerExecution: result.providerExecution,
      cashbackReversal: "OPEN_NOT_AUTO",
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * P7.8 — admin payment reconciliation snapshot (payments:read + branch scope).
 */
router.get("/admin/payments/intents/:id", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "payments:read");
    const intentId = Number(req.params.id);
    const snap = await getPaymentSnapshot(intentId);
    await assertBranchScope(admin, snap.intent.branchId);
    return res.json({
      ...snapshotBody(snap),
      audit: {
        intentId: snap.intent.id,
        orderId: snap.intent.orderId,
        branchId: snap.intent.branchId,
        provider: snap.intent.provider,
        attemptExternalRefs: snap.attempts.map((a) => a.externalRef).filter(Boolean),
        captureId: snap.capture?.id ?? null,
        refundIds: snap.refunds.map((r) => r.id),
        status: snap.intent.status,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/payments/:provider/checkout/:id", async (req, res, next) => {
  try {
    if (isProductionLike() || !allowPaymentSimulate()) {
      return res.status(404).send("To‘lov sahifasi mavjud emas");
    }
    const id = Number(req.params.id);
    const rows = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
    if (!rows[0]) return res.status(404).send("To‘lov topilmadi");
    const order = (await db.select().from(orders).where(eq(orders.id, rows[0].orderId)))[0];
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.send(`<!doctype html>
<html lang="uz">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
  <title>Vaksina Med · To‘lov</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
      background: #F7F5F2;
      color: #1A1040;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      margin: 0;
      padding: 0;
    }
    .app-shell {
      width: 100%;
      max-width: 440px;
      min-height: 100vh;
      background: #FFFFFF;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    }
    .header {
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #F1EBFF;
      background: #FFFFFF;
    }
    .back-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: #F1EBFF;
      color: #6A22D6;
      text-decoration: none;
      font-size: 18px;
      font-weight: 700;
    }
    .header-title {
      font-size: 16px;
      font-weight: 700;
      color: #1A1040;
    }
    .secure-badge {
      font-size: 11px;
      font-weight: 600;
      color: #15803D;
      background: #DCFCE7;
      padding: 4px 8px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .content {
      padding: 20px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .dev-banner {
      background: #FEF3C7;
      border: 1px solid #FDE68A;
      border-radius: 12px;
      padding: 10px 14px;
      font-size: 12px;
      color: #92400E;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dev-badge {
      background: #F59E0B;
      color: #FFFFFF;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .summary-card {
      background: linear-gradient(135deg, #FAF7FF 0%, #F3EDFF 100%);
      border: 1px solid #E9DEFF;
      border-radius: 20px;
      padding: 22px 20px;
      text-align: center;
    }
    .provider-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #FFFFFF;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      color: #6A22D6;
      box-shadow: 0 2px 6px rgba(106, 34, 214, 0.08);
      margin-bottom: 12px;
    }
    .order-code {
      font-size: 13px;
      color: #6B7280;
      font-weight: 500;
      margin-bottom: 6px;
    }
    .amount {
      font-size: 28px;
      font-weight: 800;
      color: #1A1040;
      letter-spacing: -0.5px;
      margin-bottom: 4px;
    }
    .info-list {
      background: #F9FAFB;
      border: 1px solid #F3F4F6;
      border-radius: 16px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }
    .info-label {
      color: #6B7280;
    }
    .info-val {
      font-weight: 600;
      color: #1F2937;
    }
    .trust-box {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      background: #F0FDF4;
      border-radius: 12px;
      font-size: 12px;
      color: #166534;
      line-height: 16px;
    }
    .footer {
      padding: 20px;
      border-top: 1px solid #F3F4F6;
      background: #FFFFFF;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn-pay {
      background: #6A22D6;
      color: #FFFFFF;
      border: none;
      border-radius: 14px;
      padding: 16px;
      font-size: 16px;
      font-weight: 700;
      width: 100%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.2s;
    }
    .btn-pay:hover {
      background: #5619B5;
    }
    .btn-cancel {
      background: transparent;
      color: #6B7280;
      border: none;
      padding: 10px;
      font-size: 13px;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
      border-radius: 10px;
    }
    .btn-cancel:hover {
      color: #1F2937;
      background: #F3F4F6;
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <div class="header">
      <a href="http://localhost:8081/order/${order?.id ?? ''}" class="back-btn" title="Orqaga">‹</a>
      <div class="header-title">Vaksina Med to‘lov</div>
      <div class="secure-badge">🔒 Xavfsiz</div>
    </div>
    <div class="content">
      <div class="dev-banner">
        <span class="dev-badge">Test rejimi</span>
        <span>Mock to‘lov muhiti · Real mablag‘ yechilmaydi</span>
      </div>

      <div class="summary-card">
        <div class="provider-pill">
          💳 ${rows[0].provider.toUpperCase()}
        </div>
        <div class="order-code">Buyurtma: #${order?.code ?? ""}</div>
        <div class="amount">${new Intl.NumberFormat("uz-UZ").format(rows[0].amount)} so‘m</div>
      </div>

      <div class="info-list">
        <div class="info-row">
          <span class="info-label">Qabul qiluvchi</span>
          <span class="info-val">Vaksina Med MCHJ</span>
        </div>
        <div class="info-row">
          <span class="info-label">To‘lov provayderi</span>
          <span class="info-val">${rows[0].provider.toUpperCase()}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Holati</span>
          <span class="info-val" style="color: #D97706;">To‘lov kutilmoqda</span>
        </div>
      </div>

      <div class="trust-box">
        <span>🛡️</span>
        <div>Barcha ma’lumotlar 256-bitli xavfsiz shifrlash orqali himoyalangan va rasmiy to‘lov shlyuzi orqali qayta ishlanadi.</div>
      </div>
    </div>

    <div class="footer">
      <form method="post" action="/api/payments/${id}/simulate-success">
        <button type="submit" class="btn-pay">
          ✓ To‘lovni tasdiqlash
        </button>
      </form>
      <a href="http://localhost:8081/order/${order?.id ?? ''}" class="btn-cancel">
        Bekor qilish va buyurtmaga qaytish
      </a>
    </div>
  </div>
</body>
</html>`);
  } catch (error) {
    return next(error);
  }
});

router.post("/payments/:id/simulate-success", async (req, res, next) => {
  try {
    if (!allowPaymentSimulate()) {
      return res.status(403).json({ message: "Payment simulation is disabled" });
    }
    // Capture via intent SoT — does NOT earn cashback or consume inventory
    const payment = await markPaymentPaid(Number(req.params.id));
    // Idempotent if capture already set PAID on order axis
    const paid = await markOrderPaymentPaid(payment.orderId, { actor: "payment:simulate" });
    const wantsJson = req.header("accept")?.includes("application/json") || req.header("content-type")?.includes("application/json");
    if (wantsJson) {
      // Never expose merchant secrets — payment row has merchantId (public) only
      const safePayment = {
        id: payment.id,
        orderId: payment.orderId,
        provider: payment.provider,
        branchId: payment.branchId,
        merchantId: payment.merchantId,
        externalId: payment.externalId,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        paymentIntentId: payment.paymentIntentId,
      };
      res.json({ order: await serializeOrder(paid.order), payment: safePayment });
      return;
    }
    return res.redirect(302, `http://localhost:8081/order/${paid.order.id}`);
  } catch (error) {
    return next(error);
  }
});

async function handleProviderWebhook(
  provider: "payme" | "click",
  req: { body: unknown; headers: Record<string, unknown> },
  res: { status: (n: number) => { json: (b: unknown) => unknown }; json: (b: unknown) => unknown },
) {
  const adapter = getPaymentAdapter(provider);
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    headers[k] = typeof v === "string" ? v : Array.isArray(v) ? String(v[0]) : undefined;
  }

  const parsed = await adapter.parseCallback(req.body, headers);
  const externalEventId =
    parsed.externalEventId
    || String((req.body as { id?: string })?.id || `${provider}:${Date.now()}`);

  const { event, idempotent } = await ingestWebhookEvent({
    provider,
    externalEventId,
    payload: req.body,
  });

  const processed = await processWebhookEvent(event.id, { headers });

  if (isProductionLike()) {
    return res.status(501).json({
      ok: false,
      message: "Payment provider webhook not configured",
      eventId: event.id,
      status: processed.event.status,
      mutated: false,
      idempotent,
    });
  }

  return res.json({
    ok: true,
    received: true,
    mutated: processed.mutated,
    status: processed.event.status,
    idempotent,
    eventId: event.id,
  });
}

router.post("/payments/payme/webhook", async (req, res, next) => {
  try {
    // Prefer Merchant API endpoint; webhook path only stores events without mutation.
    // If body looks like Merchant JSON-RPC, forward to merchant handler.
    const method = req.body && typeof req.body === "object" ? String((req.body as { method?: string }).method || "") : "";
    if (
      method === "CheckPerformTransaction"
      || method === "CreateTransaction"
      || method === "PerformTransaction"
      || method === "CancelTransaction"
      || method === "CheckTransaction"
    ) {
      const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
      const response = await handlePaymeMerchantRpc(req.body, authorization);
      return res.status(200).json(response);
    }
    await handleProviderWebhook("payme", req, res);
  } catch (error) {
    return next(error);
  }
});

router.post("/payments/click/webhook", async (req, res, next) => {
  try {
    // Prefer Shop API merchant endpoint; forward Prepare/Complete when action present.
    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    const action = Number(body.action);
    if (
      body.click_trans_id != null
      && (action === CLICK_ACTION.PREPARE || action === CLICK_ACTION.COMPLETE)
    ) {
      const response = await handleClickMerchantRequest(req.body);
      return res.status(200).json(response);
    }
    await handleProviderWebhook("click", req, res);
  } catch (error) {
    return next(error);
  }
});

export default router;
