/**
 * Admin Phase 12.15 — Inventory / Stock product reconstruction.
 * UI-only: no inventory engine / API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.15 — Inventory stock console", () => {
  it("Ombor IA: DetailDrawer + ConfirmDialog + Fizik/Band/Mavjud", () => {
    const page = readFileSync(path.join(adminWeb, "pages/InventoryPage.tsx"), "utf8");
    assert.match(page, /DetailDrawer/);
    assert.match(page, /DrawerSection/);
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /stockAxisShort\("physical"\)|Fizik/);
    assert.match(page, /stockAxisShort\("reserved"\)|Band/);
    assert.match(page, /stockAxisShort\("available"\)|Mavjud/);
    assert.match(page, /title="Ombor"/);
  });

  it("adjust + expire-due preserved; no StatCard wall; Available≤0 only", () => {
    const page = readFileSync(path.join(adminWeb, "pages/InventoryPage.tsx"), "utf8");
    assert.match(page, /\/api\/admin\/inventory\/adjust/);
    assert.match(page, /physicalDelta/);
    assert.match(page, /\/api\/admin\/inventory\/expire-due/);
    assert.match(page, /Available ≤ 0|Available<=0|Available≤0/);
    assert.match(page, /Mavjud emas/);
    assert.doesNotMatch(page, /StatCard/);
    assert.doesNotMatch(page, /pageTotals|inventory value|turnover|stock health/i);
    assert.doesNotMatch(page, /low stock < 10|threshold\s*=\s*10/i);
    assert.doesNotMatch(page, /setAvailable|availableQuantity\s*=|UPDATE\s+.*available/i);
    assert.match(page, /inventory:adjust/);
  });

  it("no fake Barchasi branch aggregate chrome", () => {
    const page = readFileSync(path.join(adminWeb, "pages/InventoryPage.tsx"), "utf8");
    assert.match(page, /Filial tanlang/);
    assert.match(page, /Yig‘ma qoldiq yo‘q|yig‘ma/i);
    assert.doesNotMatch(page, /<option value="">Barchasi<\/option>\s*\{props\.branches/);
  });

  it("Phase 12.15 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.15/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.15/,
    );
  });
});
