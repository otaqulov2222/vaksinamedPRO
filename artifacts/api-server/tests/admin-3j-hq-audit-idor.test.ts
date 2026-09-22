import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  adminCustomerIdentity,
  sanitizeAuditPayload,
} from "../src/lib/adminOrderOps";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../..");

describe("Batch 3J HQ branch filter + audit + HTTP IDOR gate", () => {
  it("admin orders accept branchId + reservationStatus server-side", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /resolveStaffBranchFilter/);
    assert.match(admin, /reservationStatus/);
    assert.match(admin, /eq\(orders\.reservationStatus/);
    assert.match(admin, /includePhone:\s*false/);
    assert.match(admin, /includePhone:\s*true/);
  });

  it("audit endpoint is paginated, read-only, and sanitizes payloads", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/audit/);
    assert.match(admin, /audit:read/);
    assert.match(admin, /ADMIN_AUDIT_MAX_LIMIT\s*=\s*100/);
    assert.match(admin, /sanitizeAuditPayload/);
    assert.match(admin, /readOnly:\s*true/);
    assert.doesNotMatch(admin, /router\.(delete|patch|put)\("\/admin\/audit/);
  });

  it("sanitizeAuditPayload strips secrets", () => {
    const out = sanitizeAuditPayload(JSON.stringify({
      orderId: 1,
      password: "x",
      token: "y",
      paymeKey: "z",
      branchId: 3,
    }));
    assert.equal(out.orderId, 1);
    assert.equal(out.branchId, 3);
    assert.equal("password" in out, false);
    assert.equal("token" in out, false);
    assert.equal("paymeKey" in out, false);
  });

  it("list identity omits phone; detail may include phone (POLICY E OPEN)", () => {
    const list = adminCustomerIdentity({ id: 1, firstName: "A", lastName: "B", phone: "+998" }, { includePhone: false });
    assert.equal("phone" in list, false);
    const detail = adminCustomerIdentity({ id: 1, firstName: "A", lastName: "B", phone: "+998" }, { includePhone: true });
    assert.equal(detail.phone, "+998");
  });

  it("admin UI has HQ branch filter and audit viewer", () => {
    const ui = readFileSync(path.join(root, "../admin-web/src/App.tsx"), "utf8");
    assert.match(ui, /isHqRole/);
    assert.match(ui, /orderBranchId/);
    assert.match(ui, /branchId/);
    assert.match(ui, /\["audit", "Audit"\]/);
    assert.match(ui, /loadAuditPage/);
    assert.match(ui, /read-only/i);
    assert.doesNotMatch(ui, /Pul qaytarildi/);
  });

  it("HTTP IDOR without REAL_POSTGRES_LOAD_TEST is PENDING (not PASS)", () => {
    assert.ok(existsSync(path.join(root, "src/scripts/admin-3j-http-idor.ts")));
    const r = spawnSync(
      "pnpm",
      ["--filter", "@workspace/api-server", "exec", "tsx", "src/scripts/admin-3j-http-idor.ts"],
      {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, REAL_POSTGRES_LOAD_TEST: "0" },
        shell: true,
      },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /"HTTP_IDOR"\s*:\s*"PENDING"/);
    assert.doesNotMatch(r.stdout, /"HTTP_IDOR"\s*:\s*"PASS"/);
  });
});
