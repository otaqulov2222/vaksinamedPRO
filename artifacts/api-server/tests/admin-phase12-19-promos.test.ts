/**
 * Admin Phase 12.19 — Promos / Aksiyalar product reconstruction.
 * UI-only: no promo engine / API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.19 — Promos marketing console", () => {
  it("Promos IA: DetailDrawer + dense table + read-only list", () => {
    const page = readFileSync(path.join(adminWeb, "pages/PromosPage.tsx"), "utf8");
    assert.match(page, /DetailDrawer/);
    assert.match(page, /DrawerSection/);
    assert.match(page, /title="Aksiyalar"/);
    assert.match(page, /\/api\/admin\/promos/);
    assert.match(page, /<th>Aksiya<\/th>/);
    assert.match(page, /<th>Holat<\/th>/);
    assert.doesNotMatch(page, /method:\s*"POST"|method:\s*"PATCH"|method:\s*"DELETE"/);
  });

  it("marketing honesty; no invent discount/KPI/CRUD", () => {
    const page = readFileSync(path.join(adminWeb, "pages/PromosPage.tsx"), "utf8");
    assert.match(page, /PROMO_MARKETING_ONLY/);
    assert.match(page, /Marketing|marketing|narx katalogda/i);
    assert.doesNotMatch(page, /discount applied|chegirma qo‘llandi|narx kamaytirildi/i);
    assert.doesNotMatch(page, /StatCard|stat-grid|Aksiya qo‘shish|\+ Aksiya/);
    assert.doesNotMatch(page, /10%|15%|20%|-50%|conversion|revenue generated/i);
    assert.doesNotMatch(page, /item\.price|item\.requirement/);
  });

  it("Phase 12.19 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.19/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.19/,
    );
  });
});
