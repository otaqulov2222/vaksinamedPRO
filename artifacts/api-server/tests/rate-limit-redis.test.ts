/**
 * Redis-backed rate-limit storage — unit + multi-instance simulation.
 * Does not touch cashback finance.
 */

import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MemoryRateLimitBackend,
  RedisLikeRateLimitBackend,
  FakeRedisCommandClient,
  consumeRateLimit,
  toStorageKey,
  resolveRateLimitMode,
  setRateLimitBackendForTests,
  rateLimit,
} from "../src/lib/rateLimit.ts";
import { assertProductionRedisConfig, resolveRedisUrl } from "../src/lib/redis.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Redis rate-limit hardening", () => {
  after(() => {
    setRateLimitBackendForTests(null);
  });

  it("A. same-process memory rate limit enforces max", async () => {
    const mem = new MemoryRateLimitBackend();
    const key = "test:same-process";
    for (let i = 1; i <= 3; i++) {
      const r = await consumeRateLimit(key, { windowMs: 60_000, max: 3, backend: mem });
      assert.equal(r.allowed, true);
      assert.equal(r.count, i);
    }
    const blocked = await consumeRateLimit(key, { windowMs: 60_000, max: 3, backend: mem });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.count, 4);
  });

  it("B/C/E. Redis-like backend is atomic and shared across two API instances", async () => {
    // Simulate Redis: one FakeRedis shared by instance A and instance B backends.
    const redis = new FakeRedisCommandClient();
    const instanceA = new RedisLikeRateLimitBackend(redis);
    const instanceB = new RedisLikeRateLimitBackend(redis);
    const logical = "customer:shared:orders";
    const windowMs = 60_000;
    const max = 5;

    // A: 1..3
    for (let i = 0; i < 3; i++) {
      const r = await consumeRateLimit(logical, { windowMs, max, backend: instanceA });
      assert.equal(r.allowed, true);
    }
    // B: 4..5 must see A's counter (shared), not a fresh 1..2
    const b4 = await consumeRateLimit(logical, { windowMs, max, backend: instanceB });
    assert.equal(b4.count, 4);
    assert.equal(b4.allowed, true);
    const b5 = await consumeRateLimit(logical, { windowMs, max, backend: instanceB });
    assert.equal(b5.count, 5);
    assert.equal(b5.allowed, true);
    // 6th from A must be blocked (not 5 more on B)
    const blocked = await consumeRateLimit(logical, { windowMs, max, backend: instanceA });
    assert.equal(blocked.count, 6);
    assert.equal(blocked.allowed, false);
  });

  it("C. concurrent increments remain atomic (no lost updates)", async () => {
    const redis = new FakeRedisCommandClient();
    const a = new RedisLikeRateLimitBackend(redis);
    const b = new RedisLikeRateLimitBackend(redis);
    const logical = "concurrent:key";
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        consumeRateLimit(logical, {
          windowMs: 60_000,
          max: 100,
          backend: i % 2 === 0 ? a : b,
        }),
      ),
    );
    const counts = results.map((r) => r.count).sort((x, y) => x - y);
    assert.deepEqual(counts, Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("D. window expiry resets counter", async () => {
    let now = 1_000_000;
    const redis = new FakeRedisCommandClient(() => now);
    const backend = new RedisLikeRateLimitBackend(redis);
    const logical = "expiry:key";
    const windowMs = 1_000;

    assert.equal((await consumeRateLimit(logical, { windowMs, max: 2, backend })).count, 1);
    assert.equal((await consumeRateLimit(logical, { windowMs, max: 2, backend })).count, 2);
    assert.equal((await consumeRateLimit(logical, { windowMs, max: 2, backend })).allowed, false);

    now += windowMs + 1;
    const after = await consumeRateLimit(logical, { windowMs, max: 2, backend });
    assert.equal(after.count, 1);
    assert.equal(after.allowed, true);
  });

  it("F. production Redis unavailable fails closed via middleware", async () => {
    const prevApp = process.env.APP_ENV;
    const prevNode = process.env.NODE_ENV;
    try {
      process.env.APP_ENV = "production";
      process.env.NODE_ENV = "production";

      const failingBackend = {
        async hit(): Promise<{ count: number; ttlMs: number }> {
          throw new Error("ECONNREFUSED redis");
        },
      };

      const mw = rateLimit({ windowMs: 60_000, max: 5, backend: failingBackend });
      const req = { ip: "1.2.3.4", path: "/orders", method: "POST", header: () => "" } as never;
      let status = 0;
      let body: unknown;
      let nextCalled = false;
      await new Promise<void>((resolve) => {
        const res = {
          setHeader() {},
          status(code: number) {
            status = code;
            return this;
          },
          json(payload: unknown) {
            body = payload;
            resolve();
            return this;
          },
        } as never;
        mw(req, res, () => {
          nextCalled = true;
          resolve();
        });
      });
      assert.equal(nextCalled, false);
      assert.equal(status, 503);
      assert.equal((body as { code?: string }).code, "RATE_LIMIT_REDIS_UNAVAILABLE");
    } finally {
      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  it("G. development mode resolves to memory when REDIS_URL unset", () => {
    const prevApp = process.env.APP_ENV;
    const prevNode = process.env.NODE_ENV;
    const prevRedis = process.env.REDIS_URL;
    try {
      delete process.env.APP_ENV;
      process.env.NODE_ENV = "development";
      delete process.env.REDIS_URL;
      assert.equal(resolveRateLimitMode(), "memory");
      assert.equal(resolveRedisUrl(), undefined);
    } finally {
      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      if (prevRedis === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = prevRedis;
    }
  });

  it("H. production configuration validation requires REDIS_URL", () => {
    const prevApp = process.env.APP_ENV;
    const prevNode = process.env.NODE_ENV;
    const prevRedis = process.env.REDIS_URL;
    try {
      process.env.APP_ENV = "production";
      process.env.NODE_ENV = "production";
      delete process.env.REDIS_URL;
      assert.throws(() => assertProductionRedisConfig(), /REDIS_URL/);
      process.env.REDIS_URL = "redis://127.0.0.1:6379/0";
      assert.doesNotThrow(() => assertProductionRedisConfig());
    } finally {
      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      if (prevRedis === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = prevRedis;
    }
  });

  it("storage keys are hashed — no raw bearer fragments", () => {
    const logical = "cashback-history:1.2.3.4:Bearer s1.secrettokenvalue";
    const storage = toStorageKey(logical);
    assert.match(storage, /^rl:v1:[a-f0-9]{40}$/);
    assert.doesNotMatch(storage, /Bearer|secrettoken|s1\./);
  });

  it("source contracts: endpoints still use rateLimit helper; cashback engine untouched", () => {
    const rateSrc = readFileSync(path.join(root, "src/lib/rateLimit.ts"), "utf8");
    assert.match(rateSrc, /RedisRateLimitBackend|INCR|incr/);
    assert.match(rateSrc, /RATE_LIMIT_REDIS_UNAVAILABLE/);
    assert.match(rateSrc, /isProductionLike/);

    const finance = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
    assert.match(finance, /export async function earnCashback/);
    assert.match(finance, /export async function useCashback/);
    assert.match(finance, /export async function reverseCashbackEntry/);
    assert.doesNotMatch(finance, /from ["'].*rateLimit/);

    const loyalty = readFileSync(path.join(root, "src/routes/loyalty.ts"), "utf8");
    assert.match(loyalty, /cashbackHistoryLimiter|rateLimit/);
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /orderCreateLimiter/);
  });

  it("alert codes include RATE_LIMITED and RATE_LIMIT_REDIS_UNAVAILABLE", () => {
    const alerts = readFileSync(path.join(root, "src/lib/alerts.ts"), "utf8");
    assert.match(alerts, /RATE_LIMITED/);
    assert.match(alerts, /RATE_LIMIT_REDIS_UNAVAILABLE/);
  });
});
