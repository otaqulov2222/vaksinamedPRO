# PHASE 1.1 — PRODUCTION HARDENING & CUSTOMER UX REPORT
**VaksinaMed Production Path**

---

## 1. ISSUES FOUND & RESOLVED

1. **Cashback History Horizontal Squeeze & Right-Edge Crowding:**
   - On small screens (360px and 375px), date/source text and financial amounts in `app/cashback.tsx` were tightly packed against the right edge.
   - **Resolution:** Refactored row layout hierarchy. Added dedicated `rowAmountContainer` with alignment constraints, right-side breathing room, and dynamic wrapping for metadata (`[icon] [title + meta] [amount]`).
2. **Adversarial Customer Threat Models (Cases A through L):**
   - Validated server-side immunity against payload tampering, duplicate payments, stale cancellation replays, and delivery payment method violations.
   - Enhanced `adversarial-order-security.test.ts` to **35 passed tests**.
3. **Server Financial Authority:**
   - Explicitly voided `paymentStatus`, `paymentAmount`, and `deliveryFee` alongside `total`, `subtotal`, `unitPrice`, `discount`, and `cashbackAmount` in `POST /orders`.

---

## 2. PRODUCTION-SAFE CASHBACK ACCOUNTING SPECIFICATION (FIFO GRANTS)

### Root Problem in Legacy System:
The current cashback architecture stores an aggregate `balance` in `cashback_accounts` and appends `EARN`/`USE`/`REVERSAL` to `cashback_ledger`. It lacks a link indicating which specific `EARN` entries were spent when `USE` occurs. Attempting to run a 90-day expiration worker without grant-level tracking causes:
- Risk of expiring cashback already consumed.
- Potential negative balance or double deductions.

### Proposed Schema Extension (Migration Phase):
```sql
CREATE TABLE cashback_grants (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES cashback_accounts(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  ledger_entry_id INTEGER NOT NULL REFERENCES cashback_ledger(id),
  initial_amount INTEGER NOT NULL,
  unconsumed_amount INTEGER NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' -- ACTIVE | EXHAUSTED | EXPIRED
);

CREATE INDEX idx_cashback_grants_fifo ON cashback_grants (account_id, expires_at)
WHERE unconsumed_amount > 0 AND status = 'ACTIVE';
```

### Strict FIFO Consumption Algorithm:
1. `lockAccount(tx, accountId)` executes `SELECT ... FOR UPDATE`.
2. Query active grants: `SELECT * FROM cashback_grants WHERE account_id = :id AND unconsumed_amount > 0 AND expires_at > NOW() ORDER BY earned_at ASC FOR UPDATE`.
3. Sequentially deduct amount from oldest grant until `requested` is satisfied.
4. Record `USE` entry in `cashback_ledger` with grant allocation metadata.
5. Atomic balance update in `cashback_accounts`.

---

## 3. CANCELLATION & PAYMENT INTEGRITY MATRIX

| Scenario | Trigger / Event | Order Status | Payment Status | Stock Reservation | Cashback Balance Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Case A** | Cancel unpaid order with cashback used | `CANCELLED` | `PENDING` | Released | Reverses `USE` once (+30,000 UZS) |
| **Case B** | 10x duplicate cancellation requests | `CANCELLED` | Terminal | Released | Exactly ONE reversal; 9 are idempotent no-ops |
| **Case C** | Payment callback arrives after cancel | `CANCELLED` | `PAID` (for refund) | Stays Released | No fulfillment resurrection, no inventory consumed |
| **Case D** | Duplicate payment callback received | Current | `PAID` | Consumed | Idempotent ignore; no double-earn or double-stock consume |
| **Case E** | Client sends tampered prices or 0 fee | Ignored | Derived | Authoritative | Server calculates fee (15,000 UZS) and DB catalog prices |
| **Case F-H**| Client sends `pay_at_branch` or `COD` for delivery | Rejected | 400 Bad Request | None | Blocked by backend validation |
| **Case K-L**| Concurrent checkout on last stock item | Exactly 1 `CREATED` | 1 `PENDING` | Exactly 1 Reserved | 2nd request fails with `INSUFFICIENT_STOCK` |

