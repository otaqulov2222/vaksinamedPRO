import { Router, type IRouter } from "express";
import { checkDatabaseHealth, db, dbDriver } from "@workspace/db";

const router: IRouter = Router();

/**
 * Liveness — process is up. Does NOT check dependencies.
 * Use for orchestrator restart decisions.
 */
router.get("/health/live", (_req, res) => {
  res.json({
    status: "ok",
    check: "liveness",
    service: "vaksinamed-api",
    time: new Date().toISOString(),
  });
});

/**
 * Readiness — required dependency (PostgreSQL) is reachable.
 * Does not expose secrets or connection strings.
 */
router.get("/health/ready", async (_req, res) => {
  const health = await checkDatabaseHealth(db, dbDriver);
  if (!health.ok) {
    return res.status(503).json({
      status: "not_ready",
      check: "readiness",
      service: "vaksinamed-api",
      database: health.database,
      driver: health.driver,
      time: health.checkedAt,
    });
  }
  return res.json({
    status: "ok",
    check: "readiness",
    service: "vaksinamed-api",
    database: health.database,
    driver: health.driver,
    time: health.checkedAt,
  });
});

/** Compat alias — readiness semantics (DB check). Prefer /health/live + /health/ready. */
router.get("/healthz", async (_req, res) => {
  const health = await checkDatabaseHealth(db, dbDriver);
  if (!health.ok) {
    return res.status(503).json({
      status: "degraded",
      service: "vaksinamed-api",
      database: health.database,
      driver: health.driver,
      time: health.checkedAt,
    });
  }
  return res.json({
    status: "ok",
    service: "vaksinamed-api",
    time: health.checkedAt,
    database: health.database,
    driver: health.driver,
  });
});

export default router;
