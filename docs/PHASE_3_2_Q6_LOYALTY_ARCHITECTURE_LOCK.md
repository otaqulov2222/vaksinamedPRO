# Q6 LOCK — Loyalty Architecture Principles

**Status:** LOCKED (technical architecture principles only)  
**Mode:** Documentation / design only — **no application implementation**  
**Depends on:** Q4 cashback architecture (financial ledger separation)  
**Does not lock:** Any numeric or operational business loyalty policy  
**Must not reopen:** Q1, Q2, Q4, Q5 technical locks; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | Q6 |
| Scope | Loyalty policy/state/history architecture principles |
| Implementation | Forbidden in this phase |
| Schema / migrations / API / UI | Not modified in this phase |

---

# IMPORTANT

**Do NOT lock any numeric business policy.**

## MUST remain OPEN

- level names  
- number of levels  
- thresholds  
- cashback rates  
- upgrade timing  
- downgrade timing  
- inactivity period  
- evaluation period  
- refund → loyalty behavior  
- partial refund → loyalty behavior  
- admin override availability / policy  
- promotion / rate precedence  
- effective dating of changed loyalty rules  
- multi-level jump business behavior  

Current hardcoded Silver/Gold/Platinum rates and thresholds in code are **implementation evidence**, not approved business locks.

---

# LOCKED decisions

## 1. Loyalty / cashback separation

**LOCKED:**

| Domain | Role |
|--------|------|
| **LOYALTY** | Policy / state: level, rules, eligibility, customer state, history |
| **CASHBACK** | Financial ledger: EARNED, USED, REVERSAL, financial balance |

Loyalty must **NOT** become a second financial ledger.  
Do **not** merge these responsibilities.

---

## 2. Loyalty history / auditability

**LOCKED:**

A customer's current loyalty level must **not** erase historical level changes.

Every automatic or future manual loyalty transition must be auditable.

**Target history** (conceptual — not implemented now) should capture:

- previous level  
- new level  
- reason  
- triggering business event / order where applicable  
- commercial transaction where applicable  
- timestamp  
- source  
- automatic / manual origin  
- actor / admin where applicable  

---

## 3. Eligible business events

**LOCKED:**

Loyalty activity must be based on **eligible business completion events**, not raw payment success alone.

```
PAYMENT PAID  ≠  automatically eligible loyalty activity
```

The **exact** eligible fulfillment/commercial event remains dependent on VaksinaMed’s future loyalty business policy (and may interact with **Q3** for pickup).

Do **not** lock a specific fulfillment event in this document.

---

## 4. Cancelled / refunded protection

**LOCKED safety principle:**

Cancelled or refunded commercial activity must **not** silently and permanently inflate loyalty metrics.

**Final treatment remains OPEN.** Future policies may include:

- exclude cancelled orders  
- reverse eligible activity  
- recalculate rolling metrics  
- preserve historical progress  

**Locked rule:** no hidden loyalty inflation from invalid / reversed commercial activity.

---

## 5. Duplicate event idempotency

**LOCKED:**

Duplicate commercial events must not cause:

- duplicate purchase counts  
- duplicate eligible spend  
- repeated tier upgrades  
- repeated tier history entries  

Loyalty evaluation must be **idempotent** against:

- duplicate FOM event  
- duplicate completion request  
- webhook retry  
- concurrent processing  
- job retry  

---

## 6. Cashback historical amount

**LOCKED:**

Once cashback is legitimately `EARNED`, the historical earned **amount** remains auditable in the cashback ledger.

A future loyalty level/rate change must **not** rewrite historical cashback amounts.

Example: earned 5,000 under a rule → later level changes → ledger still shows 5,000.

---

## 7. Rate / rule snapshot principle

**LOCKED:**

When cashback is earned based on loyalty/rule configuration, calculation context should be **snapshotted** for auditability.

Conceptual snapshot:

- loyalty level applicable at earn time  
- rate used  
- rule / policy identifier or version  
- eligible calculation basis  
- resulting earned amount  

Exact database fields = implementation decision later. **Not implemented now.**

---

## 8. Current loyalty state vs history

**LOCKED:**

