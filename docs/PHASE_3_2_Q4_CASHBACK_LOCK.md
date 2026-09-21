# Q4 LOCK — Cashback Architecture and Idempotency

**Status:** LOCKED (architecture only)  
**Mode:** Documentation / design only — **no application implementation**  
**Depends on:** Phase 2.5 business rules, Phase 3.1 financial truth, Q2 three-axis order model  
**Does not lock:** Q3 (FOM sale-closed semantics / pickup earn event)

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | Q4 |
| Scope | Cashback earn, spend, identity, idempotency, reversals (architecture) |
| Implementation | Forbidden in this phase |
| Schema / migrations / API / UI | Not modified in this phase |

---

# LOCKED decisions

## 1. Cashback earn trigger

| Rule | Status |
|------|--------|
| `payment_status = PAID` alone **MUST NOT** earn cashback | **LOCKED** |
| Earn is tied to a **valid commercial fulfillment / completion** event | **LOCKED** |
| **DELIVERY:** earn on delivery fulfillment **COMPLETED** | **LOCKED** |
| **PICKUP:** exact earn event **depends on Q3** | **NOT LOCKED** |

### Q3 cases (preserved, not locked)

| Case | FOM sale-closed meaning | Pickup earn (conceptual) |
|------|-------------------------|----------------------------|
| **A** | Customer handoff | May earn at FOM / completion |
| **B** | Preparation / payment only | Earn only after customer collection / completion |

---

## 2. One commercial transaction = one EARNED

**LOCKED:**

One commercial transaction may create **at most ONE** `EARNED` cashback ledger entry.

The same commercial transaction may be observed via:

- FOM event  
- App completion event  
- Retry  
- Duplicate webhook  
- Concurrent requests  

All must resolve to the **same commercial identity**. **No double cashback.**

---

## 3. Shared idempotent earn service

**LOCKED:**

FOM and app fulfillment use the **same** conceptual cashback earn service.  
Do **not** maintain separate independent earn implementations long-term.

```
eligible completion event
  → resolve commercial transaction
  → idempotency check
  → calculate eligible cashback
  → create EARNED ledger entry
  → update authoritative cashback account
  → commit atomically
```

Repeated invocation → same financial result, **no** duplicate `EARNED` rows.

---

## 4. Commercial transaction identity

**LOCKED principle:**

Cashback uses a **stable commercial transaction identity** linking:

```
APP ORDER  ↔  FOM/POS RECEIPT/SALE
```

| Rule | Status |
|------|--------|
| Payment provider transaction ID ≠ automatic commercial sale ID | **LOCKED** |
| FOM without `orderCode` must **not** silently create a second commercial for the **same** app sale | **LOCKED** (§13) |
| If identity cannot be resolved safely → treat as **unresolved / reconcilable**, not silent duplicate finance | **LOCKED** |

**Implementation prerequisite (not built now):**  
Repository currently lacks a universal `commercial_transactions` (or equivalent) entity. App earn keys on `orderId` / `order.code`; walk-in on `receiptId` with `orderId` null. Introducing a linking commercial identity is **required future work**.

---

## 5. Cashback financial source of truth

**LOCKED:**

| Layer | Role |
|-------|------|
| `cashback_ledger` | Financial **event history** (authoritative for what happened) |
| `cashback_accounts` | Authoritative **current balance** once implemented |
| `customers.balance` | **LEGACY / DERIVED** — must not remain an independent financial writer |

Ultimately: **ONE** authoritative balance model (account + ledger in the same transaction).

---

## 6. Reversals

**LOCKED:**

If cashback was already `EARNED` and the underlying transaction is later:

- cancelled  
- refunded  
- partially refunded  

then the appropriate cashback **reversal** must appear in the ledger.

| Rule | Status |
|------|--------|
| Reversal references the original cashback entry | **LOCKED** |
| Same original `EARNED` must not be reversed twice | **LOCKED** |

Exact partial-refund **formula** remains **OPEN** (§10).

---

## 7. Cancellation before earn

**LOCKED:**

| Situation | Rule |
|-----------|------|
| Cancel **before** earn | No `EARNED` entry; no cashback becomes available |
| Cashback already **USED** on that order | Restoration / reversal follows ledger rules |

---

## 8. Cashback spending

**LOCKED:**

| Rule | Detail |
|------|--------|
| Spend rules | **Server-authoritative** |
| Client | Must **never** be trusted for allowed amount |
| Maximum spend | **CONFIGURABLE** |
| Target business requirement | **30%** of eligible order amount |

### Known implementation gap (do not fix in this phase)

| Current code | Future locked rule |
|--------------|-------------------|
| `MAX_SPEND_RATIO = 1` (100%) in `lib/cashback.ts` | Configurable maximum, **intended 30%** |

Recorded as **required implementation change**.

---

## 9. Cashback spend idempotency

**LOCKED:**

Usage must be **idempotent** and **transactional**.

