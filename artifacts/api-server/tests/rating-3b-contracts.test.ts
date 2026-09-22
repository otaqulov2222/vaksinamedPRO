import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

describe("Batch 3B rating trust boundary contracts", () => {
  it("POST /ratings requires orderId and derives branch from owned order", () => {
    const src = readFileSync(path.join(root, "src/routes/integrations.ts"), "utf8");
    assert.match(src, /orderId/);
    assert.match(src, /order\.customerId !== customer\.id/);
    assert.match(src, /branchId = order\.branchId/);
    assert.match(src, /Filial xizmati/);
    assert.doesNotMatch(src, /Number\(req\.body\.branchId\)\s*\|\|\s*12/);
    assert.doesNotMatch(src, /employeeName \|\| "Farmatsevt"/);
    assert.doesNotMatch(src, /rating\) \|\| 5/);
  });

  it("rating range is validated 1–5 without default forge", () => {
    const src = readFileSync(path.join(root, "src/routes/integrations.ts"), "utf8");
    assert.match(src, /rating < 1 \|\| rating > 5/);
  });

  it("duplicate rating returns 409", () => {
    const src = readFileSync(path.join(root, "src/routes/integrations.ts"), "utf8");
    assert.match(src, /status\(409\)/);
    assert.match(src, /allaqachon baholangan/);
  });

  it("serializeOrder exposes canRate / alreadyRated", () => {
    const src = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(src, /alreadyRated/);
    assert.match(src, /canRate/);
    assert.match(src, /staffRatings/);
  });

  it("mobile rating no longer hardcodes Dilnoza or branchId 12", () => {
    const src = readFileSync(
      path.join(repoRoot, "artifacts/soglom-apteka/app/rating.tsx"),
      "utf8",
    );
    assert.doesNotMatch(src, /Dilnoza/);
    assert.doesNotMatch(src, /branchId:\s*12/);
    assert.doesNotMatch(src, /Sog‘lom apteka №12/);
    assert.match(src, /orderId/);
    assert.match(src, /Filial xizmati/);
  });

  it("migration adds order_id uniqueness for staff_ratings", () => {
    const sql = readFileSync(
      path.join(repoRoot, "lib/db/migrations/0009_staff_ratings_order.sql"),
      "utf8",
    );
    assert.match(sql, /order_id/);
    assert.match(sql, /staff_ratings_order_id_uidx/);
  });
});
