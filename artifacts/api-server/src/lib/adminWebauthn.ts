import { createHash, createPublicKey, createVerify, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { adminLoginChallenges, adminWebauthnCredentials, db } from "@workspace/db";
import { normalizeIp } from "./requestTelemetry";

const TICKET_PREFIX = "w1";
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

export type WebauthnPurpose = "enroll" | "assert" | "face";

export type PublicKeyCredentialDescriptor = {
  type: "public-key";
  id: string;
  transports?: string[];
};

export type PublicKeyCreationOptionsJSON = {
  challenge: string;
  rp: { name: string; id?: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: "public-key"; alg: number }>;
  authenticatorSelection: {
    authenticatorAttachment: "platform";
    userVerification: "required";
    residentKey: "preferred";
  };
  timeout: number;
  attestation: "none";
  excludeCredentials?: PublicKeyCredentialDescriptor[];
};

export type PublicKeyRequestOptionsJSON = {
  challenge: string;
  rpId?: string;
  allowCredentials: PublicKeyCredentialDescriptor[];
  userVerification: "required";
  timeout: number;
};

export type PendingLogin = {
  ticket: string;
  purpose: WebauthnPurpose;
  challenge: string;
  rpId: string;
  origin: string;
  creation?: PublicKeyCreationOptionsJSON;
  request?: PublicKeyRequestOptionsJSON;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function secretsEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

export function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function fromBase64Url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function hashTicketSecret(publicId: string, secret: string): string {
  return sha256Hex(`${publicId}:${secret}`);
}

export function rpIdFromHost(host: string | undefined): string {
  const raw = String(host || "").split(",")[0].trim().toLowerCase();
  const hostname = raw.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (!hostname) return "";
  if (hostname === "localhost") return "localhost";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return "";
  if (hostname.includes(":")) return "";
  if (!hostname.includes(".")) return "";
  return hostname;
}

export function originFromRequest(req?: Request): string {
  const header = String(req?.header("origin") || "").trim();
  if (header) return header.replace(/\/+$/, "");
  const proto = req?.protocol === "https" ? "https" : "http";
  const host = String(req?.header("host") || "").trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

function parseTransports(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item)).filter(Boolean).slice(0, 8);
  } catch {
    return [];
  }
}

function ieeeP1363ToDer(raw: Buffer): Buffer {
  const n = Math.floor(raw.length / 2);
  const trim = (input: Buffer) => {
    let i = 0;
    while (i < input.length - 1 && input[i] === 0) i += 1;
    const sliced = input.subarray(i);
    if (sliced[0] & 0x80) return Buffer.concat([Buffer.from([0]), sliced]);
    return sliced;
  };
  const r = trim(raw.subarray(0, n));
  const s = trim(raw.subarray(n));
  const seq = Buffer.concat([Buffer.from([0x02, r.length]), r, Buffer.from([0x02, s.length]), s]);
  return Buffer.concat([Buffer.from([0x30, seq.length]), seq]);
}

export function verifyEs256(spkiDer: Buffer, data: Buffer, signature: Buffer): boolean {
  try {
    const key = createPublicKey({ key: spkiDer, format: "der", type: "spki" });
    const der = signature[0] === 0x30 ? signature : ieeeP1363ToDer(signature);
    const verify = createVerify("SHA256");
    verify.update(data);
    verify.end();
    return verify.verify(key, der);
  } catch {
    return false;
  }
}

export async function listWebauthnCredentials(adminUserId: number) {
  return db
    .select()
    .from(adminWebauthnCredentials)
    .where(eq(adminWebauthnCredentials.adminUserId, adminUserId));
}

/** Clears enrolled Face ID / passkeys so the next login can enroll on this device. Requires a fresh password check. */
export async function deleteWebauthnCredentials(adminUserId: number): Promise<number> {
  const removed = await db
    .delete(adminWebauthnCredentials)
    .where(eq(adminWebauthnCredentials.adminUserId, adminUserId))
    .returning({ id: adminWebauthnCredentials.id });
  return removed.length;
}

