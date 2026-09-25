/**
 * Admin Phase 12.20 — Reports / Hisobotlar product reconstruction.
 * UI-only: no reporting engine / API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.20 — Reports snapshot console", () => {
  it("Reports uses dashboard API + Hali ulanmagan deep reports", () => {
    const page = readFileSync(path.join(adminWeb, "pages/ReportsPage.tsx"), "utf8");
    assert.match(page, /title="Hisobotlar"/);
    assert.match(page, /\/api\/admin\/dashboard/);
    assert.match(page, /createdFrom|createdTo/);
    assert.match(page, /Hali ulanmagan|Tez orada|AVAILABLE|API_REQUIRED/);
    assert.match(page, /Ko‘rsatkich/);
  });

  it("no invent AOV / completion % / chart libs / export action buttons", () => {
    const page = readFileSync(path.join(adminWeb, "pages/ReportsPage.tsx"), "utf8");
    assert.doesNotMatch(page, /avgTicket|completionRate|O‘rtacha chek|Yakunlanish foizi/);
    assert.doesNotMatch(page, /recharts|Chart\.js|<canvas|new Chart/i);
    assert.doesNotMatch(page, />\s*(CSV|Excel|PDF|Eksport)\s*</);
    assert.doesNotMatch(page, /MetricStrip|stat-grid|capability-grid/);
  });

  it("Phase 12.20 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.20/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.20/,
    );
  });
});
