/**
 * Admin Phase 13.3 — visual composition & signature.
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
const dashBlock = css.slice(css.indexOf("Dashboard — Phase 13.0 reset"), css.indexOf("Responsive — shell"));

describe("Admin Phase 13.3 — operations center composition", () => {
  it("stage order: money → operations → metrics → signals → network", () => {
    const order = ['className="dash-hero"', 'className="dash-orders"', 'className="dash-metrics"', 'className="dash-signals"', 'className="dash-network"'];
    const idx = order.map((s) => dash.indexOf(s));
    assert.ok(idx.every((i) => i > 0), `all stages present: ${idx}`);
    assert.deepEqual([...idx].sort((a, b) => a - b), idx);
  });

  it("sales sits on the brand-tinted surface; chart follows the headline stats", () => {
    assert.match(dashBlock, /\.dash-hero \{[^}]*background: var\(--vm-surface-brand\)/);
    assert.match(dashBlock, /\.dash-orders \{[^}]*padding: 20px 22px;/);
    assert.ok(dash.indexOf('className="dash-hero-chart"') > dash.indexOf('<dl className="dash-hero-stats">'));
  });

  it("KPIs form one strip with hairline separators, no filled cards", () => {
    assert.match(dashBlock, /\.dash-metrics \{[^}]*gap: 0;/);
    assert.match(dashBlock, /\.dash-kpi \+ \.dash-kpi \{ box-shadow: inset 1px 0 0 var\(--vm-border-subtle\); \}/);
    assert.doesNotMatch(dashBlock, /\.dash-kpi--(cash|customers|network|reserve) \{[^}]*background/);
  });

  it("network summary strip is built from real counts", () => {
    assert.match(dash, /<dt>Filial<\/dt>\s*<dd>\{focus \? focus\.n : props\.total\}<\/dd>/);
    assert.match(dash, /<dt>Ochiq<\/dt>\s*<dd>\{focus \? focus\.open : props\.open\}<\/dd>/);
    assert.match(dash, /<dt>24\/7<\/dt>\s*<dd>\{focus \? focus\.h24 : h24Total\}<\/dd>/);
    assert.match(dash, /open=\{network\.open\}/);
    assert.match(dash, /className="network-rail"/);
  });

  it("surfaces rely on tone and elevation, not outline borders", () => {
    const roles = dashBlock.match(/\.dash-orders,\r?\n\.dash-metrics,\r?\n\.attn,\r?\n\.dash-activity,\r?\n\.act,\r?\n\.dash-network \{[^}]*\}/);
    assert.ok(roles, "shared surface rule");
    assert.match(roles![0], /box-shadow: var\(--vm-elev-1\), 0 0 0 1px var\(--vm-border-subtle\);/);
    assert.doesNotMatch(roles![0], /border:/);
  });

  it("no fake data or invented trends", () => {
    assert.doesNotMatch(dash, /Math\.random|faker|lorem|mockData|sampleData|trend/i);
  });
});
