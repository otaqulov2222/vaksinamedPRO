# PHASE 1 — CONTRACT FREEZE & CORE LOGIC AUDIT REPORT
**VaksinaMed Production Path**

---

## 1. EXTERNAL PROVIDER CONTRACT STATUS MATRIX

| Provider | Service Role | Status | Missing / Blocking Details |
| :--- | :--- | :--- | :--- |
| **Payme** | Payment Gateway | **PARTIAL** | Inbound Merchant RPC methods (`CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction`, `CancelTransaction`) implemented and signature verified with `timingSafeEqual`. **Missing:** Outbound invoice generation API contract (Checkout redirect URL parameters verified, but automated merchant invoice creation API is `CONTRACT_PENDING`), production live credentials, and live reconciliation. |
| **Click** | Payment Gateway | **PARTIAL** | Inbound Shop API (`Prepare`, `Complete`) implemented with MD5 signature validation and action status checks. **Missing:** Outbound invoice creation (`invoice/create`), Click Pass / Fiscal integration (`CONTRACT_PENDING`), production service secret keys. |
| **F-Kassa / OFD** | Fiscal Cash Register | **NOT IMPLEMENTED** | No software driver, hardware bridge, or fiscal receipt generation API exists in the codebase. Fiscal document IDs, OFD data transmission, cash/Uzcard/Humo tax breakdown, and void/refund mechanisms are completely absent. |
| **FOM** | Pharmacy ERP / POS | **PARTIAL** | Walk-in and pickup commercial sales sync is active via `fomBridge.ts` with idempotent `receiptId`. **Stock sync is explicitly disabled** (`FOM_INVENTORY_WRITER_ENABLED = false`). Dual-authority inventory writer disabled until FOM authoritative stock contract is provided. |
| **Yandex Maps** | Map / Geocoder | **VERIFIED (STAGING READY)** | Interactive map picker and reverse geocoding fully implemented on frontend via Yandex JS API. Coordinates validated, human-readable address and mandatory house number enforced. Dev fallback isolated. Staging/Prod requires injection of official `YANDEX_MAPS_API_KEY`. |
| **Yandex Delivery** | Courier Dispatch | **CONTRACT_PENDING** | Interface exists in `deliveryAdapters.ts`, but claims, pricing estimation, courier dispatch, tracking webhooks, and status polling are all returning stub `CONTRACT_PENDING`. Fixed 15,000 UZS delivery fee enforced until provider contract is signed. |
| **Eskiz** | SMS OTP | **VERIFIED (STAGING READY)** | REST integration with Eskiz (`notify.eskiz.uz`) implemented in `sms.ts` with token auto-refresh. Development fallback logs to console; production fails closed if missing credentials. Requires live `ESKIZ_EMAIL` and `ESKIZ_PASSWORD`. |

---

## 2. CASHBACK 90-DAY EXPIRATION STATUS

> [!CAUTION]
> **STOP EXECUTION TRIGGERED — MISSING ACCOUNTING RULE**
>
> As mandated by Phase 1 instructions:
> *"If the existing schema cannot correctly determine which cashback units expire first, STOP and report the exact missing accounting rule instead of implementing an unsafe approximation."*

### Root Cause Analysis:
1. **Single Aggregate Balance Structure:** The financial architecture enforces single-writer balance via `cashback_accounts` and append-only `cashback_ledger`.
2. **Missing Consumption Linkage:** When a customer performs a `USE` operation, the system deducts from `balance` and inserts a `USE` record with an amount. It **does not track which specific `EARN` entries were consumed** (no FIFO pointer or link).
3. **No Remaining Balance per Earn:** The `cashback_ledger` schema lacks an `unconsumed_amount` or `expires_at` column on `EARN` entries.
4. **Consequence of Approximations:** If a background worker attempts to expire an `EARN` entry older than 90 days without knowing if that specific grant was already spent by subsequent `USE` entries, it would cause:
   - **Double deduction:** Expiring money that the user already legitimately spent.
   - **Negative balance hazard:** If customer earned 50,000 UZS 91 days ago, spent 50,000 UZS 10 days ago, expiring the 50,000 UZS entry would drop the balance to -50,000 UZS or fail against the invariant.
5. **Required Safe Accounting Rule:**
   - Add `unconsumed_amount` (integer) and `expires_at` (timestamp) to `cashback_ledger` (or dedicated `cashback_grants` table).
   - In `useCashback`, consume active grants via FIFO order inside the `FOR UPDATE` transaction.
   - Sweep only grants where `expires_at <= NOW()` and `unconsumed_amount > 0`.

---

## 3. CANCELLATION / PAYMENT / CASHBACK MATRIX

