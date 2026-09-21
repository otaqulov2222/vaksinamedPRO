# P4 LOCK — Inventory Architecture

**Status:** LOCKED (implementation architecture for Phase 3.3 P4)  
**Mode:** Documentation / architecture lock only — **no application implementation**  
**Depends on:** Q1 inventory cutover; Q14 inventory deep-dive; Q2 order axes (consume tied to fulfillment completion — axes implemented in P5); P4 analysis READY FOR IMPLEMENTATION  
**Must not reopen:** Q1–Q24 locks; **Q3 remains OPEN**  
**Must not invent:** FOM stock sync API; production open-order backfill; independently writable `available`

| Item | Value |
|------|--------|
| Decision ID | P4 (Production Inventory Implementation architecture) |
| Prior analysis | P4 Inventory Implementation Analysis (READY FOR IMPLEMENTATION) |
| Q1 canonical | [`PHASE_3_1_REQUIRED_FIXES_LOCK.md`](PHASE_3_1_REQUIRED_FIXES_LOCK.md) §A–§C, §I |
| Q14 canonical | [`PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_LOCK.md`](PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_LOCK.md) §Q14 |
| Master plan | [`PHASE_3_3_IMPLEMENTATION_MASTER_PLAN.md`](PHASE_3_3_IMPLEMENTATION_MASTER_PLAN.md) Phase 4 |
| Schema / migrations / API / UI / `.env` | **Not modified in this lock turn** |

---

## LOCKED

### 1. Source of truth

PostgreSQL is the **only** inventory source of truth.

Redis is **not** inventory authority (cache / rate-limit / queue only).

Client-supplied stock values are never truth.

### 2. Stock model

Per `(branch_id, product_id)`:

| Concept | Rule |
|---------|------|
| `physical` | Units attributed to the branch in VaksinaMed |
| `reserved` | Units held by **active** reservations |
| `available` | **`physical − reserved`** |

**LOCKED:** Do **not** create an independently writable `available` balance that can drift from `physical`/`reserved`. Prefer derived/generated read semantics with invariants:

- `available >= 0`
- `reserved >= 0`
- `physical >= 0`
- `reserved <= physical`

### 3. Reservation authority

**Authoritative:** `reservations` (+ `reservation_items`).

**Link:** `orders.reservation_id` → `reservations.id` (required once checkout holds stock).

**Not authoritative for stock:** `orders.reserved_until` — optional cache/display of `reservations.expires_at` only; must never drive release/consume.

Do **not** allow two competing reservation authorities.

### 4. Lifecycle

```
AVAILABLE → RESERVED → CONSUMED
              ↓
          AVAILABLE   (cancel or expiry)
```

| Transition | Meaning |
|------------|---------|
| AVAILABLE → RESERVED | Checkout/reserve path holds stock |
| RESERVED → AVAILABLE | Cancel or expiry releases hold |
| RESERVED → CONSUMED | Approved **fulfillment completion** reduces physical once |

### 5. Concurrency

Reserve / release / consume must run in PostgreSQL transactions with row locking (`SELECT … FOR UPDATE` or equivalent conditional updates) on the stock row for `(branch_id, product_id)`.

Must prevent: overselling, negative available, duplicate reservation, duplicate consume, duplicate release.

Critical sections must stay short — no provider HTTP inside inventory locks.

### 6. Idempotency

Inventory operations must be idempotent. Retries, double taps, webhooks, and concurrent calls must not create duplicate inventory movements.

Logical keys (design direction): reservation/idempotency key; reservation status transitions once; consume once per reservation; adjust once per adjustment identity.

### 7. Legacy consume-at-create

Current repository behavior (`POST /orders` decrements `product_stocks.quantity` at create) is **LEGACY**.

**LOCKED for implementation:** replace for **new** orders so order creation does **not** permanently consume physical stock.

Must **not** run legacy consume-at-create **and** reserve-then-consume on the same order path.

### 8. Migration strategy — Q1

**`NEW_RESERVATIONS_ONLY`** remains locked.

- Do **not** invent a production backfill that creates reservations for historical open orders from repository assumptions.
- Deployment-time open-order verification remains a **cutover gate** (see below).

### 9. Uniqueness

After deterministic duplicate merge:

```text
UNIQUE (branch_id, product_id)
```

**Merge rule (locked):** keep lowest `id` survivor; set survivor quantity/physical = **SUM** of duplicates (non-negative clamp); record absorbed ids; **never** blindly delete without summing.

### 10. Movements / audit

Inventory changes must be explainable via auditable movement history (reserve, release, consume, adjustment at minimum).

Financial/inventory history must not be casually deleted.

### 11. FOM boundary

FOM must **NOT** become an inventory writer until a real VaksinaMed/FOM stock contract is provided and verified.

Do **not** invent an FOM stock API in P4.

Existing FOM loyalty/commercial paths (order confirm / cashback bridge) are separate from inventory writers.

### 12. Admin adjustments

Admin stock changes must use an auditable adjustment → movement model with **server-side** authorization and **branch scope** (P3 AuthZ patterns). Direct unsafe client quantity overwrite without audit is rejected as target design.

### 13. Expiry

Reservation expiry must release reserved stock safely and idempotently (`ACTIVE` → `EXPIRED` once; reserved restored).

Full durable outbox/worker topology remains Q16 / later phase — P4 must still define a safe expire transition path.

### 14. Consume timing

Consume exactly once at the **approved fulfillment completion** event (server-controlled).