Retries must not deduct twice. Concurrent requests must not allow:

- negative balance  
- overspending  
- duplicate `USED` entries  

```
validate eligible amount
  → lock/serialize balance operation
  → create USED ledger entry
  → update account balance
  → commit atomically
```

---

## 10. Partial refund — OPEN

Architecture must **support** proportional reversal for amount-based cashback.  
**Exact formula and edge cases** remain a separate business decision — **NOT LOCKED**.

---

## 11. Loyalty rate — OPEN

Cashback **rate source** (tier thresholds, configurable levels) remains **OPEN** until loyalty policy is finalized.  
Do not hardcode future loyalty behavior in this lock.

---

## 12. Expiry / lot accounting — OPEN

Cashback TTL / expiry / FIFO lots remain **OPEN**. May be added later if required.

---

## 13. FOM without orderCode

**LOCKED:**

A FOM event without app `orderCode` must **not** accidentally create a second commercial transaction for the same app sale.

Deterministic identity / reconciliation strategy required.  
If unsafe to resolve → **unresolved / reconcilable**, not silent duplicate financial activity.

---

## 14. Q3 dependency

| Item | Status |
|------|--------|
| Q3 | **Remains OPEN** |
| FOM pickup → COMPLETED | **NOT LOCKED** |
| FOM pickup → READY_FOR_PICKUP | **NOT LOCKED** |
| Exact pickup cashback trigger | **NOT LOCKED** |
| Delivery cashback | Conceptually tied to delivery **COMPLETED** — **LOCKED** |

---

# Current implementation vs future contract

| Topic | Current (evidence, not future contract) | Future locked architecture |
|-------|-------------------------------------------|----------------------------|
| Max spend | `MAX_SPEND_RATIO = 1` | Configurable, intended **30%** |
| Earn callers | Separate paths; FOM → `completeOrderCashback` | Shared idempotent commercial earn service |
| Balance | `customers.balance` written directly | Ledger + `cashback_accounts` |
| Commercial id | Order id / receipt id split | Stable APP ORDER ↔ FOM/POS RECEIPT link |
| Reversal | POS `void` only; cancel lacks full ledger reverse | Ledger REVERSAL referencing original |

Do **not** reinterpret current implementation as the future contract.

---

# Required future implementation work (gaps)

Do **not** implement in this phase:

1. Commercial transaction entity / identity  
2. Unique `EARNED` per commercial transaction  
3. Unique / idempotent `USED` per commercial / order transaction  
4. `cashback_accounts`  
5. Eliminate dual `customers.balance` writers  
6. Ledger reversal support (`reverses_entry_id`, idempotent reverse)  
7. Concurrent spend protection (`FOR UPDATE` / equivalent)  
8. Concurrent earn protection (unique + conflict handling)  
9. Configurable **30%** maximum spend enforcement  
10. FOM / walk-in commercial identity reconciliation  
11. Correct cashback calculation timing (eligible event, not only checkout snapshot misuse)  
12. Partial refund handling  
13. Refund / cancel integration with cashback  

---

# LOCKED vs OPEN

## LOCKED

| # | Decision |
|---|----------|
| 1 | PAID alone does not earn |
| 2 | One commercial transaction → maximum one EARNED |
| 3 | Shared idempotent earn service |
| 4 | Stable commercial identity (APP ORDER ↔ FOM/POS RECEIPT) |
| 5 | Ledger / account financial truth; `customers.balance` legacy |
| 6 | Cancel/refund after earn requires reversal (no double reverse) |
| 7 | Cancel before earn → no EARNED |
| 8 | Server-authoritative cashback spend |
| 9 | Configurable maximum spend; target **30%** |
| 10 | Delivery earn on fulfillment **COMPLETED** |
| 11 | FOM must not silently create duplicate commercial identity |
| 12 | Spend/earn operations conceptually atomic and idempotent |

## OPEN

| # | Decision |
|---|----------|
| 1 | **Q3** pickup earn event (Case A vs B) |
| 2 | Exact partial refund formula |
| 3 | Loyalty rate source / thresholds |
| 4 | Cashback expiry / TTL / lot accounting |
| 5 | Remaining COD-specific cashback edge behavior |

---

# Consistency

| Source | Result |
|--------|--------|
| Phase 2.5 | Aligned — dual earn sources, no double earn, 30% intent, PAID ≠ earn |
| Phase 3.1 | Aligned — ledger truth, commercial uniqueness design, balance single writer |
| Q2 | Aligned — delivery COMPLETED; payment axis separate from earn |
| Q3 | Explicitly open; pickup earn conditional |
| Current `MAX_SPEND_RATIO = 1` | Documented as **defect/gap**, not approved permanent rule |

---

**Q4 LOCK COMPLETE — CASHBACK ARCHITECTURE LOCKED — Q3 REMAINS OPEN — NO IMPLEMENTATION PERFORMED.**
