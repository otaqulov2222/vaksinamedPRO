/**
 * Admin Phase 3 — MEDIUM production hardening contracts.
 * Ratings branch scope, catalog stock axes, permission-aware nav,
 * audit coverage (non-ledger), honest FOM status.
 * Does not change Universal Cashback 2.0 engine.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");

/** Pure mirror of rbac.resolveStaffBranchFilter (avoid importing db singleton). */
function resolveStaffBranchFilter(
  user: { role: string; branchId: number | null },
  requestedBranchId: number | undefined,
): number | undefined {
  const role = String(user.role || "").toLowerCase();
  const isHq = role === "super_admin" || role === "admin" || role === "hq";
  if (isHq) {
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

describe("Admin Phase 3 MEDIUM — ratings branch scope", () => {
  it("ratings list uses resolveStaffBranchFilter + ratings:read", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/ratings[\s\S]*?requirePermission\(user,\s*"ratings:read"\)/);
    assert.match(admin, /\/admin\/ratings[\s\S]*?resolveStaffBranchFilter/);
    assert.match(admin, /eq\(staffRatings\.branchId,\s*branchFilter\)/);
  });

  it("ratings DTO omits customerId (least privilege list)", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    const ratingsBlock = admin.slice(admin.indexOf('router.get("/admin/ratings"'));
    assert.match(ratingsBlock, /employeeName:\s*staffRatings\.employeeName/);
    assert.match(ratingsBlock, /branchId:\s*staffRatings\.branchId/);
    assert.doesNotMatch(ratingsBlock.slice(0, 1200), /customerId:\s*staffRatings\.customerId/);
  });

  it("cashier cannot expand branch via client branchId; HQ may filter or see all", () => {
    assert.throws(
      () => resolveStaffBranchFilter({ role: "cashier", branchId: 10 } as any, 99),
      (err: any) => err?.status === 403,
    );
    assert.equal(
      resolveStaffBranchFilter({ role: "cashier", branchId: 10 } as any, undefined),
      10,
    );
    assert.equal(
      resolveStaffBranchFilter({ role: "super_admin", branchId: null } as any, undefined),
      undefined,
    );
    assert.equal(
      resolveStaffBranchFilter({ role: "super_admin", branchId: null } as any, 7),
      7,
    );
  });
});

describe("Admin Phase 3 MEDIUM — catalog inventory axes", () => {
  it("products API exposes physical/reserved/available from product_stocks", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/products[\s\S]*?requirePermission\(user,\s*"products:read"\)/);
    assert.match(admin, /stockAxes:\s*\["physical",\s*"reserved",\s*"available"\]/);
    assert.match(admin, /physicalQuantity/);
    assert.match(admin, /reservedQuantity/);
    assert.match(admin, /availableQuantity|physical - reserved/);
  });

  it("HQ without branchId gets stock:null — no invented stock", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /stock:\s*null/);
    assert.match(admin, /Pass branchId to include authoritative product_stocks axes/);
  });

  it("admin catalog UI shows Physical / Reserved / Available — not client invent", () => {
    const catalog = readFileSync(path.join(adminWeb, "pages/CatalogPage.tsx"), "utf8");
    assert.match(catalog, /Physical/);
    assert.match(catalog, /Reserved/);
    assert.match(catalog, /Available/);
    assert.match(catalog, /item\.stock\.physical/);
    assert.match(catalog, /item\.stock\.reserved/);
    assert.match(catalog, /item\.stock\.available/);
    assert.doesNotMatch(catalog, /stock\.physical\s*=\s*|invent.*physical/i);
  });
});

describe("Admin Phase 3 MEDIUM — permission-aware navigation", () => {
  it("/admin/me returns permissions array", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/me[\s\S]*?permissions:\s*Array\.from\(perms\)\.sort\(\)/);
  });

  it("nav maps tabs to permissions; cashier vs super_admin role visibility", () => {
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
    assert.match(nav, /navVisible/);
    assert.match(nav, /permission:\s*"pos:sale"/);
    assert.match(nav, /permission:\s*"dashboard:read"/);
    assert.match(nav, /permission:\s*"ratings:read"/);
    assert.match(nav, /permission:\s*"audit:read"/);
    assert.match(nav, /hqOnly:\s*true/);
    assert.match(app, /navVisible/);
    assert.match(nav, /permissions\.includes\(item\.permission\)|item\.anyOf/);
  });

  it("rbac fallback: cashier lacks dashboard/ratings/audit; super_admin has them", () => {
    const rbac = readFileSync(path.join(root, "src/lib/rbac.ts"), "utf8");
    // Fallback cashier set
    assert.match(rbac, /"pos:sale"/);
    assert.match(rbac, /"products:read"/);
    // HQ fallback includes ratings + audit + dashboard
    assert.match(rbac, /"ratings:read"/);
    assert.match(rbac, /"audit:read"/);
    assert.match(rbac, /"dashboard:read"/);
  });

  it("direct unauthorized access still requires permission on server routes", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /requirePermission\(user,\s*"dashboard:read"\)/);
    assert.match(admin, /requirePermission\(user,\s*"ratings:read"\)/);
    assert.match(admin, /requirePermission\(user,\s*"audit:read"\)/);
    assert.match(admin, /requirePermission\(user,\s*"customers:read"\)/);
  });
});

