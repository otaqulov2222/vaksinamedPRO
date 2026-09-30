/**
 * Admin Phase 13.2 — premium visual signature.
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
const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
const rootBlock = css.slice(0, css.indexOf("\n}"));
const dashBlock = css.slice(css.indexOf("Dashboard — Phase 13.0 reset"), css.indexOf("Responsive — shell"));

describe("Admin Phase 13.2 — premium visual signature", () => {
  it("signature tokens: surface levels, elevation, radius roles", () => {
    for (const t of [
      "surface-0", "surface-1", "surface-2", "surface-3",
      "elev-1", "elev-2", "elev-3",
      "radius-card", "radius-hero", "radius-control", "radius-badge", "lift",
    ]) {
      assert.match(rootBlock, new RegExp(`--vm-${t}:`), `token --vm-${t} in :root`);
    }
    assert.doesNotMatch(rootBlock, /--vm-gradient-|--vm-texture-/);
  });

  it("dashboard block uses flat token surfaces — no gradients, textures or blur", () => {
    assert.ok(dashBlock.length > 1000);
    assert.doesNotMatch(dashBlock, /linear-gradient|radial-gradient|backdrop-filter|blur\(|--vm-texture/);
    assert.match(dashBlock, /border-radius:\s*var\(--vm-radius-hero\)/);
    assert.match(dashBlock, /background:\s*var\(--vm-surface-brand\)/);
  });

  it("hero is a main stage; sales stats sit with the 7-day chart", () => {
    assert.match(dash, /className="dash-hero-stage"/);
    assert.match(dash, /VaksinaMed HQ/);
    assert.match(dash, /<dl className="dash-sales-stats">/);
    assert.match(dash, /sales-chart-zero/);
  });

  it("KPIs have distinct roles; region bar is built from real branch regions", () => {
    assert.match(dash, /dash-kpi--\$\{props\.accent\}/);
    assert.match(dash, /network\.regions\.map\(\(\[region, n\], i\)/);
    assert.match(css, /\.dash-kpi--cash \.dash-kpi-icon/);
  });

  it("network is a real-boundary region map driven by branch data, keyboard-reachable, with legend", () => {
    assert.match(dash, /from "\.\.\/data\/uzRegions"/);
    assert.match(dash, /regionIso\(b\.region\) \?\? \(hasPoint \? regionAt\(x, y\) : null\)/);
    assert.match(dash, /projectUz\(b\.lng, b\.lat\)/);
    assert.match(dash, /aria-pressed=\{p\.iso === pinned\}/);
    assert.match(dash, /aria-live="polite"/);
    assert.match(dash, /Filiallar soni/);
    assert.match(dash, /© OpenStreetMap/);
    assert.match(dash, /b\.is24h === true/);
    const geo = readFileSync(path.join(adminWeb, "data/uzRegions.ts"), "utf8");
    assert.equal([...geo.matchAll(/"iso":"UZ-[A-Z]{2}"/g)].length, 14);
    assert.match(geo, /ODbL/);
  });

  it("region ranking counts each region once", () => {
    assert.match(dash, /network\.regions\.slice\(topRegions\.length\)/);
  });

  it("activity timeline labels each event by its real source", () => {
    assert.match(dash, /order: "Buyurtma"/);
    assert.match(dash, /pos: "Kassa"/);
    assert.match(dash, /audit: "Tizim"/);
    assert.match(dash, /dash-feed-kind/);
  });

  it("shell: operator identity in sidebar, minimal topbar date", () => {
    assert.match(app, /className="side-operator"/);
    assert.match(app, /roleLabel\(user\.role\)/);
    assert.match(app, /className="topbar-day"/);
    assert.match(css, /\.side-nav \.nav-item\.active::before \{ height: 16px; \}/);
  });

  it("no fake data introduced", () => {
    assert.doesNotMatch(dash, /Math\.random|faker|lorem|mockData|sampleData/i);
    assert.doesNotMatch(app, /Math\.random|faker|lorem/i);
  });
});
