/**
 * Admin Phase 13.1 — Dashboard sales intelligence composition.
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
const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");

describe("Admin Phase 13.1 — Dashboard sales intelligence", () => {
  it("composition: hero + orders → KPI cluster → network + activity", () => {
    assert.match(dash, /className="dash-overview"/);
    assert.match(dash, /<SalesChart /);
    assert.match(dash, /<OrdersStack /);
    assert.match(dash, /className="dash-metrics"/);
    assert.match(dash, /className="dash-insights"/);
    assert.match(dash, /className="dash-network[ "]/);
    assert.match(dash, /className="dash-activity[ "]/);
  });

  it("only existing endpoints — dynamics reuse /api/admin/dashboard per day", () => {
    const paths = [...dash.matchAll(/["`](\/api\/[a-z/:-]+)/g)].map((m) => m[1]);
    assert.ok(paths.length > 0);
    for (const p of paths) {
      assert.ok(
        p.startsWith("/api/admin/dashboard") || p.startsWith("/api/pos/sales") || p.startsWith("/api/admin/audit"),
        `unexpected endpoint ${p}`,
      );
    }
    assert.match(dash, /dashboardPath\(d, d\)/);
    assert.match(dash, /length: 7/);
  });

  it("comparison is derived from real revenue only, never hard-coded", () => {
    assert.match(dash, /showDelta = prevRevenue != null && prevRevenue > 0 && revenue > 0/);
    assert.doesNotMatch(dash, /Math\.random|\+\s*\d+(\.|,)\d+%|trend/);
  });

  it("designed empty states — no bare zero / no data", () => {
    assert.match(dash, /Ma’lumot yetarli emas/);
    assert.match(dash, /Bugun savdo hali qayd etilmadi/);
    assert.match(dash, /Bugun faol buyurtmalar yo‘q/);
    assert.match(dash, /Hozircha faoliyat mavjud emas/);
    assert.match(dash, /Filiallar ro‘yxati mavjud emas/);
  });

  it("network and activity use real fields; no invented statuses", () => {
    assert.match(dash, /Number\(b\.lat\)/);
    assert.match(dash, /Number\(b\.lng\)/);
    assert.match(dash, /b\.isOpen !== false/);
    assert.match(dash, /b\.is24h === true/);
    assert.doesNotMatch(dash, /Offline|Muammoli filial/);
    assert.match(dash, /a\.action === "admin\.login"/);
    assert.match(dash, /canAudit && !branchId/);
  });

  it("design tokens: hero, chart, KPI identity, elevation, radius, type, motion", () => {
    for (const t of [
      "surface-brand", "viz-1", "viz-3", "status-done", "status-moving",
      "kpi-customers", "kpi-cash", "kpi-network", "kpi-reserve", "map-dot",
      "elev-card", "elev-hover", "radius-lg", "radius-hero", "fs-display", "fs-metric", "dur-slow",
    ]) {
      assert.match(css, new RegExp(`--vm-${t}:`), `token --vm-${t}`);
    }
  });

  it("no gradients in the design system; motion respects reduced-motion", () => {
    const start = css.indexOf("Dashboard — Phase 13.0 reset");
    assert.ok(start > 0, "dashboard block marker");
    assert.doesNotMatch(css, /linear-gradient|radial-gradient|backdrop-filter/);
    assert.match(css.slice(start), /prefers-reduced-motion:\s*reduce/);
  });
});
