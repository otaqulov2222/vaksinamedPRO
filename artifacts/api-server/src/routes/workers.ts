/**
 * P10 — worker / ops job endpoints.
 * Production-like: queue runner requires ENABLE_BACKGROUND_WORKERS=1 (explicit).
 * Process boot does NOT start workers.
 */

import { Router } from "express";
import { requireAdmin } from "../lib/auth";
import { requirePermission } from "../lib/rbac";
import {
  enqueueJob,
  ensureSweepJobsEnqueued,
  expireUnpaidPayments,
  isBackgroundWorkersEnabled,
  JOB_TYPES,
  runDueWorkerJobs,
} from "../lib/workers";
import { expireDueReservations } from "../lib/inventory";
import { isProductionLike } from "../lib/securityEnv";

const router = Router();

function assertQueueWorkersAllowed() {
  if (isProductionLike() && !isBackgroundWorkersEnabled()) {
    throw Object.assign(
      new Error("Background workers disabled — set ENABLE_BACKGROUND_WORKERS=1 explicitly"),
      { status: 403, code: "WORKERS_DISABLED" },
    );
  }
}

/** Manual reservation expiry (also available under admin inventory). */
router.post("/workers/reservation-expiry", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "inventory:adjust");
    const result = await expireDueReservations({
      limit: req.body?.limit != null ? Number(req.body.limit) : 100,
      actor: admin.email,
    });
    return res.json({ ok: true, jobType: JOB_TYPES.RESERVATION_EXPIRY, result });
  } catch (error) {
    return next(error);
  }
});

/** Manual unpaid payment expiry — fails intents, may release reservations. */
router.post("/workers/payment-expiry", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "payments:manage");
    const result = await expireUnpaidPayments({
      olderThanMs: req.body?.olderThanMs != null ? Number(req.body.olderThanMs) : undefined,
      limit: req.body?.limit != null ? Number(req.body.limit) : undefined,
    });
    return res.json({ ok: true, jobType: JOB_TYPES.PAYMENT_EXPIRY, result });
  } catch (error) {
    return next(error);
  }
});

/** Process due worker_jobs queue (PG-backed). Production requires explicit flag. */
router.post("/workers/run-due", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "inventory:adjust");
    assertQueueWorkersAllowed();
    if (req.body?.enqueueSweeps) {
      await ensureSweepJobsEnqueued();
    }
    const result = await runDueWorkerJobs({
      limit: req.body?.limit != null ? Number(req.body.limit) : 20,
      workerId: admin.email,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

/** Enqueue a job (ops). Production requires explicit flag. */
router.post("/workers/enqueue", async (req, res, next) => {
  try {
    const admin = await requireAdmin(req);
    await requirePermission(admin, "inventory:adjust");
    assertQueueWorkersAllowed();
    const jobType = String(req.body?.jobType || "");
    if (!Object.values(JOB_TYPES).includes(jobType as (typeof JOB_TYPES)[keyof typeof JOB_TYPES])) {
      return res.status(400).json({ message: "Noto‘g‘ri jobType" });
    }
    const { job, idempotent } = await enqueueJob({
      jobType,
      entityKey: String(req.body?.entityKey || ""),
      payload: req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {},
      idempotencyKey: typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : null,
    });
    return res.json({
      ok: true,
      idempotent,
      job: {
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        attempts: job.attempts,
        entityKey: job.entityKey,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
