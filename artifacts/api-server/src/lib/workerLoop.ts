/**
 * Standalone worker loop — runs in its own process (src/worker.ts), never inside the API server.
 *
 * Drives the existing PostgreSQL `worker_jobs` runner (stale-lease reclaim + FOR UPDATE SKIP LOCKED
 * claims), so several worker replicas are safe. No Redis/in-memory queue.
 *
 * Env: WORKER_POLL_INTERVAL_MS (default 15000, clamped 1000..300000).
 */

export const WORKER_BATCH_LIMIT = 20;
/** Bounds back-to-back full batches in one tick so a stop request is honoured promptly. */
export const WORKER_MAX_DRAIN_BATCHES = 10;
export const WORKER_DEFAULT_POLL_MS = 15_000;

export function workerPollIntervalMs(raw = process.env.WORKER_POLL_INTERVAL_MS): number {
  const n = Number((raw || "").trim());
  if (!Number.isFinite(n) || n <= 0) return WORKER_DEFAULT_POLL_MS;
  return Math.min(Math.max(Math.floor(n), 1_000), 300_000);
}

export function assertWorkerProcessAllowed(enabled: boolean, productionLike: boolean): void {
  if (enabled) return;
  throw new Error(
    productionLike
      ? "Worker process requires ENABLE_BACKGROUND_WORKERS=1 in production/staging"
      : "Worker process requires ENABLE_BACKGROUND_WORKERS=1 or ENABLE_BACKGROUND_WORKERS_DEV=1",
  );
}

export type WorkerLoopDeps = {
  runDue: (opts: { limit: number; workerId: string }) => Promise<{ processed: number }>;
  ensureSweeps: () => Promise<unknown>;
  log: {
    info: (obj: Record<string, unknown>, msg: string) => void;
    error: (obj: Record<string, unknown>, msg: string) => void;
  };
};

export type WorkerLoop = {
  start: () => void;
  /** Stops scheduling; resolves once the in-flight tick finishes or the timeout elapses. */
  stop: (timeoutMs: number) => Promise<"drained" | "timeout">;
  tickNow: () => Promise<void>;
};

export function createWorkerLoop(
  opts: { workerId: string; intervalMs: number },
  deps: WorkerLoopDeps,
): WorkerLoop {
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  async function tick(): Promise<void> {
    try {
      await deps.ensureSweeps();
      let processed = 0;
      for (let batch = 0; batch < WORKER_MAX_DRAIN_BATCHES && !stopping; batch++) {
        const result = await deps.runDue({ limit: WORKER_BATCH_LIMIT, workerId: opts.workerId });
        processed += result.processed;
        if (result.processed < WORKER_BATCH_LIMIT) break;
      }
      if (processed > 0) deps.log.info({ workerId: opts.workerId, processed }, "Worker tick processed jobs");
    } catch (err) {
      deps.log.error(
        { workerId: opts.workerId, err: err instanceof Error ? err.message : String(err) },
        "Worker tick failed",
      );
    }
  }

  function tickNow(): Promise<void> {
    if (!inFlight) {
      inFlight = tick().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  function schedule() {
    if (stopping) return;
    timer = setTimeout(async () => {
      timer = null;
      await tickNow();
      schedule();
    }, opts.intervalMs);
  }

  return {
    start() {
      stopping = false;
      void tickNow().then(schedule);
    },
    async stop(timeoutMs) {
      stopping = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!inFlight) return "drained";
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const outcome = await Promise.race([
        inFlight.then(() => "drained" as const),
        new Promise<"timeout">((resolve) => {
          timeout = setTimeout(() => resolve("timeout"), timeoutMs);
        }),
      ]);
      if (timeout) clearTimeout(timeout);
      return outcome;
    },
    tickNow,
  };
}
