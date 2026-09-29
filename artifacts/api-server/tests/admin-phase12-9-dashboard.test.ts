/**
 * Admin Phase 12.9 — Dashboard operations center reset (compat with 12.11 composition).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.9 — Dashboard operations center reset", () => {
  it("composition: header → snapshot → attention → activity (no QA matrix)", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /dashboard/);
    assert.match(dash, /className="dash-overview"/);
    assert.match(dash, />Savdo<|\{salesLabel\(preset\)\}/);
    assert.match(dash, /E’tibor|E'tibor|attn/);
    assert.match(dash, /act|dash-activity/);
    assert.doesNotMatch(dash, /qa-matrix|QuickAction|Tezkor amallar/);
    assert.doesNotMatch(dash, /onOpenCatalog/);
  });

  it("attention uses real API signals only", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /zeroAvailable|available\) <= 0|available <= 0/);
    assert.match(dash, /deliveringCount|kpis\?\.delivering/);
    assert.match(dash, /openOrders|ordersCount - completedCount/);
    assert.match(dash, /Mavjud emas|mavjud emas/);
    assert.match(dash, /Yetkazilmoqda|yetkazilmoqda/);
    assert.match(dash, /Buyurtmalar/);
    assert.match(dash, /Muammo yo‘q|Muammo yo'q/);
    assert.doesNotMatch(dash, /failed.?payment|fake|Math\.random|threshold qoida/i);
    assert.doesNotMatch(dash, /Available\s*<=\s*0|product_stocks|cashback_accounts|server agregat/i);
  });

  it("inventory attention filters Available<=0 and omits SKU/tech columns", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /title:\s*"Ombor"/);
    assert.match(dash, /<th>Mahsulot<\/th>/);
    assert.match(dash, /<th className="num">Fizik<\/th>/);
    assert.match(dash, /<th className="num">Band<\/th>/);
    assert.match(dash, /<th className="num">Mavjud<\/th>/);
    assert.doesNotMatch(dash, /<th>SKU<\/th>/);
  });

  it("activity uses StatusLabelBadge; POS gated by permission; tables only with real rows", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /StatusLabelBadge/);
    assert.match(dash, /canPosSales/);
    assert.match(dash, /hasOrderActivity = recent\.length > 0/);
    assert.match(dash, /hasPosActivity = Boolean\(posSales && posSales\.length > 0\)/);
    assert.doesNotMatch(dash, /fulfillmentTone\(/);
  });

  it("CSS defines snapshot metrics + attn list; no QA matrix required", () => {
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /Phase (12\.(9|10|11|30|31)|13\.0)/);
    assert.match(css, /\.dash-hero \{/);
    assert.match(css, /\.dash-hero-value \{/);
    assert.match(css, /\.attn-rows|\.attn-list|\.attention-list/);
    assert.match(css, /\.attn-calm|\.dash-attention--calm|\.attention--calm/);
    assert.match(css, /\.dash-empty \{/);
  });

  it("docs record Phase 12.9", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.9/,
    );
  });
});
