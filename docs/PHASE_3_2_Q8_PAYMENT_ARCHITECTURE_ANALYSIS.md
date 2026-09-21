# Q8 ANALYSIS — Payment Architecture, Transactions, Webhooks and Refunds

**Status:** ANALYSIS ONLY (not a lock)  
**Mode:** Documentation / analysis only — **no application implementation**  
**Depends on:** Q2 three-axis order state; Q4 cashback; Q5 refund/reversal safety  
**Must not reopen:** Q1, Q2, Q4, Q5, Q6, Q7; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | Q8 (analysis) |
| Scope | Online payments, Payme/Click stubs, webhooks, refunds, reconciliation, payment/order separation |
| Implementation | Forbidden in this phase |
| Verdict | **Scaffold / mock** — real Payme/Click APIs, signatures, refunds, and reconciliation are **not** implemented |

---

# 1. Current payment implementation

## Primary files

| Path | Role |
|------|------|
| `artifacts/api-server/src/lib/payments.ts` | `createBranchPayment`, `markPaymentPaid` |
| `artifacts/api-server/src/routes/payments.ts` | Checkout HTML, `simulate-success`, Payme/Click webhook stubs, delivery status |
| `artifacts/api-server/src/routes/orders.ts` | Order create → payment row; cashback USE; cancel |
| `artifacts/api-server/src/routes/admin.ts` | Branch Payme/Click keys; `GET /admin/payments` |
| `artifacts/api-server/src/routes/branches.ts` | Public branch list (partial secret masking) |
| `lib/db/src/schema/commerce.ts` | `orders`, `payments`, `deliveries` |
| `lib/db/src/schema/branches.ts` | `payme_*`, `click_*` columns |
| `artifacts/soglom-apteka/app/checkout.tsx` | Method selection + opens checkout URL |

## What exists

| Capability | Status |
|------------|--------|
| `payments` table | Exists: order, provider, branch, merchantId, externalId, status, amount |
| Payment intents / attempts tables | **Absent** (single `payments` row per create) |
| Real Payme Merchant API | **Absent** |
| Real Click Prepare/Complete | **Absent** |
| Signature verification | **Absent** |
| Provider refunds | **Absent** |
| Reconciliation jobs | **Absent** |
| Separate `payment_status` column (Q2) | **Absent** — legacy `orders.status` + `payments.status` |
| Simulate pay | **Present** — primary “success” path |
| Webhook stubs | Echo `{ ok: true }` only |

---

# 2. Provider findings

## Payme

| Aspect | Reality |
|--------|---------|
| Initialization | Branch fields `paymeMerchantId`, `paymeKey` checked for “configured” |
| Payment creation | Local `payments` insert only |
| Redirect / deep link | Local HTML: `GET /api/payments/payme/checkout/:id` |
| Provider transaction ID | **Not** stored; `externalId` = `` `${provider}-${orderId}-${Date.now()}` `` |
| Callback | `POST /api/payments/payme/webhook` → echo body; **no** JSON-RPC, **no** Basic auth |
| Verification | **None** |
| Success | Via **simulate-success**, not Payme |
| Refund | **None** |
| Signature | Keys stored but **never used** for signing/verify |

**Classification:** stub / mocked.

## Click

| Aspect | Reality |
|--------|---------|
| Same pattern as Payme | Local checkout HTML + webhook echo |
| Config check | `clickMerchantId` + `clickSecret` (`clickServiceId` stored, unused in flow) |
| MD5 / Prepare / Complete | **Absent** |
| Refund | **None** |

**Classification:** stub / mocked (identical scaffold).

## Other providers

None beyond `pay_at_branch` and `cod` as payment **method** strings creating `awaiting_pos` payment rows.

---

# 3. Payment state model

## Current `payments.status` values written

| Value | When |
|-------|------|
| `pending` | payme/click + keys configured |
| `pending_keys` | payme/click + keys missing |
| `awaiting_pos` | pay_at_branch / cod |
| `paid` | `markPaymentPaid` / simulate-success |

**Absent in code:** `failed`, `cancelled`, `refunded`, `partially_refunded`, `expired`, `processing`.

## Legacy order status (payment-related)

| Value | When |
|-------|------|
| `pending_payment` | Online create |
| `paid` | Simulate success + delivery |
| `reserved` | Pickup pay-later create, or simulate success + pickup |
| `awaiting_delivery` | Delivery + pay-later create |
| `completed` | FOM / delivery delivered |
| `cancelled` | Cancel |

## Legacy → Q2 `payment_status` mapping (conceptual)

