/**
 * Distributed rate limiting.
 *
 * Production/staging: Redis INCR + PEXPIRE (shared across API instances).
 * Development/test: in-memory fallback when REDIS_URL is unset.
 *
 * Production NEVER silently falls back to process memory.
 * Rate limiting is abuse control only — not cashback / auth authorization.
 */

import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { isProductionLike } from "./securityEnv";
import { emitAlert, ALERT } from "./alerts";
import {
  ensureRedisConnected,
  isRedisConfigured,
  resolveRedisUrl,
} from "./redis";

export type RateLimitHitResult = {
  count: number;
  /** Remaining TTL of the window in ms; -1 if unknown. */
  ttlMs: number;
};

/**
 * Atomic fixed-window counter backend.
 * Implementations MUST increment atomically (no GET→local++→SET).
 */
export type RateLimitBackend = {
  hit(storageKey: string, windowMs: number): Promise<RateLimitHitResult>;
};

type MemoryBucket = { count: number; resetAt: number };

/** Process-local store — OK for single-instance development only. */
export class MemoryRateLimitBackend implements RateLimitBackend {
  private readonly buckets = new Map<string, MemoryBucket>();

  constructor(private readonly nowFn: () => number = () => Date.now()) {}

  async hit(storageKey: string, windowMs: number): Promise<RateLimitHitResult> {
    const now = this.nowFn();
    let bucket = this.buckets.get(storageKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(storageKey, bucket);
    }
    bucket.count += 1;
    return { count: bucket.count, ttlMs: Math.max(0, bucket.resetAt - now) };
  }

  /** Test/inspection helpers */
  getCount(storageKey: string): number {
    const now = this.nowFn();
    const bucket = this.buckets.get(storageKey);
    if (!bucket || bucket.resetAt <= now) return 0;
    return bucket.count;
  }

  clear(): void {
    this.buckets.clear();
  }

  pruneExpired(): void {
    const now = this.nowFn();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/**
 * Redis fixed-window: INCR then PEXPIRE on first hit (atomic INCR; TTL repair if missing).
 * Shared across all API instances using the same REDIS_URL.
 */
export class RedisRateLimitBackend implements RateLimitBackend {
  async hit(storageKey: string, windowMs: number): Promise<RateLimitHitResult> {
    const redis = await ensureRedisConnected();
    const key = storageKey;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, windowMs);
      return { count, ttlMs: windowMs };
    }
    let ttlMs = await redis.pttl(key);
    if (ttlMs < 0) {
      // Race / crash between INCR and EXPIRE — repair TTL without resetting counter.
      await redis.pexpire(key, windowMs);
      ttlMs = windowMs;
    }
    return { count, ttlMs };
  }
}

/**
 * Minimal Redis-command surface for tests (simulates INCR/PEXPIRE/PTTL without a server).
 * Two "API instances" share one FakeRedisCommandClient → multi-instance counter test.
 */
export class FakeRedisCommandClient {
  private readonly data = new Map<string, { count: number; expiresAt: number | null }>();
  private readonly nowFn: () => number;

  constructor(nowFn: () => number = () => Date.now()) {
    this.nowFn = nowFn;
  }

  async incr(key: string): Promise<number> {
    this.expireIfNeeded(key);
    const row = this.data.get(key) || { count: 0, expiresAt: null };
    row.count += 1;
    this.data.set(key, row);
    return row.count;
  }

  async pexpire(key: string, ms: number): Promise<number> {
    this.expireIfNeeded(key);
    const row = this.data.get(key);
    if (!row) return 0;
    row.expiresAt = this.nowFn() + ms;
    this.data.set(key, row);
    return 1;
  }

  async pttl(key: string): Promise<number> {
    this.expireIfNeeded(key);
    const row = this.data.get(key);
    if (!row) return -2;
    if (row.expiresAt == null) return -1;
    return Math.max(0, row.expiresAt - this.nowFn());
  }

  private expireIfNeeded(key: string): void {
    const row = this.data.get(key);
    if (!row || row.expiresAt == null) return;
    if (row.expiresAt <= this.nowFn()) this.data.delete(key);
  }
}

/** Backend over FakeRedis / injectable Redis-like client (tests + DI). */
export class RedisLikeRateLimitBackend implements RateLimitBackend {
  constructor(
    private readonly client: {
      incr(key: string): Promise<number>;
      pexpire(key: string, ms: number): Promise<number>;
      pttl(key: string): Promise<number>;
    },
  ) {}