```
CURRENT LOYALTY STATE  ≠  LOYALTY HISTORY
```

| Concept | Answers |
|---------|---------|
| Current state | What level is this customer on **now**? |
| History | How and when did the level change? |

Do not use history as a mutable current-state substitute.

---

## 9. Configuration direction

**LOCKED direction:**

Final loyalty rules should be **configuration-driven**, not permanently hardcoded in application logic.

**Do NOT** define configuration schema yet.  
**Do NOT** invent threshold/rate values.

OPEN: thresholds, rates, effective dates, downgrade rules, inactivity rules.

---

## 10. Refund / loyalty separation

**LOCKED:**

A cashback `REVERSAL` does **not** automatically equal a loyalty downgrade.

```
REFUND → cashback reversal
≠
REFUND → loyalty downgrade
```

unless future VaksinaMed loyalty policy **explicitly** defines that coupling.

---

## 11. Admin audit principle

**LOCKED** (if admin override is introduced later):

- RBAC controlled  
- auditable  
- actor identifiable  
- reason recorded  
- previous / new state preserved  

Whether admin override exists at all remains **OPEN**.

---

## 12. Multi-level evaluation

**NOT locked as business policy** whether one transaction may jump multiple levels or upgrade one at a time.

**LOCKED technically:** the system must be able to evaluate eligibility against configured rules **without assuming** a fixed number of levels.

---

## 13. Concurrency / retry safety

**LOCKED:**

Loyalty evaluation must be safe against concurrent completion, duplicate FOM events, webhook/job retries, and repeated API requests.

The same commercial activity must not produce duplicate loyalty effects.

---

# Current implementation gaps (future work)

Do **not** fix in this phase:

1. Loyalty levels currently hardcoded / fixed  
2. Thresholds not configuration-driven  
3. Rates currently hardcoded  
4. Loyalty history incomplete / missing  
5. Rate/rule context not fully snapshotted  
6. Threshold changes require code deployment  
7. Admin loyalty override not implemented  
8. Refund/cancellation ↔ loyalty interaction not fully defined  
9. Inactivity / downgrade not fully implemented  
10. Duplicate/concurrent loyalty evaluation needs production hardening  

---

# LOCKED vs OPEN

## LOCKED

| # | Principle |
|---|-----------|
| 1 | Loyalty policy/state separate from cashback financial ledger |
| 2 | Historical loyalty changes must be auditable |
| 3 | Eligible business completion events, not PAID alone, drive loyalty activity |
| 4 | Cancelled/refunded activity must not silently inflate loyalty |
| 5 | Duplicate commercial events must be idempotent |
| 6 | Cashback historical earned amount immutable/auditable |
| 7 | Rate/rule context should be snapshotted when cashback is earned |
| 8 | Current loyalty state separate from loyalty history |
| 9 | Future loyalty rules should be configuration-driven |
| 10 | Cashback reversal ≠ automatic loyalty downgrade |
| 11 | Future admin overrides must be RBAC/audited if enabled |
| 12 | Loyalty evaluation must be retry/concurrency safe |

## OPEN

| # | Decision |
|---|----------|
| 1 | Level names |
| 2 | Number of levels |
| 3 | Thresholds |
| 4 | Cashback rates |
| 5 | Upgrade timing |
| 6 | Downgrade timing |
| 7 | Inactivity period |
| 8 | Evaluation period |
| 9 | Refund → loyalty policy |
| 10 | Partial refund → loyalty policy |
| 11 | Admin override availability |
| 12 | Promotion precedence |
| 13 | Effective dates |
| 14 | Multi-level jump behavior |

---

# Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1 inventory | Not reopened |
| Q2 three-axis order state | Not reopened |
| Q3 FOM semantics | Remains **OPEN** |
| Q4 cashback architecture | Not reopened — reinforced by loyalty/cashback separation |
| Q5 refund/reversal safety | Not reopened — cashback REVERSAL ≠ loyalty downgrade |

---

**Q6 LOCK COMPLETE — LOYALTY ARCHITECTURE PRINCIPLES LOCKED — BUSINESS LOYALTY POLICY REMAINS OPEN — NO IMPLEMENTATION PERFORMED.**
