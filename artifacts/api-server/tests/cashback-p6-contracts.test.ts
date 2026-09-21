import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.resolve(root, "../../docs");

describe("P6.1–P6.4 cashback contracts", () => {
  it("P6 lock document is retained", () => {
    assert.ok(existsSync(path.join(docs, "PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md")));
  });

  it("cashbackFinance is the authoritative mutation writer", () => {
    const finance = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
    assert.match(finance, /export async function earnCashback/);
    assert.match(finance, /export async function useCashback/);
    assert.match(finance, /export async function reverseCashbackEntry/);
    assert.match(finance, /export async function inspectCashbackIntegrity/);
    assert.match(finance, /ONE commercial transaction/);
    assert.match(finance, /mirrorLegacyBalance/);
    assert.match(finance, /FOM vendor payload|OPEN dependency/);
  });

  it("order earn/use go through cashbackFinance; no new direct balance writers", () => {
    const orders = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
    assert.match(orders, /earnCashback/);
    assert.match(orders, /applyCashbackUse|useCashback/);
    assert.match(orders, /reverseOrderUseOnCancel|reverseCashbackEntry/);
    assert.match(orders, /completeOrderCashback/);
    assert.doesNotMatch(orders, /set\(\{\s*balance:/);
  });

  it("POS sale mutates via cashbackFinance", () => {
    const pos = readFileSync(path.join(root, "src/lib/pos.ts"), "utf8");
    assert.match(pos, /earnCashback/);
    assert.match(pos, /useCashback/);
    assert.match(pos, /reverseCashbackEntry/);
    assert.doesNotMatch(pos, /balance:\s*nextBalance/);
  });

  it("loyalty redeem uses useCashback", () => {
    const loyalty = readFileSync(path.join(root, "src/routes/loyalty.ts"), "utf8");
    assert.match(loyalty, /useCashback/);
    assert.doesNotMatch(loyalty, /balance:\s*customer\.balance\s*-\s*reward\.points/);
  });

  it("does not invent FOM vendor API", () => {
    const fom = readFileSync(path.join(root, "src/lib/fom.ts"), "utf8");
    assert.match(fom, /confirmFomSale/);
    assert.doesNotMatch(fom, /fetch\(|axios|FomClient|vendorApi/i);
  });
});
