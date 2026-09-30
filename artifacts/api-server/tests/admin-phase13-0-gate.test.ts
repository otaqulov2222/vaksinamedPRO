/**
 * Admin Phase 13.0 final gate — data truth for chart/map, breadcrumb, shared modal focus, token hygiene.
 * Supporting evidence only — visual acceptance is done in the browser.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
const ui = readFileSync(path.join(adminWeb, "ui.tsx"), "utf8");
const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
const rootEnd = css.indexOf("\n}");
const primitives = css.slice(rootEnd, css.indexOf("/* ——— POS"));

describe("Admin Phase 13.0 gate — chart and map use real API data only", () => {
  it("7-day chart: one /api/admin/dashboard call per day, kpis.revenue + kpis.orders", () => {
    assert.match(dash, /dates\.map\(\(d\) => softRequest\(dashboardPath\(d, d\), props\.token\)\)/);
    assert.match(dash, /revenue: Number\(dayBodies\[i\]\.kpis\.revenue \|\| 0\)/);
    assert.match(dash, /orders: Number\(dayBodies\[i\]\.kpis\.orders \|\| 0\)/);
  });

  it("chart failure shows no bars instead of invented zero points", () => {
    assert.match(dash, /setDays\(\[\]\);\s*setDaysState\("error"\);/);
    assert.match(dash, /\{props\.state !== "error" \? \(/);
    assert.match(dash, /const hasData = props\.state === "ready" && max > 0;/);
  });

  it("empty chart keeps its frame and states the gap instead of drawing a scale", () => {
    assert.match(dash, /hasData \? " has-scale" : " is-empty"/);
    assert.match(css, /\.sales-chart\.has-scale \{ padding-left: \d+px; \}/);
    assert.match(css, /\.sales-chart-empty \{[^}]*position: absolute;/);
  });

  it("network map is derived from the /api/admin/branches rows passed in by the shell", () => {
    assert.match(app, /softRequest\("\/api\/admin\/branches", nextToken\)/);
    assert.match(dash, /\(props\.branches \|\| \[\]\)\.map\(\(b: any\) => \(\{/);
    assert.match(dash, /isOpen: b\.isOpen !== false,/);
    assert.match(dash, /is24h: b\.is24h === true,/);
    assert.doesNotMatch(dash, /Math\.random|faker|mockBranches|sampleBranches/i);
  });
});

describe("Admin Phase 13.0 gate — breadcrumb", () => {
  it("group segment is dropped when it repeats the page title or is the generic fallback", () => {
    assert.match(app, /const crumbGroup = groupLabel !== pageTitle && groupLabel !== "Admin" \? groupLabel : null;/);
    assert.match(app, /\{crumbGroup \? \(/);
    assert.match(app, /className="crumb-page" aria-current="location"/);
  });

  it("nav groups that share a name with one of their pages exist, so the dedupe is load-bearing", () => {
    assert.match(nav, /label: "Ombor"/);
    assert.match(nav, /label: "Mijozlar"/);
  });
});

describe("Admin Phase 13.0 gate — shared modal focus (DetailDrawer + ConfirmDialog)", () => {
  it("focus moves in, Escape closes, Tab is trapped, focus returns to the trigger", () => {
    assert.match(ui, /function useModalFocus\(/);
    assert.match(ui, /querySelector<HTMLElement>\("\[data-autofocus\]"\)/);
    assert.match(ui, /e\.key === "Escape"/);
    assert.match(ui, /e\.key !== "Tab"/);
    assert.match(ui, /if \(trigger\?\.isConnected\) trigger\.focus\(/);
    assert.match(ui, /modalStack\[modalStack\.length - 1\] !== token/);
  });

  it("both primitives use the hook and keep dialog semantics", () => {
    assert.match(ui, /useModalFocus\(props\.open, panelRef, props\.onClose\);/);
    assert.match(ui, /useModalFocus\(props\.open, panelRef, \(\) => \{/);
    assert.match(ui, /role="dialog"\s+aria-modal="true"\s+aria-labelledby=\{titleId\}/);
    assert.match(ui, /role="alertdialog"\s+aria-modal="true"\s+aria-labelledby=\{titleId\}/);
    assert.match(ui, /onClick=\{props\.onCancel\} data-autofocus>/);
  });

  it("no page reimplements its own dialog focus handling", () => {
    for (const page of ["CustomersPage", "OrdersPage", "PaymentsPage", "InventoryPage", "CatalogPage", "BranchesPage"]) {
      let src = "";
      try {
        src = readFileSync(path.join(adminWeb, `pages/${page}.tsx`), "utf8");
      } catch {
        continue;
      }
      assert.doesNotMatch(src, /role="dialog"|aria-modal/, page);
    }
  });
});

describe("Admin Phase 13.0 gate — token hygiene", () => {
  it("global primitives carry no hardcoded colors; overlay/hover/danger colors are tokens", () => {
    assert.doesNotMatch(primitives, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    for (const t of ["border-hover", "overlay", "accent-ink-muted", "accent-edge", "danger-strong", "side-line-strong"]) {
      assert.match(css.slice(0, rootEnd), new RegExp(`--vm-${t}: `), t);
    }
  });

  it("no legacy dashboard/gradient/texture tokens remain", () => {
    assert.doesNotMatch(css, /--vm-(gradient|texture|hero-|canvas|network-|chart-|page-glow|accent-glow)/);
  });
});
