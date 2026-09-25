/**
 * Admin Phase 12.5 / 12.9 — Dashboard composition contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.5 — Dashboard composition rebuild", () => {
  it("Dashboard hierarchy: snapshot → attention → activity", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /biz-hero|biz-snapshot|cmd-strip/);
    assert.match(dash, /attn|dash-attention/);
    assert.match(dash, /act|dash-activity/);
    assert.match(dash, /activity-tab/);
    assert.match(dash, /ops-rail|dash-context-line|context-rail/);
    assert.doesNotMatch(dash, /qa-matrix/);
  });

  it("no equal secondary KPI strip; secondary demoted to context line", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.doesNotMatch(dash, /metric-strip-secondary|variant="secondary"/);
    assert.doesNotMatch(dash, /MetricStrip/);
    assert.match(dash, /ops-rail|dash-context-line|context-rail/);
  });

  it("CSS defines ops center snapshot", () => {
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /\.biz-hero|\.biz-snapshot|\.cmd-strip/);
    assert.match(css, /\.empty-inline/);
    assert.match(css, /\.activity-tab/);
  });

  it("no developer/debug language on Dashboard", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.doesNotMatch(dash, /scoped|cashback_accounts|product_stocks|TZ Asia|server agregat|order KPI/i);
  });

  it("docs record Phase 12.5", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.5/,
    );
  });
});
