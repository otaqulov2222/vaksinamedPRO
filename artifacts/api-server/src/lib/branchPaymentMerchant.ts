/**
 * P7.6.2 — branch payment merchant resolver + secret access boundary.
 *
 * Internal-only configuration for future Payme/Click adapters.
 * Does NOT call PSPs. Does NOT invent protocols, URLs, or signatures.
 *
 * Secrets stay in a WeakMap — never serialize PaymentMerchantConfig to API DTOs.
 * Encryption-at-rest is NOT implemented here (no existing vault abstraction) — follow-up.
 *
 * P12.2: All branch secret material MUST go through this module
 * (`resolvePaymentMerchantConfig` / `getPaymentMerchantSecretMaterial`).
 * Do not invent homemade crypto; wait for verified KMS/vault.
 */

import { eq } from "drizzle-orm";
import { db, branches, paymentIntents, type Branch } from "@workspace/db";

type DbLike = typeof db;

export type OnlinePaymentProvider = "payme" | "click";

export type PaymentMerchantConfig = {
  /** Opaque handle — do not JSON.stringify for APIs; use toPublicMerchantSummary. */
  readonly __brand: "PaymentMerchantConfig";
  branchId: number;
  branchCode: string;
  provider: OnlinePaymentProvider;
  /** True when public id + secret material both present for this provider. */
  configured: boolean;
  /** Public merchant identifier for this provider (never the secret). */
  merchantId: string;
  /** Click service id when provider=click; otherwise "". */
  serviceId: string;
};

type SecretBag = {
  paymeKey: string;
  clickSecret: string;
};

const secretBag = new WeakMap<object, SecretBag>();

function badRequest(message: string, status = 400, code?: string) {
  return Object.assign(new Error(message), { status, code });
}

export function normalizeOnlinePaymentProvider(raw: string): OnlinePaymentProvider {
  const p = String(raw || "").trim().toLowerCase();
  if (p === "payme") return "payme";
  if (p === "click") return "click";
  throw badRequest(`To‘lov provayderi qo‘llab-quvvatlanmaydi: ${raw}`, 400, "UNSUPPORTED_PAYMENT_PROVIDER");
}

export function isOnlinePaymentProvider(raw: string): raw is OnlinePaymentProvider {
  const p = String(raw || "").trim().toLowerCase();
  return p === "payme" || p === "click";
}

function buildConfig(branch: Branch, provider: OnlinePaymentProvider): PaymentMerchantConfig {
  const configured =
    provider === "payme"
      ? Boolean(branch.paymeMerchantId?.trim() && branch.paymeKey?.trim())
      : Boolean(branch.clickMerchantId?.trim() && branch.clickSecret?.trim());

  const merchantId =
    provider === "payme"
      ? String(branch.paymeMerchantId || "").trim()
      : String(branch.clickMerchantId || "").trim();

  const serviceId = provider === "click" ? String(branch.clickServiceId || "").trim() : "";

  const handle: PaymentMerchantConfig = {
    __brand: "PaymentMerchantConfig",
    branchId: branch.id,
    branchCode: branch.code,
    provider,
    configured,
    merchantId,
    serviceId,
  };

  secretBag.set(handle, {
    paymeKey: String(branch.paymeKey || ""),
    clickSecret: String(branch.clickSecret || ""),
  });

  return handle;
}

/**
 * Resolve Payme/Click merchant config for exactly one branch.
 * Never falls back to another branch or a global merchant.
 */
export async function resolvePaymentMerchantConfig(
  input: {
    branchId: number;
    provider: string;
    /** When set, must equal branchId (intent/order isolation guard). */
    expectedBranchId?: number;
    /** When true, missing merchant+secret throws MERCHANT_CONFIG_MISSING. */
    requireConfigured?: boolean;
  },
  executor: DbLike = db,
): Promise<PaymentMerchantConfig> {
  const branchId = Number(input.branchId);
  if (!Number.isFinite(branchId) || branchId <= 0) {
    throw badRequest("Filial ID noto‘g‘ri", 400, "INVALID_BRANCH_ID");
  }

  if (input.expectedBranchId != null && Number(input.expectedBranchId) !== branchId) {
    throw badRequest(
      "To‘lov filiali merchant konfiguratsiyasi bilan mos kelmaydi",
      409,
      "BRANCH_MERCHANT_MISMATCH",
    );
  }

  const provider = normalizeOnlinePaymentProvider(input.provider);

  const rows = await executor.select().from(branches).where(eq(branches.id, branchId)).limit(1);
  const branch = rows[0];
  if (!branch) {
    throw badRequest("Filial topilmadi", 404, "BRANCH_NOT_FOUND");
  }

  const config = buildConfig(branch, provider);

  if (input.requireConfigured && !config.configured) {
    throw badRequest(
      `${provider.toUpperCase()} merchant konfiguratsiyasi filial ${branch.code} uchun yo‘q`,
      409,
      "MERCHANT_CONFIG_MISSING",
    );
  }

  return config;
}

