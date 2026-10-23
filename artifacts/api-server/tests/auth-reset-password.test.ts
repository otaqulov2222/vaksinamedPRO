import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "vm-reset-pass-"));
process.env.PGLITE_DIR = dataDir;
process.env.APP_ENV = "development";
process.env.DB_DRIVER = "pglite";
process.env.ALLOW_DEMO_SEED = "0";
process.env.LOG_LEVEL = "silent";
process.env.ALLOW_OTP_DEV_BYPASS = "1";
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;

const { default: app } = await import("../src/app");
const { db, customers, hashPassword } = await import("@workspace/db");

describe("Auth Reset Password via SMS OTP (Forgot Password)", () => {
  const testPhone = "998909998877";
  const oldPassword = "oldPassword123";
  const newPassword = "newPassword456";
  let customerId: number;
  let server: Server;
  let base = "";

  before(async () => {
    // Seed test customer
    const inserted = await db
      .insert(customers)
      .values({
        telegramId: "dilshod_test",
        phone: "+998 90 999 88 77",
        firstName: "Dilshod",
        lastName: "Aliyev",
        passwordHash: hashPassword(oldPassword),
      })
      .returning();
    customerId = inserted[0].id;

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {}
  });

  async function call(url: string, body: unknown) {
    const res = await fetch(`${base}${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => null);
    return { status: res.status, body: json };
  }

  it("1. Non-existent phone returns 404", async () => {
    const res = await call("/api/auth/reset-password", {
      phone: "998990000000",
      code: "000000",
      newPassword: "validPassword123",
    });

    assert.equal(res.status, 404);
    assert.match(res.body.message, /ro‘yxatdan o‘tmagan/i);
  });

  it("2. Password shorter than 6 characters returns 400", async () => {
    const res = await call("/api/auth/reset-password", {
      phone: testPhone,
      code: "000000",
      newPassword: "123",
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /kamida 6 ta/i);
  });

  it("3. Invalid OTP code returns 400", async () => {
    const res = await call("/api/auth/reset-password", {
      phone: testPhone,
      code: "999999",
      newPassword: newPassword,
    });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /noto‘g‘ri yoki muddati tugagan/i);
  });

  it("4. Valid OTP resets password and returns session token", async () => {
    // In dev bypass mode with ALLOW_OTP_DEV_BYPASS=1, code "000000" is accepted
    const res = await call("/api/auth/reset-password", {
      phone: testPhone,
      code: "000000",
      newPassword: newPassword,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.token, "Must return session token");
    assert.equal(res.body.customer.id, customerId);

    // Old password fails login
    const oldLogin = await call("/api/auth/login", {
      phone: testPhone,
      password: oldPassword,
    });
    assert.equal(oldLogin.status, 401);

    // New password succeeds login
    const newLogin = await call("/api/auth/login", {
      phone: testPhone,
      password: newPassword,
    });
    assert.equal(newLogin.status, 200);
    assert.ok(newLogin.body.token);
  });
});
