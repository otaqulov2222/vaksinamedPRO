/**
 * Admin Phase 10 — design system / shell polish (source contracts, no fake data).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 10 — UI design system", () => {
  it("shared ui exports design-system components", () => {
    const ui = readFileSync(path.join(adminWeb, "ui.tsx"), "utf8");
    for (const name of [
      "AdminPageHeader",
      "FilterBar",
      "StatCard",
      "StatusBadge",
      "DataTable",
      "PaginationBar",
      "EmptyState",
      "ErrorState",
      "LoadingBlock",
      "SectionCard",
    ]) {
      assert.match(ui, new RegExp(`export function ${name}`));
    }
  });

  it("money formatter uses space thousands + so‘m", () => {
    const api = readFileSync(path.join(adminWeb, "api.ts"), "utf8");
    assert.match(api, /export function money/);
    assert.match(api, /space thousands|125 500/);
    assert.match(api, /so.m/);
  });

  it("shell has collapsible sidebar and permission-aware nav icons", () => {
    const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
    assert.match(app, /sidebarCollapsed|sidebar-collapsed/);
    assert.match(app, /NAV_ICONS/);
    assert.match(app, /aria-current/);
    assert.match(app, /onOpenInventory/);
  });

  it("Dashboard uses command strip hierarchy + compact toolbar; no fake trends", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /biz-snapshot|cmd-strip|cmd-hero/);
    assert.match(dash, /dash-toolbar|FilterField/);
    assert.doesNotMatch(dash, /trendPercent|fakeTrend|\+12%/);
  });

  it("docs exist for audit + design system + Phase 10 status", () => {
    assert.match(readFileSync(path.join(docs, "ADMIN_UI_UX_AUDIT.md"), "utf8"), /Phase 10/);
    assert.match(readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"), /--vm-primary/);
    assert.match(readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"), /Phase 10/);
  });
});