/**
 * Load intent → enforce intent.branchId → resolve merchant for that branch only.
 */
export async function resolvePaymentMerchantForIntent(
  input: { intentId: number; requireConfigured?: boolean },
  executor: DbLike = db,
): Promise<{ intent: typeof paymentIntents.$inferSelect; config: PaymentMerchantConfig }> {
  const intent = (
    await executor.select().from(paymentIntents).where(eq(paymentIntents.id, input.intentId)).limit(1)
  )[0];
  if (!intent) {
    throw badRequest("Payment intent topilmadi", 404, "PAYMENT_INTENT_NOT_FOUND");
  }
  if (!isOnlinePaymentProvider(intent.provider)) {
    throw badRequest(
      `Intent provayderi onlayn merchant talab qilmaydi: ${intent.provider}`,
      400,
      "UNSUPPORTED_PAYMENT_PROVIDER",
    );
  }
  const config = await resolvePaymentMerchantConfig(
    {
      branchId: intent.branchId,
      provider: intent.provider,
      expectedBranchId: intent.branchId,
      requireConfigured: input.requireConfigured,
    },
    executor,
  );
  return { intent, config };
}

/** Secret material for internal adapter use only — never log or return in HTTP. */
export function getPaymentMerchantSecretMaterial(config: PaymentMerchantConfig): {
  provider: OnlinePaymentProvider;
  /** Payme key when provider=payme; empty otherwise. */
  paymeKey: string;
  /** Click secret when provider=click; empty otherwise. */
  clickSecret: string;
} {
  const bag = secretBag.get(config);
  if (!bag) {
    throw badRequest("Merchant secret handle yaroqsiz", 500, "MERCHANT_SECRET_HANDLE_INVALID");
  }
  if (config.provider === "payme") {
    return { provider: "payme", paymeKey: bag.paymeKey, clickSecret: "" };
  }
  return { provider: "click", paymeKey: "", clickSecret: bag.clickSecret };
}

/** Safe summary for logs / admin metadata — never includes secrets. */
export function toPublicMerchantSummary(config: PaymentMerchantConfig) {
  return {
    branchId: config.branchId,
    branchCode: config.branchCode,
    provider: config.provider,
    configured: config.configured,
    hasMerchantId: Boolean(config.merchantId),
    hasServiceId: Boolean(config.serviceId),
    // Public ID only when present — not a secret
    merchantId: config.merchantId || null,
    serviceId: config.provider === "click" ? config.serviceId || null : null,
  };
}

/** Presence flags from a branch row without returning secrets. */
export function branchOnlinePaymentFlags(branch: {
  paymeMerchantId?: string | null;
  paymeKey?: string | null;
  clickMerchantId?: string | null;
  clickSecret?: string | null;
}) {
  return {
    hasPayme: Boolean(String(branch.paymeMerchantId || "").trim() && String(branch.paymeKey || "").trim()),
    hasClick: Boolean(String(branch.clickMerchantId || "").trim() && String(branch.clickSecret || "").trim()),
  };
}

/**
 * Admin branch payment view — secrets always masked; never raw.
 * Admin UI can still PATCH raw secrets via write path (branches:manage).
 */
export function toAdminBranchPaymentDto(branch: Branch) {
  const flags = branchOnlinePaymentFlags(branch);
  return {
    paymeMerchantId: branch.paymeMerchantId || "",
    paymeKey: flags.hasPayme ? "••••" : "",
    clickMerchantId: branch.clickMerchantId || "",
    clickServiceId: branch.clickServiceId || "",
    clickSecret: flags.hasClick ? "••••" : "",
    hasPayme: flags.hasPayme,
    hasClick: flags.hasClick,
  };
}

/** Documented follow-up: plaintext DB secrets — no vault abstraction in repo yet. */
export const SECRET_ENCRYPTION_AT_REST_FOLLOW_UP =
  "P7.6.2 follow-up: encrypt branches.payme_key / branches.click_secret at rest when a vault/KMS abstraction exists.";