---

## 4. MOBILE SCREEN AUDIT SUMMARY (360px / 375px / 390px)

- **Home Screen:** Responsive banner, categories horizontal scroll cleanly without clipping.
- **Catalog & Search:** Grid adapts cleanly without text overlap.
- **Cart & Checkout:**
  - Sticky checkout footer respects safe area insets.
  - Delivery checkout forces house number input.
  - Delivery payment options lock strictly to Online Payment (Payme/Click); "Filialda to‘lash" is hidden.
  - Pickup checkout allows "Filialda to‘lash".
- **Cashback Screen:**
  - Hero card: Balance, tier marker, and progress render clearly without wrapping defects.
  - History rows: Ample left/right padding; amounts stay legible and right-aligned.
- **Dynamic POS QR Screen:**
  - 90-second countdown indicator with auto-refresh.
  - Signed HMAC VM1 format preventing static token forgery.

---

## 5. REAL POSTGRESQL & HETZNER READINESS

| Component | Current State | Target Staging (Hetzner) | Readiness Status |
| :--- | :--- | :--- | :--- |
| **Database** | PGlite (Memory/Embedded) | Dedicated PostgreSQL 16+ on Hetzner | **PENDING PROVISIONING** |
| **Cache/RateLimit** | In-memory fallback | Redis container / managed Redis | **STAGING READY** |
| **API Server** | Node.js Fastify/Express | Dockerized App (CPX21 / CPX31) | **STAGING READY** |
| **Admin Web** | Vite Static Build | Nginx static container | **STAGING READY** |
| **Backups & DR** | None | `pg_dump` daily cron to Storage Box | **NOT IMPLEMENTED** |

---

## 6. EXTERNAL PROVIDER CONTRACT MATRIX

| Provider | Service | Integration Status | Blocker / Requirement |
| :--- | :--- | :--- | :--- |
| **Payme** | Payment Gateway | **SANDBOX READY** | Inbound webhooks verified. Outbound invoice generation contract pending. |
| **Click** | Payment Gateway | **SANDBOX READY** | Inbound Shop API verified. Outbound invoice generation contract pending. |
| **F-Kassa** | Fiscal Cash Register | **NOT IMPLEMENTED** | Awaiting official SDK / hardware driver specifications. |
| **FOM** | Pharmacy ERP | **PARTIAL** | Sales sync active; stock sync writer intentionally disabled. |
| **Yandex Maps** | Geocoder & Map | **STAGING READY** | Frontend verified; requires production API key injection. |
| **Yandex Delivery**| Courier Dispatch | **CONTRACT_PENDING** | Claims adapter stubbed; fixed 15,000 UZS fee enforced. |
| **Eskiz** | SMS OTP | **STAGING READY** | REST API implemented; requires production credentials. |
| **Telegram TMA** | Mini App | **NOT IMPLEMENTED** | Telegram Auth & session mapping pending. |

---

## 7. TEST EXECUTION EVIDENCE

- **Adversarial Security Test Suite:** 35 / 35 PASS (100%).
- **Mobile Test Suite:** 107 / 107 PASS (100%).
- **Admin Reports Test Suite:** 18 / 18 PASS (100%).
- **Workspace Typecheck:** 0 errors across 5 projects (`pnpm run typecheck`).
- **Workspace Git Diff Check:** 0 syntax/whitespace issues (`git diff --check`).

---

## 8. FINAL VERDICT

### **PASS WITH BLOCKERS**

*(System is fully hardened at the application and UI layer. Transition to Phase 2 requires provisioning Real PostgreSQL on Hetzner staging to verify row-level concurrency under network load and unblock external contracts).*
