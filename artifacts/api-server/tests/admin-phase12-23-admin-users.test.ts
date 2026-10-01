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
  it("admin.ts has no admin-user routes; management lives only in the rbac:manage router (Phase 13.16)", () => {
    const admin = readFileSync(adminRoutes, "utf8");
    assert.doesNotMatch(admin, /router\.(get|post|patch|put|delete)\("\/admin\/users/);
    assert.doesNotMatch(admin, /router\.(post|patch)\("\/admin\/roles/);
    const users = readFileSync(path.join(root, "src/routes/adminUsers.ts"), "utf8");
    assert.match(users, /RBAC_MANAGE_PERMISSION = "rbac:manage"/);
    assert.doesNotMatch(users, /router\.(post|patch|put|delete)\("\/admin\/(roles|rbac|permissions)/);
    assert.doesNotMatch(users, /router\.delete\(/);
  });

  it("AdminAccessPage: real management over /api/admin/users, honest gaps, session context, no secrets", () => {
    const page = readFileSync(path.join(adminWeb, "pages/AdminAccessPage.tsx"), "utf8");
    assert.match(page, /title="Adminlar"/);
    assert.match(page, /operatorCapabilityLabel\("API_REQUIRED"\)/);
    assert.match(page, /Hozir ishlayotgan/);
    assert.match(page, /Joriy sessiya/);
    // 13.16: create / edit / status exist server-side now; hard delete and invite still do not.
    assert.doesNotMatch(page, /O‘chirish|Deactivate|Invite|method: "DELETE"/);
    assert.match(page, /\/api\/admin\/users/);
    assert.doesNotMatch(page, /passwordHash|accessToken|refreshToken|tokenHash/i);
    // The password is a write-only form field (show/hide), never rendered from data.
    assert.equal((page.match(/type=\{showPassword \? "text" : "password"\}/g) || []).length, 1);
    assert.match(page, /autoComplete="new-password"/);
    assert.doesNotMatch(page, /\{[a-zA-Z.?]*user\.password|\{detail\.[a-z.]*password/i);
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
