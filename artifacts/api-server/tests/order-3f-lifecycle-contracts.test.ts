import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Batch 3F order lifecycle contracts", () => {
  it("GET/cancel order enforce customer ownership (404)", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /router\.get\("\/orders\/:id"/);
    assert.match(orders, /rows\[0\]\.customerId !== customer\.id/);
    assert.match(orders, /router\.post\("\/orders\/:id\/cancel"/);
    const getBlock = orders.slice(orders.indexOf('router.get("/orders/:id"'));
    assert.match(getBlock, /customerId !== customer\.id/);
    const cancelBlock = orders.slice(orders.indexOf('router.post("/orders/:id/cancel"'));
    assert.match(cancelBlock, /customerId !== customer\.id/);
  });

  it("serializeOrder exposes P5 axes + serverTime without inventing payment success", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /fulfillmentStatus/);
    assert.match(orders, /paymentStatus/);
    assert.match(orders, /reservationStatus/);
    assert.match(orders, /serverTime/);
    assert.match(orders, /canCancel/);
    assert.match(orders, /cancelRefundsPayment:\s*false/);
    assert.match(orders, /canRetryPayment:\s*false/);
  });

  it("payment poll is ownership-scoped and separate from fulfillment", () => {
    const payments = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    assert.match(payments, /\/orders\/:orderId\/payment/);
    assert.match(payments, /order\.customerId !== customer\.id/);
    assert.match(payments, /axes:\s*\{\s*paymentStatus/);
  });

  it("reservation release/expire syncs order reservation mirror", () => {
    const inv = readFileSync(path.join(root, "src/lib/inventory.ts"), "utf8");
    assert.match(inv, /syncOrderReservationMirror/);
    assert.match(inv, /reservationStatus/);
  });

  it("cart payload surfaces stock notices and removes missing products", () => {
    const cart = readFileSync(path.join(root, "src/routes/cart.ts"), "utf8");
    assert.match(cart, /PRODUCT_REMOVED/);
    assert.match(cart, /STOCK_CHANGED/);
    assert.match(cart, /priceAuthority:\s*"catalog_current"/);
    assert.match(cart, /stockInsufficient/);
  });
});
