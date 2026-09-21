# Q8 LOCK — Payment Architecture and Financial Safety

**Status:** LOCKED (technical payment architecture / financial safety only)  
**Mode:** Documentation / design only — **no application implementation**  
**Depends on:** Q2 three-axis order state; Q4 cashback; Q5 refund/reversal safety; Q8 analysis  
**Does not lock:** Provider-specific contracts or numeric business payment policies  
**Must not reopen:** Q1, Q2, Q4, Q5, Q6, Q7; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | Q8 |
| Scope | Payment lifecycle, verification, idempotency, secrets, refunds, reconciliation, client trust |
| Implementation | Forbidden in this phase |
| Schema / migrations / API / UI / `.env` | Not modified in this phase |
| Prior analysis | [`PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_ANALYSIS.md`](PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_ANALYSIS.md) |

---

# IMPORTANT

**Do NOT lock provider-specific contracts or numeric business policies.**

## MUST remain OPEN

- exact Payme contract  
- exact Click contract  
- provider signatures / authentication details  
- supported payment methods  
- payment expiration  
- retry policy  
- pay-at-pickup policy  
- COD policy  
- refund provider contract  
- partial refund business policy  
- reconciliation frequency  
- payment secret ownership / access  
- FOM / payment relationship  
- whether FOM may mark branch payment PAID  
- exact provider-specific state mappings  

---

# LOCKED decisions

## 1. Payment / fulfillment separation

**LOCKED:**

Payment lifecycle and order fulfillment lifecycle are **separate domains**.

Target payment axis (from Q2):

```text
PENDING
PAID
FAILED
REFUNDED
PARTIALLY_REFUNDED
```

Do **not** use legacy `orders.status` as the long-term authoritative payment state.

Payment status must **not** automatically determine fulfillment status.

---

## 2. Server-authoritative payment state

**LOCKED:**

The mobile/client application must never be authoritative for:

- payment success  
- payment status  
- captured amount  
- refund status  
- provider transaction identity  

The server must determine payment state from **verified** provider events/contracts or trusted internal payment events.

**Known critical gap:** current `simulate-success` behavior. Do **not** remove in this phase — mandatory future work.

---

## 3. Provider verification

**LOCKED:**

A payment provider callback/webhook cannot be trusted merely because it reaches the API.

Production provider events must eventually have:

- provider authentication / signature verification  
- provider transaction identity  
- amount verification  
- order / payment linkage verification  
- idempotency / replay protection  

Do **not** invent Payme/Click signature rules until actual provider contracts are available.

---

## 4. Payment intent / attempt / transaction separation

**LOCKED conceptual model:**

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
payment_status
```

A failed payment attempt must remain distinguishable from a successful payment transaction.

---

## 5. One successful capture per order

**LOCKED:**

An order must not accidentally receive multiple successful financial captures.

Must prevent duplicate successful captures from:

- double-click payment  
- client retry  
- provider retry  
- concurrent callbacks  
- repeated payment confirmation  

---

## 6. Provider transaction identity

**LOCKED:**

Provider transaction identity must be stored and reconciled **separately** from internal IDs.

**Known gap:** current `externalId` is local and is **NOT** a trustworthy provider transaction ID.

Target architecture must distinguish:

- internal payment intent ID  
- internal payment attempt ID  
- provider transaction ID  
- provider event ID  
- commercial transaction ID where applicable  
- order ID / orderCode  

---

## 7. Callback idempotency

**LOCKED:**

Repeated provider callbacks must produce the **same** financial result.

Safe against: duplicate callback, concurrent callback, callback retry, callback after timeout, callback after client disconnect, callback after internal transaction retry.

One logical provider event must not create multiple successful payment effects.

---

## 8. Amount integrity

**LOCKED:**

Payment amount must be calculated and validated **server-side**.

Client-provided payment amount must never be the authoritative financial amount.

Before accepting payment success, the server must verify expected amount against:

- order amount  
- eligible discounts  
- cashback USED  
- delivery fee where applicable  
- currency  

**Positive finding:** current repository already computes order totals server-side. Do not modify in this phase.

---

## 9. Money representation

**LOCKED:**

Financial payment amounts must use **exact** monetary representation.

Current integer so‘m (UZS-only) is acceptable for the current model.

Do **not** introduce floating-point financial calculations.

Future multi-currency must be explicitly designed if ever required.

---

## 10. Payment secrets

**LOCKED:**

Payment provider secrets must never be exposed through customer/public branch APIs.

Target direction:

```text
branch / payment account configuration
+ restricted privileged access
+ secure secret storage
```

Merchant identifiers may be public only where the provider contract explicitly requires it; private credentials/secrets must remain protected.

**Known gap:** current branch-row payment configuration / partial public exposure.

---

## 11. Refund separation

**LOCKED:**

Payment refund and cashback reversal are **separate** financial domains.

```text
PAYMENT → REFUND

