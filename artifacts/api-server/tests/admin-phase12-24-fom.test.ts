/**
 * Admin Phase 12.24 — FOM integration console.
 * UI-only: no FOM / inventory / cashback engine or API contract changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.24 — FOM honest console", () => {
  it("uses real FOM status API; preserves contract + writer honesty", () => {
    const page = readFileSync(path.join(adminWeb, "pages/FomPage.tsx"), "utf8");
    assert.match(page, /title="FOM"/);
    assert.match(page, /\/api\/integrations\/fom\/status/);
    assert.match(page, /inventoryWriter/);
    assert.match(page, /CONTRACT_PENDING/);
    assert.match(page, /fomPosContract|FOM POS/);
    assert.match(page, /O‘chirilgan|O'chirilgan/);
  });

  it("no invent KPI / probe button / secrets / connected chrome", () => {
    const page = readFileSync(path.join(adminWeb, "pages/FomPage.tsx"), "utf8");
    assert.doesNotMatch(page, /MetricStrip|stat-grid/);
    assert.doesNotMatch(page, /Connected|FOM.*Active|Active.*FOM/i);
    assert.doesNotMatch(page, /FOM_WEBHOOK_SECRET\s*=|passwordHash|Bearer\s+[A-Za-z0-9._-]{12,}/);
    assert.doesNotMatch(page, /successRate|syncPercent|lastSync|Products synced/i);
    assert.doesNotMatch(page, /<button[^>]*>\s*Ulanishni tekshirish\s*</);
    assert.doesNotMatch(page, /<button[^>]*>\s*Sync now\s*</i);
  });

  it("confirm-pos commercial identity remains ORDER-oriented", () => {
    const page = readFileSync(path.join(adminWeb, "pages/FomPage.tsx"), "utf8");
    assert.match(page, /confirmPos|commercialIdentity/);
    assert.match(page, /ORDER/);
  });

  it("Phase 12.24 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.24/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.24/,
    );
  });
});
