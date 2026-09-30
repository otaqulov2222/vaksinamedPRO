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
  it("stage order: business → orders → network → operations", () => {
    const order = [
      'className="dash-metrics"',
      'className="dash-kpi dash-hero"',
      'className="dash-sales"',
      'className="dash-orders"',
      'className="dash-network"',
      'className="dash-signals"',
    ];
    const idx = order.map((s) => dash.indexOf(s));
    assert.ok(idx.every((i) => i > 0), `all stages present: ${idx}`);
    assert.deepEqual([...idx].sort((a, b) => a - b), idx);
  });

  it("primary sales cell stays neutral; chart follows the sales stats", () => {
    assert.doesNotMatch(dashBlock, /\.dash-hero \{[^}]*background:/);
    assert.match(dashBlock, /\.dash-metrics \{[^}]*grid-template-columns: minmax\(0, 1\.4fr\) repeat\(3, minmax\(0, 1fr\)\)/);
    assert.ok(dash.indexOf('className="dash-sales-chart"') > dash.indexOf('<dl className="dash-sales-stats">'));
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

  it("surfaces share one hairline rule — no outline borders, no heavy shadows", () => {
    const roles = dashBlock.match(/\.dash-metrics,\r?\n\.dash-sales,\r?\n\.dash-orders,\r?\n\.dash-network,\r?\n\.dash-activity,\r?\n\.act \{[^}]*\}/);
    assert.ok(roles, "shared surface rule");
    assert.match(roles![0], /box-shadow: 0 0 0 1px var\(--vm-border-subtle\);/);
    assert.doesNotMatch(roles![0], /border:|--vm-elev-2/);
  });

  it("no fake data or invented trends", () => {
    assert.doesNotMatch(dash, /Math\.random|faker|lorem|mockData|sampleData|trend/i);
  });
});
