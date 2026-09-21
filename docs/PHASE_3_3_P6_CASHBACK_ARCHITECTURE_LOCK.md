# P6 LOCK — Cashback Financial Safety Architecture

**Status:** LOCKED (architecture only)  
**Mode:** Documentation / design only — **no application implementation**  
**Date context:** After P6 cashback analysis; P5 order domain complete  
**Depends on:** Q4 / Q5 / Q6 locks; Phase 3.1 financial truth; P5 order axes; P6 analysis  
**Does not lock:** Q3 (FOM pickup earn timing); partial-refund **formula**; live PSP refund contracts; loyalty tier thresholds

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | P6 |
| Scope | Cashback accounts, ledger, commercial identity, earn/spend/reversal, concurrency, cutover |
| Implementation | Forbidden in this lock turn |
| Schema / migrations / API / UI / .env / packages | Not modified in this turn |
| Canonical analysis input | P6 cashback analysis (conversation) |
| Prior architecture | [`PHASE_3_2_Q4_CASHBACK_LOCK.md`](PHASE_3_2_Q4_CASHBACK_LOCK.md), [`PHASE_3_2_Q5_REFUND_REVERSAL_SAFETY_LOCK.md`](PHASE_3_2_Q5_REFUND_REVERSAL_SAFETY_LOCK.md) |

---

## A. Current architecture (repository evidence)

| Component | Current state |
|-----------|---------------|
| Balance SoT | **`customers.balance`** (independent writers) — **violates** target SoT |
| History | `loyalty_ledger` (`kind`: earn/use/void); `external_id` **INDEX only**, not UNIQUE |
| Accounts table | **`cashback_accounts` MISSING** |
| Typed ledger | **`cashback_ledger` with EARNED/USED/REVERSAL MISSING** |
| Commercial identity | **MISSING** — order earn keys on `orderId`/`order.code`; walk-in on `pos_sales.receipt_id` |
| Spend cap | `MAX_SPEND_RATIO = 1` in `lib/cashback.ts` (100%) vs Q4 target 30% |
| Earn | Soft check-then-insert in `completeOrderCashback`; raceable |
| USE | At order **create**; cancel restores balance **without** ledger reverse |
| Payment | PAID alone does **not** earn (P5 simulate) — **keep** |
| FOM | Order path: legacy `status=completed` + earn; walk-in: POS immediate earn; no shared commercial_tx |
| Loyalty redeem | Writes `customers.balance` with **no** ledger |
| Integer money | Compliant (UZS integer soʻm) |

### Legacy balance writers (must migrate / remove as independent writers)

| Writer | Location | Notes |
|--------|----------|-------|
| Order USE | `routes/orders.ts` | Debit at create |
| Order EARN | `completeOrderCashback` | Soft idempotent |
| Cancel USE restore | `routes/orders.ts` | No ledger reverse |
| POS confirm | `lib/pos.ts` / routes | USE+EARN |
| POS void | `lib/pos.ts` | Balance reverse + `void` |
| Loyalty redeem | `routes/loyalty.ts` | No ledger |
| Register / profile seed | `auth.ts` / `loyalty.ts` | Phantom balance risk |
| Demo seed | `lib/db/src/seed.ts` | Dev only |

**Locked rule:** No **new** domain code may introduce another cashback balance writer outside the single authoritative account+ledger path.

---

## B. Locked invariants

