/**
 * Admin Phase 13.4 — operations & navigation polish.
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

describe("Admin Phase 13.4 — operations & navigation polish", () => {
  it("status and activity form the operational signals stage; order lists follow; network last", () => {
    const order = ['className="dash-signals"', 'className="attn"', 'className="dash-activity"', 'className="act"', 'className="dash-network"'];
    const idx = order.map((s) => dash.indexOf(s));
    assert.ok(idx.every((i) => i > 0), `all present: ${idx}`);
    assert.deepEqual([...idx].sort((a, b) => a - b), idx);
    assert.match(css, /\.dash-signals \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1\.35fr\)/);
  });

  it("recent orders render as a feed of real rows, not a table", () => {
    assert.match(dash, /<ol className="act-feed">\s*\{recent\.map/);
    assert.match(dash, /className="act-code"/);
    assert.match(dash, /className="act-status"/);
    assert.match(dash, /StatusLabelBadge domain="fulfillment"/);
    assert.doesNotMatch(dash, /<th>Mijoz<\/th>|<DataTable sticky>/);
    assert.match(css, /\.act-row \{[^}]*grid-template-areas: "code where time amount status"/);
    assert.match(css, /grid-template-areas: "code amount" "where status" "time time"/);
  });

  it("attention state is derived from real signals only", () => {
    assert.match(dash, /criticalCount = attentionItems\.filter\(\(i\) => i\.tone === "danger"\)\.length/);
    assert.match(dash, /data-state=\{attnState\}/);
    assert.match(dash, /ta muhim holat/);
    assert.match(dash, /ta holat e’tibor talab qiladi/);
    assert.match(dash, /Tizimda hozir e’tibor talab qiladigan holat mavjud emas\./);
    assert.doesNotMatch(dash, /Offline|Kam qoldiq|low stock/i);
  });

  it("KPI cells stretch as columns so their metadata rows align at the bottom", () => {
    assert.match(css, /\.dash-kpi \{\s*display: flex;\s*flex-direction: column;/);
    assert.match(css, /\.dash-kpi-detail \{[^}]*margin-top: auto;/);
  });

  it("sidebar keeps the active item visible inside its own scroll container", () => {
    assert.match(app, /ref=\{navRef\}/);
    assert.match(app, /nav\.scrollTop/);
    assert.doesNotMatch(app, /scrollIntoView/);
    assert.match(css, /--vm-side-active: rgba\(167, 139, 250, 0\.16\)/);
  });

  it("no fake data introduced", () => {
    assert.doesNotMatch(dash, /Math\.random|faker|lorem|mockData|sampleData|trend/i);
  });
});