| Current evidence | Target Q2 axis (not implemented) |
|------------------|----------------------------------|
| `payments.status = pending` / `pending_keys` / order `pending_payment` | `PENDING` |
| `payments.status = paid` / order `paid` | `PAID` |
| No failed payment path | `FAILED` (gap) |
| No refund path | `REFUNDED` / `PARTIALLY_REFUNDED` (gap) |
| `awaiting_pos` | Still `PENDING` until branch collects (policy OPEN) |

---

# 4. Order / payment separation

Q2 requires independent axes. **Today** payment and fulfillment are collapsed into `orders.status`.

| Combination | Current support | Notes |
|-------------|-----------------|-------|
| A) payment PENDING + fulfillment CREATED | Partial | Online: `pending_payment` (mixed axes) |
| B) payment PENDING + fulfillment CONFIRMED | Unclear | No separate axes |
| C–G) PAID + various fulfillment | Partial | Delivery simulate → `paid`; pickup simulate → `reserved` (payment paid, fulfillment mixed) |
| H) FAILED + CREATED | **Missing** | No failed payment status |
| I) REFUNDED + CANCELLED | **Missing** | Cancel does not refund PSP or set payment refunded |

**Valid architectural principle (already Q2):** do not collapse payment into fulfillment. Current code violates this by overloading `orders.status`.

---

# 5. Online payment flow (as implemented)

```text
Customer → POST /api/orders
  → server totals + stock decrement + cashback USE
  → createBranchPayment
  → (payme/click) open GET …/checkout/:id (local HTML)
  → POST …/simulate-success (unauthenticated)
  → payments.status = paid
  → order.status = paid | reserved
  → cashback EARN later (FOM / delivery delivered) — not on simulate
```

| Question | Answer |
|----------|--------|
| Where is PAID set? | `markPaymentPaid` via simulate-success |
| Can client mark paid? | **Yes** — unauthenticated simulate endpoint (critical gap) |
| Server verifies provider? | **No** |
| Callback trusted? | Webhooks do nothing; simulate is fully trusted |
| Idempotent verification? | Simulate re-sets `paid`; no provider txn uniqueness |
| Timeout | **No** payment expiry / cancel-on-timeout job found |

---

# 6. Webhook security

| Surface | Signature | Auth | Replay / idempotency | Side effects |
|---------|-----------|------|----------------------|--------------|
| Payme webhook | None | None | None | Echo only |
| Click webhook | None | None | None | Echo only |
| simulate-success | None | None | None | Marks paid + updates order |
| Delivery status | None | **None** | None | Can complete order + earn cashback |

Branch secrets never read by webhooks. **Callbacks are not correctly trusted** — either no-op or open simulate.

---

# 7. Idempotency

| Scenario | Current behavior | Required principle (direction) |
|----------|------------------|--------------------------------|
| 1. Pay tapped twice | New order create = new payment; no “active intent” guard | One active intent per order |
| 2. Client retry after timeout | May create second order | Idempotency-Key / create-once |
| 3. Callback twice | Stub no-op; simulate can re-enter paid | Unique provider event / txn |
| 4. Concurrent callbacks | N/A (stub) | Atomic capture |
| 5. Callback after cancel | Simulate still marks payment paid; order may already be cancelled | Ignore or reconcile; no silent recapture |
| 6. Success after failed attempt | No failed attempt model | Attempt history + one successful capture |
| 7. Same provider txn twice | No real provider IDs | UNIQUE(provider, provider_txn_id) |
| 8. Two successful provider txns for one order | Possible if two simulates / future double intents | Forbid double capture |

**Critical:** one order must not be financially captured twice — **not enforced**.

---

# 8. Payment attempts

| Concept | Present? |
|---------|----------|
| ORDER | Yes |
| PAYMENT INTENT | Implicit single `payments` row |
| PAYMENT ATTEMPTS | **No** |
| PAYMENT TRANSACTIONS (provider) | **No** |

Gaps:

- Failed attempt not historical  
- Retry does not create structured new attempt  
- Successful attempt uniqueness not enforced  
- Multiple captures possible (no guard)  
- Old checkout URL remains valid indefinitely  
- No attempt expiry  

---

# 9. Secret storage

| Location | Detail |
|----------|--------|
| Branch table | `payme_key`, `click_secret` plaintext in PostgreSQL |
| Env vars | **No** Payme/Click env in `.env.example` |
| Source code | No hardcoded merchant keys found |
| Secret manager | **Absent** |
| Public `GET /api/branches` | Masks `paymeKey` / `clickSecret`; still exposes **merchant IDs** and `clickServiceId` |
| Admin PATCH response | Can return full secrets if present |

**Gap vs Phase 3.1:** payment secrets must not be public; need restricted finance/admin storage/ACL (OPEN who may access — §16.11).

---

