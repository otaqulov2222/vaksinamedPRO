/**
 * UNIVERSAL CASHBACK 2.0 — Operational Hardening Batch 1 contracts + unit gates.
 * Does not mutate financial engine math — verifies ops safety wiring only.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Cashback ops hardening Batch 1", () => {
  it("A. allowDemoCashbackSeed false in production-like", async () => {
    const prevApp = process.env.APP_ENV;
    const prevNode = process.env.NODE_ENV;
    try {
      process.env.APP_ENV = "production";
      process.env.NODE_ENV = "production";
      const { allowDemoCashbackSeed, isProductionLike } = await import("../src/lib/securityEnv.ts");
      assert.equal(isProductionLike(), true);
      assert.equal(allowDemoCashbackSeed(), false);
    } finally {
      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  it("B. allowDemoCashbackSeed true outside production-like", async () => {
    const prevApp = process.env.APP_ENV;
    const prevNode = process.env.NODE_ENV;
    try {
      delete process.env.APP_ENV;
      process.env.NODE_ENV = "development";
      // bust module cache is hard; re-read via fresh dynamic with same module may cache.
      // Function reads env at call time — ok if module already loaded.
      const { allowDemoCashbackSeed, isProductionLike } = await import("../src/lib/securityEnv.ts");
      assert.equal(isProductionLike(), false);
      assert.equal(allowDemoCashbackSeed(), true);
    } finally {
      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  it("A/B. loyalty Firdavs demo welcome gated by allowDemoCashbackSeed", () => {
    const loyalty = readFileSync(path.join(root, "src/routes/loyalty.ts"), "utf8");
    assert.match(loyalty, /allowDemoCashbackSeed/);
    assert.match(loyalty, /demo_opening|demoWelcome/);
    assert.doesNotMatch(
      loyalty,
      /const welcome = telegramId === "firdavs" \? 125500/,
    );
  });

  it("C/D/E. integrity checker is read-only and classifies MATCH/DRIFT", () => {
    const integrity = readFileSync(path.join(root, "src/lib/cashbackIntegrity.ts"), "utf8");
    assert.match(integrity, /runCashbackIntegrityCheck/);
    assert.match(integrity, /MATCH/);
    assert.match(integrity, /DRIFT/);
    assert.match(integrity, /INVALID/);
    assert.match(integrity, /autoRepaired:\s*false/);
    assert.match(integrity, /CASHBACK_LEDGER_DRIFT/);
    assert.doesNotMatch(integrity, /\.update\(cashbackAccounts\)/);
    assert.doesNotMatch(integrity, /\.delete\(/);
    assert.ok(existsSync(path.join(root, "src/scripts/cashback-integrity-check.ts")));
  });

  it("F. alert codes defined and wired for cashback conditions", () => {
    const alerts = readFileSync(path.join(root, "src/lib/alerts.ts"), "utf8");
    for (const code of [
      "CASHBACK_LEDGER_DRIFT",
      "CASHBACK_NEGATIVE_BALANCE_ATTEMPT",
      "CASHBACK_DUPLICATE_EARN_ATTEMPT",
      "CASHBACK_DUPLICATE_REVERSAL_ATTEMPT",
      "CASHBACK_OPERATION_FAILURE",
    ]) {
      assert.match(alerts, new RegExp(code));
    }
    const finance = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
    assert.match(finance, /CASHBACK_NEGATIVE_BALANCE_ATTEMPT/);
    assert.match(finance, /CASHBACK_DUPLICATE_EARN_ATTEMPT/);
    assert.match(finance, /CASHBACK_DUPLICATE_REVERSAL_ATTEMPT/);
    assert.doesNotMatch(finance, /otp|bearer|cvv|card.?pan/i);
  });

  it("G. rate limits applied to cashback-sensitive endpoints", () => {
    const loyalty = readFileSync(path.join(root, "src/routes/loyalty.ts"), "utf8");
    assert.match(loyalty, /cashbackHistoryLimiter/);
    assert.match(loyalty, /\/loyalty\/cashback-history".*cashbackHistoryLimiter|cashbackHistoryLimiter.*\/loyalty\/cashback-history/s);
    assert.match(loyalty, /redeemLimiter/);

    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /orderCreateLimiter/);
    assert.match(orders, /post\("\/orders", orderCreateLimiter/);

    const pos = readFileSync(path.join(root, "src/routes/pos.ts"), "utf8");
    assert.match(pos, /cardLimiter/);
    assert.match(pos, /get\("\/pos\/card", cardLimiter/);
  });

  it("H. auth publicCustomer uses getAuthoritativeBalance", () => {
    const auth = readFileSync(path.join(root, "src/routes/auth.ts"), "utf8");
    assert.match(auth, /getAuthoritativeBalance/);
    assert.match(auth, /async function publicCustomer/);
    assert.doesNotMatch(auth, /balance:\s*user\.balance/);
  });

  it("I. refund-cashback writes audit_log", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /refund-cashback/);
    assert.match(orders, /order\.refund_cashback/);
    assert.match(orders, /auditLog/);
  });

  it("worker integrates CASHBACK_INTEGRITY job type", () => {
    const workers = readFileSync(path.join(root, "src/lib/workers.ts"), "utf8");
    assert.match(workers, /CASHBACK_INTEGRITY/);
    assert.match(workers, /cashback_integrity/);
    assert.match(workers, /runCashbackIntegrityCheck/);
  });

  it("J. earn/use/reversal function signatures unchanged (engine lock)", () => {
    const finance = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
    assert.match(finance, /export async function earnCashback/);
    assert.match(finance, /export async function useCashback/);
    assert.match(finance, /export async function reverseCashbackEntry/);
    assert.match(finance, /eligibleGoodsAmount/);
    assert.match(finance, /clampCashbackSpend/);
    assert.match(finance, /ONE commercial transaction/);
  });
});
