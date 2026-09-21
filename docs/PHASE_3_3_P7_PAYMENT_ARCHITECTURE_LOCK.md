# P7 LOCK — Payment Architecture and Financial Safety

**Status:** LOCKED (architecture only)  
**Mode:** Documentation / design only — **no application implementation**  
**Date context:** After P7 payment analysis; P1–P6 complete and retained  
**Depends on:** Q8 payment locks; Phase 3.1 financial truth; P5 order axes; P6 cashback; P7 analysis  
**Does not lock:** Official Payme/Click contracts; production method set; payment expiry/abandon; FOM payment PAID rights; secret storage model; partial-refund business formula

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | P7.0 |
| Scope | Payment lifecycle, intent/attempt/capture/refund model, webhook safety, PSP adapter boundary, cutover, relation to P4/P5/P6 |
| Implementation | Forbidden in this lock turn |
| Schema / migrations / API / UI / .env / packages | **Not modified** in this turn |
| Canonical analysis input | P7 payment analysis (accepted) |
| Prior architecture | [`PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_LOCK.md`](PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_LOCK.md), [`PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_ANALYSIS.md`](PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_ANALYSIS.md) |
| Related domains | [`PHASE_3_3_P5_ORDER_ARCHITECTURE_LOCK.md`](PHASE_3_3_P5_ORDER_ARCHITECTURE_LOCK.md), [`PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md`](PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md), [`PHASE_3_3_P4_CUTOVER_GATES.md`](PHASE_3_3_P4_CUTOVER_GATES.md) |

---

## A. Current architecture (repository evidence)

| Component | Current state |
|-----------|---------------|
| Order payment axis | **Present (P5):** `orders.payment_status` ∈ `PENDING` \| `PAID` \| `FAILED` \| `REFUNDED` \| `PARTIALLY_REFUNDED` |
| Payment entity | Single `payments` table (`order_id`, `provider`, `branch_id`, `merchant_id`, `external_id`, `status`, `amount`) |
| Intent / attempt / txn / refund / webhook_event tables | **MISSING** |
| Create path | Checkout → `createBranchPayment` with **server** `order.total` |
| Online “success” | Dev `simulate-success` → `markPaymentPaid` + `markOrderPaymentPaid` (gated off production-like) |
| Payme/Click webhooks | Stub: prod-like **501**; non-prod echo **no mutate**; **no** signature verify |
| Provider redirect | Local HTML `/api/payments/{payme\|click}/checkout/:id` — **not** a PSP redirect |
| `external_id` | Local fake `` `${provider}-${orderId}-${Date.now()}` `` — **not** a provider txn ID |
| Branch secrets | `payme_key` / `click_secret` on branch rows; stripped from customer DTOs via `publicBranch` (merchant IDs still may appear) |
| One-capture | **Not enforced** — idempotent order retry can create multiple `payments` rows |
| Currency | Implicit UZS integer soʻm; **no** explicit currency column |
| Cashback (P6) | PAID alone does **not** earn; EARN on COMPLETED; refund cashback is **explicit** REVERSAL |
| Inventory (P4) | PAID alone does **not** consume; consume on fulfillment COMPLETED paths |

**Note:** [`PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_ANALYSIS.md`](PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_ANALYSIS.md) still claims `payment_status` is absent — that claim is **stale** after P5. Prefer this lock + current schema.

---

## B. Locked principles (20)

1. **Payment state is separate from order fulfillment state.** Do not collapse payment into `orders.status` or fulfillment transitions.  
2. **Server/database are authoritative** for amount, currency, payment status, transaction identity, capture state, and refund state.  
3. **Client-provided amount is never authoritative.**  
4. **Exact/integer money only.** No floating-point financial calculations.  
5. **One successful capture** per order/payment intent according to the final DB uniqueness rule (to be encoded in P7.1–P7.3).  
6. **Payment creation and capture must be idempotent.**  
7. **Webhooks require:** provider event identity; authentication/signature verification once the official contract is available; idempotent + retry-safe processing; audit trail.  
8. **Unknown/unverified PSP fields must NOT be invented.**  
9. **Payme and Click** are provider adapters behind a common payment boundary.  
10. **Real Payme/Click implementation is BLOCKED** until official sandbox + production contracts are supplied.  
11. **`ALLOW_PAYMENT_SIMULATE` is development-only** and must be disabled in production-like environments (already fail-closed when production-like).  
12. **PAID does NOT automatically mean** cashback EARN or inventory CONSUMED.  
13. **Cashback remains governed by P6.**  
14. **Inventory remains governed by P4.**  
15. **Orders remain governed by P5.**  
16. **Refund does NOT automatically equal cashback REVERSAL** unless applicable business policy explicitly requires it (and then only via P6 cashback service).  
17. **FOM payment confirmation remains OPEN** until actual FOM contract and business decision are available.  
18. **Payment secrets must never** be exposed through customer-facing branch/payment DTOs.  
19. **Payment admin access must use RBAC/AuthZ.**  
20. **Production PSP cutover requires:** backup; versioned migrations; webhook verification; idempotency; amount verification; reconciliation; rollback plan.