# 10. Amount integrity

| Step | Authority |
|------|-----------|
| Cart prices | Server DB `products.price` |
| Subtotal / cashback / total | Server `computeCashback` |
| Client amount | Preview only; not trusted as capture amount |
| Payment amount | Copied from server `total` at create |

**Risks remaining:**

| Risk | Status |
|------|--------|
| Price change after cart | Snapshot on order items at create — OK for that order |
| Stock change after create | Already decremented at create (legacy) |
| Promo expiry mid-checkout | No complex promo engine in payment path |
| Cashback change | USE applied at create from then-current balance |
| Duplicate payment | Gap (§7) |
| Float errors | Integers / `Math.floor` — generally safe; unit is whole so‘m |

---

# 11. Cashback interaction (Q4 preserved)

| Rule | Repo evidence |
|------|---------------|
| PAID ≠ EARN | Simulate pay does **not** call `completeOrderCashback` |
| Earn on completion | Delivery `delivered` or FOM / confirm-pos |
| USE timing | At **order create**, before online PAID |
| Payment fails | No fail path; cancel restores USE |
| Order cancelled | Restores used cashback; does not update payment to refunded |
| Payment succeeds, fulfillment fails | Axes collapsed; no clean recovery policy |

**Gaps:** USE before PAID can strand spent cashback on unpaid abandoned online orders until cancel; payment row not coordinated with USE reverse on timeout.

---

# 12. Reservation / inventory interaction

| Behavior | Current |
|----------|---------|
| Reserve before payment? | Stock **decremented at create** for all methods including `pending_payment` |
| Payment success creates reservation? | No — already consumed/decremented |
| Payment failure releases? | No failure path; cancel restocks |
| Payment timeout releases? | **No job found** |
| Reservation expire independently? | `reservedUntil` set for pickup; no expiry worker found in payment code |

**Q1/Q2 target:** reservation axis separate; payment must coordinate with reservation release on fail/timeout/cancel — **not implemented**.

---

# 13. Pay-at-pickup

**Supported as method:** `pay_at_branch`.

| Aspect | Current |
|--------|---------|
| Create | order `reserved` (pickup) or `awaiting_delivery`; payment `awaiting_pos` |
| READY while PENDING | No separate READY status; single legacy status |
| Counter pay | Expected via FOM / `confirm-pos` |
| When PAID? | Payment row often stays `awaiting_pos` even after order `completed` |
| FOM marks payment | Completes order; **does not** set `payments.status = paid` |

**Q3 OPEN:** exact FOM sale / payment semantics not locked here.

---

# 14. COD / delivery payment

**Supported as method string:** `cod` (UI: pay on delivery).

Flow today:

- Create → `awaiting_delivery` + payment `awaiting_pos`  
- Delivery status updates → `delivered` → order `completed` + cashback earn  
- **No** explicit payment → `paid` transition on COD collection  

COD is a **future-capable scaffold**, not a full payment lifecycle.

Conceptual Q2 COD sequence (CONFIRMED → … → PENDING → DELIVERED → PAID → COMPLETED) is **not** implemented as separate axes.

---

# 15. Refunds

| Capability | Status |
|------------|--------|
| Full PSP refund | **Absent** |
| Partial refund | **Absent** |
| Refund provider ID / webhook | **Absent** |
| Order cancel | Restock + restore USE; **no** payment status change |
| POS void | Walk-in void within 15 min — not online PSP refund |

Aligns with Q5: refund domain ≠ cashback REVERSAL; technical safety locked; **business formula and FOM/PSP contract OPEN**; app refund API missing.

---

# 16. Reconciliation

**No** reconciliation mechanism.

Cannot systematically detect today:

- provider PAID vs internal PENDING  
- internal PAID vs provider FAILED  
- duplicate provider txn  
- unknown provider txn  
- amount mismatch  
- refund mismatch  

Admin can list `payments` rows only.

---

# 17. Money / currency

| Aspect | Reality |
|--------|---------|
| Types | `integer` (so‘m whole units) |
| Float money columns | Not used for commerce amounts |
| Currency field | **Absent** (implicit UZS) |
| Rounding | `Math.floor` in cashback |
| Target | Exact integer (or minor-unit) representation — integer so‘m is current practice; tiyin policy OPEN |

---

# 18. Audit

| Event | Audited? |
|-------|----------|
| Payment create | **No** |
| Attempt / simulate success | **No** |
| Provider callback | **No** (echo only) |
| Capture / failure / refund | **No** |
| Branch key update | Partial (`branch.update`, weak payload) |
| FOM / POS | Partial |

---

# 19. Client-trust risks

