import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "vm-staging-otp-"));
process.env.PGLITE_DIR = dataDir;
process.env.DB_DRIVER = "pglite";
process.env.ALLOW_DEMO_SEED = "0";
process.env.LOG_LEVEL = "silent";
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;

// Import database and auth modules
const dbm = await import("@workspace/db");
const { db, customers, authOtps, sql, eq } = dbm;
const { createOtp, verifyOtpAndAuth } = await import("../src/lib/auth");

const SAVED_ENV: Record<string, string | undefined> = {};
const KEYS = [
  "APP_ENV",
  "NODE_ENV",
  "STAGING_TEST_OTP_ENABLED",
  "STAGING_TEST_OTP_PHONE",
  "STAGING_TEST_OTP_CODE",
  "ESKIZ_EMAIL",
  "ESKIZ_PASSWORD",
  "ALLOW_OTP_DEV_BYPASS",
] as const;

describe("Staging Test OTP Security Mechanism", () => {
  before(() => {
    for (const k of KEYS) SAVED_ENV[k] = process.env[k];
  });

  after(() => {
    for (const k of KEYS) {
      if (SAVED_ENV[k] === undefined) delete process.env[k];
      else process.env[k] = SAVED_ENV[k];
    }
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(async () => {
    delete process.env.ESKIZ_EMAIL;
    delete process.env.ESKIZ_PASSWORD;
    delete process.env.ALLOW_OTP_DEV_BYPASS;
  });

  it("1. Staging allowlist uchun to‘g‘ri kod: createOtp va verifyOtpAndAuth muvaffaqiyatli ishlaydi", async () => {
    process.env.APP_ENV = "staging";
    process.env.NODE_ENV = "production";
    process.env.STAGING_TEST_OTP_ENABLED = "true";
    process.env.STAGING_TEST_OTP_PHONE = "+998 95 111 22 33";
    process.env.STAGING_TEST_OTP_CODE = "654321";

    const phone = "998951112233";

    // 1. createOtp
    const otpRes = await createOtp(phone, "register");
    assert.equal(otpRes.purpose, "register");
    assert.equal(otpRes.provider, "staging_test");
    assert.equal(otpRes.phone, "+998 95 111 22 33");

    // Zero leak: devCode bo'lmasligi shart, kod response'da chiqmasligi shart
    assert.equal((otpRes as any).devCode, undefined);
    assert.equal((otpRes as any).code, undefined);
    assert.doesNotMatch(JSON.stringify(otpRes), /654321/);

    // 2. verifyOtpAndAuth to'g'ri kod bilan
    const authRes = await verifyOtpAndAuth({
      phone,
      code: "654321",
      purpose: "register",
      firstName: "Staging Test User",
      password: "secret_password_123",
    });

    assert.ok(authRes.token, "Session token berilishi shart");
    assert.ok(authRes.user, "Foydalanuvchi obyekti qaytishi shart");
    assert.equal(authRes.user.firstName, "Staging Test User");

    // 3. Single-use: bir xil kod bilan takroriy verify 401 xato berishi shart
    await assert.rejects(
      async () => {
        await verifyOtpAndAuth({
          phone,
          code: "654321",
          purpose: "register",
        });
      },
      (err: any) => {
        assert.equal(err.status, 401);
        assert.match(err.message, /noto‘g‘ri yoki muddati tugagan/i);
        return true;
      },
    );
  });

  it("2. Staging allowlist uchun noto‘g‘ri kod: verify rad etiladi (401)", async () => {
    process.env.APP_ENV = "staging";
    process.env.NODE_ENV = "production";
    process.env.STAGING_TEST_OTP_ENABLED = "true";
    process.env.STAGING_TEST_OTP_PHONE = "998952223344";
    process.env.STAGING_TEST_OTP_CODE = "778899";

    const phone = "998952223344";

    const otpRes = await createOtp(phone, "register");
    assert.equal(otpRes.provider, "staging_test");

    // Noto'g'ri kod kiritilganda
    await assert.rejects(
      async () => {
        await verifyOtpAndAuth({
          phone,
          code: "111111",
          purpose: "register",
          firstName: "Wrong Code User",
          password: "password_123",
        });
      },
      (err: any) => {
        assert.equal(err.status, 401);
        assert.match(err.message, /noto‘g‘ri yoki muddati tugagan/i);
        return true;
      },
    );
  });

  it("3. Boshqa telefon: allowlistda bo‘lmagan raqam SMS provayderiga yuboriladi va chetlab o‘tilmaydi", async () => {
    process.env.APP_ENV = "staging";
    process.env.NODE_ENV = "production";
    process.env.STAGING_TEST_OTP_ENABLED = "true";
    process.env.STAGING_TEST_OTP_PHONE = "998951112233"; // Allowlist raqami
    process.env.STAGING_TEST_OTP_CODE = "654321";

    const otherPhone = "998959998877"; // Boshqa raqam

    // Eskiz sozlangan emasligi sababli 503 qaytishi shart (haqiqiy SMS oqimidan ketgani isboti)
    await assert.rejects(
      async () => {
        await createOtp(otherPhone, "register");
      },
      (err: any) => {
        assert.equal(err.status, 503);
        assert.match(err.message, /SMS provider is not configured/i);
        return true;
      },
    );
  });

  it("4. Flag o‘chiq holat: STAGING_TEST_OTP_ENABLED=false bo‘lganda mexanizm ishlamaydi", async () => {
    process.env.APP_ENV = "staging";
    process.env.NODE_ENV = "production";
    process.env.STAGING_TEST_OTP_ENABLED = "false";
    process.env.STAGING_TEST_OTP_PHONE = "998953334455";
    process.env.STAGING_TEST_OTP_CODE = "123456";

    const phone = "998953334455";

    await assert.rejects(
      async () => {
        await createOtp(phone, "register");
      },
      (err: any) => {
        assert.equal(err.status, 503);
        assert.match(err.message, /SMS provider is not configured/i);
        return true;
      },
    );
  });

  it("5. Production taqiqi: APP_ENV=production bo‘lganda STAGING_TEST_OTP qat'iy taqiqlanadi", async () => {
    process.env.APP_ENV = "production";
    process.env.NODE_ENV = "production";
    process.env.STAGING_TEST_OTP_ENABLED = "true"; // Flag yoqilgan bo'lsa ham
    process.env.STAGING_TEST_OTP_PHONE = "998954445566";
    process.env.STAGING_TEST_OTP_CODE = "123456";

    const phone = "998954445566";

    await assert.rejects(
      async () => {
        await createOtp(phone, "register");
      },
      (err: any) => {
        assert.equal(err.status, 503);
        assert.match(err.message, /SMS provider is not configured/i);
        return true;
      },
    );
  });

  it("6. Xavfsizlik: test kodi hech qachon createOtp response'ida qaytmaydi", async () => {
    process.env.APP_ENV = "staging";
    process.env.NODE_ENV = "production";
    process.env.STAGING_TEST_OTP_ENABLED = "true";
    process.env.STAGING_TEST_OTP_PHONE = "998958887766";
    process.env.STAGING_TEST_OTP_CODE = "842913";

    const phone = "998958887766";
    const res = await createOtp(phone, "register");

    const json = JSON.stringify(res);
    assert.doesNotMatch(json, /842913/);
    assert.equal((res as any).devCode, undefined);
    assert.equal((res as any).code, undefined);
  });
});
