/**
 * Admin Phase 12.8 — Information Architecture + operator copy system.
 * Supporting evidence only — not visual PASS.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.8 — IA + operator copy", () => {
  it("nav groups match approved IA; FOM under Tizim; no Umumiy/Operatsiya", () => {
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    assert.match(nav, /label:\s*"Boshqaruv"/);
    assert.match(nav, /label:\s*"Savdo"/);
    assert.match(nav, /label:\s*"Ombor"/);
    assert.match(nav, /label:\s*"Mijozlar"/);
    assert.match(nav, /label:\s*"Tarmoq"/);
    assert.match(nav, /label:\s*"Tahlil"/);
    assert.match(nav, /label:\s*"Tizim"/);
    assert.doesNotMatch(nav, /label:\s*"Umumiy"/);
    assert.doesNotMatch(nav, /label:\s*"Operatsiya"/);

    const fomIdx = nav.indexOf('id: "fom"');
    const systemIdx = nav.indexOf('id: "system"');
    const salesIdx = nav.indexOf('id: "sales"');
    assert.ok(fomIdx > systemIdx && systemIdx > salesIdx, "FOM must live under Tizim after Savdo");

    const invIdx = nav.indexOf('id: "inventory"');
    const prodIdx = nav.indexOf('id: "products"');
    assert.ok(invIdx > 0 && prodIdx > invIdx, "Ombor item before Katalog");

    assert.match(nav, /weight:\s*"primary"/);
    assert.match(nav, /weight:\s*"system"/);
    assert.match(nav, /Cashback \/ Loyalty/);
  });

  it("navVisible / preferLandingTab / routes unchanged shape", () => {
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    assert.match(nav, /export function navVisible/);
    assert.match(nav, /export function preferLandingTab/);
    assert.match(nav, /if \(ids\.has\("dashboard"\)\) return "dashboard"/);
    for (const id of [
      "dashboard", "kassa", "orders", "payments", "inventory", "products",
      "promos", "customers", "cashback", "ratings", "branches", "delivery",
      "reports", "audit", "fom", "admins", "settings",
    ]) {
      assert.match(nav, new RegExp(`id:\\s*"${id}"`));
    }
  });

  it("operator label helpers cover fulfillment/payment/reservation/capability", () => {
    const ui = readFileSync(path.join(adminWeb, "ui.tsx"), "utf8");
    assert.match(ui, /export function fulfillmentLabel/);
    assert.match(ui, /export function paymentLabel/);
    assert.match(ui, /export function reservationLabel/);
    assert.match(ui, /export function entryTypeLabel/);
    assert.match(ui, /export function sourceLabel/);
    assert.match(ui, /export function operatorCapabilityLabel/);
    assert.match(ui, /READY_FOR_PICKUP:\s*"Olib ketishga tayyor"/);
    assert.match(ui, /PARTIALLY_REFUNDED:\s*"Qisman qaytarilgan"/);
    assert.match(ui, /FOM_POS.*FOM kassa/);
    assert.match(ui, /CONTRACT_PENDING.*Hali ulanmagan|Hali ulanmagan/);
    assert.match(ui, /FAILED:\s*"Amal bajarilmadi"/);
    assert.match(ui, /Hali ulanmagan/);
    assert.doesNotMatch(ui, /Provayder ulanmagan/);
    assert.match(ui, /export const PAGE_DENSITY/);
    assert.match(ui, /export function StatusLabelBadge/);
  });

  it("Settings primary UI does not show ADMIN_USER_MANAGEMENT=API_REQUIRED chrome", () => {
    const page = readFileSync(path.join(adminWeb, "pages/SettingsPage.tsx"), "utf8");
    assert.doesNotMatch(page, /ADMIN_USER_MANAGEMENT\s*=\s*API_REQUIRED/);
    assert.doesNotMatch(page, />API_REQUIRED</);
    const access = readFileSync(path.join(adminWeb, "pages/AdminAccessPage.tsx"), "utf8");
    assert.match(access, /operatorCapabilityLabel\("API_REQUIRED"\)/);
    assert.doesNotMatch(access, /ADMIN_USER_MANAGEMENT\s*=\s*API_REQUIRED/);
  });

  it("App applies nav weight classes + page-header/topbar contract + density", () => {
    const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
    assert.match(app, /nav-w-\$\{weight\}/);
    assert.match(app, /crumb-group/);
    assert.match(app, /crumb-page/);
    assert.match(app, /PAGE_DENSITY/);
    assert.match(app, /data-density=/);
    assert.match(app, /surface-page/);
    assert.match(app, /aria-current=\{active \? "page"/);
  });

  it("CSS supports nav weight + button hierarchy + surfaces", () => {
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /\.nav-w-primary/);
    assert.match(css, /\.nav-w-low/);
    assert.match(css, /\.nav-w-system/);
    assert.match(css, /\.btn-primary/);
    assert.match(css, /\.btn-secondary/);
    assert.match(css, /\.btn-tertiary/);
    assert.match(css, /\.btn-danger/);
    assert.match(css, /\.surface-page/);
    assert.match(css, /\.surface-ops/);
    assert.match(css, /\.surface-table/);
    assert.match(css, /\.surface-drawer/);
    assert.match(css, /\.surface-dialog/);
    assert.match(css, /data-density="high"/);
  });

  it("Dashboard keeps primary ops CTAs without sidebar mirror matrix", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /Kassa|Kassaga/);
    assert.match(dash, /Buyurtmalar/);
    assert.match(dash, /Ombor/);
    assert.doesNotMatch(dash, /qa-matrix/);
    assert.doesNotMatch(dash, /title:\s*"Hisobotlar"/);
    assert.doesNotMatch(dash, /title:\s*"Sozlamalar"/);
    assert.doesNotMatch(dash, /title:\s*"FOM"/);
    assert.doesNotMatch(dash, /cashback_accounts|server agregat|order KPI scoped/);
  });

  it("docs record Phase 12.8", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.8/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.8/,
    );
  });
});
