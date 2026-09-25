/**
 * Admin Phase 12.16 — Catalog product management reconstruction.
 * UI-only: no product engine / API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.16 — Catalog product console", () => {
  it("Catalog IA: DetailDrawer + master-data table + create/edit APIs", () => {
    const page = readFileSync(path.join(adminWeb, "pages/CatalogPage.tsx"), "utf8");
    assert.match(page, /DetailDrawer/);
    assert.match(page, /DrawerSection/);
    assert.match(page, /title="Mahsulotlar"/);
    assert.match(page, /\/api\/admin\/products/);
    assert.match(page, /method:\s*"POST"/);
    assert.match(page, /method:\s*"PATCH"/);
    assert.match(page, /products:manage/);
    assert.match(page, /<th>Mahsulot<\/th>/);
    assert.match(page, /<th>Kategoriya<\/th>/);
    assert.match(page, /SKU/);
    assert.match(page, /Narx/);
  });

  it("Catalog ≠ Inventory: no stock-axis table columns; no StatCard wall", () => {
    const page = readFileSync(path.join(adminWeb, "pages/CatalogPage.tsx"), "utf8");
    assert.doesNotMatch(page, /<th[^>]*>Fizik<\/th>/);
    assert.doesNotMatch(page, /<th[^>]*>Band<\/th>/);
    assert.doesNotMatch(page, /<th[^>]*>Mavjud<\/th>/);
    assert.doesNotMatch(page, /StatCard|pageTotals|oldPrice|chegirma|discount/i);
    assert.match(page, /Ombor holatini ko‘rish|onOpenInventory/);
    assert.match(page, /Mahsulotlar topilmadi/);
  });

  it("Phase 12.16 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.16/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.16/,
    );
  });
});