---

## C. Locked domain model (target — not created in this lock)

### Separation of concerns

| Domain | Authority | Must not |
|--------|-----------|----------|
| Payment | Intent / attempt / capture / refund + order `payment_status` mirror | Drive fulfillment or invent PSP payloads |
| Order fulfillment | P5 `fulfillment_status` | Become payment SoT |
| Reservation / inventory | P4 | Be mutated by PAID alone |
| Cashback | P6 accounts + ledger | Auto-earn on PAID; auto-reverse on PSP refund without policy |

### Conceptual entities (provider-agnostic)

```
payment_intent     → commercial desire to collect a server amount for an order
payment_attempt    → one try against a provider (or simulate/dev)
payment_capture    → successful money capture (≤ one per intent/order per uniqueness rule)
payment_refund     → money returned against a capture
webhook_event      → durable provider event with unique provider event id
```

Exact table names may vary in P7.1; concepts are **LOCKED**.

### Order payment axis (retain P5 values)

`PENDING` · `PAID` · `FAILED` · `REFUNDED` · `PARTIALLY_REFUNDED`

Finer states (`CREATED`, `REQUIRES_PAYMENT`, `PROCESSING`, `EXPIRED`, `CANCELLED` on the **intent/attempt**) must not silently expand the order axis without an additive migration decision in P7.1.

### Valid combination principles (order × payment)

| Combination | Locked stance |
|-------------|---------------|
| `payment PENDING` + active fulfillment (non-terminal) | Allowed (online unpaid; pay-later) |
| `payment PAID` + CONFIRMED / PREPARING / READY / OUT / COMPLETED | Allowed |
| `payment PAID` + CANCELLED | Invalid without explicit refund/reconcile path |
| `payment FAILED` + CREATED / CANCELLED | Allowed |
| `PAID` alone → inventory consume | **Forbidden** |
| `PAID` alone → cashback EARN | **Forbidden** |
| Fulfillment COMPLETED → may earn (P6) and may consume (P4) | Per those locks; independent of how PAID was set |

Pay-at-branch / COD / FOM “when is PAID set” details remain **OPEN** where noted below.

---

## D. Webhook / event safety (locked requirements)

Until official contracts exist, infrastructure may be built (P7.4) with **verify hooks left OPEN**.

| Requirement | Locked |
|-------------|--------|
| Stable provider event identity | Required for idempotent processing |
| Signature / auth verification | Required **once contract known** — algorithm **OPEN** |
| Idempotent apply | One event → ≤ one financial effect |
| Retry-safe | Duplicate delivery must no-op after success |
| Out-of-order / unknown events | Must not corrupt capture; audit + safe reject/hold |
| Audit trail | Actor, payload hash/ref, result, timestamps |
| Invented Payme JSON-RPC / Click Prepare fields | **Forbidden** |

---

## E. Provider adapter boundary (locked)

```
Checkout / Order amount snapshot
        │
        ▼
PaymentService (provider-agnostic)
        │
        ├── SimulateAdapter (dev-only; ALLOW_PAYMENT_SIMULATE)
        ├── PaymeAdapter     【BLOCKED until official contract】
        └── ClickAdapter     【BLOCKED until official contract】
```

- Common boundary owns amount verification, idempotency keys, capture uniqueness, status mapping **from verified adapter results**.  
- Adapters own only contract-specific request/response/verify — **no business rules duplicated**.  
- Branch merchant field **names** in DB are storage placeholders, not evidence of a contract.

---

## F. Money safety (locked)

1. Payable amount computed and snapshotted **server-side** at intent creation.  
2. Client amount ignored for capture decisions.  
3. Integer soʻm (or documented minor units once currency is explicit).  
4. Capture amount must match expected intent amount (tolerance **OPEN** only if a real contract requires it — default: exact match).  
5. One successful capture per uniqueness rule.  
6. Idempotency mandatory for intent create, capture, refund, webhook apply.

---

## G. OPEN decisions — do not guess

