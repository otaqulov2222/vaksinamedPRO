/**
 * P10 — PostgreSQL-backed worker jobs (no Redis queue system in repo).
 * Financial truth stays in PostgreSQL. Redis not used as SoT.
 */

import { and, eq, lte, sql } from "drizzle-orm";
import {
  db,
  orders,
  paymentIntents,
  workerJobs,
} from "@workspace/db";
import { expireDueReservations, releaseReservation } from "./inventory";
import { failPaymentIntent, findIntentByOrderId } from "./paymentService";
import { logger } from "./logger";
import { flagEnabled, isProductionLike } from "./securityEnv";
import { emitAlert, ALERT } from "./alerts";

type DbLike = typeof db;

function rowsOf(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: any[] }).rows;
  }
  return [];
}

function withTx<T>(executor: DbLike, fn: (tx: DbLike) => Promise<T>): Promise<T> {
  if (typeof (executor as { transaction?: unknown }).transaction === "function") {
    return (executor as typeof db).transaction(async (tx) => fn(tx as unknown as DbLike));
  }
  return fn(executor);
}

export const JOB_TYPES = {
  RESERVATION_EXPIRY: "reservation_expiry",
  PAYMENT_EXPIRY: "payment_expiry",
  FOM_RETRY: "fom_retry",
  NOTIFICATION: "notification",
  DELIVERY_PROVIDER_RETRY: "delivery_provider_retry",
  /** Read-only cashback ledger ↔ account integrity (never mutates money). */
  CASHBACK_INTEGRITY: "cashback_integrity",
} as const;

export function isBackgroundWorkersEnabled(): boolean {
  if (flagEnabled("ENABLE_BACKGROUND_WORKERS")) return true;
  return !isProductionLike() && flagEnabled("ENABLE_BACKGROUND_WORKERS_DEV");
}

export async function enqueueJob(input: {
  jobType: string;
  entityKey?: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
  runAfter?: Date;
  maxAttempts?: number;
}, executor: DbLike = db) {
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await executor
      .select()
      .from(workerJobs)
      .where(eq(workerJobs.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing[0]) return { job: existing[0], idempotent: true };
  }
  try {
    const inserted = await executor
      .insert(workerJobs)
      .values({
        jobType: input.jobType,
        entityKey: input.entityKey || "",
        status: "PENDING",
        payload: JSON.stringify(input.payload || {}),
        idempotencyKey,
        runAfter: input.runAfter || new Date(),
        maxAttempts: input.maxAttempts ?? 5,
      })
      .returning();
    return { job: inserted[0], idempotent: false };
  } catch {
    if (idempotencyKey) {
      const existing = await executor
        .select()
        .from(workerJobs)
        .where(eq(workerJobs.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing[0]) return { job: existing[0], idempotent: true };
    }
    throw Object.assign(new Error("Job enqueue failed"), { status: 500 });
  }
}

async function runReservationExpiry() {
  const result = await expireDueReservations({ limit: 100, actor: "worker:reservation_expiry" });
  return { ...result, inventory: "release_only" };
}

/**
 * Unpaid payment intents older than TTL → failPaymentIntent.
 * Then release reservation if order still unpaid (P5 inventory release).
 * Does NOT mark PAID, earn cashback, or consume inventory.
 */
export async function expireUnpaidPayments(opts: { olderThanMs?: number; limit?: number } = {}) {
  const olderThanMs = opts.olderThanMs
    ?? Number(process.env.PAYMENT_INTENT_TTL_MS || 30 * 60 * 1000);
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const cutoff = new Date(Date.now() - olderThanMs);

  const candidates = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        sql`${paymentIntents.status} IN ('CREATED','REQUIRES_PAYMENT','PROCESSING')`,
        lte(paymentIntents.createdAt, cutoff),
      ),
    )
    .limit(limit);

  let failed = 0;
  let released = 0;
  for (const intent of candidates) {
    try {
      await failPaymentIntent(intent.id, {
        actor: "worker:payment_expiry",
        reason: "payment_intent_expired",
      });
      failed += 1;
      const order = (await db.select().from(orders).where(eq(orders.id, intent.orderId)).limit(1))[0];
      if (
        order
        && order.reservationId
        && order.paymentStatus !== "PAID"
        && order.fulfillmentStatus !== "COMPLETED"
        && order.fulfillmentStatus !== "CANCELLED"
      ) {
        try {
          await releaseReservation(order.reservationId, {
            actor: "worker:payment_expiry",
            reason: "payment_expired",
          });
          released += 1;
        } catch {
          // Already released / not ACTIVE
        }
      }
    } catch {
      // Invalid transition / already terminal
    }
  }
  return { scanned: candidates.length, failed, released, olderThanMs };
}

