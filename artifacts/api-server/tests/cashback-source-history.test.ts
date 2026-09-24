/**
 * cashback source-aware history contracts.
 * Avoids importing cashbackHistory (pulls @workspace/db singleton / PGlite).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("cashback source-aware history (read-model)", () => {
  it("sourceLabelFor uses real sourceType — SYSTEM is Bonus not a purchase", () => {
    const hist = readFileSync(path.join(root, "src/lib/cashbackHistory.ts"), "utf8");
    assert.match(hist, /export function sourceLabelFor/);
    assert.match(hist, /sourceType === "SYSTEM"\) return "Bonus"/);
    assert.match(hist, /Ilova xaridi/);
    assert.match(hist, /Ilova buyurtmasi/);
    assert.match(hist, /Kassa xaridi/);
    assert.doesNotMatch(hist, /APP_ORDER/);
  });

  it("history module is read-only SoT projection (no earn/use/reverse writers)", () => {
    const hist = readFileSync(path.join(root, "src/lib/cashbackHistory.ts"), "utf8");
    assert.match(hist, /getCustomerCashbackHistory/);
    assert.match(hist, /cashbackLedger/);
    assert.match(hist, /commercialTransactions/);
    assert.match(hist, /eq\(cashbackLedger\.customerId, customerId\)/);
    assert.match(hist, /CONTRACT_PENDING/);
    assert.doesNotMatch(hist, /earnCashback|useCashback|reverseCashbackEntry/);
    assert.doesNotMatch(hist, /\.insert\(/);
    assert.doesNotMatch(hist, /\.update\(/);
    // Does not invent APP_ORDER as stored sourceType
    assert.doesNotMatch(hist, /APP_ORDER/);
  });

  it("loyalty profile + cashback-history use session customer ownership", () => {
    const loyalty = readFileSync(path.join(root, "src/routes/loyalty.ts"), "utf8");
    assert.match(loyalty, /getCustomerCashbackHistory/);
    assert.match(loyalty, /\/loyalty\/cashback-history/);
    assert.match(loyalty, /requireCustomer\(req\)/);
    assert.match(loyalty, /getCustomerCashbackHistory\(customer\.id/);
    // Must not authorize via client-supplied customerId for history
    assert.doesNotMatch(
      loyalty,
      /getCustomerCashbackHistory\(\s*(req\.(body|query)|Number\(req)/,
    );
    // Profile no longer serves loyalty_ledger soft mirror as history SoT
    assert.doesNotMatch(loyalty, /from\(loyaltyLedger\)/);
  });

  it("does not change cashbackFinance mutation surface", () => {
    const finance = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
    assert.match(finance, /export async function earnCashback/);
    assert.match(finance, /export async function useCashback/);
    assert.match(finance, /export async function reverseCashbackEntry/);
    assert.match(finance, /eligibleGoodsAmount/);
  });

  it("FOM_POS remains reserved — no invented FOM vendor receipt in history", () => {
    const hist = readFileSync(path.join(root, "src/lib/cashbackHistory.ts"), "utf8");
    assert.match(hist, /FOM_POS/);
    assert.match(hist, /sourceContract/);
    assert.doesNotMatch(hist, /fakeFom|fabricatedReceipt|inventReceipt/i);
    const fom = readFileSync(path.join(root, "src/lib/fom.ts"), "utf8");
    assert.doesNotMatch(fom, /fetch\(|axios|FomClient/i);
  });
});
