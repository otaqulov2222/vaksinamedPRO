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
    assert.match(dash, /className="dash-overview"/);
    assert.match(dash, /attn|dash-attention/);
    assert.match(dash, /act|dash-activity/);
    assert.match(dash, /dash-metrics/);
    assert.doesNotMatch(dash, /qa-matrix/);
  });

  it("no equal secondary KPI strip; secondary metrics live in the board foot", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.doesNotMatch(dash, /metric-strip-secondary|variant="secondary"/);
    assert.doesNotMatch(dash, /MetricStrip/);
    assert.match(dash, /dash-metrics/);
  });

  it("CSS defines ops center snapshot", () => {
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    assert.match(css, /\.dash-hero \{/);
    assert.match(css, /\.dash-empty \{/);
    assert.match(css, /\.dash-feed \{/);
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
