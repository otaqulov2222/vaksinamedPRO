/**
 * Admin Phase 12.14 — Payments product reconstruction.
 * UI-only: no payment engine / API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.14 — Payments operations console", () => {
  it("Payments uses DetailDrawer + ConfirmDialog + StatusLabelBadge", () => {
    const page = readFileSync(path.join(adminWeb, "pages/PaymentsPage.tsx"), "utf8");
    assert.match(page, /DetailDrawer/);
    assert.match(page, /DrawerSection/);
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /StatusLabelBadge/);
    assert.match(page, /\/api\/admin\/payments/);
    assert.match(page, /\/api\/admin\/payments\/intents/);
  });

  it("provider refund honesty + no secret chrome", () => {
    const page = readFileSync(path.join(adminWeb, "pages/PaymentsPage.tsx"), "utf8");
    assert.match(page, /CONTRACT_PENDING/);
    assert.match(page, /payments:manage/);
    assert.match(page, /refundableAmount/);
    assert.doesNotMatch(page, /paymeKey|clickSecret|webhook secret/i);
    assert.doesNotMatch(page, /merchant key|API secret/i);
    assert.doesNotMatch(page, /StatCard/);
  });

  it("operator table hierarchy without raw id/provider chrome", () => {
    const page = readFileSync(path.join(adminWeb, "pages/PaymentsPage.tsx"), "utf8");
    assert.match(page, /<th>Buyurtma<\/th>/);
    assert.match(page, /<th>Usul<\/th>/);
    assert.match(page, /<th>Holat<\/th>/);
    assert.match(page, /Summa/);
    assert.match(page, /To‘lovlar topilmadi/);
    assert.doesNotMatch(page, /<th>Tranzaksiya<\/th>/);
    assert.doesNotMatch(page, /<th>Intent<\/th>/);
    assert.doesNotMatch(page, /Filial ID/);
  });

  it("Phase 12.14 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.14/,
    );
  });
});
