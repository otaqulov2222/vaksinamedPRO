import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.resolve(root, "../../docs");

describe("P5.0–P5.4 order contracts", () => {
  it("P5.0 lock document freezes three axes and inventory lifecycle", () => {
    const lock = readFileSync(path.join(docs, "PHASE_3_3_P5_ORDER_ARCHITECTURE_LOCK.md"), "utf8");
    assert.match(lock, /fulfillment_status/);
    assert.match(lock, /payment_status/);
    assert.match(lock, /reservation_status/);
    assert.match(lock, /CREATE\s*→\s*RESERVE/);
    assert.match(lock, /CANCEL\s*→\s*RELEASE/);
    assert.match(lock, /CONSUME/);
    assert.match(lock, /Q3/);
    assert.match(lock, /reserved_until/);
    assert.ok(existsSync(path.join(docs, "PHASE_3_3_P5_ORDER_ARCHITECTURE_LOCK.md")));
  });

  it("checkout sets axes and dual-writes legacy status; reserves not consumes", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /initialAxesForCheckout/);
    assert.match(orders, /fulfillmentStatus/);
    assert.match(orders, /checkoutIdempotencyKey/);
    assert.match(orders, /reserveStock/);
    assert.doesNotMatch(orders, /consumeReservation/);
  });

  it("cancel and confirm-pos go through applyOrderTransition", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /applyOrderTransition/);
    assert.match(orders, /toFulfillment:\s*"CANCELLED"/);
    assert.match(orders, /inventory:\s*"release"/);
    assert.match(orders, /toFulfillment:\s*"COMPLETED"/);
    assert.match(orders, /inventory:\s*"consume"/);
    assert.match(orders, /requirePermission\(admin,\s*"orders:confirm_pos"\)/);
    assert.match(orders, /assertBranchScope/);
  });

  it("payment paid does not consume; delivery delivered consumes via transition", () => {
    const payments = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    const deliverySvc = readFileSync(path.join(root, "src/lib/deliveryService.ts"), "utf8");
    assert.match(payments, /markOrderPaymentPaid/);
    assert.match(deliverySvc, /inventory:\s*"consume"/);
    assert.match(deliverySvc, /delivery_completed/);
    const simulate = payments.slice(
      payments.indexOf("simulate-success"),
      payments.indexOf("payme/webhook"),
    );
    assert.doesNotMatch(simulate, /consumeReservation|inventory:\s*"consume"/);
  });

  it("transition service is the mutation gateway", () => {
    const svc = readFileSync(path.join(root, "src/lib/orderTransitions.ts"), "utf8");
    assert.match(svc, /export async function applyOrderTransition/);
    assert.match(svc, /releaseReservation/);
    assert.match(svc, /consumeReservation/);
    assert.match(svc, /deriveLegacyStatus/);
    assert.match(svc, /INVALID_TRANSITION/);
  });

  it("customer routes do not expose staff prepare transitions in this batch", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    // Staff endpoints exist but are admin AuthZ gated (P5.5)
    assert.match(orders, /\/orders\/:id\/prepare/);
    assert.match(orders, /staffTransition/);
    assert.match(orders, /requirePermission\(admin,\s*"orders:confirm_pos"\)/);
  });
});