| Manipulation | Possible today? |
|--------------|-----------------|
| Mark payment PAID | **Yes** — open `simulate-success` |
| Client amount as capture truth | **No** — server calculates |
| Provider txn ID injection | N/A (not used) |
| Order total override | Not as payment amount |
| Force delivery complete / earn | **Yes** — `POST /deliveries/:orderId/status` appears **unauthenticated** |
| Refund state | N/A |

**Violations:** client/anonymous can drive financial-adjacent state via simulate and delivery status.

---

# 20. Failure / retry scenarios

| Scenario | Current | Required principle (direction) |
|----------|---------|--------------------------------|
| A) Provider timeout | No real provider | Poll / reconcile; don’t trust client |
| B) Callback timeout | Stub | Durable event processing |
| C) Duplicate callback | Stub | Idempotent by provider event/txn |
| D) Paid but callback lost | Simulate is only path | Poll provider; reconcile |
| E) Callback OK, response lost | N/A | Idempotent retry |
| F) Customer closes page | Payment stays pending; stock held | Expiry + release policy |
| G) Retry payment | New order risk | Intent/attempt model |
| H) Success after cancel | Possible via simulate | Reject or auto-refund policy OPEN |
| I) Refund callback lost | No refunds | Idempotent refund + reconcile |
| J) DB fail after provider success | No real capture | Outbox / reconcile mandatory |

---

# 21. Business / provider decisions required (OPEN)

1. Which payment providers are production-authoritative  
2. Payme contract details  
3. Click contract details  
4. Supported payment methods (final)  
5. Pay-at-pickup policy  
6. COD policy  
7. Payment expiration period  
8. Payment retry policy  
9. Multiple payment attempt policy  
10. Refund policy  
11. Partial refund policy  
12. Provider reconciliation frequency  
13. Payment secret ownership/access  
14. Currency policy (so‘m vs tiyin)  
15. FOM/payment relationship  
16. Whether FOM can mark branch payment PAID  

Do **not** invent answers. Q3 remains OPEN for FOM semantics.

---

# 22. Target payment architecture (conceptual)

```text
ORDER
  ↓
PAYMENT INTENT
  ↓
PAYMENT ATTEMPT(S)
  ↓
PROVIDER TRANSACTION
  ↓
VERIFIED PAYMENT EVENT
  ↓
PAYMENT TRANSACTION
  ↓
payment_status (Q2 axis)

Refunds:
PAYMENT TRANSACTION → REFUND → payment_status
                     ↘ CASHBACK REVERSAL (when applicable; Q4/Q5)
```

Separate lifecycles:

| Domain | Axis / ledger |
|--------|----------------|
| Order fulfillment | `fulfillment_status` |
| Payment | `payment_status` |
| Inventory | `reservation_status` |
| Cashback | EARNED / USED / REVERSAL |

---

# 23. LOCKED vs OPEN (analysis recommendation — **not yet Q8 LOCK**)

## Candidates for future technical LOCK (principles — no provider contracts / no numeric policies)

| Principle | Rationale |
|-----------|-----------|
| Payment state separate from fulfillment | Q2; violated today |
| Client cannot mark payment PAID | Simulate is open |
| Server/provider verification authoritative | Stubs trust nothing or everything wrongly |
| Provider callbacks idempotent | Required |
| One order cannot have duplicate successful captures | Required |
| Payment attempts ≠ transactions | Missing model |
| Provider transaction identity stored | `externalId` is local fake |
| Payment secrets never public | Partial mask only |
| Payment amount server-calculated | Already mostly true |
| Payment/refund events auditable | Missing |
| Refund ≠ cashback reversal | Q5 |
| Reconciliation required | Missing |
| Exact money representation | Integer path exists; keep |
| Retries must be safe | Missing |
| Lost callback must not lose financial truth | Needs poll/reconcile |

## Remain OPEN

- Provider-specific Payme/Click contracts  
- Numeric expiry / retry / reconciliation schedules  
- COD / pay-at-pickup business rules  
- Refund business formulas (Q5)  
- FOM payment marking (Q3)  
- Currency minor-unit policy  

**This Q8 document does not lock the candidates above.** A separate Q8 LOCK step is required.

---

## Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1 inventory | Not reopened — payment must coordinate with reservation release |
| Q2 three-axis | Reinforced — `payment_status` still missing in schema |
| Q3 FOM | Remains OPEN |
| Q4 cashback | Reinforced — PAID ≠ earn confirmed in simulate path |
| Q5 refund safety | Reinforced — refund API still absent |
| Q6 / Q7 | Not reopened |

---

**Q8 ANALYSIS COMPLETE — NO IMPLEMENTATION PERFORMED — PAYMENT ARCHITECTURE READY FOR REVIEW.**