REFUND → CASHBACK REVERSAL  (when applicable; Q4/Q5)
```

A payment refund must not be represented only as a cashback reversal.  
A cashback reversal must not be treated as proof that a PSP refund happened.

---

## 12. Refund idempotency

**LOCKED:**

Refund processing must eventually be **idempotent**.

Repeated refund callbacks/retries must not create duplicate refund effects.

A refund must have a stable provider/internal refund identity.

Total refunded amount must never exceed the captured / payment amount.

(Business partial-refund formula remains OPEN under Q5.)

---

## 13. Payment reconciliation

**LOCKED:**

Production payment architecture must support reconciliation:

```text
INTERNAL SYSTEM  ↔  PAYMENT PROVIDER
```

Must be able to identify:

- provider PAID / internal PENDING  
- internal PAID / provider FAILED  
- amount mismatch  
- unknown provider transaction  
- duplicate provider transaction  
- provider REFUNDED / internal not refunded  
- internal refund / provider refund mismatch  

Reconciliation must **not** rely only on browser/client callbacks.

---

## 14. Failure / retry safety

**LOCKED:**

A network failure must not by itself imply financial failure or financial success.

| Scenario | Requirement |
|----------|-------------|
| Provider succeeds → callback lost | Recover via provider verification / reconciliation |
| Callback succeeds → response lost | Must not cause second capture on retry |
| DB fails after provider success | Reconciliation recovers internal state |

---

## 15. Cashback boundary

**LOCKED (preserve Q4):**

```text
PAYMENT PAID  ≠  CASHBACK EARN
```

Cashback earning remains governed by Q4 commercial / fulfillment architecture.

Payment processing may provide financial facts but must not independently create duplicate cashback earning.

Do **not** reopen Q4.

---

## 16. Cashback USED / payment failure safety

**LOCKED (preserve Q4/Q5 principles):**

Current repository uses cashback at order creation before payment — **known gap**.

Target architecture must ensure payment failure or order cancellation cannot permanently destroy or double-spend cashback.

Exact USE reversal business policy remains subject to **Q5 OPEN** decisions.

---

## 17. Reservation / payment separation

**LOCKED (preserve Q1/Q2):**

Reservation is a separate lifecycle.

Payment success must not itself become inventory truth.

Payment failure must not be treated as an inventory event unless order/reservation policy explicitly requires the corresponding transition.

**Known gap:** stock is decremented at order creation, including unpaid online orders — conflicts with locked reservation architecture. Do **not** change now. Do **not** reopen Q1.

---

## 18. Pay-at-pickup / COD (not locked as policy)

**Document only — policies remain OPEN:**

- `payment PENDING` may coexist with a valid fulfillment state where business policy permits  
- FOM may update payment only if its real contract permits it  
- FOM completion semantics remain **Q3 OPEN**  
- COD must not be assumed production-supported solely because method strings exist  

Current repository payment method strings are **not** sufficient evidence of production support.

---

## 19. Auditability

**LOCKED:**

Payment operations must be auditable.

Target events include:

- payment intent creation  
- payment attempt  
- provider event  
- verification result  
- successful capture  
- failed attempt  
- cancellation  
- refund / partial refund  
- reconciliation  
- amount mismatch  
- provider transaction ID  

Do **not** log provider secrets or sensitive credentials.

---

## 20. Client trust boundary

**LOCKED:**

The client must never be able to directly establish:

- PAID  
- REFUNDED  
- payment transaction identity  
- provider success  
- capture amount  

**Critical production blockers (do not fix now):**

- `simulate-success` endpoint  
- unauthenticated delivery status mutation where it affects payment/fulfillment trust  

---

## 21. Payment state transitions

**LOCKED conceptually:**

```text
PENDING → PAID | FAILED
PAID    → REFUNDED | PARTIALLY_REFUNDED
```

Do not allow arbitrary client-side state mutation.

Invalid financial transitions must be rejected by backend / domain rules.

Exact provider-specific transition details remain **OPEN**.

---

## 22. Reconciliation as first-class capability

**LOCKED:**

Reconciliation is **not** an optional reporting feature. It is required for production payment reliability.

Architecture must support:

- provider transaction lookup  
- internal transaction lookup  
- status comparison  
- amount comparison  
- refund comparison  
- unresolved transaction queue / state  
- retry / reconciliation processing  

---

# Current critical gaps (future work)

Do **not** fix in this phase:

1. Replace `simulate-success` production behavior  
2. Real Payme integration contract  
3. Real Click integration contract  
4. Provider signature / authentication  
5. Provider transaction IDs  
6. Payment intent / attempt / transaction separation  
7. One successful capture per order  
8. Callback idempotency  
9. Replay protection  
10. Payment refund implementation  
11. Refund idempotency  
12. Payment reconciliation  
13. Secure payment secret storage  
14. Payment audit trail  
15. Payment status axis implementation  
16. Remove client trust for financial state  
17. Fix unpaid-order stock decrement to follow reservation architecture  
18. Resolve cashback USED / payment-failure behavior  
19. FOM / payment relationship  
20. COD / pay-at-pickup production policy  

---

# LOCKED vs OPEN

## LOCKED

| # | Principle |
|---|-----------|
| 1 | Payment lifecycle separate from fulfillment lifecycle |
| 2 | Server / provider verification authoritative |
| 3 | Client cannot mark PAID |
| 4 | Provider events require authentication / verification in production |
| 5 | Payment intent / attempt / transaction are separate concepts |
| 6 | One order cannot have duplicate successful captures |
| 7 | Provider transaction identity distinct from internal IDs |
| 8 | Callbacks must be idempotent |
| 9 | Server validates payment amount |
| 10 | Exact money representation (no float finance) |
| 11 | Payment secrets never public |
| 12 | Refund separate from cashback reversal |
| 13 | Refund processing idempotent; reverse ≤ captured |
| 14 | Reconciliation required |
| 15 | Retries / network failures safely recoverable |
| 16 | Payment does not independently trigger cashback earn |
| 17 | Payment does not become inventory truth |
| 18 | Payment operations auditable |
| 19 | Client cannot control financial state |
| 20 | Conceptual payment_status transitions enforced server-side |

## OPEN

| # | Decision |
|---|----------|
| 1 | Payme contract |
| 2 | Click contract |
| 3 | Provider signature details |
| 4 | Payment methods |
| 5 | Payment expiry |
| 6 | Retry policy |
| 7 | Pay-at-pickup |
| 8 | COD |
| 9 | Refund business policy |
| 10 | Partial refund policy |
| 11 | Reconciliation frequency |
| 12 | Payment secret ownership / access |
| 13 | FOM payment behavior |
| 14 | Exact provider-specific state mappings |

---

# Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1 inventory | Not reopened — unpaid stock decrement recorded as gap |
| Q2 three-axis | Reinforced — `payment_status` is authoritative payment axis |
| Q3 FOM | Remains **OPEN** |
| Q4 cashback | Not reopened — PAID ≠ earn preserved |
| Q5 refund/reversal | Not reopened — refund ≠ cashback REVERSAL preserved |
| Q6 loyalty | Not reopened |
| Q7 auth/OTP | Not reopened |

---

**Q8 LOCK COMPLETE — PAYMENT ARCHITECTURE AND FINANCIAL SAFETY LOCKED — PROVIDER CONTRACTS REMAIN OPEN — NO IMPLEMENTATION PERFORMED.**
