/**
 * Admin Phase 12 / 12.11 — visual redesign contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12 — premium visual redesign", () => {
  it("design tokens favor density: narrower sidebar, tighter radius, wider content", () => {
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /--vm-sidebar:\s*212px/);
    assert.match(css, /--vm-content-max:\s*1680px/);
    assert.match(css, /--vm-radius:\s*8px/);
    assert.match(css, /--vm-shadow:\s*none/);
  });

  it("Dashboard Phase 12.11 ops composition", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /biz-hero|biz-snapshot/);
    assert.match(dash, /ops-rail|attn|act/);
    assert.match(dash, /activity-tab/);
    assert.match(dash, /empty-inline/);
    assert.doesNotMatch(dash, /qa-matrix|qa-cell/);
    assert.doesNotMatch(dash, /metric-strip-primary|metric-strip-secondary/);
    assert.doesNotMatch(dash, /low stock < 10|trendPercent|\+12%/);
    assert.doesNotMatch(dash, /order KPI scoped|cashback_accounts|TZ Asia/);
  });

  it("StatCard / MetricStrip primitives remain for other modules", () => {
    const ui = readFileSync(path.join(adminWeb, "ui.tsx"), "utf8");
    assert.match(ui, /variant\?: "primary" \| "secondary"/);
    assert.match(ui, /MetricStrip|section-flat|flat\?:/);
  });

  it("status docs mention Phase 12", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12|biz-snapshot|biz-hero|ops-center|command/i,
    );
  });
});
