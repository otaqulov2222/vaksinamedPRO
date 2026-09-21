# Q5 TECHNICAL LOCK — Refund and Cashback Reversal Safety

**Status:** LOCKED (technical architecture / safety only)  
**Mode:** Documentation / design only — **no application implementation**  
**Depends on:** Q4 cashback architecture lock, Phase 3.1 ledger truth  
**Does not lock:** Final business refund formula or already-used cashback policy

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | Q5 (technical) |
| Scope | Refund/reversal **safety** architecture |
| Implementation | Forbidden in this phase |
| Schema / migrations / API / UI | Not modified in this phase |

---

# IMPORTANT DISTINCTION

**This document locks technical safety rules.**

**It does NOT lock** the final VaksinaMed business refund formula.

## Business decisions that remain OPEN

1. Partial refund formula: proportional / item-based / final-order recalculation  
2. Treatment when cashback was already spent and reversal exceeds available balance  
3. Negative cashback balance / debt / refund blocking policy  
4. Promo-adjusted eligible amount  
5. Exact rounding remainder policy  
6. FOM/PSP refund event contract  
7. Whether cancellation must always create a USE reversal as a mandatory business rule  

Do **not** invent answers for these.

**Technical note (not a business lock):** Repository analysis found **proportional** reversal to be the closest fit to current order-level earn storage. That remains a **recommendation**, not an approved business rule.

---

# LOCKED decisions

## 1. Immutable financial history

**LOCKED:**

Original cashback ledger entries must **never** be deleted or silently rewritten because of refund/cancellation.

Refund/cancellation after `EARNED` must create a separate **REVERSAL** financial event referencing the original `EARNED` entry.

```
EARNED  (immutable)
  ↓
REVERSAL
```

The original `EARNED` remains auditable forever.

---

## 2. Reversal idempotency

**LOCKED:**

One logical refund/reversal event → **at most one** corresponding reversal financial effect.

Repeated webhook/event delivery must not create multiple reversals.

The system must have a **stable refund/reversal identity**.

Candidate identity sources (whichever the contract supplies):

- refund event ID  
- provider refund ID  
- FOM refund/void ID  
- commercial transaction + refund sequence  

**Do not assume** which provider identifier exists.  
The real FOM/PSP contract **must** supply a stable identifier before production refund processing.

---

## 3. Reversal boundary

**LOCKED:**

Total cashback reversal for one `EARNED` entry must **never** exceed the reversible cashback amount attributable to that `EARNED` entry.

```
total_reversed <= original_earned
```

Repeated partial refunds must accumulate safely.

Example:

| Step | Reversal | Cumulative |
|------|----------|------------|
| Original EARNED | 10,000 | — |
| Refund #1 | 2,000 | 2,000 |
| Refund #2 | 3,000 | 5,000 |
| Refund #3 | 5,000 | 10,000 |

A **duplicate** refund must not create another reversal.  
Any attempt to exceed `original_earned` must be **rejected or reconciled safely**.

Final business behavior for the “excess” case (reject vs reconcile) remains **OPEN** — safety requires it never silently over-reverse.

---

## 4. Refund event vs cashback event separation

**LOCKED:**

A payment refund/void event and a cashback reversal are **related but not the same** financial record.

```
REFUND EVENT
  → resolve commercial transaction
  → resolve original EARNED cashback
  → calculate allowed reversal
  → create REVERSAL
  → update cashback account/balance atomically
```

Do **not** merge payment/refund records with cashback ledger records.

---

## 5. Commercial transaction linkage

**LOCKED:**

Every cashback reversal must be traceable to:

- original `EARNED` entry  
- commercial transaction  
- app order where available  
- refund event identity  
- source system / provider  

Do **not** silently create a new commercial transaction during refund processing.

---

## 6. Full refund behavior (architecture level)

**LOCKED:**

For a full refund after cashback was earned:

```
EARNED → REVERSAL
```

Reversal amount cannot exceed original earned amount.

Exact formula details for **partial** / promo cases remain **OPEN**.

---

## 7. Partial refund safety

**LOCKED** (regardless of final business formula):

Architecture must support:

- multiple partial refunds  
- refund retries  
- duplicate refund webhooks  
- concurrent refund events  
- refund after previous reversal  
- refund after cashback usage  

Must prevent:

- double reversal  
- reversal greater than original `EARNED`  
- corrupted cashback balance  
- deletion of original financial history  

---

## 8. Transactional consistency

**LOCKED:**

Cashback reversal and authoritative cashback account/balance update must be **one atomic financial operation**.

