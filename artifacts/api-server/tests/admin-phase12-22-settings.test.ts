/**
 * Admin Phase 12.22 — Settings product reconstruction.
 * UI-only: no settings engine / API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.22 — Settings honest console", () => {
  it("page uses real cashback rules read; no admin settings aggregate invent", () => {
    const page = readFileSync(path.join(adminWeb, "pages/SettingsPage.tsx"), "utf8");
    assert.match(page, /title="Sozlamalar"/);
    assert.match(page, /\/api\/cashback\/rules/);
    assert.match(page, /maxSpendPercent/);
    assert.match(page, /Faqat ko‘rish/);
    assert.doesNotMatch(page, /\/api\/admin\/settings/);
  });

  it("no invent save / toggles / secrets / fake system controls", () => {
    const page = readFileSync(path.join(adminWeb, "pages/SettingsPage.tsx"), "utf8");
    assert.doesNotMatch(page, /Saqlash|onSubmit|method:\s*[\"']PATCH|method:\s*[\"']POST/);
    assert.doesNotMatch(page, /type=\"checkbox\"|maintenanceMode|Redis|runWorkers|backupNow/i);
    assert.doesNotMatch(page, /payme.?secret|click.?secret|merchant.?secret|webhook.?secret/i);
    assert.doesNotMatch(page, /value=\{.*secret|password=/i);
    assert.doesNotMatch(page, /capability-grid|MetricStrip/);
  });

  it("admin users unavailable; sensitive chrome not primary", () => {
    const page = readFileSync(path.join(adminWeb, "pages/SettingsPage.tsx"), "utf8");
    assert.match(page, /Adminlar/);
    assert.doesNotMatch(page, /ADMIN_USER_MANAGEMENT\s*=\s*API_REQUIRED/);
    assert.doesNotMatch(page, />API_REQUIRED</);
  });

  it("Phase 12.22 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.22/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.22/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /ADMIN_USER_MANAGEMENT = API_REQUIRED/,
    );
  });
});
