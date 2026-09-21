import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { authSessions, db } from "@workspace/db";
import { allowLegacyHmacTokens, customerSessionTtlMs, adminSessionTtlMs } from "./securityEnv";
import { recordAuthEvent } from "./authEvents";

export type SessionActorType = "customer" | "admin";

export type SessionMeta = {
  deviceLabel?: string;
  userAgent?: string;
  ip?: string;
};

const SESSION_PREFIX = "s1";

function hashTokenSecret(publicId: string, secret: string): string {
  return createHash("sha256").update(`${publicId}:${secret}`).digest("hex");
}

function secretsEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/** Bearer format: s1.{publicId}.{secret} — secret never stored raw. */
export function isSessionToken(token: string | undefined | null): boolean {
  return Boolean(token && token.startsWith(`${SESSION_PREFIX}.`));
}

export async function createSession(input: {
  actorType: SessionActorType;
  actorId: number;
  meta?: SessionMeta;
}): Promise<{ token: string; sessionPublicId: string; expiresAt: Date }> {
  const publicId = randomBytes(16).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const tokenHash = hashTokenSecret(publicId, secret);
  const ttl = input.actorType === "admin" ? adminSessionTtlMs() : customerSessionTtlMs();
  const expiresAt = new Date(Date.now() + ttl);

  await db.insert(authSessions).values({
    publicId,
    actorType: input.actorType,
    actorId: input.actorId,
    tokenHash,
    expiresAt,
    deviceLabel: (input.meta?.deviceLabel || "").slice(0, 120),
    userAgent: (input.meta?.userAgent || "").slice(0, 240),
  });

  await recordAuthEvent({
    actorType: input.actorType,
    actorId: input.actorId,
    eventType: "session.create",
    success: true,
    meta: { sessionPublicId: publicId, expiresAt: expiresAt.toISOString() },
  });

  return {
    token: `${SESSION_PREFIX}.${publicId}.${secret}`,
    sessionPublicId: publicId,
    expiresAt,
  };
}

export type ValidSession = {
  id: number;
  publicId: string;
  actorType: SessionActorType;
  actorId: number;
  expiresAt: Date;
};

export async function validateSessionToken(token: string | undefined): Promise<ValidSession | null> {
  if (!token || !isSessionToken(token)) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== SESSION_PREFIX) return null;
  const [, publicId, secret] = parts;
  if (!publicId || !secret || publicId.length < 16 || secret.length < 32) return null;

  const rows = await db.select().from(authSessions).where(eq(authSessions.publicId, publicId)).limit(1);
  const session = rows[0];
  if (!session) return null;
  if (session.revokedAt) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  if (!secretsEqualHex(session.tokenHash, hashTokenSecret(publicId, secret))) return null;

  await db
    .update(authSessions)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(authSessions.id, session.id), isNull(authSessions.revokedAt)));

  return {
    id: session.id,
    publicId: session.publicId,
    actorType: session.actorType as SessionActorType,
    actorId: session.actorId,
    expiresAt: new Date(session.expiresAt),
  };
}

/**
 * Revoke the session bound to this bearer token.
 * Idempotent: unknown / already-revoked / legacy tokens → ok without leaking existence.
 */
export async function revokeSessionFromToken(
  token: string | undefined,
  opts?: { actorType?: SessionActorType; expectedActorId?: number },
): Promise<{ ok: true; revoked: boolean }> {
  if (!token || !isSessionToken(token)) {
    return { ok: true, revoked: false };
  }
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: true, revoked: false };
  const publicId = parts[1];

  const rows = await db.select().from(authSessions).where(eq(authSessions.publicId, publicId)).limit(1);
  const session = rows[0];
  if (!session) return { ok: true, revoked: false };
  if (opts?.actorType && session.actorType !== opts.actorType) return { ok: true, revoked: false };
  if (opts?.expectedActorId != null && session.actorId !== opts.expectedActorId) {
    return { ok: true, revoked: false };
  }
  if (session.revokedAt) return { ok: true, revoked: false };

  // Verify secret before revoke so attackers cannot revoke by publicId alone
  const secret = parts[2];
  if (!secretsEqualHex(session.tokenHash, hashTokenSecret(publicId, secret))) {
    return { ok: true, revoked: false };
  }

  await db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, session.id));
  await recordAuthEvent({
    actorType: session.actorType,
    actorId: session.actorId,
    eventType: "session.revoke",
    success: true,
    meta: { sessionPublicId: publicId },
  });
  return { ok: true, revoked: true };
}

export { allowLegacyHmacTokens };
