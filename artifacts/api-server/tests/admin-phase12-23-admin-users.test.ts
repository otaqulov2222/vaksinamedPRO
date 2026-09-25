/**
 * Admin Phase 12.23 — Admin users & RBAC access boundary.
 * UI-only: no RBAC / admin-user API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");
const adminRoutes = path.join(root, "src/routes/admin.ts");

describe("Admin Phase 12.23 — Admin access boundary", () => {
  it("no admin-user management routes exist", () => {
    const admin = readFileSync(adminRoutes, "utf8");
    assert.doesNotMatch(admin, /router\.(get|post|patch|put|delete)\("\/admin\/users/);
    assert.doesNotMatch(admin, /router\.(post|patch)\("\/admin\/roles/);
  });

  it("AdminAccessPage is honest unavailable management + session read-only", () => {
    const page = readFileSync(path.join(adminWeb, "pages/AdminAccessPage.tsx"), "utf8");
    assert.match(page, /title="Adminlar va ruxsatlar"/);
    assert.match(page, /operatorCapabilityLabel\("API_REQUIRED"\)/);
    assert.match(page, /Hozir ishlayotgan/);
    assert.match(page, /Joriy sessiya/);
    assert.doesNotMatch(page, /Yaratish|Saqlash|O‘chirish|Deactivate|Invite/);
    assert.doesNotMatch(page, /\/api\/admin\/users/);
    assert.doesNotMatch(page, /password|passwordHash|accessToken|refreshToken/i);
    assert.doesNotMatch(page, /ADMIN_USER_MANAGEMENT\s*=\s*API_REQUIRED/);
  });

  it("nav wires Adminlar under Tizim without inventing permissions", () => {
    const nav = readFileSync(path.join(adminWeb, "nav.ts"), "utf8");
    assert.match(nav, /id:\s*"admins"/);
    assert.match(nav, /hqOnly:\s*true/);
    assert.doesNotMatch(nav, /users:manage|admin:manage|settings:manage/);
    const app = readFileSync(path.join(adminWeb, "App.tsx"), "utf8");
    assert.match(app, /AdminAccessPage/);
    assert.match(app, /tab === "admins"/);
  });

  it("Phase 12.23 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.23/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.23/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /ADMIN_USER_MANAGEMENT = API_REQUIRED/,
    );
  });
});