export async function createPendingAdminLogin(input: {
  adminUserId: number;
  email: string;
  name: string;
  req?: Request;
}): Promise<PendingLogin> {
  const credentials = await listWebauthnCredentials(input.adminUserId);
  const purpose: WebauthnPurpose = credentials.length ? "assert" : "enroll";
  const publicId = randomBytes(16).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const challengeBytes = randomBytes(32);
  const challenge = toBase64Url(challengeBytes);
  const origin = originFromRequest(input.req);
  const rpId = rpIdFromHost(input.req?.header("host"));
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

  await db.insert(adminLoginChallenges).values({
    publicId,
    tokenHash: hashTicketSecret(publicId, secret),
    adminUserId: input.adminUserId,
    purpose,
    challenge,
    origin,
    rpId,
    ip: normalizeIp(input.req?.ip) || "",
    userAgent: String(input.req?.header("user-agent") || "").slice(0, 240),
    expiresAt,
  });

  const userId = toBase64Url(Buffer.from(String(input.adminUserId), "utf8"));
  const excludeCredentials = credentials.map((row) => ({
    type: "public-key" as const,
    id: row.credentialId,
    transports: parseTransports(row.transports),
  }));

  const pending: PendingLogin = {
    ticket: `${TICKET_PREFIX}.${publicId}.${secret}`,
    purpose,
    challenge,
    rpId,
    origin,
  };

  if (purpose === "enroll") {
    pending.creation = {
      challenge,
      rp: rpId ? { name: "Vaksina Med", id: rpId } : { name: "Vaksina Med" },
      user: { id: userId, name: input.email, displayName: input.name },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",
      excludeCredentials,
    };
  } else {
    pending.request = {
      challenge,
      ...(rpId ? { rpId } : {}),
      allowCredentials: excludeCredentials,
      userVerification: "required",
      timeout: 60_000,
    };
  }

  return pending;
}

type LoadedChallenge = {
  id: number;
  adminUserId: number;
  purpose: WebauthnPurpose;
  challenge: string;
  origin: string;
  rpId: string;
};

