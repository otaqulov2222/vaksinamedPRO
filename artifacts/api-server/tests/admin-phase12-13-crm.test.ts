/**
 * Admin Phase 12.13 — Customers / Cashback / Ratings product reconstruction.
 * UI-only: no business-logic / API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.13 — Customers / Cashback / Ratings", () => {
  it("Customers: dense table + DetailDrawer; cashbackBalance SoT; no balance invent", () => {
    const page = readFileSync(path.join(adminWeb, "pages/CustomersPage.tsx"), "utf8");
    assert.match(page, /DetailDrawer/);
    assert.match(page, /DrawerSection/);
    assert.match(page, /cashbackBalance/);
    assert.match(page, /phoneMasked/);
    assert.match(page, /CUSTOMER_PAGE|limit.*25/);
    assert.match(page, /StatusLabelBadge/);
    assert.match(page, /crm-row/);
    assert.match(page, /Mijozlar topilmadi/);
    assert.doesNotMatch(page, /money\(item\.balance\)/);
    assert.doesNotMatch(page, /Korreksiya OPEN/);
    assert.doesNotMatch(page, /cashback_accounts/);
  });

  it("Cashback: liability overview + drawer ledger; no sourceKey / grant / adjust UI", () => {
    const page = readFileSync(path.join(adminWeb, "pages/CashbackPage.tsx"), "utf8");
    assert.match(page, /DetailDrawer/);
    assert.match(page, /MetricStrip/);
    assert.match(page, /cashbackBalance/);
    assert.match(page, /cashback-history/);
    assert.match(page, /StatusLabelBadge/);
    assert.match(page, /Jami cashback majburiyati|Cashback majburiyati/);
    assert.match(page, /Cashback operatsiyalari topilmadi|Cashback tarixi/);
    assert.doesNotMatch(page, /sourceKey/);
    assert.doesNotMatch(page, /cashback.?correct|grant cashback|adjust balance|manual.?earn/i);
    assert.doesNotMatch(page, /cashback_accounts/);
  });

  it("Ratings: table + drawer; no fake average KPI; no customerId invent", () => {
    const page = readFileSync(path.join(adminWeb, "pages/RatingsPage.tsx"), "utf8");
    assert.match(page, /DetailDrawer/);
    assert.match(page, /\/api\/admin\/ratings/);
    assert.match(page, /Baholar topilmadi/);
    assert.match(page, /isHqRole/);
    assert.doesNotMatch(page, /Sahifa o‘rtachasi|pageAverage/);
    assert.doesNotMatch(page, /customerId/);
    assert.doesNotMatch(page, /Server filtri/);
    assert.doesNotMatch(page, /sentiment|AI summary|priority/i);
  });

  it("Phase 12.13 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.13/,
    );
  });
});
