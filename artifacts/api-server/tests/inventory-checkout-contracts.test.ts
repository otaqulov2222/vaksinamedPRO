import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("P4.5 checkout inventory contracts", () => {
  it("checkout reserves instead of decrementing quantity at create", () => {
    const src = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(src, /reserveStock/);
    assert.match(src, /reservationId/);
    assert.doesNotMatch(src, /quantity:\s*Math\.max\(0,\s*stock\.quantity\s*-\s*item\.quantity\)/);
  });

  it("cancel releases reservation when linked", () => {
    const src = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(src, /applyOrderTransition/);
    assert.match(src, /inventory:\s*"release"/);
  });

  it("confirm-pos consumes reservation when present", () => {
    const src = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(src, /applyOrderTransition/);
    assert.match(src, /inventory:\s*"consume"/);
  });
});
