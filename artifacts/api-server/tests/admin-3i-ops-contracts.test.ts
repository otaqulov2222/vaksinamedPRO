import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adminCustomerIdentity,
  sanitizeAdminOrderSearch,
  tashkentBusinessDayUtcRange,
} from "../src/lib/adminOrderOps";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Batch 3I admin ops polish contracts", () => {
  it("admin orders search joins customer + Tashkent date bounds + capability canCancel", () => {
    const admin = readFileSync(path.join(root, "src/routes/admin.ts"), "utf8");
    assert.match(admin, /sanitizeAdminOrderSearch/);
    assert.match(admin, /tashkentBusinessDayUtcRange/);
    assert.match(admin, /ilike\(customers\.phone/);
    assert.match(admin, /adminCustomerIdentity/);
    assert.match(admin, /adminHasPermission\(user,\s*"orders:cancel"\)/);
    assert.match(admin, /canTransitionFulfillment/);
    assert.match(admin, /reservationExpiryAutoCancel/);
    assert.doesNotMatch(admin, /passwordHash/);
  });

  it("adminCustomerIdentity strips to id/name/phone only", () => {
    const out = adminCustomerIdentity({
      id: 7,
      firstName: "Ali",
      lastName: "Vali",
      phone: "+99890",
    });
    assert.deepEqual(out, { id: 7, firstName: "Ali", lastName: "Vali", phone: "+99890" });
    const list = adminCustomerIdentity({
      id: 7,
      firstName: "Ali",
      lastName: "Vali",
      phone: "+99890",
    }, { includePhone: false });
    assert.deepEqual(list, { id: 7, firstName: "Ali", lastName: "Vali" });
  });

  it("sanitizeAdminOrderSearch strips LIKE metacharacters", () => {
    assert.equal(sanitizeAdminOrderSearch("  ab%_c\\  "), "abc");
    assert.equal(sanitizeAdminOrderSearch("x".repeat(100)).length, 64);
  });

  it("tashkentBusinessDayUtcRange uses UTC+5 exclusive end", () => {
    const r = tashkentBusinessDayUtcRange("2026-09-22");
    assert.ok(r);
    // 2026-09-22 00:00 Tashkent = 2026-09-21 19:00 UTC
    assert.equal(r!.start.toISOString(), "2026-09-21T19:00:00.000Z");
    assert.equal(r!.endExclusive.toISOString(), "2026-09-22T19:00:00.000Z");
    assert.equal(tashkentBusinessDayUtcRange("bad"), null);
  });

  it("admin UI uses capabilities for cancel and honest loading/error/retry", () => {
    const ui = readFileSync(path.join(root, "../admin-web/src/pages/OrdersPage.tsx"), "utf8");
    const app = readFileSync(path.join(root, "../admin-web/src/App.tsx"), "utf8");
    assert.match(ui, /capabilities|canCancel/);
    assert.match(ui, /canCancel/);
    assert.match(ui, /Qayta urinish/);
    assert.match(ui, /Yuklanmoqda/);
    assert.match(ui, /createdFrom/);
    assert.match(ui, /bron muddati tugagan/);
    assert.match(app, /\/api\/admin\/logout/);
    assert.doesNotMatch(ui, /Pul qaytarildi/);
    assert.doesNotMatch(ui, /refund completed/i);
  });
});
