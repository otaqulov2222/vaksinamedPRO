/**
 * Admin Phase 12.11 — Final Dashboard product reconstruction (sparse-data).
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

describe("Admin Phase 12.11 — Dashboard product reconstruction", () => {
  it("composition: dash-board → attn → act (no QA matrix)", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /className="dash-board"/);
    assert.match(dash, /className="dash-board-main"/);
    assert.match(dash, /className="dash-board-metrics"/);
    assert.match(dash, /className="attn"/);
    assert.match(dash, /className="act"/);
    assert.doesNotMatch(dash, /qa-matrix|Tezkor amallar|QuickAction/);
    assert.doesNotMatch(dash, /business-snapshot-subs|biz-snapshot-metrics/);
  });

  it("hero is compact: Savdo + period + order count; no fake trends", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /dash-rev-value/);
    assert.match(dash, /dash-rev-meta">\{presetLabel\(preset\)\}/);
    assert.match(dash, /dash-ord-total-n">\{ordersCount\}/);
    assert.match(dash, /completedCount/);
    assert.match(dash, /deliveringCount/);
    assert.doesNotMatch(dash, /\+\s*12%|trend|yesterday vs|↑/);
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /\.dash-rev-value\s*\{[^}]*font-size:\s*clamp\([^)]*34px\)/);
    assert.match(css, /Phase 12\.30/);
    assert.doesNotMatch(css, /Phase 12\.30[\s\S]{0,1200}linear-gradient/);
  });

  it("attention: quiet status OR compact rows from real signals", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /Muammo yo‘q|Muammo yo'q/);
    assert.match(dash, /!hasAttention \?/);
    assert.match(dash, /attentionItems\.map/);
    assert.match(dash, /Ko‘rish|Ko'rish/);
    assert.doesNotMatch(dash, /Available\s*<=\s*0|product_stocks|cashback_accounts/);
  });

  it("activity renders only with real rows (no empty placeholder card)", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /hasOrderActivity \? \(/);
    assert.match(dash, /Oxirgi buyurtmalar/);
    assert.doesNotMatch(dash, /act--empty/);
  });

  it("CSS: dash-board + attn + dash-status; dashboard fills main width", () => {
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /\.dash-board\s*\{/);
    assert.match(css, /\.attn-calm/);
    assert.match(css, /\.dash-status\s*\{/);
    assert.match(css, /\.dashboard[\s\S]*?width:\s*100%/);
    assert.match(css, /\.dashboard[\s\S]*?max-width:\s*none/);
    assert.doesNotMatch(css, /\.dashboard\s*\{[^}]*max-width:\s*1100px/);
  });

  it("docs record Phase 12.11", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.11/,
    );
  });
});
