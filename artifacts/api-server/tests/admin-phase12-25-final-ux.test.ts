/**
 * Admin Phase 12.25 — Cross-module UX consolidation invariants.
 * UI-only; no business / API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

function read(rel: string) {
  return readFileSync(path.join(adminWeb, rel), "utf8");
}

describe("Admin Phase 12.25 — final UX consolidation", () => {
  it("shared shell destinations remain complete and unique", () => {
    const nav = read("nav.ts");
    const app = read("App.tsx");
    const ids = [
      "dashboard", "kassa", "orders", "payments", "inventory", "products",
      "promos", "customers", "cashback", "ratings", "branches", "delivery",
      "reports", "audit", "fom", "admins", "settings",
    ];
    for (const id of ids) {
      assert.match(nav, new RegExp(`id:\\s*"${id}"`));
      assert.match(app, new RegExp(`tab === "${id}"`));
    }
    assert.match(nav, /label:\s*"Boshqaruv"/);
    assert.match(nav, /label:\s*"Tizim"/);
    assert.doesNotMatch(nav, /soon\?:/);
    assert.doesNotMatch(app, /Tez orada|nav-soon/);
  });

  it("shared status language is unified", () => {
    const ui = read("ui.tsx");
    assert.match(ui, /FAILED:\s*"Amal bajarilmadi"/);
    assert.match(ui, /CONTRACT_PENDING[\s\S]*?return "Hali ulanmagan"/);
    assert.match(ui, /NOT_SUPPORTED[\s\S]*?return "Qo‘llab-quvvatlanmaydi"/);
    assert.doesNotMatch(ui, /Provayder ulanmagan/);
    assert.match(ui, /export function DetailDrawer/);
    assert.match(ui, /Escape/);
    assert.match(ui, /export function ErrorState/);
    assert.match(ui, /export function LoadingBlock/);
  });

  it("honesty locks preserved: FOM / Settings / Adminlar / Audit / Reports", () => {
    const fom = read("pages/FomPage.tsx");
    assert.match(fom, /\/api\/integrations\/fom\/status/);
    assert.match(fom, /CONTRACT_PENDING|inventoryWriter/);
    assert.doesNotMatch(fom, /<button[^>]*>\s*Ulanishni tekshirish\s*</);
    assert.doesNotMatch(fom, /MetricStrip|stat-grid/);

    const settings = read("pages/SettingsPage.tsx");
    assert.match(settings, /\/api\/cashback\/rules|cashback\/rules/);
    assert.doesNotMatch(settings, />\s*Saqlash\s*</);

    const admins = read("pages/AdminAccessPage.tsx");
    assert.match(admins, /operatorCapabilityLabel\("API_REQUIRED"\)/);
    assert.doesNotMatch(admins, /\/api\/admin\/users/);

    const audit = read("pages/AuditPage.tsx");
    assert.match(audit, /actionDraft|setEntity/);
    assert.doesNotMatch(audit, /security score|Excel|CSV export|branchFilter|actorFilter/i);

    const reports = read("pages/ReportsPage.tsx");
    assert.match(reports, /\/api\/admin\/dashboard|dashboard/);
    assert.doesNotMatch(reports, /AOV|trend chart/i);
  });

  it("no secrets rendered in Admin page sources", () => {
    const pagesDir = path.join(adminWeb, "pages");
    const files = readdirSync(pagesDir).filter((f) => f.endsWith(".tsx"));
    for (const f of files) {
      const src = readFileSync(path.join(pagesDir, f), "utf8");
      assert.doesNotMatch(src, /FOM_WEBHOOK_SECRET\s*=/);
      assert.doesNotMatch(src, /Bearer\s+[A-Za-z0-9._-]{16,}/);
      assert.doesNotMatch(src, /passwordHash\s*[:=]/);
    }
  });

  it("page descriptions are present for all destinations", () => {
    const nav = read("nav.ts");
    for (const key of [
      "dashboard", "orders", "customers", "cashback", "payments", "kassa",
      "delivery", "promos", "ratings", "branches", "products", "inventory",
      "reports", "audit", "settings", "admins", "fom",
    ]) {
      assert.match(nav, new RegExp(`${key}:\\s*"`));
    }
    assert.match(nav, /admins:\s*"Joriy sessiya/);
  });

  it("Phase 12.25 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.25/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.25/,
    );
  });
});