async function runNotificationJob(payload: Record<string, unknown>) {
  // Non-blocking: notification failure must not affect order/payment.
  // No SMS credentials logged.
  const channel = String(payload.channel || "noop");
  logger.info(
    { jobType: JOB_TYPES.NOTIFICATION, channel, entityId: payload.entityId ?? null },
    "Notification job (best-effort)",
  );
  return { delivered: false, code: "NOOP_OR_SYNC_SMS", channel };
}

async function runFomRetry(payload: Record<string, unknown>) {
  // Retries must not duplicate sale — processFomSale is receipt-idempotent.
  // Inventory writer stays OFF.
  const receiptId = String(payload.receiptId || "").trim();
  if (!receiptId) return { ok: false, code: "MISSING_RECEIPT" };
  const { processFomSale } = await import("./fomBridge");
  const result = await processFomSale({
    receiptId,
    orderCode: payload.orderCode ? String(payload.orderCode) : undefined,
    customerQr: payload.customerQr ? String(payload.customerQr) : undefined,
    amount: payload.amount != null ? Number(payload.amount) : undefined,
    branchCode: payload.branchCode ? String(payload.branchCode) : undefined,
    branchId: payload.branchId != null ? Number(payload.branchId) : undefined,
    actor: "worker:fom_retry",
  });
  return {
    ok: true,
    idempotent: Boolean(result.idempotent),
    inventoryWriter: "DISABLED",
    receiptId,
  };
}

async function runDeliveryProviderRetry(payload: Record<string, unknown>) {
  const { getDeliveryAdapter } = await import("./deliveryAdapters");
  const adapter = getDeliveryAdapter("external");
  const result = await adapter.syncStatus?.({
    deliveryId: Number(payload.deliveryId) || 0,
    providerRef: String(payload.providerRef || ""),
  });
  return result || { ok: false, code: "CONTRACT_PENDING", message: "External delivery pending" };
}

export async function processWorkerJob(job: typeof workerJobs.$inferSelect) {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(job.payload || "{}");
  } catch {
    payload = {};
  }

  switch (job.jobType) {
    case JOB_TYPES.RESERVATION_EXPIRY:
      return runReservationExpiry();
    case JOB_TYPES.PAYMENT_EXPIRY:
      return expireUnpaidPayments({
        olderThanMs: payload.olderThanMs != null ? Number(payload.olderThanMs) : undefined,
        limit: payload.limit != null ? Number(payload.limit) : undefined,
      });
    case JOB_TYPES.NOTIFICATION:
      return runNotificationJob(payload);
    case JOB_TYPES.FOM_RETRY:
      return runFomRetry(payload);
    case JOB_TYPES.DELIVERY_PROVIDER_RETRY:
      return runDeliveryProviderRetry(payload);
    case JOB_TYPES.CASHBACK_INTEGRITY: {
      const { runCashbackIntegrityCheck } = await import("./cashbackIntegrity");
      return runCashbackIntegrityCheck(db, { emitAlerts: true });
    }
    default:
      throw Object.assign(new Error(`Unknown job type: ${job.jobType}`), { code: "UNKNOWN_JOB_TYPE" });
  }
}

