/**
 * Admin Phase 12.17 — Branches / Filiallar product reconstruction.
 * UI-only: no branch engine / API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.17 — Branches network console", () => {
  it("Filiallar IA: DetailDrawer + ConfirmDialog + CRM table", () => {
    const page = readFileSync(path.join(adminWeb, "pages/BranchesPage.tsx"), "utf8");
    assert.match(page, /DetailDrawer/);
    assert.match(page, /DrawerSection/);
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /title="Filiallar"/);
    assert.match(page, /\/api\/admin\/branches/);
    assert.match(page, /method:\s*"PATCH"/);
    assert.match(page, /<th>Filial<\/th>/);
    assert.match(page, /<th>Holat<\/th>/);
    assert.match(page, /<th>Manzil<\/th>/);
  });

  it("no invented create/delete; no mini inventory/orders tabs; secrets masked", () => {
    const page = readFileSync(path.join(adminWeb, "pages/BranchesPage.tsx"), "utf8");
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(page, /MASK|••••/);
    assert.doesNotMatch(page, /paymeKey:\s*branch\.paymeKey/);
    assert.doesNotMatch(page, /Filial qo‘shish|\+ Filial/);
    // Create/delete UI only when the secured backend route exists (Phase 13.10.1 added both).
    if (/method:\s*"POST"/.test(page)) assert.match(admin, /router\.post\("\/admin\/branches", /);
    if (/method:\s*"DELETE"/.test(page)) assert.match(admin, /router\.delete\("\/admin\/branches\/:id", /);
    assert.doesNotMatch(page, /softRequest/);
    assert.doesNotMatch(page, /id:\s*"inventory"|id:\s*"orders"|Tabs/);
    assert.doesNotMatch(page, /StatCard|Ko‘rish<\/button>|Ochish<\/button>/);
    assert.match(page, /Omborni ko‘rish|onOpenInventory/);
  });

  it("Phase 12.17 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.17/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.17/,
    );
  });
});
