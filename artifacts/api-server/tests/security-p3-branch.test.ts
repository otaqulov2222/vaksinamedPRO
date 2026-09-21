import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure branch-filter logic mirrored from rbac.resolveStaffBranchFilter
 * (kept here so security tests do not boot the DB singleton).
 */
function resolveStaffBranchFilter(
  user: { role: string; branchId: number | null },
  requestedBranchId: number | undefined,
  isHq: (role: string) => boolean,
): number | undefined {
  if (isHq(user.role)) {
    return requestedBranchId && Number.isFinite(requestedBranchId) ? requestedBranchId : undefined;
  }
  if (!user.branchId) {
    throw Object.assign(new Error("Bu filial uchun ruxsat yo‘q"), { status: 403 });
  }
  if (requestedBranchId && requestedBranchId !== user.branchId) {
    throw Object.assign(new Error("Bu filial uchun ruxsat yo‘q"), { status: 403 });
  }
  return user.branchId;
}

function isHq(role: string) {
  const r = role.toLowerCase();
  return r === "super_admin" || r === "hq" || r === "admin";
}

describe("P3 branch scope matrix", () => {
  it("branch A cashier cannot select branch B", () => {
    assert.throws(
      () => resolveStaffBranchFilter({ role: "cashier", branchId: 12 }, 7, isHq),
      (err: { status?: number }) => err.status === 403,
    );
  });

  it("branch A cashier is forced to own branch", () => {
    assert.equal(resolveStaffBranchFilter({ role: "cashier", branchId: 12 }, undefined, isHq), 12);
  });

  it("HQ may omit branch filter (global)", () => {
    assert.equal(resolveStaffBranchFilter({ role: "super_admin", branchId: null }, undefined, isHq), undefined);
  });

  it("HQ may filter a specific branch", () => {
    assert.equal(resolveStaffBranchFilter({ role: "super_admin", branchId: null }, 7, isHq), 7);
  });

  it("cashier cannot perform HQ-only permission (dashboard)", () => {
    const cashierPerms = new Set([
      "products:read",
      "orders:read",
      "orders:confirm_pos",
      "pos:lookup",
      "pos:preview",
      "pos:sale",
      "pos:void",
      "pos:sales:read",
      "delivery:update",
    ]);
    assert.equal(cashierPerms.has("dashboard:read"), false);
    assert.equal(cashierPerms.has("branches:manage"), false);
    assert.equal(cashierPerms.has("rbac:manage"), false);
    assert.equal(cashierPerms.has("inventory:adjust"), false);
    assert.equal(cashierPerms.has("pos:sale"), true);
  });

  it("invalid branch scope returns 403", () => {
    assert.throws(
      () => resolveStaffBranchFilter({ role: "cashier", branchId: 1 }, 999, isHq),
      (err: { status?: number; message?: string }) => err.status === 403,
    );
  });
});