/** Claim and run due jobs using PostgreSQL FOR UPDATE SKIP LOCKED. */
export async function runDueWorkerJobs(
  opts: { limit?: number; workerId?: string } = {},
  executor: DbLike = db,
) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const workerId = opts.workerId || `worker-${process.pid}`;
  const now = new Date();

  const claimed = await withTx(executor, async (tx) => {
    const locked = await tx.execute(sql`
      SELECT id, attempts, max_attempts
      FROM worker_jobs
      WHERE status IN ('PENDING', 'FAILED')
        AND run_after <= ${now}
        AND attempts < max_attempts
      ORDER BY id ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);
    const rows = rowsOf(locked);
    const jobs: Array<typeof workerJobs.$inferSelect> = [];
    for (const row of rows) {
      const id = Number(row.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const nextAttempts = Number(row.attempts) + 1;
      const updated = await tx
        .update(workerJobs)
        .set({
          status: "RUNNING",
          lockedAt: now,
          lockedBy: workerId,
          attempts: nextAttempts,
          updatedAt: now,
        })
        .where(and(eq(workerJobs.id, id), sql`${workerJobs.status} IN ('PENDING','FAILED')`))
        .returning();
      if (updated[0]) jobs.push(updated[0]);
    }
    return jobs;
  });

  const results: Array<{ jobId: number; status: string; error?: string }> = [];

  for (const job of claimed) {
    try {
      const result = await processWorkerJob(job);
      await executor
        .update(workerJobs)
        .set({
          status: "SUCCEEDED",
          result: JSON.stringify(result ?? {}),
          lastError: "",
          updatedAt: new Date(),
          lockedAt: null,
          lockedBy: "",
        })
        .where(eq(workerJobs.id, job.id));
      logger.info(
        { jobId: job.id, jobType: job.jobType, entityKey: job.entityKey, attempt: job.attempts },
        "Worker job succeeded",
      );
      results.push({ jobId: job.id, status: "SUCCEEDED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextAttempts = job.attempts;
      const dead = nextAttempts >= job.maxAttempts;
      const backoffMs = Math.min(60_000 * nextAttempts, 15 * 60_000);
      await executor
        .update(workerJobs)
        .set({
          status: dead ? "DEAD" : "FAILED",
          lastError: message.slice(0, 1000),
          runAfter: new Date(Date.now() + backoffMs),
          updatedAt: new Date(),
          lockedAt: null,
          lockedBy: "",
        })
        .where(eq(workerJobs.id, job.id));
      logger.warn(
        { jobId: job.id, jobType: job.jobType, attempt: nextAttempts, err: message },
        "Worker job failed",
      );
      emitAlert(dead ? ALERT.WORKER_JOB_DEAD : ALERT.WORKER_JOB_FAILED, {
        jobId: job.id,
        jobType: job.jobType,
        attempt: nextAttempts,
        reason: message.slice(0, 200),
      });
      results.push({ jobId: job.id, status: dead ? "DEAD" : "FAILED", error: message });
    }
  }

  if (claimed.length === 0) {
    // optional backlog probe could live in ops cron
  }

  return { processed: results.length, results };
}

/** Ensure periodic sweep jobs are enqueued (idempotent keys). */
export async function ensureSweepJobsEnqueued() {
  await enqueueJob({
    jobType: JOB_TYPES.RESERVATION_EXPIRY,
    entityKey: "sweep",
    idempotencyKey: `sweep:reservation:${new Date().toISOString().slice(0, 13)}`,
    payload: {},
  });
  await enqueueJob({
    jobType: JOB_TYPES.PAYMENT_EXPIRY,
    entityKey: "sweep",
    idempotencyKey: `sweep:payment:${new Date().toISOString().slice(0, 13)}`,
    payload: {},
  });
}

// Re-export for payment expiry tests
export { findIntentByOrderId };
