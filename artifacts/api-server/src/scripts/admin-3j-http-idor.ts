/**
 * Batch 3J — HTTP-level IDOR against real PostgreSQL (gated).
 *
 * Without REAL_POSTGRES_LOAD_TEST=1 → reports PENDING (not PASS).
 * With gate + TEST_DATABASE_URL / safe DATABASE_URL → runs HTTP scenarios
 * via an already-running API base (P13_API_BASE_URL) when provided.
 *
 * Never enables production PSP/FOM writer.
 *
 * Run:
 *   pnpm --filter @workspace/api-server exec tsx src/scripts/admin-3j-http-idor.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = path.join(root, ".data", "admin-3j-http-idor");

type Status = "PASS" | "FAIL" | "PENDING" | "NOT_RUN";

type Scenario = {
  name: string;
  status: Status;
  detail?: string;
  httpStatus?: number;
};

function gated(): boolean {
  return process.env.REAL_POSTGRES_LOAD_TEST === "1";
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function runAgainstApi(base: string): Promise<Scenario[]> {
  const scenarios: Scenario[] = [];
  const adminLogin = await fetchJson(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.P13_CASHIER_EMAIL || "cashier-a@test.local",
      password: process.env.P13_CASHIER_PASSWORD || "x",
    }),
  });
  if (adminLogin.status !== 200 || !(adminLogin.body as { token?: string }).token) {
    return [{
      name: "seed_or_login",
      status: "NOT_RUN",
      detail: "Cashier login failed — seed Branch A/B actors on real PG first (see P13 harness)",
      httpStatus: adminLogin.status,
    }];
  }

  const cashierToken = (adminLogin.body as { token: string }).token;
  const foreignOrderId = Number(process.env.P13_FOREIGN_ORDER_ID || "0");
  if (!foreignOrderId) {
    return [{
      name: "foreign_order_id",
      status: "NOT_RUN",
      detail: "Set P13_FOREIGN_ORDER_ID to a Branch B order id",
    }];
  }

  const getForeign = await fetchJson(`${base}/api/admin/orders/${foreignOrderId}`, {
    headers: { authorization: `Bearer ${cashierToken}` },
  });
  scenarios.push({
    name: "cashier_A_get_branch_B_order",
    status: getForeign.status === 403 ? "PASS" : "FAIL",
    httpStatus: getForeign.status,
    detail: getForeign.status === 403 ? "denied" : "expected 403",
  });

  const cancelForeign = await fetchJson(`${base}/api/orders/${foreignOrderId}/admin-cancel`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cashierToken}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  scenarios.push({
    name: "cashier_A_cancel_branch_B_order",
    status: cancelForeign.status === 403 ? "PASS" : "FAIL",
    httpStatus: cancelForeign.status,
    detail: cancelForeign.status === 403 ? "denied" : "expected 403",
  });

  const badId = await fetchJson(`${base}/api/admin/orders/not-a-number`, {
    headers: { authorization: `Bearer ${cashierToken}` },
  });
  scenarios.push({
    name: "malformed_order_id",
    status: badId.status === 404 || badId.status === 400 ? "PASS" : "FAIL",
    httpStatus: badId.status,
  });

  return scenarios;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  if (!gated()) {
    const report = {
      HTTP_IDOR: "PENDING",
      reason: "REAL_POSTGRES_LOAD_TEST!=1",
      note: "Do not claim PASS without real PG + HTTP. PGlite IDOR covered in lib/db/tests/admin-3i-idor.test.ts",
    };
    writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    return;
  }

  const base = (process.env.P13_API_BASE_URL || "").replace(/\/$/, "");
  if (!base) {
    const report = {
      HTTP_IDOR: "NOT_RUN",
      reason: "P13_API_BASE_URL unset while REAL_POSTGRES_LOAD_TEST=1",
    };
    writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    process.exitCode = 0;
    return;
  }

  const scenarios = await runAgainstApi(base);
  const failed = scenarios.some((s) => s.status === "FAIL");
  const report = {
    HTTP_IDOR: failed ? "FAIL" : scenarios.every((s) => s.status === "PASS") ? "PASS" : "NOT_RUN",
    scenarios,
  };
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