1. **SoT:** `cashback_accounts` + `cashback_ledger` are the only financial authority for cashback balance.  
2. **`customers.balance`:** legacy/derived mirror only during compatibility — **never** independent SoT.  
3. **One mutation path:** exactly one authoritative service mutates account balance (always with a ledger row in the same DB transaction).  
4. **One commercial → ≤ one successful EARN.** DB uniqueness required; check-then-insert alone is forbidden as sole protection.  
5. **FOM and app completion** converge on the **same** idempotent earn service + commercial identity.  
6. **PAID ≠ earn.** Earn only on approved completion / supported FOM sale-closed event.  
7. **Spend:** concurrency-safe; available cashback never negative; duplicate USE prevented by identity + uniqueness.  
8. **Max spend:** server-controlled configurable ratio; **target business value 30%** of eligible goods (not delivery); client never authoritative.  
9. **Historical duplicates:** reconcile with explicit **REVERSAL** + audit — **never blind delete**.  
10. **Ledger** supports `reverses_entry_id` (or equivalent) linking REVERSAL → original EARNED/USED.  
11. **Redis is never** cashback financial truth. PostgreSQL transactions are.  
12. **Exact integer** monetary amounts (soʻm).  
13. **Do not invent** FOM API/stock contracts or live PSP behavior.  
14. **Pickup earn timing remains OPEN under Q3** — do not guess.

---

## C. Data model direction

### Tables (target — not created in this lock)

| Entity | Role |
|--------|------|
| `cashback_accounts` | One per customer (or explicit account id); `balance` denormalized cache |
| `cashback_ledger` | Append-oriented financial history; entry types below |
| `commercial_transactions` (or equivalent) | Stable commercial identity for earn/use uniqueness |
| Settings / config | `cashback.max_spend_ratio` (default **0.30**), not a permanent hardcode in business logic |

### Ledger entry types (locked direction)

| Type | Meaning |
|------|---------|
| `EARNED` | Credit from eligible commercial completion / FOM sale-closed |
| `USED` | Debit for spend/redemption against a commercial/order |
| `REVERSAL` | Explicit correction referencing `reverses_entry_id` |
| Optional later | `ADJUSTMENT` (admin RBAC), `EXPIRED` (if TTL policy locked later) |

### Commercial transaction identity (locked principle; field OPEN if unknown)

| Source | Identity direction |
|--------|-------------------|
| App order | Resolve to commercial_tx linked to `orders.id` / `orders.code` |
| FOM sale with `orderCode` | **Must resolve to the same** commercial_tx as that order — never a second EARN |
| FOM / POS walk-in | Commercial_tx keyed by **real** external receipt/cheque identity when the integration provides one |
| If external id unreliable | Document as **OPEN contract field** — do **not** invent placeholder production IDs |

**OPEN (not invented):** exact FOM payload field name/format for receipt identity beyond what the repo already documents (`receiptId` / cheque aliases in current bridge).

### Uniqueness (locked)

| Constraint | Purpose |
|------------|---------|
| UNIQUE successful `EARNED` per `commercial_transaction_id` | One earn |
| UNIQUE successful `USED` per commercial/order spend identity | One use (or idempotent key) |
| UNIQUE REVERSAL of a given original entry (or `(reverses_entry_id, entry_type)`) | No double reverse |
| Ledger idempotency key UNIQUE when present | Retry safety |

---

## D. Earn model

| Rule | Status |
|------|--------|
| Shared earn service for FOM + app | **LOCKED** |
| Input: commercial_tx + amount + source + actor | **LOCKED** |
| Delivery: earn on fulfillment **COMPLETED** | **LOCKED** (Q4) |
| App: not on PAID alone | **LOCKED** |
| Pickup exact event | **OPEN — Q3** |
| FOM sale-closed may earn where real integration supports it | **LOCKED principle**; semantics OPEN under Q3 for pickup |
| Concurrent earns | Exactly one succeeds; others idempotent no-op or conflict |

### Amount source

Prefer immutable snapshot on commercial/order at eligibility (`orders.cashback_earned` today) until rate policy is re-derived under Q6 OPEN rates — do not silently recompute differently per path without audit.

---

## E. Redemption model

| Rule | Status |
|------|--------|
| Server computes max spend from config × eligible goods | **LOCKED** |
| Eligible base excludes delivery fee (current engine direction) | **LOCKED** unless policy reopens |
| Atomic: lock account row → validate → insert USED → update balance | **LOCKED** |
| `balance` / available never &lt; 0 | **LOCKED** |
| Client preview non-authoritative | **LOCKED** |
| Loyalty reward redeem that spends cashback balance | Must eventually use this path (see §9) — **LOCKED direction** |
| USE timing (“not at create” vs at create) | Prefer authorize/hold or spend at confirmed commercial moment — **implementation detail under P6.5–P6.6**; cancel-before-earn must reverse USED |

