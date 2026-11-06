/**
 * Admin Phase 12.18 — Delivery console retired (pickup-only).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminWeb = path.resolve(root, "../admin-web/src");
const docs = path.resolve(root, "../../docs");

describe("Admin Phase 12.18 — Delivery disabled", () => {
  it("DeliveryPage shows disabled notice only", () => {
    const page = readFileSync(path.join(adminWeb, "pages/DeliveryPage.tsx"), "utf8");
    assert.match(page, /Yetkazib berish o‘chirilgan/);
    assert.match(page, /delivery-disabled/);
    assert.doesNotMatch(page, /\/api\/admin\/deliveries|ConfirmDialog|DetailDrawer/);
  });

  it("Phase 12.18 docs still referenced", () => {
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
