import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.resolve(root, "../../docs");

describe("P6.5–P6.8 cashback spend/reversal/FOM contracts", () => {
  it("P6 lock retained", () => {
    assert.ok(existsSync(path.join(docs, "PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md")));
  });

  it("MAX_SPEND_RATIO default is 0.30 not 1", () => {
    const cashback = readFileSync(path.join(root, "src/lib/cashback.ts"), "utf8");
    assert.match(cashback, /DEFAULT_MAX_SPEND_RATIO\s*=\s*0\.3/);
    assert.doesNotMatch(cashback, /MAX_SPEND_RATIO\s*=\s*1\b/);
    assert.match(cashback, /clampCashbackSpend/);
  });

  it("useCashback enforces eligibleGoodsAmount spend cap", () => {
    const finance = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
    assert.match(finance, /eligibleGoodsAmount/);
    assert.match(finance, /getMaxSpendRatio/);
    assert.match(finance, /refundOrderCashback/);
    assert.match(finance, /reverseOrderUseOnCancel/);
    assert.match(finance, /PARTIAL_REFUND_AMOUNT_REQUIRED/);
    assert.match(finance, /INSUFFICIENT_FOR_REVERSAL/);
  });

  it("completeOrderCashback only on COMPLETED; not CANCELLED; not PAID alone", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /fulfillmentStatus !== "COMPLETED"/);
    assert.match(orders, /CANCELLED/);
    assert.match(orders, /refundOrderCashback/);
    assert.match(orders, /reverseOrderUseOnCancel/);
    const payments = readFileSync(path.join(root, "src/routes/payments.ts"), "utf8");
    const simulate = payments.slice(
      payments.indexOf("simulate-success"),
      payments.indexOf("payme/webhook"),
    );
    assert.doesNotMatch(simulate, /completeOrderCashback/);
  });

  it("FOM confirm uses applyOrderTransition + shared earn; no invented vendor API", () => {
    const fom = readFileSync(path.join(root, "src/lib/fom.ts"), "utf8");
    assert.match(fom, /applyOrderTransition/);
    assert.match(fom, /ORDER_CANCELLED|Bekor qilingan/);
    assert.doesNotMatch(fom, /fetch\(|axios|FomClient/i);
    const bridge = readFileSync(path.join(root, "src/lib/fomBridge.ts"), "utf8");
    assert.match(bridge, /confirmPosSale|confirmFomSale/);
    // Avoid false positive on inventoryWriter / FOM_INVENTORY_* identifiers
    assert.doesNotMatch(bridge, /invent(?!ory)|fabricat/i);
  });

  it("loyalty balance uses authoritative account", () => {
    const loyalty = readFileSync(path.join(root, "src/routes/loyalty.ts"), "utf8");
    assert.match(loyalty, /getAuthoritativeBalance/);
  });

  it("M/N source contracts: PAID path no earn; CANCELLED blocked in completeOrderCashback", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /fulfillmentStatus !== "COMPLETED"/);
    assert.match(orders, /fulfillmentStatus === "CANCELLED"/);
  });
});
