import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import app from "./app";
import { logger } from "./lib/logger";
import { assertProductionRedisConfig, warmRedisForBoot } from "./lib/redis";
import { isProductionLike } from "./lib/securityEnv";

/** Lokal .env ni yuklash (ESKIZ_EMAIL, ESKIZ_PASSWORD, ...) */
function loadEnvFile() {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i <= 0) continue;
      const key = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
    logger.info({ file }, "Loaded env file");
    break;
  }
}

loadEnvFile();

const rawPort = process.env.PORT || "5000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const smsMode = process.env.ESKIZ_EMAIL && process.env.ESKIZ_PASSWORD ? "eskiz" : "dev";

async function boot() {
  // Fail closed: production-like without REDIS_URL must not start with memory rate limits.
  assertProductionRedisConfig();
  let redisBoot: { mode: "redis" | "skipped"; latencyMs?: number } = { mode: "skipped" };
  try {
    redisBoot = await warmRedisForBoot();
  } catch (err) {
    if (isProductionLike()) {
      logger.error({ err }, "Redis warm-up failed — refusing to start in production-like");
      process.exit(1);
    }
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Redis warm-up failed — development will use in-memory rate limits",
    );
  }

  /** No background worker loop on boot — workers are explicit HTTP/ops only. */
  const server = app.listen(port, "0.0.0.0", (listenErr) => {
    if (listenErr) {
      logger.error({ err: listenErr }, "Error listening on port");
      process.exit(1);
    }

    logger.info(
      {
        port,
        smsMode,
        workersAutoStart: false,
        rateLimitStorage: redisBoot.mode === "redis" ? "redis" : "memory",
        redisLatencyMs: redisBoot.latencyMs,
        note: "ENABLE_BACKGROUND_WORKERS gates /workers/run-due in production-like",
      },
      "Vaksina Med API listening",
    );
  });

  function shutdown(signal: string) {
    logger.info({ signal }, "Graceful shutdown starting");
    server.close((closeErr) => {
      if (closeErr) {
        logger.error({ err: closeErr }, "Error during server close");
        process.exit(1);
      }
      logger.info("HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn("Shutdown timeout — forcing exit");
      process.exit(1);
    }, 15_000).unref?.();
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

boot().catch((err) => {
  logger.error({ err }, "API boot failed");
  process.exit(1);
});
