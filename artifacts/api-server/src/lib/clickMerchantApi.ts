/**
 * P7.6.4 — Click Shop API Prepare/Complete — verified contract only.
 *
 * Contract sources (official):
 * - https://docs.click.uz/en/click-api-request/ (Shop API Prepare/Complete)
 * - https://docs.click.uz/en/click-api-error/
 * - https://docs.click.uz/en/click-button/ (checkout URL)
 *
 * Model: Click POSTs to OUR merchant endpoints (Prepare action=0, Complete action=1).
 * Auth: MD5 sign_string with branch click_secret (never from client).
 * Amount: soums (UZS); compared to P7 intent integer so'm via ×100.
 *
 * Outbound Merchant API (Auth SHA1 invoice/create): CONTRACT_PENDING.
 * Fiscal / Click Pass / Advanced GetInfo: CONTRACT_PENDING.
 */

import { and, desc, eq } from "drizzle-orm";
import {
  db,
  paymentAttempts,
  paymentCaptures,
  paymentIntents,
  type PaymentAttempt,
  type PaymentIntent,
} from "@workspace/db";
import {
  getPaymentMerchantSecretMaterial,
  resolvePaymentMerchantConfig,
} from "./branchPaymentMerchant";
import { capturePayment, createPaymentAttempt, failPaymentIntent } from "./paymentService";
import {
  CLICK_ACTION,
  CLICK_ERROR,
  CLICK_ERROR_NOTE,
  clickAmountMatchesIntentUzs,
  isClickMerchantApiEnabled,
  isValidClickSignTime,
  verifyClickSignString,
} from "./clickContract";

type DbLike = typeof db;

export type ClickMerchantResponse = {
  click_trans_id: number | string;
  merchant_trans_id: string;
  merchant_prepare_id?: number;
  merchant_confirm_id?: number | null;
  error: number;
  error_note: string;
};

type AttemptMeta = {
  clickTransId?: string;
  clickPaydocId?: string;
  serviceId?: string;
  merchantTransId?: string;
  amountRaw?: string;
  action?: number;
  signTime?: string;
  prepareId?: number;
  confirmId?: number | null;
  phase?: "prepare" | "complete" | "cancelled";
  clickError?: number;
  orderId?: number;
};

function note(code: number): string {
  return CLICK_ERROR_NOTE[code] || "Error";
}

function respond(
  clickTransId: number | string,
  merchantTransId: string,
  error: number,
  extra: Partial<ClickMerchantResponse> = {},
): ClickMerchantResponse {
  return {
    click_trans_id: clickTransId,
    merchant_trans_id: merchantTransId,
    error,
    error_note: note(error),
    ...extra,
  };
}

function parseMeta(raw: string | null | undefined): AttemptMeta {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? (v as AttemptMeta) : {};
  } catch {
    return {};
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  return body as Record<string, unknown>;
}

function pickField(body: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (body[k] != null && body[k] !== "") return body[k];
  }
  return undefined;
}

async function findAttemptByClickTransId(
  clickTransId: string,
  executor: DbLike,
): Promise<PaymentAttempt | null> {
  const rows = await executor
    .select()
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.provider, "click"), eq(paymentAttempts.externalRef, clickTransId)))
    .limit(1);
  return rows[0] || null;
}

async function findAttemptByPrepareId(
  prepareId: number,
  executor: DbLike,
): Promise<PaymentAttempt | null> {
  if (!Number.isFinite(prepareId) || prepareId <= 0) return null;
  const rows = await executor
    .select()
    .from(paymentAttempts)
    .where(and(eq(paymentAttempts.provider, "click"), eq(paymentAttempts.id, prepareId)))
    .limit(1);
  return rows[0] || null;
}

async function findClickIntentForOrder(orderId: number, executor: DbLike): Promise<PaymentIntent | null> {
  const rows = await executor
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.orderId, orderId), eq(paymentIntents.provider, "click")))
    .orderBy(desc(paymentIntents.id))
    .limit(5);
  const open = rows.find((r) =>
    ["CREATED", "REQUIRES_PAYMENT", "PROCESSING"].includes(r.status),
  );
  return open || rows[0] || null;
}

async function resolveIntentFromMerchantTransId(
  merchantTransId: string,
  executor: DbLike,
): Promise<PaymentIntent | null> {
  const raw = String(merchantTransId || "").trim();
  if (!raw) return null;

  if (raw.startsWith("pi:") || raw.startsWith("intent:")) {
    const intentId = Number(raw.replace(/^(pi:|intent:)/, ""));
    if (intentId > 0) {
      const intent = (
        await executor.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1)
      )[0];
      if (intent?.provider === "click") return intent;
    }
  }

  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0 && String(asNum) === raw) {
    const byIntent = (
      await executor.select().from(paymentIntents).where(eq(paymentIntents.id, asNum)).limit(1)
    )[0];
    if (byIntent?.provider === "click") return byIntent;

    const byOrder = await findClickIntentForOrder(asNum, executor);
    if (byOrder) return byOrder;
  }

  return null;
}

