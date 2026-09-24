# UNIVERSAL CASHBACK 2.0 — Architecture Lock

**Status:** LOCKED (implemented foundation + product UX contract)  
**Date:** 2026-09-24  
**Supersedes narrative:** channel-silo cashback “app feature only”  
**Does not reopen:** Q3 FOM pickup earn timing · PSP refund contracts · delivery provider · inventing new source keys

---

## 1. Target model (locked)

```
CUSTOMER
   → COMMERCIAL TRANSACTION   (sourceType + sourceKey)
   → CASHBACK ENGINE          (EARN | USE | REVERSAL)
   → CASHBACK LEDGER
   → CUSTOMER BALANCE         (cashback_accounts; customers.balance = mirror only)
   → UI / LOYALTY TIER        (presentation)
```

**Payment method, sales channel, and source system are orthogonal dimensions.**  
They must never become separate customer balances or separate “cashback products.”

---

## 2. Implemented SoT (repository)

| Layer | Authority |
|-------|-----------|
| Balance | `cashback_accounts.balance` via `getAuthoritativeBalance` |
| Ledger | `cashback_ledger` (`EARN` / `USE` / `REVERSAL`) |
| Commercial identity | `commercial_transactions` unique on `(source_type, source_key)` |
| Writers | **Only** `cashbackFinance.ts`: `earnCashback`, `useCashback`, `reverseCashbackEntry` |
| Legacy | `customers.balance` mirrored for compatibility — never independent SoT |
| Display history | `loyalty_ledger` may soft-write for UI; not financial SoT |

---

## 3. Commercial source types (locked)

| `sourceType` | `sourceKey` pattern | Channel meaning |
|--------------|---------------------|-----------------|
| `ORDER` | `order:{orders.id}` | App checkout order (also FOM confirm-pos earn path — **same** key) |
| `POS` | `receipt:{receiptId}` | Walk-in kassa / Admin POS |
| `FOM_POS` | Reserved | Future external FOM walk-in identity when vendor receipt ID is guaranteed |
| `SYSTEM` | stable seed/adjust keys | Registration / system grants — never fake commercial sales |

**Invariant:** One commercial transaction → ≤ one successful **EARN** (DB uniqueness).  
**Invariant:** FOM order-linked completion must **not** invent a second commercial key for the same sale.

---

## 4. Engine semantics (locked)

| Action | When | Notes |
|--------|------|-------|
| **USE** | At commercial spend time (app order create; POS confirm) | Client sends boolean / request only; server clamps (default max **30%** of goods, not delivery) |
| **EARN** | On eligible **completion** of the commercial event | App: `fulfillmentStatus === COMPLETED`. **PAID alone does not earn.** |
| **REVERSAL** | Cancel / void paths | Explicit ledger reverse; never blind delete |

Pickup earn **exact FOM moment** remains **Q3 OPEN** — do not invent.

---

## 5. Product / UX contract (locked)

Customer cashback UI must present a **single universal balance** earned and spent across allowed commercial channels.

Must **not** imply:

- cashback exists only on one screen
- cashback is only for app orders
- cashback is only for one payment method
- Payme/Click/PAID automatically credits earn

May honestly say:

- balance is server-authoritative
- earn after completed purchase (channel-agnostic wording)
- spend at checkout and at pharmacy POS (QR)

---

## 6. Explicit non-goals (this lock)

- No new DB tables / migrations in this turn  
- No change to spend-cap formula or tier rates  
- No Payme/Click production enablement  
- No external delivery / FOM inventory writer  
- No second balance store  
- No fabricated FOM vendor receipt field beyond existing aliases  

---

## 7. Canonical code entrypoints

| Concern | File |
|---------|------|
| Engine | `artifacts/api-server/src/lib/cashbackFinance.ts` |
| Pricing helpers / public rules copy | `artifacts/api-server/src/lib/cashback.ts` |
| App order USE/EARN | `artifacts/api-server/src/routes/orders.ts` |
| POS USE/EARN | `artifacts/api-server/src/lib/pos.ts` |
| Schema | `lib/db/src/schema/cashback.ts` |
| Customer UI | `artifacts/soglom-apteka/app/cashback.tsx` |

---

## 8. Prior locks

- [`PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md`](PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md) — original P6 design (partially historical; tables now exist)  
- [`PHASE_3_2_Q4_CASHBACK_LOCK.md`](PHASE_3_2_Q4_CASHBACK_LOCK.md) — spend/earn policy  

**UNIVERSAL CASHBACK 2.0** affirms the implemented engine as the product-facing universal loyalty core.
