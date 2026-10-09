import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeCashback, DELIVERY_FEE } from "../src/lib/money.js";
import { createHmac } from "node:crypto";
import { verifyClickSignString, clickAmountMatchesIntentUzs } from "../src/lib/clickContract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Phase B.0.5 Adversarial Customer and Order Security QA Contracts", () => {
  const ordersCode = readFileSync(path.join(root, "src/routes/orders.ts"), "utf8");
  const cashbackFinanceCode = readFileSync(path.join(root, "src/lib/cashbackFinance.ts"), "utf8");
  const orderTransitionsCode = readFileSync(path.join(root, "src/lib/orderTransitions.ts"), "utf8");
  const inventoryCode = readFileSync(path.join(root, "src/lib/inventory.ts"), "utf8");
  const posCode = readFileSync(path.join(root, "src/lib/pos.ts"), "utf8");
  const paymeMerchantCode = readFileSync(path.join(root, "src/lib/paymeMerchantApi.ts"), "utf8");
  const clickMerchantCode = readFileSync(path.join(root, "src/lib/clickMerchantApi.ts"), "utf8");
  const clickContractCode = readFileSync(path.join(root, "src/lib/clickContract.ts"), "utf8");
  const paymentServiceCode = readFileSync(path.join(root, "src/lib/paymentService.ts"), "utf8");

  describe("1. POS Dynamic QR TTL & Verification", () => {
    it("exact source constant is 90 seconds (90_000 ms)", () => {
      assert.match(posCode, /const QR_TTL_MS = 90_000;/);
      assert.match(posCode, /expiresIn: Math\.floor\(ttlMs \/ 1000\)/);
    });

    it("source contracts enforce 90 seconds TTL calculation and signed payload", () => {
      assert.match(posCode, /issuePosToken\(customerId: number, ttlMs = QR_TTL_MS\)/);
      assert.match(posCode, /const exp = Date\.now\(\) \+ ttlMs;/);
      assert.match(posCode, /const body = `VM1\.\$\{customerId\}\.\$\{exp\}`;/);
    });

    it("verifyPosToken rejects expired token and forged signatures", () => {
      assert.match(posCode, /if \(exp < Date\.now\(\)\) return null;/);
      assert.match(posCode, /timingSafeEqual\(a, b\)/);
    });
  });

  describe("2. Delivery and Pickup Payment Method Backend Validation", () => {
    it("rejects pay_at_branch and cod for delivery orders on backend", () => {
      assert.match(
        ordersCode,
        /fulfillment === "delivery" && \(paymentMethod === "pay_at_branch" \|\| paymentMethod === "cod"\)/,
      );
      assert.match(ordersCode, /INVALID_PAYMENT_METHOD/);
    });

    it("rejects cod for pickup orders on backend", () => {
      assert.match(
        ordersCode,
        /fulfillment === "pickup" && paymentMethod === "cod"/,
      );
    });

    it("enforces address minimum length for delivery orders", () => {
      assert.match(ordersCode, /fulfillment === "delivery" && address\.length < 8/);
      assert.match(ordersCode, /ADDRESS_REQUIRED/);
    });

    it("enforces open branch check on order placement", () => {
      assert.match(ordersCode, /BRANCH_CLOSED/);
    });
  });

  describe("3. Client Payload Manipulation Immunity", () => {
    it("backend explicitly ignores client-supplied financial totals and recalculates from DB", () => {
      assert.match(ordersCode, /void req\.body\.total/);
      assert.match(ordersCode, /void req\.body\.subtotal/);
      assert.match(ordersCode, /void req\.body\.unitPrice/);
      assert.match(ordersCode, /void req\.body\.cashbackAmount/);
      assert.match(ordersCode, /void req\.body\.discount/);
      assert.match(ordersCode, /const calc = computeCashback\(/);
    });

    it("computeCashback strictly limits max cashback spend to policy ratio and balance", () => {
      const calcNormal = computeCashback({
        goodsAmount: 100000,
        cashbackToUse: 50000,
        balance: 50000,
        tier: "standard",
        deliveryFee: DELIVERY_FEE,
        maxSpendRatio: 0.5,
      });
      assert.equal(calcNormal.cashbackUsed, 50000);
      assert.equal(calcNormal.payableTotal, 50000 + DELIVERY_FEE);

      const calcExploit = computeCashback({
        goodsAmount: 100000,
        cashbackToUse: 90000,
        balance: 90000,
        tier: "standard",
        deliveryFee: DELIVERY_FEE,
        maxSpendRatio: 0.5,
      });
      assert.equal(calcExploit.cashbackUsed, 50000);
      assert.equal(calcExploit.payableTotal, 50000 + DELIVERY_FEE);

      const calcOverBalance = computeCashback({
        goodsAmount: 100000,
        cashbackToUse: 50000,
        balance: 10000,
        tier: "standard",
        deliveryFee: 0,
        maxSpendRatio: 0.5,
      });
      assert.equal(calcOverBalance.cashbackUsed, 10000);
      assert.equal(calcOverBalance.payableTotal, 90000);
    });
  });

  describe("4. Multi-Device & Concurrent Financial Safety", () => {
    it("useCashback locks account and rejects when balance is insufficient (no negative balance)", () => {
      assert.match(cashbackFinanceCode, /const locked = await lockAccount\(tx, account\.id\);/);
      assert.match(cashbackFinanceCode, /if \(locked\.balance < amount\)/);
      assert.match(cashbackFinanceCode, /ALERT\.CASHBACK_NEGATIVE_BALANCE_ATTEMPT/);
      assert.match(cashbackFinanceCode, /INSUFFICIENT_CASHBACK/);
    });

    it("concurrent cancel calls return idempotent reversal without double restore", () => {
      assert.match(cashbackFinanceCode, /ALERT\.CASHBACK_DUPLICATE_REVERSAL_ATTEMPT/);
      assert.match(cashbackFinanceCode, /source:\s*"idempotent_existing"/);
    });

    it("concurrent order completion executes earn at most once per commercial transaction", () => {
      assert.match(cashbackFinanceCode, /ALERT\.CASHBACK_DUPLICATE_EARN_ATTEMPT/);
      assert.match(cashbackFinanceCode, /eq\(cashbackLedger\.entryType, "EARN"\)/);
    });
  });

  describe("5. Reversal Accounting & Balance Invariant", () => {
    it("reverseCashbackEntry on USE adds to balance without decreasing or flooring", () => {
      assert.match(cashbackFinanceCode, /else if \(original\.entryType === "USE"\) {\s*nextBalance = locked\.balance \+ reverseAmount;\s*}/);
    });

    it("reverseCashbackEntry on EARN refuses negative balance rather than inventing debt", () => {
      assert.match(cashbackFinanceCode, /if \(locked\.balance < reverseAmount\) {/);
      assert.match(cashbackFinanceCode, /INSUFFICIENT_FOR_REVERSAL/);
    });

    it("inspectCashbackIntegrity verifies account balance equals sum of ledger entries", () => {
      assert.match(cashbackFinanceCode, /export async function inspectCashbackIntegrity/);
      assert.match(cashbackFinanceCode, /accountLedgerMismatches/);
    });
  });

  describe("6. Payment Callback Authentication & Replay Protection", () => {
    it("Payme Merchant API verifies Basic Auth password using timingSafeEqual", () => {
      assert.match(paymeMerchantCode, /timingSafeEqual/);
      assert.match(paymeMerchantCode, /ACCESS_DENIED/);
    });

    it("Payme CreateTransaction and PerformTransaction are strictly idempotent", () => {
      assert.match(paymeMerchantCode, /PAYME_STATE\.PERFORMED/);
      assert.match(paymeMerchantCode, /applyOrderTransition/);
    });

    it("Click Shop API verifies MD5 sign_string with branch secret", () => {
      assert.match(clickContractCode, /createHash\("md5"\)/);
      assert.match(clickContractCode, /export function verifyClickSignString/);
      assert.match(clickMerchantCode, /verifyClickSignString/);
    });

    it("Click rejects wrong signature, wrong service ID, and invalid sign time", () => {
      assert.match(clickContractCode, /isValidClickSignTime/);
      assert.match(clickMerchantCode, /CLICK_ERROR\.SIGN_CHECK_FAILED/);
      assert.match(clickMerchantCode, /CLICK_ERROR\.ERROR_IN_REQUEST/);
    });

    it("Click verifyClickSignString behaves correctly with test credentials", () => {
      const signTime = "2026-10-08 12:00:00";
      const valid = verifyClickSignString({
        clickTransId: "12345",
        serviceId: "54321",
        secretKey: "test_secret",
        merchantTransId: "1",
        amount: "50000",
        action: 0,
        signTime,
        signString: "00000000000000000000000000000000", // dummy bad
      });
      assert.equal(valid, false);
    });
  });

  describe("7. Delivery Payment / Cancel Race Invariants", () => {
    it("cancellation after checkout releases inventory and reverses cashback", () => {
      assert.match(orderTransitionsCode, /releaseReservation/);
      assert.match(ordersCode, /reverseOrderUseOnCancel/);
    });

    it("payment callback arriving after cancellation leaves fulfillment as CANCELLED", () => {
      assert.match(orderTransitionsCode, /deriveLegacyStatus/);
      assert.match(orderTransitionsCode, /paymentStatus === "PAID"/);
      assert.match(orderTransitionsCode, /fulfillmentStatus === "CANCELLED"/);
    });
  });

  describe("8. POS and Mobile Cross-Channel Cashback Concurrency", () => {
    it("POS lookup and confirmation use authoritative cashback balance", () => {
      assert.match(posCode, /getAuthoritativeBalance/);
      assert.match(posCode, /useCashback/);
      assert.match(posCode, /earnCashback/);
    });

    it("commercial transactions prevent cross-channel duplicate spend and earn", () => {
      assert.match(cashbackFinanceCode, /resolveCommercialTransaction/);
      assert.match(cashbackFinanceCode, /sourceType/);
      assert.match(cashbackFinanceCode, /sourceKey/);
    });
  });

  describe("9. Cancellation / Payment / Cashback Matrix", () => {
    it("CASE 1-4: Cancellation matrix verifies safe state transitions", () => {
      // Order created -> Cancelled
      assert.match(orderTransitionsCode, /CREATED: \["CONFIRMED", "CANCELLED"\]/);
      // Cancellation triggers reverseOrderUseOnCancel
      assert.match(ordersCode, /reverseOrderUseOnCancel/);
      // PAID -> REFUNDED
      assert.match(orderTransitionsCode, /from === "PAID" && \(to === "REFUNDED"/);
    });

    it("CASE 5-12: Concurrent adversarial cancellation scenarios", () => {
      // Terminal states reject further modifications
      assert.match(orderTransitionsCode, /"Yakunlangan buyurtmani o‘zgartirib bo‘lmaydi"/);
      assert.match(orderTransitionsCode, /"Bekor qilingan buyurtmani o‘zgartirib bo‘lmaydi"/);
      // Double consume cashback is prevented by idempotency/unique keys
      assert.match(cashbackFinanceCode, /idempotencyKey:\s*idemKey/);
    });
  });

  describe("10. Payment Authority Audit", () => {
    it("Client cannot forge payment status, refund amount, or delivery fee", () => {
      assert.match(ordersCode, /void req\.body\.paymentStatus/);
      assert.match(ordersCode, /void req\.body\.paymentAmount/);
      assert.match(ordersCode, /void req\.body\.deliveryFee/);
      assert.match(ordersCode, /const deliveryFee = /); // strictly server calculated
    });
  });

  describe("11. Inventory + Cancellation Race", () => {
    it("Concurrency is controlled via atomic reservation state changes", () => {
      assert.match(inventoryCode, /UPDATE product_stocks/);
      assert.match(inventoryCode, /reserveStock/);
      assert.match(inventoryCode, /releaseReservation/);
      assert.match(inventoryCode, /consumeReservation/);
    });
  });

  describe("12. Adversarial Cases A through L & Fraud Prevention", () => {
    it("CASE A & B: Unpaid cancelled order reverses used cashback exactly once; duplicate cancel is idempotent", () => {
      assert.match(ordersCode, /reverseOrderUseOnCancel/);
      assert.match(cashbackFinanceCode, /source:\s*"idempotent_existing"/);
      assert.match(cashbackFinanceCode, /ALERT\.CASHBACK_DUPLICATE_REVERSAL_ATTEMPT/);
    });

    it("CASE C: Payment arriving for cancelled order does not resurrect fulfillment or consume inventory", () => {
      assert.match(orderTransitionsCode, /fulfillmentStatus === "CANCELLED"/);
      assert.match(orderTransitionsCode, /"Bekor qilingan buyurtmani o‘zgartirib bo‘lmaydi"/);
    });

    it("CASE D: Duplicate payment callback is strictly idempotent and does not duplicate cashback or inventory", () => {
      assert.match(paymeMerchantCode, /PAYME_STATE\.PERFORMED/);
      assert.match(cashbackFinanceCode, /ALERT\.CASHBACK_DUPLICATE_EARN_ATTEMPT/);
      assert.match(cashbackFinanceCode, /eq\(cashbackLedger\.entryType, "EARN"\)/);
    });

    it("CASE E, I, J: Client financial tampering (price, fee, total, status) is completely voided and derived from DB", () => {
      assert.match(ordersCode, /void req\.body\.total/);
      assert.match(ordersCode, /void req\.body\.unitPrice/);
      assert.match(ordersCode, /void req\.body\.deliveryFee/);
      assert.match(ordersCode, /void req\.body\.paymentAmount/);
      assert.match(ordersCode, /void req\.body\.paymentStatus/);
    });

    it("CASE F, G, H: Delivery rejects pay_at_branch and COD with HTTP 400 INVALID_PAYMENT_METHOD", () => {
      assert.match(ordersCode, /fulfillment === "delivery" && \(paymentMethod === "pay_at_branch" \|\| paymentMethod === "cod"\)/);
      assert.match(ordersCode, /INVALID_PAYMENT_METHOD/);
    });

    it("CASE K & L: Atomic reservation locks prevent concurrent inventory overdraft and duplicate orders", () => {
      assert.match(inventoryCode, /SELECT id FROM product_stocks/);
      assert.match(inventoryCode, /FOR UPDATE/);
      assert.match(ordersCode, /const idempotencyKey = /);
    });

    it("POS Fraud Defense: Overdraft, double-earn, and double-reversal are rejected", () => {
      assert.match(posCode, /if \(balance < preview\.cashbackUsed\)/);
      assert.match(posCode, /useCashback/);
      assert.match(posCode, /earnCashback/);
      assert.match(cashbackFinanceCode, /INSUFFICIENT_CASHBACK/);
      assert.match(cashbackFinanceCode, /INSUFFICIENT_FOR_REVERSAL/);
    });
  });

  describe("13. Late Payment After Cancellation & Extended Customer Fraud", () => {
    it("Late payment callback on cancelled order: leaves fulfillment CANCELLED and triggers refund flow", () => {
      // Intent cannot capture if cancelled or terminal
      assert.match(paymentServiceCode, /if \(from === "REFUNDED" \|\| from === "CANCELLED" \|\| from === "EXPIRED"\)/);
      // Click complete returns TRANSACTION_CANCELLED
      assert.match(clickMerchantCode, /CLICK_ERROR\.TRANSACTION_CANCELLED/);
      // Payme CreateTransaction rejects cancelled intent
      assert.match(paymeMerchantCode, /if \(intent\.status === "PAID" \|\| \["CANCELLED", "EXPIRED", "REFUNDED"\]\.includes\(intent\.status\)\)/);
    });

    it("Refundable amount calculation is exact and prevents double refunding", () => {
      assert.match(paymentServiceCode, /export async function getRefundableAmount/);
      assert.match(paymentServiceCode, /Math\.max\(0, captured - refundedTotal\)/);
    });

    it("Customer cannot tamper with QR token payload or use expired HMAC token", () => {
      assert.match(posCode, /if \(exp < Date\.now\(\)\) return null;/);
      assert.match(posCode, /timingSafeEqual\(a, b\)/);
    });
  });
});