async function resolveMerchantForIntent(intent: PaymentIntent, executor: DbLike) {
  return resolvePaymentMerchantConfig(
    {
      branchId: intent.branchId,
      provider: "click",
      expectedBranchId: intent.branchId,
      requireConfigured: true,
    },
    executor,
  );
}

/**
 * Single entry for Click Shop API callbacks (Prepare or Complete).
 * Body may be JSON or form-urlencoded (Express-parsed).
 */
export async function handleClickMerchantRequest(
  body: unknown,
  executor: DbLike = db,
): Promise<ClickMerchantResponse> {
  if (!isClickMerchantApiEnabled()) {
    return respond(0, "", CLICK_ERROR.ERROR_IN_REQUEST);
  }

  const raw = asRecord(body);
  const clickTransIdRaw = pickField(raw, "click_trans_id");
  const merchantTransId = String(pickField(raw, "merchant_trans_id") ?? "").trim();
  const action = Number(pickField(raw, "action"));
  const clickTransId =
    clickTransIdRaw != null && clickTransIdRaw !== ""
      ? (Number.isFinite(Number(clickTransIdRaw)) ? Number(clickTransIdRaw) : String(clickTransIdRaw))
      : 0;

  if (action !== CLICK_ACTION.PREPARE && action !== CLICK_ACTION.COMPLETE) {
    return respond(clickTransId, merchantTransId, CLICK_ERROR.ACTION_NOT_FOUND);
  }

  const serviceIdRaw = pickField(raw, "service_id");
  const amountRaw = pickField(raw, "amount");
  const signTime = String(pickField(raw, "sign_time") ?? "").trim();
  const signString = String(pickField(raw, "sign_string") ?? "").trim();
  const clickPaydocId = pickField(raw, "click_paydoc_id");
  const merchantPrepareIdRaw = pickField(raw, "merchant_prepare_id");
  const clickErrorField = Number(pickField(raw, "error") ?? 0);

  if (
    clickTransIdRaw == null
    || clickTransIdRaw === ""
    || !merchantTransId
    || serviceIdRaw == null
    || serviceIdRaw === ""
    || amountRaw == null
    || amountRaw === ""
    || !signTime
    || !signString
  ) {
    return respond(clickTransId, merchantTransId, CLICK_ERROR.ERROR_IN_REQUEST);
  }

  if (!isValidClickSignTime(signTime)) {
    return respond(clickTransId, merchantTransId, CLICK_ERROR.ERROR_IN_REQUEST);
  }

  if (action === CLICK_ACTION.PREPARE) {
    return prepare({
      clickTransId,
      clickTransIdStr: String(clickTransIdRaw),
      merchantTransId,
      serviceIdRaw,
      amountRaw,
      signTime,
      signString,
      clickPaydocId,
      executor,
    });
  }

  return complete({
    clickTransId,
    clickTransIdStr: String(clickTransIdRaw),
    merchantTransId,
    serviceIdRaw,
    amountRaw,
    signTime,
    signString,
    clickPaydocId,
    merchantPrepareIdRaw,
    clickErrorField,
    executor,
  });
}

