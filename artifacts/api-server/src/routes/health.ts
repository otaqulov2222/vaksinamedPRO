import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({
      status: "ok",
      service: "vaksinamed-api",
      time: new Date().toISOString(),
      database: "up",
    });
  } catch {
    res.status(503).json({ status: "degraded", database: "down" });
  }
});

export default router;
