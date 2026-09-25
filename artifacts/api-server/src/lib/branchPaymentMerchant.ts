/**
 * P7.6.2 — branch payment merchant resolver + secret access boundary.
 *
 * Phase 12.28: DB may store ciphertext (`enc:v1:…`). Plaintext exists only after
 * decrypt into WeakMap for adapter use. WeakMap is NOT encryption-at-rest.
 *
 * Secrets never serialize on PaymentMerchantConfig. No vault/KMS client in-repo —
 * KEK is ops-injected via MERCHANT_SECRET_KEK (see merchantSecretCrypto.ts).
 */

import { eq } from "drizzle-orm";
import { db, branches, paymentIntents, type Branch } from "@workspace/db";
import {
  decryptMerchantSecretFromStorage,
  encryptMerchantSecretForStorage,
  storedSecretConfigured,
} from "./merchantSecretCrypto";

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
  let paymePlain = "";
  let clickPlain = "";
  try {
    paymePlain = decryptMerchantSecretFromStorage(branch.paymeKey);
    clickPlain = decryptMerchantSecretFromStorage(branch.clickSecret);
  } catch (err) {
    // Fail closed — do not fall back to sending ciphertext to PSP.
    throw err;
  }

  const configured =
    provider === "payme"
      ? Boolean(branch.paymeMerchantId?.trim() && paymePlain.trim())
      : Boolean(branch.clickMerchantId?.trim() && clickPlain.trim());

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
    paymeKey: paymePlain,
    clickSecret: clickPlain,
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
    merchantId: config.merchantId || null,
    serviceId: config.provider === "click" ? config.serviceId || null : null,
  };
}

/** Presence flags from a branch row without returning or decrypting secrets. */
export function branchOnlinePaymentFlags(branch: {
  paymeMerchantId?: string | null;
  paymeKey?: string | null;
  clickMerchantId?: string | null;
  clickSecret?: string | null;
}) {
  return {
    hasPayme: Boolean(
      String(branch.paymeMerchantId || "").trim() && storedSecretConfigured(branch.paymeKey),
    ),
    hasClick: Boolean(
      String(branch.clickMerchantId || "").trim() && storedSecretConfigured(branch.clickSecret),
    ),
  };
}

/**
 * Admin branch payment view — secrets always masked; never raw / never ciphertext.
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

/** Encrypt plaintext for DB write. Production without KEK fails closed. */
export function prepareMerchantSecretForStorage(plaintext: string): string {
  return encryptMerchantSecretForStorage(plaintext);
}

/** Documented: app encryption boundary exists; cloud KMS still OPS_REQUIRED. */
export const SECRET_ENCRYPTION_AT_REST_FOLLOW_UP =
  "P12.28: AES-GCM enc:v1 ciphertext via MERCHANT_SECRET_KEK. Cloud KMS/Vault still OPS_REQUIRED — no homemade cloud KMS.";