**Q3 FOM semantics remain OPEN** — this lock does **not** hardcode a FOM completion event as the consume trigger. Implementation may attach consume to existing **server** completion paths already in the repository (e.g. authorized confirm-pos / delivery completion) without inventing FOM stock sync.

### 15. Catalog vs inventory

Catalog ≠ inventory. Availability shown to clients must come from inventory **available**, not a second truth in product rows.

### 16. Transfers

Branch-to-branch transfer **capability** remains architectural direction (Q14). **Operational transfer workflow is OPEN** and **out of P4 implementation scope** unless explicitly re-authorized.

---

## OPEN

Do **not** lock or invent in P4:

| Item | Status |
|------|--------|
| Exact reservation TTL | OPEN (current display uses `RESERVE_HOURS=2` — not locked as final policy) |
| Exact inventory adjustment reason codes | OPEN |
| Branch transfer policy / workflow | OPEN / deferred from P4 |
| POS walk-in consume policy details | OPEN under Q1/Q14 |
| Q3 FOM confirmation / sale semantics | **OPEN** |
| Production open-order cutover verification results | OPEN until deployment audit |
| Full outbox/worker expiry topology | OPEN (Q16); P4 requires safe expire semantics |
| Q2 three-axis column cutover | P5 (consume still tied to fulfillment completion principle) |

---

## IMPLEMENTATION ORDER

Repository-specific sequence (architecture locked; code not started in this turn):

| Step | Name | Intent |
|------|------|--------|
| **P4.1** | Schema / migration foundation | Versioned migration(s); physical/reserved (+ derived available); CHECKs; movement table foundation |
| **P4.2** | Duplicate stock merge + uniqueness | Detect → SUM merge → `UNIQUE(branch_id, product_id)` |
| **P4.3** | Reservation service | `reservations` / `reservation_items`; reserve with locking + idempotency |
| **P4.4** | Release / consume lifecycle | RESERVED→AVAILABLE; RESERVED→CONSUMED exactly once |
| **P4.5** | Checkout integration | Replace legacy create-time decrement; link `orders.reservation_id`; no dual-path |
| **P4.6** | Cancellation / expiry | Cancel → release; expire → release idempotent |
| **P4.7** | Admin inventory adjustments | Auditable adjust + AuthZ + branch scope |
| **P4.8** | Concurrency / idempotency tests | Race reserves; duplicate consume/release |
| **P4.9** | Integration / regression tests | Unpaid≠physical consume; FOM cannot mutate inventory; catalog available |
| **P4.10** | Post-implementation audit | Read-only security/correctness review |

**Feature flag direction:** `inventory.reservations` (or equivalent) — enable new path for new orders only; never dual-write legacy consume + reserve on one order.

**Out of P4:** Expo UI redesign; real Payme/Click; cashback redesign; FOM stock contract; delivery domain redesign; Q2 full axis migration (P5); Redis as truth.

---

## CUTOVER GATES

Before enabling new reservation lifecycle in a **deployed** environment:

1. Backup / restore point (Q19).
2. Versioned migrations applied successfully (P1 toolchain).
3. Duplicate stock groups merged; UNIQUE constraint applied.
4. **Open / non-terminal order audit** on the target database — if any exist, environment-specific assessment before cutover (Q1 caveat). Do not invent backfill from repo seed absence.
5. Feature flag: new path only; legacy consume-at-create disabled for that path.
6. FOM inventory writers remain disabled.
7. Concurrency + unpaid-order tests green.
8. Post-implementation audit (P4.10) completed before calling P4 production-ready.

---

## RISKS

| Severity | Risk | Mitigation (locked direction) |
|----------|------|-------------------------------|
| High | Legacy create-time consume continues if dual-path | Single path per order; flag discipline |
| High | Deployed open orders unknown | Cutover gate #4 |
| High | Duplicate stock rows before UNIQUE | Deterministic SUM merge |
| Medium | Expiry without worker → holds leak | P4.6 expire path; Q16 for durable jobs |
| Medium | Race last-unit oversell | `FOR UPDATE` / conditional update |
| Medium | Accidental FOM stock write later | Explicit boundary; tests assert no write |
| Low | Writable `available` drift | Derived only |
| Deferred | Transfers / reconcile / POS consume policy / Q3 | Remain OPEN |

---

## Repository evidence (analysis snapshot — not implementation)

| Fact | Evidence |
|------|----------|
| Single `product_stocks.quantity` | `lib/db/src/schema/catalog.ts`, `0000_baseline.sql` |
| No UNIQUE(branch, product) | Same |
| No `reservations` tables | Schema / migrations |
| Consume at order create | `artifacts/api-server/src/routes/orders.ts` |
| Cancel increments quantity | Same cancel route |
| FOM/POS do not write stock today | `fom.ts`, `pos.ts`, integrations |
| `orders.reserved_until` display-only | commerce schema + pickup create path |

---

## Alignment

| Document | Relationship |
|----------|----------------|
| Q1 / PHASE_3.1 §A–C, §I | Preserved; P4 is implementation architecture for those locks |
| Q14 | Preserved; workflows listed OPEN stay OPEN |
| Q2 | Consume on fulfillment completion; axis schema = P5 |
| Q3 | Remains OPEN — no FOM completion hardcode |
| P1–P3 | Migrations + AuthZ prerequisites; do not reopen |
| AGENTS / MASTER_SPEC | PG truth; concurrency; no client stock trust |

---

**P4 architecture is LOCKED for implementation when explicitly authorized.**  
**This turn performs no schema, migration, API, UI, or `.env` changes.**

---

**END OF P4 INVENTORY ARCHITECTURE LOCK**
