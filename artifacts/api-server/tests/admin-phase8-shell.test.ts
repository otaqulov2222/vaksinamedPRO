/**
 * Admin Phase 8 — shell / navigation / Dashboard-first landing.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");

describe("Admin Phase 8 — Dashboard-first shell", () => {
  it("nav groups cover master-spec modules; FOM is not alone", () => {
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    assert.match(nav, /NAV_GROUPS/);
    assert.match(nav, /preferLandingTab/);
    assert.match(nav, /id:\s*"dashboard"/);
    assert.match(nav, /id:\s*"kassa"/);
    assert.match(nav, /id:\s*"orders"/);
    assert.match(nav, /id:\s*"fom"/);
    assert.match(nav, /label:\s*"Boshqaruv"|label:\s*"Umumiy"|label:\s*"Asosiy"/);
    assert.match(nav, /label:\s*"Savdo"/);
    assert.match(nav, /label:\s*"Tizim"|label:\s*"Operatsiya"/);
  });

  it("preferLandingTab prefers dashboard over fom/settings", () => {
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    assert.match(nav, /if \(ids\.has\("dashboard"\)\) return "dashboard"/);
    assert.match(nav, /i\.id !== "fom" && i\.id !== "settings"/);
    assert.match(nav, /i\.id !== "admins"/);
  });

  it("App gates shell until /admin/me permissions load; default tab dashboard", () => {
    const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
    assert.match(app, /preferLandingTab/);
    assert.match(app, /NAV_GROUPS/);
    assert.match(app, /setTab\("dashboard"\)/);
    assert.match(app, /Sessiya va ruxsatlar yuklanmoqda/);
    assert.match(app, /!ready \|\| !user/);
    assert.doesNotMatch(app, /setTab\("fom"\)/);
  });

  it("Dashboard renders completed/delivering/customers from API; no fake inventory alerts", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /\/api\/admin\/dashboard/);
    assert.match(dash, /kpis\?\.completed|completed/);
    assert.match(dash, /kpis\?\.delivering|delivering/);
    assert.match(dash, /kpis\?\.customers|customers/);
    assert.match(dash, /mavjud emas|topilmadi|Threshold qoidasi yo.q/);
    assert.doesNotMatch(dash, /fakeOrders|demoSales|Math\.random\(\)/);
  });

  it("RBAC empty role-links fall back to known operational sets (seed drift)", () => {
    const rbac = readFileSync(path.join(root, "src/lib/rbac.ts"), "utf8");
    assert.match(rbac, /fallbackPermissionsForRole/);
    assert.match(rbac, /links\.length/);
    assert.match(rbac, /Empty links = seed drift/);
  });
});
