/**
 * Admin Phase 12.10 — Dashboard pixel-level (compat with 12.11).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.10 — Dashboard pixel reconstruction", () => {
  it("IA: header → business-snapshot → context-rail → attention → activity", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /className=\{`dashboard|className="dashboard/);
    assert.match(dash, /className="dash-board"/);
    assert.match(dash, /dash-board-metrics/);
    assert.match(dash, /E’tibor|E'tibor|attn/);
    assert.match(dash, /className="act|dash-activity/);
    assert.doesNotMatch(dash, /qa-matrix|Tezkor amallar|QuickAction/);
  });

  it("Savdo is hero focal point; secondary metrics subordinate", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /className="dash-rev-value">\{money\(revenue\)\}/);
    assert.match(dash, /Yetkazilmoqda|yetkazilmoqda|deliveringCount/);
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /\.dash-rev-value\s*\{[^}]*font-size:\s*clamp\([^)]*34px\)/);
    assert.match(css, /inset 3px 0 0 var\(--vm-gold\)/);
  });

  it("attention priority: inventory → open orders → delivery; real API only", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    const inv = dash.indexOf('id: "inv-zero"');
    const open = dash.indexOf('id: "open-orders"');
    const del = dash.indexOf('id: "delivering"');
    assert.ok(inv > 0 && open > inv && del > open, "attention push order must be inv → open → delivery");
    assert.match(dash, /Ombor|mavjud emas/i);
    assert.match(dash, /Ko‘rish|Buyurtmalarga o‘tish|Yetkazib berish/);
    assert.doesNotMatch(dash, /Available\s*<=\s*0|product_stocks|cashback_accounts|Math\.random/);
  });

  it("empty calm state is compact with check mark", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /className="dash-status" role="status"/);
    assert.match(dash, /Muammo yo‘q|Muammo yo'q/);
    assert.match(dash, /✓/);
  });

  it("CSS vocabulary uses dashboard / dash-board / attention", () => {
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /Phase 12\.(10|11|30)/);
    assert.match(css, /\.dash-board\s*\{/);
    assert.match(css, /\.dash-board-metrics\s*\{/);
    assert.match(css, /\.attn-row|\.attention-item|\.attention-list/);
    assert.match(css, /\.dashboard-controls/);
  });

  it("docs record Phase 12.10", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.10/,
    );
  });
});