  async hit(storageKey: string, windowMs: number): Promise<RateLimitHitResult> {
    const count = await this.client.incr(storageKey);
    if (count === 1) {
      await this.client.pexpire(storageKey, windowMs);
      return { count, ttlMs: windowMs };
    }
    let ttlMs = await this.client.pttl(storageKey);
    if (ttlMs < 0) {
      await this.client.pexpire(storageKey, windowMs);
      ttlMs = windowMs;
    }
    return { count, ttlMs };
  }
}

const defaultMemory = new MemoryRateLimitBackend();
let injectedBackend: RateLimitBackend | null = null;

/** Test-only: force a backend (shared fake Redis across "instances"). */
export function setRateLimitBackendForTests(backend: RateLimitBackend | null): void {
  injectedBackend = backend;
}

export type RateLimitMode = "redis" | "memory";

export function resolveRateLimitMode(): RateLimitMode {
  if (isProductionLike()) return "redis";
  if (isRedisConfigured()) return "redis";
  return "memory";
}

export function getRateLimitBackend(): RateLimitBackend {
  if (injectedBackend) return injectedBackend;
  if (resolveRateLimitMode() === "redis") return new RedisRateLimitBackend();
  return defaultMemory;
}

/** Hash logical keys so bearer/token fragments never land in Redis plaintext. */
export function toStorageKey(logicalKey: string): string {
  const digest = createHash("sha256").update(logicalKey).digest("hex").slice(0, 40);
  return `rl:v1:${digest}`;
}

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
  /** Override backend (tests). */
  backend?: RateLimitBackend;
};

export async function consumeRateLimit(
  logicalKey: string,
  options: { windowMs: number; max: number; backend?: RateLimitBackend },
): Promise<{ allowed: boolean; count: number; remaining: number; ttlMs: number }> {
  const backend = options.backend || getRateLimitBackend();
  const storageKey = toStorageKey(logicalKey);
  const { count, ttlMs } = await backend.hit(storageKey, options.windowMs);
  const remaining = Math.max(0, options.max - count);
  return {
    allowed: count <= options.max,
    count,
    remaining,
    ttlMs,
  };
}

/**
 * Express middleware — preserves existing call sites:
 *   rateLimit({ windowMs, max, key })
 */
export function rateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const logicalKey = options.key?.(req) || `${req.ip || "unknown"}:${req.path}`;
      try {
        const result = await consumeRateLimit(logicalKey, {
          windowMs: options.windowMs,
          max: options.max,
          backend: options.backend,
        });
        res.setHeader("X-RateLimit-Limit", String(options.max));
        res.setHeader("X-RateLimit-Remaining", String(result.remaining));
        if (result.ttlMs >= 0) {
          res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.ttlMs / 1000)));
        }
        if (!result.allowed) {
          emitAlert(ALERT.RATE_LIMITED, {
            path: req.path,
            method: req.method,
            count: result.count,
            max: options.max,
            mode: resolveRateLimitMode(),
          });
          return res.status(429).json({ message: "Juda ko‘p urinish. Biroz kutib qayta urinib ko‘ring." });
        }
        return next();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emitAlert(ALERT.RATE_LIMIT_REDIS_UNAVAILABLE, {
          path: req.path,
          method: req.method,
          reason: message.slice(0, 200),
          productionLike: isProductionLike(),
          redisConfigured: Boolean(resolveRedisUrl()),
        });
        if (isProductionLike()) {
          // Fail closed — do not silently disable rate limiting in production.
          return res.status(503).json({
            message: "Xizmat vaqtincha mavjud emas. Keyinroq urinib ko‘ring.",
            code: "RATE_LIMIT_REDIS_UNAVAILABLE",
          });
        }
        // Development/test: fall back to process memory if Redis misconfigured/down.
        try {
          const result = await consumeRateLimit(logicalKey, {
            windowMs: options.windowMs,
            max: options.max,
            backend: defaultMemory,
          });
          res.setHeader("X-RateLimit-Limit", String(options.max));
          res.setHeader("X-RateLimit-Remaining", String(result.remaining));
          if (!result.allowed) {
            return res.status(429).json({ message: "Juda ko‘p urinish. Biroz kutib qayta urinib ko‘ring." });
          }
          return next();
        } catch (fallbackErr) {
          return next(fallbackErr);
        }
      }
    })();
  };
}

/** Periodic prune for memory backend (dev only). */
setInterval(() => {
  defaultMemory.pruneExpired();
}, 60_000).unref?.();