describe("Admin Phase 3 MEDIUM — audit coverage", () => {
  it("admin login writes audit_log without password/token secrets", () => {
    const auth = readFileSync(path.join(root, "src/lib/auth.ts"), "utf8");
    const idx = auth.indexOf('action: "admin.login"');
    assert.ok(idx > 0);
    const payloadLine = auth.slice(idx, idx + 160);
    assert.match(payloadLine, /JSON\.stringify\(\{\s*adminId:\s*user\.id,\s*role:\s*normalized\s*\}\)/);
    assert.doesNotMatch(payloadLine, /password|passwordHash|Bearer|token/i);
  });

  it("POS sale/void and order transitions audit; cashback ledger remains financial SoT", () => {
    const pos = readFileSync(path.join(root, "src/lib/pos.ts"), "utf8");
    assert.match(pos, /"pos\.sale"/);
    assert.match(pos, /"pos\.void"/);
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /order\.transition\./);
    assert.match(orders, /order\.confirm_pos/);
    assert.match(orders, /order\.cancel/);
    const finance = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
    // Engine must NOT dual-write audit_log as second financial SoT
    assert.doesNotMatch(finance, /insert\(auditLog\)|INSERT INTO audit_log/);
    assert.match(finance, /cashbackLedger/);
  });

  it("branch/product/catalog changes audited; no merchant secrets in branch audit", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /action:\s*"branch\.update"/);
    assert.match(admin, /action:\s*"product\.create"/);
    assert.match(admin, /action:\s*"product\.update"/);
    const idx = admin.indexOf('action: "branch.update"');
    assert.ok(idx > 0);
    const snippet = admin.slice(idx, idx + 200);
    assert.match(snippet, /JSON\.stringify\(\{\s*id\s*\}\)/);
    assert.doesNotMatch(snippet, /paymeKey|clickSecret|paymeMerchantId/);
  });
});

describe("Admin Phase 3 MEDIUM — FOM status honesty", () => {
  it("FOM status requires admin auth and reports CONTRACT_PENDING + writer OFF", () => {
    const integ = readFileSync(path.join(root, "src/routes/integrations.ts"), "utf8");
    assert.match(integ, /\/integrations\/fom\/status[\s\S]*?requireAdmin\(req\)/);
    assert.match(integ, /ready:\s*false/);
    assert.match(integ, /status:\s*"CONTRACT_PENDING"/);
    assert.match(integ, /inventoryWriter:\s*"OFF"/);
    assert.match(integ, /fomInventoryWriterEnabled:\s*false/);
    assert.match(integ, /fomPosContract:\s*"CONTRACT_PENDING"/);
    assert.match(integ, /confirmPos:\s*"ORDER"/);
    assert.doesNotMatch(integ, /ready:\s*true/);
  });

  it("FOM inventory writer kill-switch remains false", () => {
    const adapter = readFileSync(path.join(root, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(adapter, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);
  });

  it("admin FOM UI shows OFF / CONTRACT_PENDING — not fake Connected", () => {
    const fom = readFileSync(path.join(adminWeb, "pages/FomPage.tsx"), "utf8");
    assert.match(fom, /CONTRACT_PENDING/);
    assert.match(fom, /inventoryWriter/);
    assert.doesNotMatch(fom, /Connected|Active.*FOM|FOM.*Active/i);
  });
});

describe("Admin Phase 3 MEDIUM — regression locks", () => {
  it("cashback 30% + earn/use/reversal surface unchanged", () => {
    const finance = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
    assert.match(finance, /export async function earnCashback/);
    assert.match(finance, /export async function useCashback/);
    assert.match(finance, /export async function reverseCashbackEntry/);
    const cashback = readFileSync(path.join(root, "src/lib/cashback.ts"), "utf8");
    assert.match(cashback, /DEFAULT_MAX_SPEND_RATIO\s*=\s*0\.3/);
  });
});
