/**
 * Admin Phase 12.21 — Audit logs product reconstruction.
 * UI-only: no audit engine / API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.21 — Audit investigation console", () => {
  it("uses real audit API + supported filters + pagination", () => {
    const page = readFileSync(path.join(adminWeb, "pages/AuditPage.tsx"), "utf8");
    assert.match(page, /title="Audit"/);
    assert.match(page, /\/api\/admin\/audit/);
    assert.match(page, /action|entity/);
    assert.match(page, /PaginationBar|hasMore|offset/);
    assert.match(page, /DetailDrawer/);
  });

  it("no invent KPI / charts / export / fake filters / JSON dump", () => {
    const page = readFileSync(path.join(adminWeb, "pages/AuditPage.tsx"), "utf8");
    assert.doesNotMatch(page, /MetricStrip|stat-grid|security.?score|risk.?level/i);
    assert.doesNotMatch(page, /recharts|<canvas|Chart\.js/);
    assert.doesNotMatch(page, />\s*(CSV|Excel|PDF|Eksport)\s*</);
    assert.doesNotMatch(page, /createdFrom|createdTo|branchId.*qs\.set|actorId/);
    assert.doesNotMatch(page, /JSON\.stringify\(row\.metadata/);
  });

  it("safe action fallback + client sensitive scrub", () => {
    const page = readFileSync(path.join(adminWeb, "pages/AuditPage.tsx"), "utf8");
    assert.match(page, /Amal: \$\{|Amal: `/);
    assert.match(page, /SENSITIVE_KEY|password\|otp\|token/);
    assert.match(page, /Noma'lum operator/);
    assert.match(page, /Audit qaydlari topilmadi|Audit ma'lumotlarini yuklab bo/);
  });

  it("Phase 12.21 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.21/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.21/,
    );
  });
});
