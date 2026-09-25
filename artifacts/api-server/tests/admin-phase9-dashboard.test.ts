/**
 * Admin Phase 9 — operational dashboard filters + inventory snapshot.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");

describe("Admin Phase 9 — dashboard filters", () => {
  it("dashboard API accepts createdFrom/createdTo and branchId server-side", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    const block = admin.slice(admin.indexOf('router.get("/admin/dashboard"'));
    assert.match(block, /createdFrom/);
    assert.match(block, /createdTo/);
    assert.match(block, /resolveStaffBranchFilter/);
    assert.match(block, /tashkentBusinessDayUtcRange/);
    assert.match(block, /capabilities:\s*\{[\s\S]*dateFilter:\s*true/);
    assert.match(block, /branchFilter:\s*true/);
    assert.match(block, /inventoryThreshold:\s*false/);
  });

  it("inventory snapshot uses product_stocks without inventing threshold", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /zeroAvailable/);
    assert.match(admin, /Threshold yo.q|threshold/i);
    assert.match(admin, /inventorySnapshotRequiresBranch:\s*true/);
  });

  it("Dashboard UI sends filters to API; does not client-aggregate KPIs", () => {
    const dash = readFileSync(path.join(adminWeb, "pages/DashboardPage.tsx"), "utf8");
    assert.match(dash, /createdFrom/);
    assert.match(dash, /branchId/);
    assert.match(dash, /\/api\/admin\/dashboard/);
    assert.doesNotMatch(dash, /reduce\(\(sum|orders\.filter\(|fakeRevenue/);
    assert.match(dash, /onOpenOrder/);
  });

  it("Admin user management remains unavailable (honest UI)", () => {
    const settings = readFileSync(path.join(adminWeb, "pages/SettingsPage.tsx"), "utf8");
    assert.match(settings, /Adminlar/);
    const access = readFileSync(path.join(adminWeb, "pages/AdminAccessPage.tsx"), "utf8");
    assert.match(access, /Hali ulanmagan|operatorCapabilityLabel\("API_REQUIRED"\)/);
    assert.doesNotMatch(access, /ADMIN_USER_MANAGEMENT\s*=\s*API_REQUIRED/);
  });

  it("status doc records Phase 9", () => {
    const doc = readFileSync(path.join(root, "../../docs/ADMIN_IMPLEMENTATION_STATUS.md"), "utf8");
    assert.match(doc, /Phase 9/);
    assert.match(doc, /Date filter/);
    assert.match(doc, /ADMIN_USER_MANAGEMENT = API_REQUIRED/);
  });
});