---

## F. Reversal / refund / cancel model

### Architecture (technical — LOCKED)

| Situation | Direction |
|-----------|-----------|
| Cancel **before** earn | No EARNED; reverse any USED (REVERSAL or dedicated USE reverse) in same financial rules |
| Cancel **after** earn | Not allowed if fulfillment COMPLETED (P5); if policy later allows reopen → REVERSAL of EARNED required |
| Full refund after earn | REVERSAL of EARNED (≤ original); idempotent refund identity |
| Partial refund after earn | Technical REVERSAL support required; **amount formula OPEN** |
| Cashback already spent before refund | **POLICY OPEN** (debt / block / clawback / proportional) — Q5 |
| POS void | Map to REVERSAL under ledger model (replace ad-hoc `void` as SoT) |

### Partial refund formula

**POLICY OPEN** (Q4 §10 / Q5). Documented proposed direction for later decision: proportional to refunded goods amount — **not locked**. No invented PSP refund webhook behavior.

Payment refund ≠ cashback REVERSAL automatically (Q8) — cashback adjusts via explicit cashback service when business rules say so.

---

## G. Idempotency model

| Operation | Identity |
|-----------|----------|
| EARN | `commercial_transaction_id` (+ uniqueness) |
| USE | commercial/order spend key / checkout idempotency |
| REVERSAL | `reverses_entry_id` + unique reverse |
| Refund adjustment | Provider/refund attempt id when available (P7) — OPEN contract |

Retries must return the same financial effect (or no-op), never a second credit/debit.

Historical duplicate EARN rows: create REVERSAL + audit reason `DUPLICATE_RECONCILE` — never DELETE ledger history.

---

## H. Concurrency model

| Mechanism | Requirement |
|-----------|-------------|
| Account row | `SELECT … FOR UPDATE` (or equivalent conditional update) inside short PG transaction |
| Unique constraints | Absorb concurrent insert races |
| Redis | Cache/rate-limit only — **not** balance |
| Earn + inventory | Separate domains; cashback txn must not assume Redis inventory |

---

## I. Legacy migration strategy

1. **Inspect** ledger vs `customers.balance` divergence; list duplicate earns.  
2. **Create** accounts with opening balance + opening ledger entry where needed.  
3. **Dual-write** period: authoritative path writes ledger+account; mirror `customers.balance` in same txn.  
4. **Retire** independent writers listed in §A one by one.  
5. **API** may keep returning `balance` field sourced from account (compatibility).  
6. **Feature flag** direction: `cashback.ledger` (master plan).  
7. **Rollback:** stop new-path writers; keep dual-write reversible; do not drop ledger.  

Loyalty domain is **not** redesigned in P6; thresholds remain OPEN (Q6).

---

## J. 30% spend rule

| Item | Lock |
|------|------|
| Business target | **30%** of eligible order goods amount |
| Storage | Configurable server setting (e.g. `cashback.max_spend_ratio = 0.30`) |
| Code | Must **not** permanently hardcode `0.30` as the only possible value inside irreversible logic; current `MAX_SPEND_RATIO = 1` must be replaced |
| Enforcement | Server only |
| Client | Preview may approximate; POST always revalidated |

---

## K. Test matrix (locked requirements)

| ID | Case |
|----|------|
| A | Single earn |
| B | Duplicate earn → one effect |
| C | Concurrent earn → one success |
| D | FOM + app same commercial → one earn |
| E | Single redemption |
| F | Duplicate redemption idempotent |
| G | Concurrent redemption → no overspend |
| H | Insufficient balance rejected |
| I | 30% (configurable) limit enforced |
| J | Cancelled before earn |
| K | Cancelled after earn (blocked / reverse policy) |
| L | Full refund → REVERSAL |
| M | Partial refund (formula OPEN — test harness accepts policy stub) |
| N | REVERSAL links `reverses_entry_id`; no double reverse |
| O | Historical duplicate reconciliation via REVERSAL |
| P | `customers.balance` cannot become independent SoT |
| Q | Ledger sum consistent with account balance |
| R | Transaction rollback leaves no partial financial write |

