/**
 * Phase 12.26 — Production gap matrix invariants.
 * Documentation + gate honesty only — no feature invent.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(apiRoot, "../..");
const matrix = path.join(repo, "docs/PRODUCTION_GAP_MATRIX.md");

describe("Phase 12.26 — production gap matrix", () => {
  it("authoritative matrix exists with executive NOT READY", () => {
    assert.ok(existsSync(matrix));
    const doc = readFileSync(matrix, "utf8");
    assert.match(doc, /\*\*PRODUCTION READINESS:\s*NOT READY\*\*/);
    assert.match(doc, /## P0 — Production Blockers/);
    assert.match(doc, /## P1 — Required Before Production/);
    assert.match(doc, /## External \/ Contract Pending/);
    assert.match(doc, /## Operations Required/);
    assert.match(doc, /## Not Supported \/ Intentionally Disabled/);
    assert.match(doc, /## Evidence Matrix/);
    assert.match(doc, /MANAGED_POSTGRES|Managed PostgreSQL backup|PITR/);
    assert.match(doc, /FOM_INVENTORY_WRITER|inventory writer/);
    assert.match(doc, /CONTRACT_PENDING/);
    assert.doesNotMatch(doc, /\b9[0-9]%\b|\b9\/10\b|\b98%\b/);
  });

  it("production safety gates remain closed in code", () => {
    const fom = readFileSync(path.join(apiRoot, "src/lib/fomAdapter.ts"), "utf8");
    assert.match(fom, /FOM_INVENTORY_WRITER_ENABLED\s*=\s*false/);

    const integ = readFileSync(path.join(apiRoot, "src/routes/integrations.ts"), "utf8");
    assert.match(integ, /status:\s*"CONTRACT_PENDING"/);
    assert.match(integ, /fomPosContract:\s*"CONTRACT_PENDING"/);
    assert.match(integ, /confirmPos:\s*"ORDER"|confirmPos.*ORDER/);

    const delivery = readFileSync(path.join(apiRoot, "src/lib/deliveryAdapters.ts"), "utf8");
    assert.match(delivery, /CONTRACT_PENDING/);

    const redis = readFileSync(path.join(apiRoot, "src/lib/redis.ts"), "utf8");
    assert.match(redis, /REDIS_URL/);
    assert.match(redis, /production\/staging requires REDIS_URL|fail.?closed|must have REDIS_URL/i);
  });

  it("Admin honesty modules still point at real limited APIs", () => {
    const adminWeb = path.join(repo, "artifacts/admin-web/src");
    const fomPage = readFileSync(path.join(adminWeb, "pages/FomPage.tsx"), "utf8");
    assert.match(fomPage, /\/api\/integrations\/fom\/status/);
    assert.doesNotMatch(fomPage, /<button[^>]*>\s*Ulanishni tekshirish\s*</);

    const settings = readFileSync(path.join(adminWeb, "pages/SettingsPage.tsx"), "utf8");
    assert.doesNotMatch(settings, />\s*Saqlash\s*</);

    const admins = readFileSync(path.join(adminWeb, "pages/AdminAccessPage.tsx"), "utf8");
    assert.match(admins, /operatorCapabilityLabel\("API_REQUIRED"\)/);

    const icons = readFileSync(path.join(adminWeb, "navIcons.tsx"), "utf8");
    assert.match(icons, /from "lucide-react"/);
    assert.match(icons, /LayoutDashboard/);
  });
});
