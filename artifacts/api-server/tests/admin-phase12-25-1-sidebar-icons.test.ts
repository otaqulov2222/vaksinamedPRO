/**
 * Admin Phase 12.25.1 — Sidebar lucide icon system.
 * UI-only; navigation logic / routes / RBAC unchanged.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const pkg = path.resolve(root, "../admin-web/package.json");

describe("Admin Phase 12.25.1 — sidebar icons", () => {
  it("uses lucide-react only; no Unicode NAV_ICONS map", () => {
    const packageJson = readFileSync(pkg, "utf8");
    assert.match(packageJson, /"lucide-react"/);
    const icons = readFileSync(path.join(adminWeb, "navIcons.tsx"), "utf8");
    assert.match(icons, /from "lucide-react"/);
    assert.match(icons, /LayoutDashboard/);
    assert.match(icons, /MonitorSmartphone/);
    assert.match(icons, /ShoppingBag/);
    assert.match(icons, /CreditCard/);
    assert.match(icons, /Warehouse/);
    assert.match(icons, /PackageSearch/);
    assert.match(icons, /BadgePercent/);
    assert.match(icons, /Users/);
    assert.match(icons, /WalletCards/);
    assert.match(icons, /Star/);
    assert.match(icons, /Store/);
    assert.match(icons, /Truck/);
    assert.match(icons, /ChartNoAxesCombined/);
    assert.match(icons, /ClipboardCheck/);
    assert.match(icons, /Cable/);
    assert.match(icons, /ShieldUser/);
    assert.match(icons, /Settings2/);
    assert.match(icons, /LogOut/);
    assert.doesNotMatch(icons, /▣|☰|☺|₽/);
  });

  it("every nav destination has an icon; IA / permissions unchanged", () => {
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    const icons = readFileSync(path.join(adminWeb, "navIcons.tsx"), "utf8");
    const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
    const ids = [
      "dashboard", "kassa", "orders", "payments", "inventory", "products",
      "promos", "customers", "cashback", "ratings", "branches", "delivery",
      "reports", "audit", "fom", "admins", "settings",
    ];
    for (const id of ids) {
      assert.match(nav, new RegExp(`id:\\s*"${id}"`));
      assert.match(icons, new RegExp(`${id}:\\s*[A-Z]`));
    }
    assert.match(nav, /permission:\s*"dashboard:read"/);
    assert.match(nav, /hqOnly:\s*true/);
    assert.match(app, /from "\.\/navIcons"/);
    assert.match(app, /NAV_ICONS\[item\.id\]/);
    assert.match(app, /LOGOUT_ICON/);
    assert.doesNotMatch(nav, /NAV_ICONS/);
  });
});