async function prepare(input: {
  clickTransId: number | string;
  clickTransIdStr: string;
  merchantTransId: string;
  serviceIdRaw: unknown;
  amountRaw: unknown;
  signTime: string;
  signString: string;
  clickPaydocId: unknown;
  executor: DbLike;
}): Promise<ClickMerchantResponse> {
  const { executor } = input;

  const existing = await findAttemptByClickTransId(input.clickTransIdStr, executor);
  if (existing) {
    const intent = (
      await executor.select().from(paymentIntents).where(eq(paymentIntents.id, existing.intentId)).limit(1)
    )[0];
    if (!intent) {
      return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.TRANSACTION_NOT_FOUND);
    }
    try {
      const merchant = await resolveMerchantForIntent(intent, executor);
      const secrets = getPaymentMerchantSecretMaterial(merchant);
      if (
        !verifyClickSignString({
          clickTransId: input.clickTransIdStr,
          serviceId: input.serviceIdRaw as string | number,
          secretKey: secrets.clickSecret,
          merchantTransId: input.merchantTransId,
          amount: input.amountRaw,
          action: CLICK_ACTION.PREPARE,
          signTime: input.signTime,
          signString: input.signString,
        })
      ) {
        return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.SIGN_CHECK_FAILED);
      }
      if (String(merchant.serviceId) !== String(input.serviceIdRaw)) {
        return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.ERROR_IN_REQUEST);
      }
    } catch {
      return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.SIGN_CHECK_FAILED);
    }

    const meta = parseMeta(existing.meta);
    if (meta.phase === "complete" || intent.status === "PAID" || existing.status === "SUCCEEDED") {
      return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.ALREADY_PAID, {
        merchant_prepare_id: existing.id,
      });
    }
    if (meta.phase === "cancelled" || intent.status === "FAILED" || intent.status === "CANCELLED") {
      return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.TRANSACTION_CANCELLED, {
        merchant_prepare_id: existing.id,
      });
    }
    // Idempotent Prepare
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.SUCCESS, {
      merchant_prepare_id: existing.id,
    });
  }

  const intent = await resolveIntentFromMerchantTransId(input.merchantTransId, executor);
  if (!intent) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.USER_NOT_FOUND);
  }

  let merchant;
  let secrets;
  try {
    merchant = await resolveMerchantForIntent(intent, executor);
    secrets = getPaymentMerchantSecretMaterial(merchant);
  } catch {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.USER_NOT_FOUND);
  }

  if (!merchant.serviceId?.trim()) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.ERROR_IN_REQUEST);
  }
  if (String(merchant.serviceId) !== String(input.serviceIdRaw)) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.ERROR_IN_REQUEST);
  }

  if (
    !verifyClickSignString({
      clickTransId: input.clickTransIdStr,
      serviceId: input.serviceIdRaw as string | number,
      secretKey: secrets.clickSecret,
      merchantTransId: input.merchantTransId,
      amount: input.amountRaw,
      action: CLICK_ACTION.PREPARE,
      signTime: input.signTime,
      signString: input.signString,
    })
  ) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.SIGN_CHECK_FAILED);
  }

  if (!clickAmountMatchesIntentUzs(input.amountRaw, intent.amount)) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.INCORRECT_AMOUNT);
  }

  if (intent.status === "PAID") {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.ALREADY_PAID);
  }
  if (["CANCELLED", "EXPIRED", "REFUNDED", "FAILED"].includes(intent.status)) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.TRANSACTION_CANCELLED);
  }

  const captured = await executor
    .select()
    .from(paymentCaptures)
    .where(eq(paymentCaptures.intentId, intent.id))
    .limit(1);
  if (captured[0]) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.ALREADY_PAID);
  }

  try {
    const { attempt } = await createPaymentAttempt(
      {
        intentId: intent.id,
        idempotencyKey: `click:prepare:${input.clickTransIdStr}`,
        externalRef: input.clickTransIdStr,
        actor: "click:Prepare",
      },
      executor,
    );

    const meta: AttemptMeta = {
      clickTransId: input.clickTransIdStr,
      clickPaydocId: input.clickPaydocId != null ? String(input.clickPaydocId) : undefined,
      serviceId: String(input.serviceIdRaw),
      merchantTransId: input.merchantTransId,
      amountRaw: typeof input.amountRaw === "string" ? input.amountRaw : String(input.amountRaw),
      action: CLICK_ACTION.PREPARE,
      signTime: input.signTime,
      prepareId: attempt.id,
      phase: "prepare",
      orderId: intent.orderId,
    };

    await executor
      .update(paymentAttempts)
      .set({
        status: "PROCESSING",
        meta: JSON.stringify(meta),
        externalRef: input.clickTransIdStr,
      })
      .where(eq(paymentAttempts.id, attempt.id));

    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.SUCCESS, {
      merchant_prepare_id: attempt.id,
    });
  } catch {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.FAILED_TO_UPDATE_USER);
  }
}

