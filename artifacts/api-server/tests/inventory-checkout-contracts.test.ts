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

describe("Batch 3E checkout integrity contracts", () => {
  it("checkout requires explicit branch and ignores client money fields", () => {
    const src = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(src, /BRANCH_REQUIRED/);
    assert.match(src, /void req\.body\.total/);
    assert.match(src, /void req\.body\.subtotal/);
    assert.match(src, /void req\.body\.cashbackAmount/);
    assert.match(src, /getAuthoritativeBalance/);
    assert.match(src, /alreadyInTx:\s*true/);
  });

  it("checkout recalculates prices inside the reservation transaction", () => {
    const src = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(src, /from\(products\)/);
    assert.match(src, /getAuthoritativeBalance\(customer\.id/);
    assert.match(src, /computeCashback/);
    assert.match(src, /applyCashbackUse|useCashback as applyCashbackUse/);
  });

  it("cart branch set validates existence and soft-checks PATCH stock", () => {
    const cart = readFileSync(path.join(root, "src/routes/cart.ts"), "utf8");
    assert.match(cart, /BRANCH_NOT_FOUND/);
    assert.match(cart, /BRANCH_CLOSED/);
    assert.match(cart, /STOCK_UNAVAILABLE/);
    assert.match(cart, /availabilityKnown/);
  });

  it("error handler surfaces machine codes for honest mobile UX", () => {
    const app = readFileSync(path.join(root, "src/app.ts"), "utf8");
    assert.match(app, /error\.code/);
  });
});