---

## L. Production cutover gates

Before enabling ledger-authoritative cashback in a deployed environment:

1. Database **backup** / restore point.  
2. **Duplicate earn / USE** inspection report.  
3. **Reconciliation plan** (opening balances, REVERSAL for dups — no blind delete).  
4. Versioned migrations applied successfully.  
5. Single authoritative writer path verified; legacy writers disabled or dual-writing only.  
6. Configurable spend ratio set (prod intent **0.30**).  
7. Financial invariant tests green (matrix K).  
8. Rollback strategy documented and rehearsed.  
9. Q3-sensitive pickup earn path explicitly stubbed or gated — no guessed policy.  
10. Do **not** claim production-ready from local tests alone.

---

## M. OPEN business policies

| ID | Topic |
|----|--------|
| **Q3** | Pickup / FOM confirm → COMPLETED vs READY; pickup earn moment |
| **Partial refund formula** | Proportional vs other; already-spent cashback on refund |
| **Loyalty rates / tiers** | Q6 business OPEN |
| **Cashback TTL / lots / expiry** | Q4 OPEN |
| **FOM external receipt field contract** | Beyond current bridge aliases — do not invent |
| **Live PSP refund ↔ cashback** | P7 + provider contracts OPEN |
| **USE exact timing** | At create vs at pay/complete — choose in P6.5–P6.6 without violating cancel safety |

---

## N. Exact implementation order

| Step | Name | Intent |
|------|------|--------|
| **P6.0** | Architecture lock | This document |
| **P6.1** | Schema foundation | `cashback_accounts`, `cashback_ledger`, commercial_tx skeleton, settings, CHECKs/UNIQUEs |
| **P6.2** | Historical inspection / reconciliation | Reports + REVERSAL plan; opening balances |
| **P6.3** | Single authoritative balance writer | Service API; dual-write mirror to `customers.balance` |
| **P6.4** | Commercial identity + earn idempotency | DB unique EARNED; shared earn service |
| **P6.5** | Concurrency-safe redemption | FOR UPDATE; unique USED; never negative |
| **P6.6** | Configurable 30% spend rule | Replace `MAX_SPEND_RATIO = 1`; server enforce |
| **P6.7** | Cancel / refund / REVERSAL handling | Technical paths; partial formula stub/OPEN |
| **P6.8** | FOM + app shared earn path | Same service; no silent double commercial |
| **P6.9** | API / serializer compatibility | Balance from account; no Expo redesign |
| **P6.10** | Tests + audit + cutover gates | Matrix A–R; production checklist |

**Order rationale:** Schema and reconciliation before cutting over writers; uniqueness before concurrent earn wiring; spend cap after atomic spend exists; FOM convergence after commercial identity; tests/cutover last. Adjusted from a flat list only to put **inspection (P6.2)** immediately after schema so production data is not assumed clean before writer cutover.

### Explicitly out of P6 implementation

Expo/UI redesign · real Payme/Click · invented FOM stock API · loyalty threshold redesign · delivery domain rewrite (P8) · guessing Q3.

---

## Consistency

| Aligns with | Document |
|-------------|----------|
| Q4 | Earn/spend/identity principles |
| Q5 | Technical REVERSAL safety; business formula OPEN |
| Q6 | Loyalty ≠ cashback ledger |
| Q8 | Payment ≠ cashback; PAID ≠ earn |
| P5 | Completion axes; PAID independent of earn |
| P4 | Inventory separate; FOM no inventory writers |
| Master plan | Phase 6 objectives |

---

**P6 LOCK COMPLETE — CASHBACK FINANCIAL ARCHITECTURE LOCKED — NO IMPLEMENTATION PERFORMED.**
