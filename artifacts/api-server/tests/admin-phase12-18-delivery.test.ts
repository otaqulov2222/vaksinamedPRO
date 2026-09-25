/**
 * Admin Phase 12.18 — Delivery / Yetkazib berish product reconstruction.
 * UI-only: no delivery engine / API / DB changes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.18 — Delivery operations console", () => {
  it("Delivery IA: DetailDrawer + ConfirmDialog + server list filters", () => {
    const page = readFileSync(path.join(adminWeb, "pages/DeliveryPage.tsx"), "utf8");
    assert.match(page, /DetailDrawer/);
    assert.match(page, /DrawerSection/);
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /title="Yetkazib berish"/);
    assert.match(page, /\/api\/admin\/deliveries/);
    assert.match(page, /\/api\/deliveries\/\$\{.*\}\/assign/);
    assert.match(page, /\/api\/deliveries\/\$\{.*\}\/status/);
    assert.match(page, /\/api\/deliveries\/\$\{.*\}\/external\/sync/);
    assert.match(page, /<th>Buyurtma<\/th>/);
    assert.match(page, /<th>Holat<\/th>/);
  });

  it("ETA/courier/tracking honesty; no invent; no window.confirm", () => {
    const page = readFileSync(path.join(adminWeb, "pages/DeliveryPage.tsx"), "utf8");
    assert.match(page, /Yetkazish vaqti hali aniqlanmagan/);
    assert.match(page, /Kuryer hali biriktirilmagan|Biriktirilmagan/);
    assert.match(page, /Jonli kuzatuv mavjud emas/);
    assert.match(page, /operatorCapabilityLabel/);
    assert.doesNotMatch(page, /window\.confirm/);
    assert.doesNotMatch(page, /30 daqiqa|15 daqiqada|fake.?eta|tracking.?url|google.?map/i);
    assert.doesNotMatch(page, /StatCard|Amallar<\/button>/);
    assert.doesNotMatch(page, /Courier #12|Haydovchi Ali/);
  });

  it("Phase 12.18 docs updated", () => {
    assert.match(
      readFileSync(path.join(docs, "ADMIN_IMPLEMENTATION_STATUS.md"), "utf8"),
      /Phase 12\.18/,
    );
    assert.match(
      readFileSync(path.join(docs, "ADMIN_DESIGN_SYSTEM.md"), "utf8"),
      /Phase 12\.18/,
    );
  });
});
