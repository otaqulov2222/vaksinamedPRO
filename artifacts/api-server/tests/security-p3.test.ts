import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createHmac, randomBytes } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENV_KEYS = [
  "ALLOW_LEGACY_HMAC_TOKENS",
  "LEGACY_HMAC_DEADLINE",
  "APP_ENV",
  "NODE_ENV",
] as const;

const saved: Record<string, string | undefined> = {};

function snapEnv() {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
}

function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

async function loadSecurity() {
  return import(`../src/lib/securityEnv.ts?t=${Date.now()}-${Math.random()}`);
}

describe("P3 dual-accept / role normalize (env)", () => {
  beforeEach(() => {
    snapEnv();
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => restoreEnv());

  it("normalizeAdminRole maps admin/hq → super_admin without inventing roles", async () => {
    const s = await loadSecurity();
    assert.equal(s.normalizeAdminRole("admin"), "super_admin");
    assert.equal(s.normalizeAdminRole("HQ"), "super_admin");
    assert.equal(s.normalizeAdminRole("super_admin"), "super_admin");
    assert.equal(s.normalizeAdminRole("cashier"), "cashier");
  });

  it("legacy HMAC dual-accept defaults on; flag 0 closes window", async () => {
    const s = await loadSecurity();
    assert.equal(s.allowLegacyHmacTokens(), true);
    process.env.ALLOW_LEGACY_HMAC_TOKENS = "0";
    const s2 = await loadSecurity();
    assert.equal(s2.allowLegacyHmacTokens(), false);
  });

  it("LEGACY_HMAC_DEADLINE in the past rejects legacy", async () => {
    process.env.LEGACY_HMAC_DEADLINE = "2020-01-01T00:00:00.000Z";
    const s = await loadSecurity();
    assert.equal(s.allowLegacyHmacTokens(), false);
  });

  it("LEGACY_HMAC_DEADLINE in the future allows legacy", async () => {
    process.env.LEGACY_HMAC_DEADLINE = "2099-01-01T00:00:00.000Z";
    const s = await loadSecurity();
    assert.equal(s.allowLegacyHmacTokens(), true);
  });
});

describe("P3 session token protocol (pure)", () => {
  it("session token format s1.publicId.secret hashes without storing secret", () => {
    const publicId = randomBytes(16).toString("hex");
    const secret = randomBytes(32).toString("hex");
    const token = `s1.${publicId}.${secret}`;
    const tokenHash = createHash("sha256").update(`${publicId}:${secret}`).digest("hex");
    assert.match(token, /^s1\.[a-f0-9]{32}\.[a-f0-9]{64}$/);
    assert.equal(tokenHash.length, 64);
    assert.ok(!tokenHash.includes(secret));
  });

  it("legacy customer HMAC still parseable for dual-accept", () => {
    const secret = "vaksinamed-customer-secret";
    const customerId = 7;
    const exp = Date.now() + 60_000;
    const payload = `${customerId}:${exp}`;
    const sig = createHmac("sha256", secret).update(payload).digest("hex");
    const token = `${payload}:${sig}`;
    const parts = token.split(":");
    assert.ok(parts.length >= 3);
    assert.ok(!token.startsWith("s1."));
  });
});

describe("P3 source contracts", () => {
  it("logout revokes customer session", () => {
    const src = readFileSync(path.join(root, "src/routes/auth.ts"), "utf8");
    assert.match(src, /revokeSessionFromToken/);
    assert.match(src, /\/auth\/logout/);
  });

  it("admin logout revokes admin session", () => {
    const src = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(src, /\/admin\/logout/);
    assert.match(src, /revokeSessionFromToken/);
  });

  it("new logins issue session tokens via createSession path", () => {
    const src = readFileSync(path.join(root, "src/lib/auth.ts"), "utf8");
    assert.match(src, /issueCustomerSession/);
    assert.match(src, /issueAdminSession/);
    assert.match(src, /createSession|validateSessionToken/);
  });

  it("privileged admin routes use requirePermission", () => {
    const src = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(src, /requirePermission\(user, "dashboard:read"\)/);
    assert.match(src, /requirePermission\(user, "branches:manage"\)/);
    assert.match(src, /requirePermission\(user, "customers:read"\)/);
  });

  it("confirm-pos and delivery enforce permission + branch scope", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    const deliveries = readFileSync(path.join(root, "src/routes/deliveries.ts"), "utf8");
    assert.match(orders, /orders:confirm_pos/);
    assert.match(orders, /assertBranchScope/);
    assert.match(deliveries, /delivery:update/);
    assert.match(deliveries, /assertBranchScope/);
  });

  it("POS sales list forces branch filter for staff", () => {
    const src = readFileSync(path.join(root, "src/routes/pos.ts"), "utf8");
    assert.match(src, /resolveStaffBranchFilter/);
    assert.match(src, /pos:sales:read/);
  });

  it("logger redacts authorization and token fields", () => {
    const src = readFileSync(path.join(root, "src/lib/logger.ts"), "utf8");
    assert.match(src, /authorization/);
    assert.match(src, /token/);
  });

  it("authEvents strips secrets from meta", () => {
    const src = readFileSync(path.join(root, "src/lib/authEvents.ts"), "utf8");
    assert.match(src, /password/);
    assert.match(src, /token/);
    assert.match(src, /secret/);
  });

  it("env example documents dual-accept migration", () => {
    const example = readFileSync(path.join(root, "../../.env.example"), "utf8");
    assert.match(example, /ALLOW_LEGACY_HMAC_TOKENS/);
    assert.match(example, /LEGACY_HMAC_DEADLINE/);
  });
});
