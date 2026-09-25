/**
 * Admin Phase 11 — deep module UX contracts (no business-logic changes).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 11 — deep operator UX", () => {
  it("shared ConfirmDialog + DetailDrawer exist", () => {
    const ui = readFileSync(path.join(adminWeb, "ui.tsx"), "utf8");
    assert.match(ui, /export function ConfirmDialog/);
    assert.match(ui, /export function DetailDrawer/);
    assert.match(ui, /export function Tabs/);
    assert.match(ui, /export function FeedbackBanner/);
  });

  it("Filiallar uses DetailDrawer; secrets stay masked", () => {
    const page = readFileSync(path.join(adminWeb, "pages/BranchesPage.tsx"), "utf8");
    assert.match(page, /crm-controls|FilterBar/);
    assert.match(page, /DetailDrawer/);
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /MASK|••••/);
    assert.doesNotMatch(page, /paymeKey:\s*branch\.paymeKey/);
  });

  it("Ombor uses Available<=0 only; ConfirmDialog for adjust", () => {
    const page = readFileSync(path.join(adminWeb, "pages/InventoryPage.tsx"), "utf8");
    assert.match(page, /Available ≤ 0|Available<=0|Available≤0/);
    assert.match(page, /ConfirmDialog/);
    assert.doesNotMatch(page, /low stock < 10|threshold\s*=\s*10/i);
    assert.match(page, /\/api\/admin\/inventory\/adjust/);
  });

  it("Orders cancel uses ConfirmDialog not only window.confirm", () => {
    const page = readFileSync(path.join(adminWeb, "pages/OrdersPage.tsx"), "utf8");
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /confirmCancel/);
  });

  it("POS shows step chrome without changing engine paths", () => {
    const pos = readFileSync(path.join(adminWeb, "PosTerminal.tsx"), "utf8");
    assert.match(pos, /pos-steps/);
    assert.match(pos, /1\. Mijoz/);
    assert.match(pos, /\/api\/pos\//);
  });

  it("Payments marks provider refund CONTRACT_PENDING", () => {
    const page = readFileSync(path.join(adminWeb, "pages/PaymentsPage.tsx"), "utf8");
    assert.match(page, /CONTRACT_PENDING/);
    assert.match(page, /ConfirmDialog/);
  });

  it("Phase 11 audit + status docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_PHASE_11_MODULE_AUDIT.md"), "utf8"),
      /Filiallar/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 11/,
    );
  });
});
