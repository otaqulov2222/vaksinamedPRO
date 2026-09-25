/**
 * Admin Phase 12.12 / 12.12.1 — Orders page product reconstruction contracts.
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

describe("Admin Phase 12.12 — Orders operations console", () => {
  it("Orders uses DetailDrawer + FilterField + ConfirmDialog", () => {
    const page = readFileSync(path.join(adminWeb, "pages/OrdersPage.tsx"), "utf8");
    assert.match(page, /DetailDrawer/);
    assert.match(page, /DrawerSection/);
    assert.match(page, /FilterField/);
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /AdminPageHeader/);
    assert.match(page, /StatusLabelBadge/);
  });

  it("table columns prioritize Buyurtma / Mijoz / Filial / Holat / To‘lov / Summa / Vaqt", () => {
    const page = readFileSync(path.join(adminWeb, "pages/OrdersPage.tsx"), "utf8");
    assert.match(page, /<th>Buyurtma<\/th>/);
    assert.match(page, /<th>Mijoz<\/th>/);
    assert.match(page, /<th>Filial<\/th>/);
    assert.match(page, /<th>Holat<\/th>/);
    assert.match(page, /<th>To‘lov<\/th>/);
    assert.match(page, /Summa/);
    assert.match(page, /<th>Vaqt<\/th>/);
    assert.doesNotMatch(page, /<th>Tur<\/th>/);
    assert.doesNotMatch(page, /<th>Bron<\/th>/);
  });

  it("row click opens drawer; payment and fulfillment stay separate", () => {
    const page = readFileSync(path.join(adminWeb, "pages/OrdersPage.tsx"), "utf8");
    assert.match(page, /onClick=\{\(\) => void openOrder\(item\.id\)\}/);
    assert.match(page, /domain="fulfillment"/);
    assert.match(page, /domain="payment"/);
    assert.match(page, /domain="reservation"/);
    assert.doesNotMatch(page, /\/api\/orders\/[^"'`]*\/mark-paid/);
    assert.doesNotMatch(page, /Pul qaytarildi/);
  });

  it("preserves existing order APIs and capability gates", () => {
    const page = readFileSync(path.join(adminWeb, "pages/OrdersPage.tsx"), "utf8");
    assert.match(page, /\/api\/admin\/orders/);
    assert.match(page, /\/api\/admin\/orders\/\$\{id\}/);
    assert.match(page, /\/api\/orders\/\$\{selected\.id\}\/admin-cancel/);
    assert.match(page, /\/api\/orders\/\$\{id\}\/confirm-pos/);
    assert.match(page, /canCancel/);
    assert.match(page, /canConfirmPos/);
    assert.match(page, /canTransitionFulfillment/);
    assert.match(page, /CONTRACT_PENDING/);
    assert.match(page, /fulfillmentStatus/);
    assert.match(page, /paymentStatus/);
    assert.match(page, /reservationStatus/);
    assert.match(page, /createdFrom/);
    assert.match(page, /bron muddati tugagan/);
    assert.match(page, /Qayta urinish|ErrorState/);
    assert.match(page, /Yuklanmoqda|LoadingBlock/);
    assert.match(page, /isHqRole/);
  });

  it("compact empty state + control hierarchy (12.12.1)", () => {
    const page = readFileSync(path.join(adminWeb, "pages/OrdersPage.tsx"), "utf8");
    const css = readFileSync(path.join(adminWeb, "styles.css"), "utf8");
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    assert.match(page, /Buyurtmalar topilmadi/);
    assert.match(page, /Buyurtmalar hozircha mavjud emas/);
    assert.match(page, /Tanlangan mezonlar bo‘yicha buyurtmalar topilmadi/);
    assert.match(page, /Filtrlarni tozalash/);
    assert.match(page, /Qo‘shimcha filtrlar/);
    assert.match(page, /orders-date-group/);
    assert.match(page, /onSubmit=\{applySearch\}/);
    assert.match(page, /ta buyurtma/);
    assert.match(nav, /Buyurtmalarni kuzatish va holatini boshqarish/);
    assert.match(css, /\.orders-empty/);
    assert.match(css, /\.orders-controls-primary/);
    assert.doesNotMatch(page, /API_REQUIRED/);
    assert.doesNotMatch(page, /server agregat|server aggregate/i);
  });

  it("Phase 12.12 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.12/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.12|Orders/,
    );
  });
});