| # | Decision | Status |
|---|----------|--------|
| 1 | Payme official sandbox + production contract | **OPEN** |
| 2 | Click official sandbox + production contract | **OPEN** |
| 3 | Supported production payment methods (final set) | **OPEN** |
| 4 | Payment expiry / abandon period and behavior | **OPEN** |
| 5 | Reservation release on payment expiry | **OPEN** |
| 6 | Cashback USE reversal on payment expiry | **OPEN** |
| 7 | Whether FOM may mark branch payment PAID | **OPEN** |
| 8 | Secret ownership / storage model (branch row vs vault / KMS) | **OPEN** |
| 9 | Partial refund **business** formula (Q5) | **OPEN** |
| 10 | Public exposure of merchant IDs / service IDs | **OPEN** (secrets already must stay private) |
| 11 | Explicit currency column vs implicit UZS | **OPEN** (integer money remains locked) |
| 12 | Multi-attempt policy after FAILED | **OPEN** |

---

## H. PSP contract blockers (external gate)

Before **P7.6**, obtain for **each** of Payme and Click (official docs only):

- Authentication / signature / verification rules  
- Request and response formats  
- Payment creation / redirect / invoice flow  
- Callback / webhook flow  
- Transaction identifiers  
- Cancellation / refund flow  
- Status semantics → internal mapping  
- Sandbox environment  
- Error codes and retry rules  
- Amount / currency / rounding rules  

If absent from repository or official contract → remain **OPEN**. **Never invent.**

---

## I. P7 implementation order (provisional — locked for planning)

| Step | Scope | Notes |
|------|--------|------|
| **P7.0** | This architecture lock | **DONE (docs only)** |
| **P7.1** | Payment DB foundation (intent/attempt/capture/refund/webhook_event) | Additive versioned migrations only |
| **P7.2** | Intent/attempt lifecycle service; sync `orders.payment_status` | No live PSP |
| **P7.3** | Idempotency + capture uniqueness | DB uniqueness authoritative |
| **P7.4** | Webhook/event infrastructure | Verify adapter pluggable; no invented signatures |
| **P7.5** | Provider adapter boundary | SimulateAdapter only until contracts |
| **P7.6** | Payme/Click integration | **BLOCKED** until official contracts |
| **P7.7** | Refund domain + optional explicit cashback REVERSAL calls | ≠ auto cashback reverse |
| **P7.8** | Serializers / API compatibility | No Expo redesign |
| **P7.9** | Test matrix | Include PAID≠earn/consume |
| **P7.10** | Final production-readiness audit | Cutover gates below |

### Sequence rationale (repository-driven)

Order unchanged from analysis: foundation and idempotency before webhooks; adapter boundary before providers; refunds after capture model; API/tests/audit last. Live PSP last because contracts are the external gate. No evidence requires reordering.

---

## J. Production cutover gates (PSP)

**PRE-CUTOVER**

1. Backup / restore point.  
2. Versioned migrations through P7 payment foundation applied (when implemented).  
3. `ALLOW_PAYMENT_SIMULATE` disabled in production-like.  
4. Official contracts available for enabled providers.  
5. Webhook verification proven in sandbox.  
6. Idempotency + one-capture proven.  
7. Amount verification proven.  
8. Secrets not in customer DTOs; AuthZ on admin payment routes.  
9. PAID≠earn and PAID≠consume smoke confirmed.  
10. Reconciliation procedure defined.

**CUTOVER**

1. Apply migrations only (`db:migrate`) — never `push --force`.  
2. Enable verified webhooks.  
3. Smoke: create intent → capture → status PAID; duplicate webhook no-op.  
4. Confirm no cashback earn / inventory consume on PAID alone.

**POST-CUTOVER**

1. Monitor duplicate capture / webhook retries.  
2. Monitor amount mismatch rejects.  
3. Monitor simulate endpoint remains dark.  
4. Monitor refund vs cashback divergence.  
5. Reconciliation job / report (may land with later ops phase).

**Rollback plan:** required before enabling live capture (disable provider adapter; halt new intents; reconcile open attempts).

---

## K. Explicit non-goals (this lock)

- No application code, schema, migrations, API, UI, `.env`, or package changes in P7.0.  
- No real Payme/Click integration.  
- No invented webhook payloads or merchant credentials.  
- No redesign of P4 inventory, P5 orders, or P6 cashback.  
- No FOM contract invention.  
- No Expo redesign.  
- No destructive DB reset.

---

## L. Cross-lock summary

| Lock | Payment must respect |
|------|----------------------|
| P4 | PAID ≠ CONSUME |
| P5 | Separate axes; transition service for order payment axis updates |
| P6 | PAID ≠ EARN; refund cashback only via explicit REVERSAL when policy says so |
| Q8 | Intent/attempt/txn; verified webhooks; server amount; secrets private |

---

**P7.0 STATUS:** Architecture LOCKED. Implementation not performed. Real PSP remains the external integration gate.