async function complete(input: {
  clickTransId: number | string;
  clickTransIdStr: string;
  merchantTransId: string;
  serviceIdRaw: unknown;
  amountRaw: unknown;
  signTime: string;
  signString: string;
  clickPaydocId: unknown;
  merchantPrepareIdRaw: unknown;
  clickErrorField: number;
  executor: DbLike;
}): Promise<ClickMerchantResponse> {
  const { executor } = input;
  const prepareId = Number(input.merchantPrepareIdRaw);

  if (!Number.isFinite(prepareId) || prepareId <= 0) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.ERROR_IN_REQUEST);
  }

  let attempt =
    (await findAttemptByPrepareId(prepareId, executor))
    || (await findAttemptByClickTransId(input.clickTransIdStr, executor));

  if (!attempt) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.TRANSACTION_NOT_FOUND);
  }

  if (attempt.id !== prepareId && Number.isFinite(prepareId)) {
    // merchant_prepare_id must match our prepare attempt
    const byPrepare = await findAttemptByPrepareId(prepareId, executor);
    if (!byPrepare) {
      return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.TRANSACTION_NOT_FOUND);
    }
    attempt = byPrepare;
  }

  const intent = (
    await executor.select().from(paymentIntents).where(eq(paymentIntents.id, attempt.intentId)).limit(1)
  )[0];
  if (!intent || intent.provider !== "click") {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.TRANSACTION_NOT_FOUND);
  }

  let merchant;
  let secrets;
  try {
    merchant = await resolveMerchantForIntent(intent, executor);
    secrets = getPaymentMerchantSecretMaterial(merchant);
  } catch {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.SIGN_CHECK_FAILED);
  }

  if (String(merchant.serviceId) !== String(input.serviceIdRaw)) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.ERROR_IN_REQUEST);
  }

  if (
    !verifyClickSignString({
      clickTransId: input.clickTransIdStr,
      serviceId: input.serviceIdRaw as string | number,
      secretKey: secrets.clickSecret,
      merchantTransId: input.merchantTransId,
      merchantPrepareId: prepareId,
      amount: input.amountRaw,
      action: CLICK_ACTION.COMPLETE,
      signTime: input.signTime,
      signString: input.signString,
    })
  ) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.SIGN_CHECK_FAILED);
  }

  // Branch / merchant_trans identity: intent must belong to expected order/merchant_trans
  const expectedTrans = String(parseMeta(attempt.meta).merchantTransId || intent.orderId);
  if (
    input.merchantTransId !== expectedTrans
    && input.merchantTransId !== String(intent.orderId)
    && input.merchantTransId !== String(intent.id)
    && input.merchantTransId !== `pi:${intent.id}`
    && input.merchantTransId !== `intent:${intent.id}`
  ) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.USER_NOT_FOUND);
  }

  if (!clickAmountMatchesIntentUzs(input.amountRaw, intent.amount)) {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.INCORRECT_AMOUNT);
  }

  const meta = parseMeta(attempt.meta);

  if (meta.phase === "complete" || intent.status === "PAID" || attempt.status === "SUCCEEDED") {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.ALREADY_PAID, {
      merchant_prepare_id: attempt.id,
      merchant_confirm_id: meta.confirmId ?? attempt.id,
    });
  }

  if (meta.phase === "cancelled" || intent.status === "CANCELLED" || intent.status === "FAILED") {
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.TRANSACTION_CANCELLED, {
      merchant_prepare_id: attempt.id,
    });
  }

  // Official: negative error from Click → cancel billing payment, return -9
  if (Number.isFinite(input.clickErrorField) && input.clickErrorField !== CLICK_ERROR.SUCCESS) {
    try {
      await executor
        .update(paymentAttempts)
        .set({
          status: "FAILED",
          meta: JSON.stringify({
            ...meta,
            phase: "cancelled",
            clickError: input.clickErrorField,
            action: CLICK_ACTION.COMPLETE,
          }),
        })
        .where(eq(paymentAttempts.id, attempt.id));

      if (["CREATED", "REQUIRES_PAYMENT", "PROCESSING"].includes(intent.status)) {
        await failPaymentIntent(
          intent.id,
          { actor: "click:Complete", reason: `click_error_${input.clickErrorField}` },
          executor,
        );
      }
    } catch {
      return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.FAILED_TO_UPDATE_USER, {
        merchant_prepare_id: attempt.id,
      });
    }
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.TRANSACTION_CANCELLED, {
      merchant_prepare_id: attempt.id,
    });
  }

  try {
    await capturePayment(
      {
        intentId: intent.id,
        attemptId: attempt.id,
        amount: intent.amount,
        currency: intent.currency,
        actor: "click:Complete",
      },
      executor,
    );

    const confirmId = attempt.id;
    await executor
      .update(paymentAttempts)
      .set({
        status: "SUCCEEDED",
        externalRef: input.clickTransIdStr,
        meta: JSON.stringify({
          ...meta,
          clickTransId: input.clickTransIdStr,
          clickPaydocId: input.clickPaydocId != null ? String(input.clickPaydocId) : meta.clickPaydocId,
          phase: "complete",
          confirmId,
          action: CLICK_ACTION.COMPLETE,
          clickError: 0,
          amountRaw: typeof input.amountRaw === "string" ? input.amountRaw : String(input.amountRaw),
        }),
      })
      .where(eq(paymentAttempts.id, attempt.id));

    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.SUCCESS, {
      merchant_prepare_id: attempt.id,
      merchant_confirm_id: confirmId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // Duplicate capture / already paid → official -4
    if (/already|PAID|unique|duplicate/i.test(msg)) {
      return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.ALREADY_PAID, {
        merchant_prepare_id: attempt.id,
        merchant_confirm_id: attempt.id,
      });
    }
    return respond(input.clickTransId, input.merchantTransId, CLICK_ERROR.FAILED_TO_UPDATE_USER, {
      merchant_prepare_id: attempt.id,
    });
  }
}
