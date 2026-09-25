/**
 * Admin Phase 12.3 — enterprise product UX contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.3 — enterprise product UX", () => {
  it("nav IA uses product groups", () => {
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    assert.match(nav, /Boshqaruv|Umumiy|overview/);
    assert.match(nav, /Ombor|Katalog|Savdo/);
    assert.match(nav, /groupLabelForTab/);
  });

  it("shell breadcrumb includes group context", () => {
    const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
    assert.match(app, /groupLabelForTab/);
    assert.match(app, /crumb-page|breadcrumb/);
  });

  it("Dashboard uses command-center ops composition", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /biz-hero|ops-rail|attn/);
    assert.match(dash, /Ombor|E’tibor|E'tibor/);
    assert.doesNotMatch(dash, /order KPI scoped|cashback_accounts|server agregat/);
  });

  it("Reports separates AVAILABLE vs API_REQUIRED", () => {
    const page = readFileSync(path.join(adminWeb, "pages/ReportsPage.tsx"), "utf8");
    assert.match(page, /Hali ulanmagan|Tez orada|AVAILABLE|API_REQUIRED/);
  });

  it("docs record Phase 12.3", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.3/,
    );
  });
});