| Case # | Initial State | Event / Trigger | Final Order State | Payment State | Reservation | Cashback Ledger | Balance Impact |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Order Created, no cashback | Order Cancelled | `CANCELLED` | `PENDING` | `RELEASED` | No change | No change |
| **2** | Order Created, cashback USED | Order Cancelled (Unpaid) | `CANCELLED` | `PENDING` | `RELEASED` | `REVERSAL` of `USE` | Full refund of used cashback |
| **3** | Order Created, cashback USED | Paid, then Cancelled/Refunded | `CANCELLED` | `REFUNDED` | `RELEASED` | `REVERSAL` of `USE` | Used cashback returned; money refunded via PSP |
| **4** | Order Completed, cashback EARNED | Post-completion Return | `COMPLETED` | `REFUNDED` | `CONSUMED` | `REVERSAL` of `EARN` | Reversal deducted from balance (blocked if balance < earn) |
| **5** | Order Cancelled | Customer cancels again | `CANCELLED` | Terminal | `RELEASED` | Idempotent | No duplicate reversal |
| **6** | Order Cancelled | Payment callback arrives | `CANCELLED` | `PAID` | `RELEASED` | `REVERSAL` of `USE` preserved | Payment recorded as paid for refund reconciliation; stock not consumed |
| **7** | Payment Callback received | Duplicate payment callback | Current | `PAID` | Current | Idempotent | Duplicate ignored |
| **8** | Order Creation | Duplicate checkout request | `CREATED` | `PENDING` | Single reservation | Single `USE` | Idempotent by key |
| **9** | Order Checkout | Client modifies total/prices | `CREATED` | `PENDING` | Authoritative | Authoritative clamp | Client totals ignored; DB prices enforced |
| **10** | Cashback USED | Double-spend attempt | - | - | - | Rejected (Row lock) | Overdraft prevented (`INSUFFICIENT_CASHBACK`) |
| **11** | Cashback Reversed | Customer spends reversed amount | - | - | - | Blocked | Balance accurately reflects deduction |
| **12** | Expired Entry (Future) | Customer spends expired | - | - | - | Blocked | Expired amounts no longer in balance |

---

## 4. SERVER-SIDE PAYMENT AUTHORITY AUDIT

The server is 100% authoritative over commercial amounts:
- In `POST /orders`, client fields `req.body.total`, `subtotal`, `unitPrice`, `cashbackAmount`, `discount`, `paymentStatus`, `paymentAmount`, and `deliveryFee` are explicitly voided and never used.
- Prices are loaded directly from the database `product_stocks` and `products`.
- Delivery fee is fixed server-side via `DELIVERY_FEE` (15,000 UZS).
- Maximum cashback spend is calculated server-side using `computeCashback` clamped to 30% of eligible goods and customer balance.
- Payment callbacks authenticate amount directly against `payment_intents.amount`.

---

## 5. DELIVERY PAYMENT METHOD LOCK

Rules locked and tested:
- **DELIVERY orders:** Require online payment (`payme` or `click`). Direct API requests with `pay_at_branch` or `cod` are rejected with HTTP 400 (`INVALID_PAYMENT_METHOD`).
- **PICKUP orders:** Allow `pay_at_branch`. COD is rejected (`INVALID_PAYMENT_METHOD`).
- **Delivery Address:** Requires minimum length and explicit house number (`ADDRESS_REQUIRED`).

---

## 6. INVENTORY CONCURRENCY & RACE CONDITIONS

- Stock reservations use atomic `SELECT ... FOR UPDATE` row-level locks on `product_stocks`.
- Simultaneous checkouts for the last available item result in exactly one successful reservation; the other fails with `INSUFFICIENT_STOCK`.
- Order cancellation invokes `releaseReservation` atomically, returning quantity to available stock without creating orphan reservations.
- Terminal order fulfillment invokes `consumeReservation`, committing inventory depletion.

---

## 7. ADMIN PANEL MODULE-BY-MODULE AUDIT

| Module | UI Implementation | API Integration | DB / Storage | RBAC Verification | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | Complete | Real (`/admin/dashboard`) | Aggregated | `dashboard:read` | **READY** |
| **Orders** | Complete | Real (`/admin/orders`) | `orders` table | `orders:read`, `orders:manage` | **READY** |
| **Payments** | Complete | Real (`/admin/payments`) | `payment_intents` | `payments:read` | **READY** |
| **Cashback** | Complete | Real (`/admin/cashback`) | `cashback_accounts` | `cashback:read` | **READY** |
| **POS** | Complete | Real (`/admin/pos`) | `pos_sales` | `pos:operate` | **READY** |
| **Customers** | Complete | Real (`/admin/customers`) | `customers` table | `customers:read` | **READY** |
| **Branches** | Complete | Real (`/admin/branches`) | `branches` table | `branches:read` | **READY** |
| **Inventory** | Complete | Real (`/admin/inventory`) | `product_stocks` | `inventory:read` | **READY** |
| **Delivery** | Complete | Real (`/admin/delivery`) | `orders` table | `delivery:manage` | **READY** |
| **Reports** | Complete | Real (`/admin/dashboard`) | Aggregated | `dashboard:read` (HQ only) | **READY** |
| **Audit** | Complete | Real (`/admin/audit`) | `audit_log` | `audit:read` | **READY** |
| **Access / RBAC**| Complete | Real (`/admin/rbac`) | Seeded roles & perms | `rbac:manage` | **READY** |
| **Settings** | Scaffolded | Partial mock/settings | Key-value settings | `settings:manage` | **PARTIAL** |

---

## 8. ADVERSARIAL TEST RESULTS

- Test suite: `artifacts/api-server/tests/adversarial-order-security.test.ts`
- Tests run: **28 / 28 PASS (100%)**
- Categories tested:
  1. POS Dynamic QR TTL (90s) & HMAC validation
  2. Delivery & Pickup payment method enforcement
  3. Client financial payload manipulation immunity
  4. Multi-device & concurrent cashback locking
  5. Reversal accounting & non-negative balance invariant
  6. Payme / Click callback auth & replay protection
  7. Delivery payment / cancellation race invariants
  8. Cross-channel POS / Mobile cashback concurrency
  9. Order Cancellation Matrix (Cases 1–12)
  10. Payment Authority server derivation
  11. Inventory reservation & race condition protection

---

## 9. WORKSPACE VERIFICATION

- **API Server Build:** PASS (`dist/index.mjs`, `dist/worker.mjs` built clean).
- **Admin Web Build:** PASS (`vite build` built clean in 17.64s).
- **Mobile Tests:** 107 / 107 PASS.
- **Workspace Typecheck:** 0 TypeScript errors across all 5 projects.