async function consumeChallenge(ticket: string): Promise<LoadedChallenge> {
  const parts = String(ticket || "").split(".");
  if (parts.length !== 3 || parts[0] !== TICKET_PREFIX) {
    throw Object.assign(new Error("Tasdiqlash muddati tugagan. Qayta kiring."), { status: 401, code: "TICKET_INVALID" });
  }
  const [, publicId, secret] = parts;
  const expectedHash = hashTicketSecret(publicId, secret);
  const rows = await db
    .select()
    .from(adminLoginChallenges)
    .where(eq(adminLoginChallenges.publicId, publicId))
    .limit(1);
  const row = rows[0];
  if (!row || !secretsEqualHex(row.tokenHash, expectedHash)) {
    throw Object.assign(new Error("Tasdiqlash muddati tugagan. Qayta kiring."), { status: 401, code: "TICKET_INVALID" });
  }
  if (row.consumedAt) {
    throw Object.assign(new Error("Tasdiqlash allaqachon ishlatilgan. Qayta kiring."), { status: 401, code: "TICKET_USED" });
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw Object.assign(new Error("Tasdiqlash muddati tugagan. Qayta kiring."), { status: 401, code: "TICKET_EXPIRED" });
  }

  const updated = await db
    .update(adminLoginChallenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(adminLoginChallenges.id, row.id),
        isNull(adminLoginChallenges.consumedAt),
        gt(adminLoginChallenges.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!updated.length) {
    throw Object.assign(new Error("Tasdiqlash muddati tugagan. Qayta kiring."), { status: 401, code: "TICKET_USED" });
  }

  return {
    id: row.id,
    adminUserId: row.adminUserId,
    purpose: row.purpose as WebauthnPurpose,
    challenge: row.challenge,
    origin: row.origin,
    rpId: row.rpId,
  };
}

function parseClientData(clientDataJSON: string): { type: string; challenge: string; origin: string } {
  const json = JSON.parse(Buffer.from(fromBase64Url(clientDataJSON)).toString("utf8")) as {
    type?: string;
    challenge?: string;
    origin?: string;
  };
  return {
    type: String(json.type || ""),
    challenge: String(json.challenge || ""),
    origin: String(json.origin || "").replace(/\/+$/, ""),
  };
}

function assertClientData(parsed: { type: string; challenge: string; origin: string }, expectedType: string, challenge: LoadedChallenge) {
  if (parsed.type !== expectedType) {
    throw Object.assign(new Error("Face ID javobi noto‘g‘ri"), { status: 401, code: "WEBAUTHN_TYPE" });
  }
  if (parsed.challenge !== challenge.challenge) {
    throw Object.assign(new Error("Face ID javobi noto‘g‘ri"), { status: 401, code: "WEBAUTHN_CHALLENGE" });
  }
  if (challenge.origin && parsed.origin !== challenge.origin) {
    throw Object.assign(new Error("Face ID javobi noto‘g‘ri"), { status: 401, code: "WEBAUTHN_ORIGIN" });
  }
}

function readAuthData(authenticatorData: string, rpId: string) {
  const data = fromBase64Url(authenticatorData);
  if (data.length < 37) {
    throw Object.assign(new Error("Face ID javobi noto‘g‘ri"), { status: 401, code: "WEBAUTHN_AUTHDATA" });
  }
  if (rpId) {
    const expected = createHash("sha256").update(rpId).digest();
    if (!expected.equals(data.subarray(0, 32))) {
      throw Object.assign(new Error("Face ID javobi noto‘g‘ri"), { status: 401, code: "WEBAUTHN_RPID" });
    }
  }
  const flags = data[32];
  const signCount = data.readUInt32BE(33);
  const userPresent = Boolean(flags & 0x01);
  const userVerified = Boolean(flags & 0x04);
  if (!userPresent || !userVerified) {
    throw Object.assign(new Error("Yuz yoki barmoq izi tasdiqlanmadi"), { status: 401, code: "WEBAUTHN_UV" });
  }
  return { data, signCount };
}

export type WebauthnAssertionBody = {
  id?: string;
  rawId?: string;
  clientDataJSON?: string;
  authenticatorData?: string;
  signature?: string;
  publicKey?: string;
  transports?: string[];
};

export async function verifyWebauthnAndBind(ticket: string, body: WebauthnAssertionBody): Promise<{ adminUserId: number; enrolled: boolean }> {
  const challenge = await consumeChallenge(ticket);
  const credentialId = String(body.id || body.rawId || "").trim();
  const clientDataJSON = String(body.clientDataJSON || "");
  const authenticatorData = String(body.authenticatorData || "");
  const signature = String(body.signature || "");
  if (!credentialId || !clientDataJSON || !authenticatorData) {
    throw Object.assign(new Error("Face ID javobi noto‘g‘ri"), { status: 400, code: "WEBAUTHN_PAYLOAD" });
  }

  const parsed = parseClientData(clientDataJSON);
  const { data, signCount } = readAuthData(authenticatorData, challenge.rpId);

  if (challenge.purpose === "enroll") {
    assertClientData(parsed, "webauthn.create", challenge);
    const publicKey = String(body.publicKey || "").trim();
    if (!publicKey) {
      throw Object.assign(new Error("Face ID kaliti olinmadi"), { status: 400, code: "WEBAUTHN_PUBKEY" });
    }
    fromBase64Url(publicKey);
    await db.insert(adminWebauthnCredentials).values({
      adminUserId: challenge.adminUserId,
      credentialId,
      publicKey,
      signCount,
      transports: JSON.stringify(Array.isArray(body.transports) ? body.transports.slice(0, 8) : ["internal"]),
    });
    return { adminUserId: challenge.adminUserId, enrolled: true };
  }

  assertClientData(parsed, "webauthn.get", challenge);
  if (!signature) {
    throw Object.assign(new Error("Face ID javobi noto‘g‘ri"), { status: 400, code: "WEBAUTHN_SIGNATURE" });
  }
  const rows = await db
    .select()
    .from(adminWebauthnCredentials)
    .where(
      and(
        eq(adminWebauthnCredentials.adminUserId, challenge.adminUserId),
        eq(adminWebauthnCredentials.credentialId, credentialId),
      ),
    )
    .limit(1);
  const cred = rows[0];
  if (!cred) {
    throw Object.assign(new Error("Bu qurilma Face ID uchun ro‘yxatdan o‘tmagan"), { status: 401, code: "WEBAUTHN_UNKNOWN" });
  }
  if (signCount > 0 && signCount <= cred.signCount) {
    throw Object.assign(new Error("Face ID javobi eskirgan"), { status: 401, code: "WEBAUTHN_COUNTER" });
  }
  const signed = Buffer.concat([data, createHash("sha256").update(fromBase64Url(clientDataJSON)).digest()]);
  if (!verifyEs256(fromBase64Url(cred.publicKey), signed, fromBase64Url(signature))) {
    throw Object.assign(new Error("Face ID tasdiqlanmadi"), { status: 401, code: "WEBAUTHN_VERIFY" });
  }
  await db
    .update(adminWebauthnCredentials)
    .set({ signCount, lastUsedAt: new Date() })
    .where(eq(adminWebauthnCredentials.id, cred.id));
  return { adminUserId: challenge.adminUserId, enrolled: false };
}

export async function confirmFacePresence(_ticket: string): Promise<{ adminUserId: number }> {
  throw Object.assign(new Error("Face ID majburiy — kamera tugmasi orqali kirib bo‘lmaydi"), {
    status: 401,
    code: "WEBAUTHN_REQUIRED",
  });
}

export const ADMIN_LOGIN_CHALLENGE_TTL_MS = CHALLENGE_TTL_MS;
