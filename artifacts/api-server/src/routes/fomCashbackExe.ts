/**
 * CASHBACK.exe HTTP surface (F-Kassa).
 *
 * Preferred base for FOM SETUP.ini / kassa URL:
 *   https://<host>/fom-cashback
 * Also mirrored under /api/integrations/fom/cashback for ops.
 *
 * Does not alter /api/pos/* or /api/integrations/fom/sale.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { cashbackExeCreateReceipt, cashbackExeGetBalance } from "../lib/fomCashbackExe";
import {
  authenticateCashbackExe,
  cashbackErr,
  verifyCashbackExeToken,
} from "../lib/fomCashbackExeAuth";
import { logger } from "../lib/logger";

const router = Router();

function bearerToken(req: Request): string | undefined {
  const auth = req.header("authorization");
  if (auth) return auth.replace(/^Bearer\s+/i, "").trim();
  const x = req.header("x-fom-cashback-token");
  return x?.trim() || undefined;
}

function requireCashbackToken(req: Request, res: Response): boolean {
  const token = verifyCashbackExeToken(bearerToken(req));
  if (!token) {
    res.status(200).json(cashbackErr("Login or Password incorrect!"));
    return false;
  }
  return true;
}

/** POST /authPOS — { login, password } → { code:0, data:{ token } } */
router.post("/authPOS", async (req, res, next) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const result = authenticateCashbackExe(String(body.login || ""), String(body.password || ""));
    const http = result.code === 0 ? 200 : result.code === 503 ? 503 : 200;
    return res.status(http).json(result);
  } catch (error) {
    return next(error);
  }
});

/** POST /api — vendor method router */
router.post("/api", async (req, res, next) => {
  try {
    if (!requireCashbackToken(req, res)) return;

    const body = (req.body || {}) as Record<string, unknown>;
    const method = String(body.method || "").trim();
    const params =
      body.params && typeof body.params === "object"
        ? (body.params as Record<string, unknown>)
        : {};

    if (method === "GetBalance") {
      const scan = String(params.scan_code || params.scanCode || params.qr || "");
      const out = await cashbackExeGetBalance(scan);
      return res.status(out.http).json(out.body);
    }

    if (method === "CreateReceipt") {
      const out = await cashbackExeCreateReceipt(params);
      return res.status(out.http).json(out.body);
    }

    logger.warn({ method }, "CASHBACK.exe unknown method");
    return res.status(200).json(cashbackErr(`Unknown method: ${method || "(empty)"}`));
  } catch (error) {
    return next(error);
  }
});

/** Express error → vendor-shaped JSON (avoid leaking stack to kassa). */
export function fomCashbackExeErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) return next(err);
  logger.error({ err }, "CASHBACK.exe handler failed");
  return res.status(200).json(cashbackErr("Internal error"));
}

export default router;
