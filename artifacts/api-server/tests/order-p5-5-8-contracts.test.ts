import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.resolve(root, "../../docs");

describe("P5.5–P5.8 staff endpoints + serializers + compatibility", () => {
  it("staff transition endpoints exist and use applyOrderTransition + AuthZ", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /\/orders\/:id\/prepare/);
    assert.match(orders, /\/orders\/:id\/ready/);
    assert.match(orders, /\/orders\/:id\/out-for-delivery/);
    assert.match(orders, /\/orders\/:id\/complete/);
    assert.match(orders, /staffTransition/);
    assert.match(orders, /requirePermission\(admin,\s*"orders:confirm_pos"\)/);
    assert.match(orders, /assertBranchScope/);
    assert.match(orders, /applyOrderTransition/);
    // Routes must not raw-update fulfillment_status
    assert.doesNotMatch(
      orders.slice(orders.indexOf("/orders/:id/prepare")),
      /\.set\(\{\s*fulfillmentStatus/,
    );
  });

  it("serializer exposes axes + legacy status; strips branch payment secrets", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /fulfillment_status:\s*order\.fulfillmentStatus/);
    assert.match(orders, /payment_status:\s*order\.paymentStatus/);
    // Live reservation row is authoritative when linked; mirror may heal (Batch 3F).
    assert.match(orders, /reservation_status:\s*reservationStatus/);
    assert.match(orders, /status:\s*order\.status/);
    assert.match(orders, /publicBranch/);
  });

  it("customer cannot use staffTransition helper without admin auth path", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    const prepareBlock = orders.slice(orders.indexOf("/orders/:id/prepare"));
    assert.match(prepareBlock, /requireAdmin|staffTransition/);
    assert.doesNotMatch(prepareBlock.split("export default")[0], /requireCustomer/);
  });

  it("confirm-pos and delivery completion remain AuthZ gated", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    const deliveries = readFileSync(path.join(root, "src/routes/deliveries.ts"), "utf8");
    assert.match(orders, /orders:confirm_pos/);
    assert.match(deliveries, /delivery:update/);
    assert.match(deliveries, /assertBranchScope/);
  });

  it("P5.8 compatibility document exists and names Expo legacy consumers", () => {
    const doc = path.join(docs, "PHASE_3_3_P5_8_LEGACY_STATUS_COMPATIBILITY.md");
    assert.ok(existsSync(doc));
    const text = readFileSync(doc, "utf8");
    assert.match(text, /compatibility only/i);
    assert.match(text, /deriveLegacyStatus/);
    assert.match(text, /purchases\.tsx|order\/\[id\]/);
    assert.match(text, /READY_FOR_PICKUP → OUT_FOR_DELIVERY.*invalid/i);
  });

  it("READY→OUT is rejected in transition graph (channel conflict)", () => {
    const svc = readFileSync(path.join(root, "src/lib/orderTransitions.ts"), "utf8");
    assert.match(svc, /READY_FOR_PICKUP.*COMPLETED.*CANCELLED/);
    assert.doesNotMatch(
      svc.match(/READY_FOR_PICKUP:\s*\[[^\]]+\]/)?.[0] || "",
      /OUT_FOR_DELIVERY/,
    );
  });
});
