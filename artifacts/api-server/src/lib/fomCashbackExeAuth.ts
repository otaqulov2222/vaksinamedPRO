/**
 * Pure CASHBACK.exe auth/token helpers (no DB import — safe for unit tests).
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { isProductionLike, requireConfiguredSecret } from "./securityEnv";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

function timingEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function cashbackSigningSecret(): string {
  const dedicated = process.env.FOM_CASHBACK_SECRET?.trim();
  if (dedicated) return dedicated;
  const webhook = process.env.FOM_WEBHOOK_SECRET?.trim();
  if (webhook) return webhook;
  return requireConfiguredSecret("POS_SECRET", "dev-pos-secret");
}

function expectedLogin(): string {
  return (process.env.FOM_CASHBACK_LOGIN || "fom").trim();
}

function expectedPassword(): string | null {
  const p = process.env.FOM_CASHBACK_PASSWORD?.trim();
  if (p) return p;
  const webhook = process.env.FOM_WEBHOOK_SECRET?.trim();
  if (webhook) return webhook;
  if (isProductionLike()) return null;
  return "dev-fom-cashback";
}

export type CashbackExeOk<T> = { code: 0; message: "OK"; data: T };
export type CashbackExeErr = { code: number; message: string; data: null };

export function cashbackOk<T>(data: T): CashbackExeOk<T> {
  return { code: 0, message: "OK", data };
}

export function cashbackErr(message: string, code = 1): CashbackExeErr {
  return { code, message, data: null };
}

export function issueCashbackExeToken(login: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const nonce = randomBytes(8).toString("hex");
  const body = `cb1.${Buffer.from(JSON.stringify({ login, exp, nonce })).toString("base64url")}`;
  const sig = createHmac("sha256", cashbackSigningSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyCashbackExeToken(raw: string | undefined): { login: string } | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const parts = text.split(".");
  if (parts.length !== 3 || parts[0] !== "cb1") return null;
  const body = `${parts[0]}.${parts[1]}`;
  const sig = parts[2];
  const expected = createHmac("sha256", cashbackSigningSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      login?: string;
      exp?: number;
    };
    if (!payload.login || !payload.exp || payload.exp < Date.now()) return null;
    return { login: String(payload.login) };
  } catch {
    return null;
  }
}

export function authenticateCashbackExe(
  login: string,
  password: string,
): CashbackExeOk<{ token: string }> | CashbackExeErr {
  const wantLogin = expectedLogin();
  const wantPass = expectedPassword();
  if (!wantPass) {
    return cashbackErr("Login or Password incorrect!", 503);
  }
  const loginOk = timingEqual(String(login || "").trim(), wantLogin);
  const passOk = timingEqual(String(password || ""), wantPass);
  if (!loginOk || !passOk) {
    return cashbackErr("Login or Password incorrect!");
  }
  return cashbackOk({ token: issueCashbackExeToken(wantLogin) });
}
