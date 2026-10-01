/**
 * Worker process entrypoint (dist/worker.mjs). No HTTP server, no listening port.
 * Same image as the API: `node --enable-source-maps dist/worker.mjs`.
 */
import { hostname } from "node:os";
import { logger } from "./lib/logger";
import { loadEnvFile } from "./lib/envFile";
import { backgroundWorkersEnabled, isProductionLike } from "./lib/securityEnv";
import { assertWorkerProcessAllowed, createWorkerLoop, workerPollIntervalMs } from "./lib/workerLoop";

loadEnvFile();

const SHUTDOWN_TIMEOUT_MS = 25_000;

async function boot() {
  // Refuse before the DB module opens a pool or applies migrations.
  assertWorkerProcessAllowed(backgroundWorkersEnabled(), isProductionLike());

  const { ensureSweepJobsEnqueued, runDueWorkerJobs } = await import("./lib/workers");

  const workerId = `worker-${hostname()}-${process.pid}`;
  const intervalMs = workerPollIntervalMs();
  const loop = createWorkerLoop(
    { workerId, intervalMs },
    {
      runDue: (opts) => runDueWorkerJobs(opts),
      ensureSweeps: () => ensureSweepJobsEnqueued(),
      log: logger,
    },
  );

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, workerId }, "Worker shutdown starting");
    // An interrupted job keeps its RUNNING lease and is reclaimed after WORKER_STALE_RUNNING_MS.
    const outcome = await loop.stop(SHUTDOWN_TIMEOUT_MS);
    logger.info({ workerId, outcome }, "Worker stopped");
    process.exit(outcome === "drained" ? 0 : 1);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  loop.start();
  logger.info({ workerId, intervalMs, httpServer: false }, "Vaksina Med worker started");
}

boot().catch((err) => {
  logger.error({ err }, "Worker boot failed");
  process.exit(1);
});