```
BEGIN
  1. resolve original EARNED
  2. lock / check reversible amount
  3. verify refund idempotency
  4. calculate permitted reversal
  5. create REVERSAL ledger entry
  6. update authoritative cashback account
COMMIT
```

If any required step fails → **no** partial financial state committed.

---

## 9. Concurrency protection

**LOCKED:**

Design must be safe when:

- two identical refunds arrive simultaneously  
- two different partial refunds arrive simultaneously  
- refund and cashback spend happen simultaneously  
- webhook retry during transaction timeout  
- reversal retry after ambiguous network failure  

Must prevent:

- negative balance caused by race (unless future business policy explicitly allows debt — still OPEN)  
- duplicate reversal  
- reversal exceeding original `EARNED`  
- double cashback restoration  

---

## 10. Money precision principle

**LOCKED:**

Cashback and refund calculations must use **exact** monetary representation.

Do **not** use binary floating point for financial calculations.

Final **rounding remainder** policy remains **OPEN**.

Integer smallest-unit (UZS soʻm) or exact decimal may be used per final DB design — **not** changed in this phase.

---

## 11. Auditability

**LOCKED** (target architecture):

Every `REVERSAL` must be auditable and conceptually identify:

- original `EARNED`  
- commercial transaction  
- order (when available)  
- refund event  
- source / provider  
- reversal amount  
- creation timestamp  
- reason / type  

Do not require fields that do not yet exist in the repository; document as **target**.

---

## 12. Cancel before earn

**LOCKED:**

If cancellation occurs before cashback has legitimately been earned:

- no `EARNED` entry is created  
- no `EARNED` reversal is created  

**OPEN:** If cashback was already `USED` as part of the order, separate USE-reversal behavior requires business confirmation (Q4 noted gap vs current balance-only restore).

---

## 13. Partial refund formula — OPEN

Architecture **supports** proportional / item-based / final-recalculation approaches.

**Do NOT lock** one as the final VaksinaMed business rule.

**Recommendation only:** proportional is closest to current order-level earn storage.

---

## 14. Promotions — OPEN

Do not lock how promotions/discounts affect refundable eligible cashback amount.

Eventually the calculation engine must receive a deterministic eligible refund amount. Policy OPEN.

---

## 15. Already-used cashback — OPEN

Do **not** decide: negative balance, debt, future offset, refund blocking, manual reconciliation.

Architecture must nevertheless **detect** when:

```
required reversal > currently available cashback
```

Do **not** silently create an invalid negative balance unless business policy **explicitly** allows it.

---

# Current implementation gaps (future work)

Do **not** fix in this phase:

- no complete app refund API  
- no app `REVERSAL` implementation  
- no universal refund idempotency key  
- no partial-refund cashback calculation  
- no complete FOM/PSP refund event contract  
- incomplete cancellation / reversal behavior  
- no safe handling of already-used cashback reversal  
- `MAX_SPEND_RATIO = 1` remains a **separate** known gap (Q4)  

---

# LOCKED vs OPEN

## LOCKED

| # | Decision |
|---|----------|
| 1 | Immutable original `EARNED` history |
| 2 | `REVERSAL` as separate ledger event |
| 3 | One logical refund event → max one reversal effect |
| 4 | Total reversal cannot exceed original `EARNED` |
| 5 | Refund identity must be stable / idempotent |
| 6 | Commercial transaction linkage required |
| 7 | Refund domain ≠ cashback ledger domain |
| 8 | Reversal + account update atomic |
| 9 | Concurrency protected |
| 10 | Exact money representation (no float) |
| 11 | Auditability of REVERSAL |
| 12 | Cancel-before-earn creates no `EARNED` / no earn reversal |

## OPEN

| # | Decision |
|---|----------|
| 1 | Partial refund formula (A / B / C) |
| 2 | Already-used cashback handling |
| 3 | Negative balance / debt / block refund |
| 4 | Promo treatment |
| 5 | Exact rounding remainder |
| 6 | FOM/PSP refund contract |
| 7 | USE reversal on cancellation (business rule) |

---

# Consistency

| Source | Result |
|--------|--------|
| Q4 | Aligned — reversals, commercial id, ledger truth, no double reverse |
| Q5 analysis | Safety rules locked; business formula left open |
| Repository | Gaps documented; current cancel/POS void not treated as complete future contract |

---

**Q5 TECHNICAL LOCK COMPLETE — REFUND/REVERSAL SAFETY LOCKED — BUSINESS REFUND POLICY REMAINS OPEN — NO IMPLEMENTATION PERFORMED.**
