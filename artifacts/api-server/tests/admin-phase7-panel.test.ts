/**
 * Admin Phase 7 — full panel shell + newly surfaced API contracts.
 * Does not change cashback/inventory/payment/FOM engines.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");

describe("Admin Phase 7 — shell navigation", () => {
  it("sidebar exposes master-spec modules (not FOM-only)", () => {
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    for (const id of [
      "dashboard",
      "kassa",
      "branches",
      "products",
      "inventory",
      "orders",
      "customers",
      "cashback",
      "payments",
      "promos",
      "ratings",
      "delivery",
      "reports",
      "audit",
      "fom",
    ]) {
      assert.match(nav, new RegExp(`id:\\s*"${id}"`));
    }
    const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
    assert.match(app, /DashboardPage/);
    assert.match(app, /PosTerminal/);
    assert.match(app, /InventoryPage/);
    assert.match(app, /CashbackPage/);
    assert.match(app, /DeliveryPage/);
    assert.match(app, /FomPage/);
  });

  it("nav is permission-aware; inventory uses anyOf", () => {
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    assert.match(nav, /anyOf:\s*\["inventory:adjust",\s*"products:read"\]/);
    assert.match(nav, /function navVisible/);
  });
});

describe("Admin Phase 7 — newly surfaced APIs", () => {
  it("customer detail + cashback history are read-only SoT projections", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/customers\/:id"/);
    assert.match(admin, /\/admin\/customers\/:id\/cashback-history/);
    assert.match(admin, /getCustomerCashbackHistory/);
    assert.match(admin, /cashbackSource:\s*"cashback_accounts"/);
    assert.match(admin, /cashbackSource:\s*"cashback_ledger"/);
    assert.doesNotMatch(admin, /update\(cashbackAccounts\)/);
  });

  it("admin deliveries list is branch-scoped via resolveStaffBranchFilter", () => {
    const deliveries = readFileSync(path.join(root, "src/routes/deliveries.ts"), "utf8");
    assert.match(deliveries, /\/admin\/deliveries/);
    assert.match(deliveries, /requirePermission\(admin,\s*"delivery:update"\)/);
    assert.match(deliveries, /resolveStaffBranchFilter/);
    assert.match(deliveries, /externalProvider:\s*"CONTRACT_PENDING"/);
  });

  it("inventory adjust UI exists and posts to server adjust API", () => {
    const inv = readFileSync(path.join(adminWeb, "pages/InventoryPage.tsx"), "utf8");
    assert.match(inv, /\/api\/admin\/inventory\/adjust/);
    assert.match(inv, /physicalDelta/);
    assert.match(inv, /reason/);
    assert.match(inv, /confirm|Tasdiqlash|window\.confirm/i);
    assert.doesNotMatch(inv, /UPDATE product_stocks|SET physical/i);
  });
});

describe("Admin Phase 7 — dashboard KPI coverage", () => {
  it("dashboard UI renders completed / delivering / customers from API", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /kpis\?\.completed|kpis\.completed/);
    assert.match(dash, /kpis\?\.delivering|kpis\.delivering/);
    assert.match(dash, /kpis\?\.customers|kpis\.customers/);
    assert.match(dash, /cashback_accounts|cashbackSource/);
  });
});

describe("Admin Phase 7 — status doc", () => {
  it("ADMIN_IMPLEMENTATION_STATUS.md exists", () => {
    const doc = path.resolve(root, "../../docs/ADMIN_IMPLEMENTATION_STATUS.md");
    assert.ok(existsSync(doc), "docs/ADMIN_IMPLEMENTATION_STATUS.md missing");
  });
});
