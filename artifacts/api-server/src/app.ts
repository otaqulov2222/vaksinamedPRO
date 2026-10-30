import express, { type Express } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requestTelemetryMiddleware } from "./lib/requestTelemetry";
import { isCorsOriginAllowed } from "./lib/corsPolicy";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: (origin, callback) => callback(null, isCorsOriginAllowed(origin)), credentials: true }));
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"));
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

// After the body parsers: their stream callbacks would otherwise run outside the request context.
app.use(requestTelemetryMiddleware);

app.use("/api", router);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const error = err as { status?: number; message?: string; code?: string };
  logger.error({ err }, "Request failed");
  // Status-less errors come from the DB/driver/runtime: their message may carry SQL and bound params.
  const handled = typeof error.status === "number" && error.status >= 400 && error.status < 600;
  const sqlState = typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code);
  res.status(handled ? error.status! : 500).json({
    message: handled ? error.message || "Ichki xatolik" : "Ichki xatolik",
    ...(error.code && !sqlState ? { code: error.code } : {}),
  });
});

export default app;
