/**
 * Phase 12.28 — Merchant secret encryption-at-rest boundary.
 *
 * WeakMap (branchPaymentMerchant) protects in-process serialization.
 * This module protects DB persistence: ciphertext in columns, plaintext
 * only after decrypt at the payment adapter boundary.
 *
 * NOT a cloud KMS implementation. Production must supply
 * MERCHANT_SECRET_KEK via secret manager / KMS-injected env (OPS).
 * No hardcoded keys. No silent plaintext fallback in production-like.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isProductionLike, flagEnabled } from "./securityEnv";

export const CIPHERTEXT_PREFIX = "enc:v1:";

export type SecretEncryptionProvider = {
  readonly id: string;
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
};

function cryptoError(message: string, code: string, status = 503) {
  return Object.assign(new Error(message), { status, code });
}

/** Ambiguous ciphertext marker — never treat as "configured" without successful decrypt. */
export function isEncryptedSecretBlob(raw: string | null | undefined): boolean {
  return String(raw || "").startsWith(CIPHERTEXT_PREFIX);
}

export function hasStoredSecretMaterial(raw: string | null | undefined): boolean {
  return Boolean(String(raw || "").trim());
}

/**
 * Local envelope: AES-256-GCM with KEK from env (32-byte key material).
 * KEK must be injected by ops (secret manager / KMS → env). Not "cloud KMS".
 */
export function createLocalKekProvider(kekRaw: string): SecretEncryptionProvider {
  const key = normalizeKek(kekRaw);
  return {
    id: "local_kek",
    encrypt(plaintext: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${CIPHERTEXT_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
    },
    decrypt(ciphertext: string): string {
      const body = String(ciphertext || "");
      if (!body.startsWith(CIPHERTEXT_PREFIX)) {
        throw cryptoError("Ciphertext format yaroqsiz", "MERCHANT_SECRET_CIPHERTEXT_INVALID", 500);
      }
      const parts = body.slice(CIPHERTEXT_PREFIX.length).split(".");
      if (parts.length !== 3) {
        throw cryptoError("Ciphertext format yaroqsiz", "MERCHANT_SECRET_CIPHERTEXT_INVALID", 500);
      }
      const [ivB64, tagB64, ctB64] = parts;
      try {
        const iv = Buffer.from(ivB64, "base64url");
        const tag = Buffer.from(tagB64, "base64url");
        const ct = Buffer.from(ctB64, "base64url");
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
      } catch {
        throw cryptoError("Merchant secret ochib bo‘lmadi", "MERCHANT_SECRET_DECRYPT_FAILED", 503);
      }
    },
  };
}

function normalizeKek(raw: string): Buffer {
  const s = String(raw || "").trim();
  if (!s) {
    throw cryptoError("MERCHANT_SECRET_KEK sozlanmagan", "MERCHANT_SECRET_KEK_MISSING", 503);
  }
  // Prefer base64 (32 bytes). Also accept hex (64 chars) or derive from long passphrase (test only).
  let key: Buffer;
  if (/^[A-Za-z0-9+/_-]+=*$/.test(s) && s.length >= 43) {
    key = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } else if (/^[0-9a-fA-F]{64}$/.test(s)) {
    key = Buffer.from(s, "hex");
  } else if (s.length >= 32 && !isProductionLike()) {
    key = createHash("sha256").update(s, "utf8").digest();
  } else {
    throw cryptoError("MERCHANT_SECRET_KEK formati yaroqsiz", "MERCHANT_SECRET_KEK_INVALID", 503);
  }
  if (key.length !== 32) {
    throw cryptoError("MERCHANT_SECRET_KEK 32 bayt bo‘lishi kerak", "MERCHANT_SECRET_KEK_INVALID", 503);
  }
  return key;
}

/**
 * Resolve provider from environment.
 * - Production/staging: MERCHANT_SECRET_KEK required for encrypt/decrypt of merchant secrets.
 * - Dev/test: optional; plaintext legacy reads allowed when provider absent.
 */
export function resolveMerchantSecretProvider(): SecretEncryptionProvider | null {
  const kek = (process.env.MERCHANT_SECRET_KEK || "").trim();
  if (kek) return createLocalKekProvider(kek);
  return null;
}

export function assertProductionMerchantSecretCryptoReady(): void {
  if (!isProductionLike()) return;
  if (!resolveMerchantSecretProvider()) {
    throw cryptoError(
      "Staging/production merchant secret encryption talab qilinadi (MERCHANT_SECRET_KEK).",
      "MERCHANT_SECRET_CRYPTO_REQUIRED",
      503,
    );
  }
}

/** Controlled migration window only — never default ON in production. */
export function allowPlaintextMerchantSecretRead(): boolean {
  if (!isProductionLike()) return true;
  return flagEnabled("MERCHANT_SECRET_ALLOW_PLAINTEXT_READ");
}

/**
 * Encrypt plaintext for DB storage.
 * Production-like without provider → fail closed (no plaintext write).
 */
export function encryptMerchantSecretForStorage(plaintext: string): string {
  const value = String(plaintext ?? "");
  if (!value) return "";
  const provider = resolveMerchantSecretProvider();
  if (!provider) {
    if (isProductionLike()) {
      throw cryptoError(
        "Merchant secret yozish uchun shifrlash sozlanmagan",
        "MERCHANT_SECRET_CRYPTO_REQUIRED",
        503,
      );
    }
    // Dev/test without KEK: store plaintext (legacy) — never production-like.
    return value;
  }
  return provider.encrypt(value);
}

/**
 * Decrypt DB value for adapter boundary only.
 * Ciphertext → decrypt. Legacy plaintext → allowed only when policy permits.
 */
export function decryptMerchantSecretFromStorage(stored: string | null | undefined): string {
  const raw = String(stored || "");
  if (!raw) return "";
  if (isEncryptedSecretBlob(raw)) {
    const provider = resolveMerchantSecretProvider();
    if (!provider) {
      throw cryptoError(
        "Shifrlangan merchant secret ochish uchun KEK yo‘q",
        "MERCHANT_SECRET_CRYPTO_REQUIRED",
        503,
      );
    }
    return provider.decrypt(raw);
  }
  if (!allowPlaintextMerchantSecretRead()) {
    throw cryptoError(
      "Plaintext merchant secret production rejimida taqiqlangan",
      "MERCHANT_SECRET_PLAINTEXT_FORBIDDEN",
      503,
    );
  }
  return raw;
}

/** Presence for hasPayme/hasClick without decrypting. */
export function storedSecretConfigured(stored: string | null | undefined): boolean {
  return hasStoredSecretMaterial(stored);
}

/** Test helper — constant-time compare of plaintext (never log). */
export function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * One-shot migration helper: plaintext or already-encrypted → enc:v1 ciphertext.
 * Does not touch production DB — callers (ops scripts/tests) must supply values.
 * Idempotent for already-encrypted blobs (re-validates decrypt then re-encrypts).
 */
export function migrateMerchantSecretValue(stored: string | null | undefined): {
  next: string;
  changed: boolean;
  wasEncrypted: boolean;
} {
  const raw = String(stored || "");
  if (!raw) return { next: "", changed: false, wasEncrypted: false };
  const wasEncrypted = isEncryptedSecretBlob(raw);
  const plain = decryptMerchantSecretFromStorage(raw);
  const next = encryptMerchantSecretForStorage(plain);
  return { next, changed: next !== raw, wasEncrypted };
}
