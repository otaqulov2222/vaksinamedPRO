/**
 * Shared Redis client for distributed coordination (rate limits).
 *
 * NOT a source of truth for money, inventory, orders, or cashback.
 * Workers remain PostgreSQL `worker_jobs` — no BullMQ invent.
 *
 * Env: REDIS_URL (redis://... or rediss://...)
 */

import Redis from "ioredis";
import { isProductionLike } from "./securityEnv";
import { logger } from "./logger";

let sharedClient: Redis | null = null;

/** Existing contract: REDIS_URL only — do not invent alternate env names. */
export function resolveRedisUrl(): string | undefined {
  const url = (process.env.REDIS_URL || "").trim();
  return url || undefined;
}

/**
 * Production/staging MUST have REDIS_URL for shared rate-limit storage.
 * Prefer clear startup error over silently using process memory.
 */
export function assertProductionRedisConfig(): void {
  if (!isProductionLike()) return;
  if (!resolveRedisUrl()) {
    throw new Error(
      "[redis] production/staging requires REDIS_URL for shared rate limiting (process memory is not multi-instance safe).",
    );
  }
}

export function isRedisConfigured(): boolean {
  return Boolean(resolveRedisUrl());
}

/**
 * Single shared ioredis client per process — never create per-request connections.
 */
export function getRedisClient(): Redis {
  if (sharedClient) return sharedClient;
  const url = resolveRedisUrl();
  if (!url) {
    throw new Error("[redis] REDIS_URL is not configured");
  }
  sharedClient = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
    // Fail fast rather than hanging request handlers
    connectTimeout: 5_000,
    commandTimeout: 2_000,
  });
  sharedClient.on("error", (err) => {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Redis client error");
  });
  return sharedClient;
}

/** Ensure the shared client is connected (idempotent). */
export async function ensureRedisConnected(): Promise<Redis> {
  const client = getRedisClient();
  // ioredis statuses: wait | connecting | connect | ready | close | end | reconnecting
  if (client.status === "wait" || client.status === "close" || client.status === "end") {
    await client.connect();
  } else if (client.status === "connecting" || client.status === "reconnecting") {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        client.off("ready", onReady);
        client.off("error", onError);
      };
      client.once("ready", onReady);
      client.once("error", onError);
    });
  }
  return client;
}

/** Production boot: connect + PING. Dev: no-op if Redis unset. */
export async function warmRedisForBoot(): Promise<{ mode: "redis" | "skipped"; latencyMs?: number }> {
  assertProductionRedisConfig();
  if (!isRedisConfigured()) {
    return { mode: "skipped" };
  }
  const started = Date.now();
  const client = await ensureRedisConnected();
  const pong = await client.ping();
  if (pong !== "PONG") {
    throw new Error(`[redis] unexpected PING reply: ${String(pong)}`);
  }
  return { mode: "redis", latencyMs: Date.now() - started };
}

/** Test helper — reset singleton between suites. */
export async function resetRedisClientForTests(): Promise<void> {
  if (sharedClient) {
    try {
      sharedClient.disconnect();
    } catch {
      // ignore
    }
    sharedClient = null;
  }
}
