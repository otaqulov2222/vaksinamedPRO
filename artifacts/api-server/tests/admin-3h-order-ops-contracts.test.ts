import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Batch 3H admin order operations contracts", () => {
  it("admin orders list is paginated and branch-scoped via resolveStaffBranchFilter", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/orders/);
    assert.match(admin, /resolveStaffBranchFilter/);
    assert.match(admin, /ADMIN_ORDERS_MAX_LIMIT\s*=\s*50/);
    assert.match(admin, /\.limit\(limit\)/);
    assert.match(admin, /\.offset\(offset\)/);
    assert.match(admin, /\/admin\/orders\/:id/);
    assert.match(admin, /assertBranchScope/);
  });

  it("staff transitions audit and confirm route exists; admin-cancel uses orders:cancel", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /auditLog/);
    assert.match(orders, /order\.transition\./);
    assert.match(orders, /\/orders\/:id\/confirm"/);
    assert.match(orders, /\/orders\/:id\/admin-cancel/);
    assert.match(orders, /orders:cancel/);
    assert.match(orders, /paymentRefundRequired/);
    assert.match(orders, /assertBranchScope/);
  });

  it("admin logout endpoint exists and admin-web calls it", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /\/admin\/logout/);
    assert.match(admin, /revokeSessionFromToken/);
    const ui = readFileSync(path.join(root, "../admin-web/src/App.tsx"), "utf8");
    assert.match(ui, /\/api\/admin\/logout/);
    assert.match(ui, /async function logout|void logout/);
  });

  it("admin UI shows P5 axes and does not invent PSP refund success", () => {
    const ui = readFileSync(path.join(root, "../admin-web/src/pages/OrdersPage.tsx"), "utf8");
    const app = readFileSync(path.join(root, "../admin-web/src/App.tsx"), "utf8");
    assert.match(ui, /fulfillmentStatus/);
    assert.match(ui, /paymentStatus/);
    assert.match(ui, /reservationStatus/);
    assert.match(ui, /CONTRACT_PENDING/);
    assert.match(app, /softRequest/);
    assert.doesNotMatch(ui, /Pul qaytarildi/);
  });

  it("payment remains separate from generic mark-paid button", () => {
    const ui = readFileSync(path.join(root, "../admin-web/src/pages/OrdersPage.tsx"), "utf8");
    assert.doesNotMatch(ui, /\/api\/orders\/[^"'`]*\/mark-paid/);
    assert.doesNotMatch(ui, /\bMark paid\b/);
    assert.doesNotMatch(ui, /orderAction\([^)]*["']PAID["']/);
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /toPayment: toFulfillment === "COMPLETED"/);
    assert.match(orders, /paymentRefundRequired/);
  });
});
