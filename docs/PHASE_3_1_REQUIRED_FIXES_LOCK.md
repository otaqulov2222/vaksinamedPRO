# PHASE 3.1 — REQUIRED FIXES LOCK

**Status:** LOCKED engineering decisions  
**Date context:** After Phase 3 validation (`READY WITH REQUIRED FIXES`)  
**Mode:** Documentation / design only — no application or schema implementation in this phase  

**Supersedes ambiguities in:** Phase 3 Production Database Design (where listed below)  
**Must not contradict:** `AGENTS.md`, `docs/MASTER_SPECIFICATION.md`, Phase 2.5 Business Rules Lock, Phase 2.7 FOM/POS Discovery  

---

## Document control

| Item | Value |
|------|--------|
| Purpose | Convert every MUST FIX validation item into an explicit locked decision |
| Implementation | **Forbidden in this phase** |
| Migrations | **Not created in this phase** |
| Source of truth for these fixes | This document |

---

# A. Inventory lifecycle decision — LOCKED

## Authoritative model

PostgreSQL is the **only** inventory source of truth.

Redis is **not** inventory truth (cache / rate-limit / queue only).

Per branch and product:

| Field | Meaning |
|-------|---------|
| `physical_quantity` | Units physically attributed to the branch in VaksinaMed |
| `reserved_quantity` | Units held for active reservations |
| `available_quantity` | **Computed:** `physical_quantity - reserved_quantity` |

Constraints (must hold after every successful transaction):

- `available_quantity >= 0`
- `reserved_quantity >= 0`
- `physical_quantity >= 0`
- `reserved_quantity <= physical_quantity`
- Never double-consume the same reserved quantity

## Lifecycle (single model)

```
AVAILABLE  →  RESERVED  →  CONSUMED
                ↓
            AVAILABLE   (on expire or cancel)
```

| Transition | When | Who | DB effect (one transaction) |
|------------|------|-----|-----------------------------|
| AVAILABLE → RESERVED | Customer successfully creates a reservation (checkout/reserve path that holds stock) | Inventory + Reservation modules | `SELECT … FOR UPDATE` stock row; if `physical - reserved < qty` → reject; else `reserved += qty`; insert movement `RESERVATION`; create/update reservation `ACTIVE` |
| RESERVED → AVAILABLE | Reservation cancelled by customer/admin, or expiry job | Inventory + Reservation | Lock stock; `reserved -= qty`; movement `RESERVATION_RELEASE`; reservation `CANCELLED` or `EXPIRED` |
| RESERVED → CONSUMED | Order fulfillment completes (pickup collected / delivery delivered / server-controlled completion — exact order status is an **open business question**; see §16) | Inventory + Orders | Lock stock; `reserved -= qty` **and** `physical -= qty`; movement `SALE` / `CONSUME`; reservation `FULFILLED` |

## Explicitly rejected

- Parallel “consume at order create” **and** “reserve then consume” on the same order path.
- Client-supplied stock values as truth.
- FOM/POS decreasing `physical_quantity` until a validated FOM stock contract exists (see §I).

## Concurrency

Two customers reserve the last unit:

1. Both transactions lock the same `(branch_id, product_id)` row (or use conditional update).
2. First commit succeeds (`available` becomes 0).
3. Second sees insufficient available → `STOCK_UNAVAILABLE` → rollback.

Same serialization applies between app reserve and any future authorized inventory writer.

## Cutover from current `product_stocks.quantity`

**Target model is locked above.**

### Q1 inventory cutover — LOCKED

| Field | Value |
|-------|--------|
| Decision | `NEW_RESERVATIONS_ONLY` |
| Meaning | Start reserved inventory semantics only for **newly created** reservations. Do **not** backfill reservations from historical open orders based on repository definitions. |
| Reason | Repository evidence: no seed/fixture open orders; no committed production order corpus (`seed.ts` does not insert orders; no SQL dumps). |
| Production caveat | **Before any real production cutover**, audit the **deployed** environment for non-terminal/open orders. If open orders exist, perform an **environment-specific** migration/backfill assessment before enabling the new reservation lifecycle. |

Current repository fact (do not invent): checkout currently decrements `product_stocks.quantity` at order create (`orders` route). That behavior is **legacy** and must be replaced by this lifecycle for **new** orders; it must not run alongside the new lifecycle on the same order path.

---

# B. Reservation authority — LOCKED

## Single authority

**Authoritative:** `reservations` (inventory reservation entity).

**Link:** `orders.reservation_id` → `reservations.id` (nullable only before a reservation exists; once checkout holds stock, it must be set).

**Not authoritative for stock:** `orders.reserved_until`.

| Field | Role |
|-------|------|
| `reservations.*` | **Authority** for hold quantity, expiry, status |
| `orders.reservation_id` | FK to authority |
| `orders.reserved_until` | **Optional derived/cache** of `reservations.expires_at` for display only; must never drive inventory release |

## Reservation entity (minimum)

- `id`
- `order_id` (nullable until bound; unique among open reservations when set — see constraints)
- `branch_id`
- `customer_id`
- `status`
- `created_at`
- `expires_at`
- `cancelled_at`
- `fulfilled_at`

Items live in `reservation_items` (product_id, quantity).

## States — LOCKED names

| Status | Meaning |
|--------|---------|
| `ACTIVE` | Hold counts in `reserved_quantity` |
| `EXPIRED` | Hold released; stock returned to available |
| `CANCELLED` | Hold released |
| `FULFILLED` | Hold consumed into physical reduction |

(Phase 3 draft names `pending/confirmed/consumed` are superseded by these locked names for production design.)

## Expiration

- Worker selects `status = ACTIVE AND expires_at < now()` (using `SKIP LOCKED` / row locks).
- For each: perform RESERVED → AVAILABLE in one DB transaction; set `EXPIRED`.
- Idempotent: re-running on already `EXPIRED` is a no-op.

---

# C. Product stock uniqueness — LOCKED

## Constraint

```text
UNIQUE (branch_id, product_id)
```

Exactly one inventory row per branch–product pair.

## Before adding the constraint

1. **Detect** duplicates: groups with count > 1 on `(branch_id, product_id)`.
2. **Merge (deterministic):**
   - Keep the row with the **lowest `id`** as survivor.
   - Set survivor `quantity` (legacy) / `physical_quantity` = **SUM** of quantities across duplicates (non-negative clamp).
   - Record merge in `audit_logs` / migration report: survivor id, absorbed ids, before/after quantities.
   - Do **not** blindly `DELETE` without summing.
3. **Preserve history:** if any future movement tables exist by then, re-point or note absorbed ids in the migration report; do not destroy financial/order history (orders reference products, not stock row ids today).
4. Add `UNIQUE (branch_id, product_id)`.
5. Only then add `physical_quantity` / `reserved_quantity` / generated `available` per Phase 3 design + this lock.

Current repository fact: `product_stocks` has **no** unique on `(product_id, branch_id)` in `bootstrap.ts` / Drizzle schema.

---

# D. User phone uniqueness — LOCKED

## Representation

- Store `users.phone_e164` (or evolve `customers.phone` to normalized E.164).
- Digits-only international form consistent with existing `normalizePhone` intent (Uzbekistan `998…`).

## Constraint

```text
UNIQUE (phone_e164)
```

## Before enforcing uniqueness

1. Detect duplicate normalized phones.
2. **Reconcile — do not hard-delete users:**
   - Choose **survivor** account (deterministic: oldest `created_at`, then lowest `id`).
   - Reassign to survivor: orders, cashback account/ledger, loyalty, addresses, favorites, carts, reservations, POS sales, ratings.
   - Merge cashback: ledger remains append-only; survivor balance = ledger-derived after merge; document any adjustment line with reason `ACCOUNT_MERGE` if balances cannot be reconciled by reassignment alone.
   - Mark absorbed users `deleted_at` / `merged_into_user_id` (soft), never destroy order history.
3. Add unique constraint.
4. All new OTP/login flows use normalized phone only.

Current repository fact: `customers.phone` is **not** unique; `telegram_id` is unique.

`telegram_id` strategy (nullable vs synthetic `app:{phone}`) remains **OPEN** (§16.8).

---

# E. OTP security — LOCKED

## Forbidden in production

- Storing plaintext OTP (`auth_otps.code` as used today).
- Production acceptance of `devCode` or bypass `000000` (existing code allows these when Eskiz is unset — must not work when `NODE_ENV=production` or when production SMS is configured).

## Challenge design

| Field | Requirement |
|-------|-------------|
| `id` / challenge id | Primary key |
| `phone_e164` | Association |
| `purpose` | e.g. login, register, pin_reset |
| `code_hash` | Hash only (e.g. HMAC/SHA-256 with server secret); never store raw code |
| `expires_at` | Time-limited |
| `attempt_count` | Increment on verify failure |
| `max_attempts` | Cap; then invalidate challenge |
| `consumed_at` | Set on success; single-use |
| `created_at` | |

OTP is: **hashed at rest**, **single-use**, **time-limited**, **attempt-limited**.

Exact TTL and max attempts: **OPEN** (§16.10). Defaults may be proposed in implementation only after product confirms; until then design stores them in `system_settings`.

Primary login remains **phone + OTP** (Phase 2.5). Optional PIN/password later via `user_credentials` without rewriting auth identity.

---

# F. Cashback source of truth — LOCKED

## Authoritative

1. `cashback_ledger` — **authoritative history**
2. `cashback_accounts.balance` — **denormalized cache** updated **only** in the same DB transaction as the ledger insert

## Ledger entry types (locked vocabulary)

| Type | Use |
|------|-----|
| `EARNED` | Grant |
| `USED` | Spend against an order/commercial transaction |
| `EXPIRED` | TTL expiry of earn lots / balance |
| `REVERSAL` | Undo prior earn/use (linked via `reverses_entry_id`) |
| `REFUND` | Refund-driven cashback correction (may map to REVERSAL policy; both allowed if distinguished) |
| `ADJUSTMENT` | Admin correction with mandatory reason + audit |

(Aligned with AGENTS.md cashback kinds.)

## Legacy `customers.balance`

Current repository fact: balance lives on `customers` and is written by orders/POS paths.

**Locked rule:**

- After cutover, **no independent business write** to `customers.balance`.
- Until mobile/API stop reading it: treat as **derived/legacy** mirror updated only by the same transaction that writes ledger + `cashback_accounts`, **or** expose via view/API mapping from `cashback_accounts`.
- Removal migration: drop column or make read-only after all readers switched.

Every cashback change must be traceable in the ledger and auditable for admin adjustments.

---

# G. Cashback idempotency — LOCKED

## Commercial identity

Earn and spend attach to `commercial_transactions` (Phase 3):

- App order → one commercial row keyed by `order_id` / `order.code`
- Walk-in POS/FOM → one commercial row keyed by POS/`receipt_id` when no app order
- FOM close of an app order **must** use `order_code` so it attaches to the **same** commercial row (Phase 2.5 + 2.7)

## EARN uniqueness

After historical duplicate **audit and reconciliation** (no silent delete of financial history):

```text
UNIQUE partial index:
  ON cashback_ledger (commercial_transaction_id)
  WHERE entry_type = 'EARNED'
```

Second earn for the same commercial transaction → conflict → return `ALREADY_GRANTED` (idempotent success).

### Historical reconciliation (required before unique)

1. Report all groups with >1 `EARNED` for the same commercial/order identity.
2. Keep the earliest valid earn; mark later duplicates with compensating `REVERSAL` (or documented merge) — **do not DELETE** ledger rows.
3. Then create the unique index.

## USED uniqueness

```text
UNIQUE partial index:
  ON cashback_ledger (commercial_transaction_id)
  WHERE entry_type = 'USED'
```

(If spend can occur only with an order, equivalent: unique on `order_id` where `entry_type = 'USED'` and `order_id IS NOT NULL`. Prefer commercial_transaction_id for consistency with walk-in.)

Prevents: double spend, checkout retry duplication, payment retry duplication creating a second USE.

## Spend cap

Maximum usable cashback = **configurable** ratio; Phase 2.5 initial business value **30%** of eligible goods (not delivery). Stored in `system_settings` (`cashback.max_spend_ratio`), not hard-coded as a permanent schema constant.

## Reversal linkage

`cashback_ledger.reverses_entry_id` → original ledger row. Required before production refunds.

---

# H. Versioned migrations — LOCKED

## Forbidden as the sole production strategy

- `drizzle-kit push --force` as production migrate
- Bootstrap `CREATE TABLE IF NOT EXISTS` alone as complete evolution
- Relying on `IF NOT EXISTS` without version history

## Required

| Requirement | Rule |
|-------------|------|
| Version | Ordered migration versions |
| Forward | Explicit SQL/ORM migration |
| Rollback / recovery | Documented where practical; expand/contract pattern preferred over destructive down |
| Ordering | Deploy migrate-before-app when additive; expand → dual-write → contract for breaking changes |
| Validation | Post-migrate checks (constraints exist, row counts, no orphan FKs) |
| Data | No destructive change without an explicit data migration strategy |

Current repository fact: schema applied via `lib/db/src/bootstrap.ts` + optional `drizzle-kit push`. Production must move to versioned migrations before inventory/cashback constraint cutovers.

---

# I. FOM inventory boundary — LOCKED

## Rule

**FOM/POS integration MUST NOT modify authoritative inventory** (`physical_quantity` / `reserved_quantity` / movements) until a real production FOM stock contract is provided and validated.

## Current integration (Phase 2.7 facts)

- Inbound bridge: `POST /api/integrations/fom/sale` (loyalty / order complete / walk-in cashback).
- Amount-centric; `barcodes` accepted and unused.
- No outbound hold API found.
- No stock pull/push found.
- Treat as **loyalty/commercial bridge only** where already supported.

## Do not invent until contract exists

- Required barcode columns as mandatory
- Line-item stock events as live writers
- Terminal IDs as inventory keys
- Outbound hold fields as live protocol
- Vendor event IDs as if already known

Extension tables (`integration_events`, `external_branches`, `external_products`, nullable item payloads) may exist as **empty / unused writers** for inventory.

Official FOM stock synchronization contract: **OPEN** (§16.12).

---

# J. Transaction / concurrency rules — LOCKED

## Pattern

```text
BEGIN
  SELECT branch_inventory … FOR UPDATE   -- or conditional UPDATE … WHERE available >= qty
  … business checks …
  UPDATE quantities / INSERT ledger / INSERT history
COMMIT
```

| Operation | Requires FOR UPDATE on | Idempotent key |
|-----------|------------------------|----------------|
| Reserve | `branch_inventory` row | reservation id / idempotency key on create |
| Release / expire | stock + reservation row | reservation id + status |
| Consume | stock + reservation | reservation id / order completion event |
| Checkout create order | stock (via reserve), cart | client `Idempotency-Key` recommended |
| Cashback USE | `cashback_accounts` | unique USED per commercial_tx |
| Cashback EARN | `cashback_accounts` | unique EARNED per commercial_tx |
| Cashback REVERSAL | `cashback_accounts` | unique on `(reverses_entry_id, entry_type)` or equivalent |
| Payment confirm | payment intent/txn | provider transaction id / webhook event id |
| Reservation expire job | reservation + stock | status transition ACTIVE→EXPIRED once |

PostgreSQL commits are the durability boundary. Redis locks are optional helpers only; never replace the row lock for stock/money.

---

# K. Retry / idempotency rules — LOCKED

| Failure scenario | Required behavior |
|------------------|-------------------|
| Payment succeeds; client disconnects | Provider webhook / status poll marks paid; client refresh shows PAID; no second charge if idempotency key / provider txn unique |
| Payment webhook twice | Unique `(provider, event_id)` → second is no-op |
| Reservation expires during checkout | Checkout fails with clear error; no order in reserved stock; payment not captured (or auto-cancel/refund policy — payment provider path must not assume stock still held) |
| FOM event twice | Unique integration `event_id` when available; walk-in `receipt_id` unique on POS; order earn unique on commercial_tx |
| FOM out of order | State machine ignores illegal transitions; earn still once per commercial_tx |
| Pay pressed twice | Idempotency-Key / one active payment intent |
| Reserve pressed twice | Idempotent reservation create or reject duplicate ACTIVE hold per policy |
| Crash after payment confirm | Restart safe: payment row already captured; order status recovered from DB |
| Crash after reservation | ACTIVE reservation remains until expire/cancel; stock stays reserved (correct); client may retry using same idempotency key |
| Notification fails after completion | Order/payment/cashback **already committed**; notification retries via outbox/queue; failure must not roll back finance |

---

# L. Scalability assumptions — LOCKED

## Targets (capacity claims)

| Phase | Branches | Concurrent users |
|-------|----------|------------------|
| Phase 1 | 200+ | Design for thousands of concurrent **application** users |
| Phase 2 | 1000+ | Same design trajectory |

**Do not claim guaranteed capacity without load testing** (AGENTS / Spec / prior audit).

## Depends on

- PostgreSQL sizing and indexes
- Connection pooling
- Redis (cache, rate limit, queues) — not financial truth
- Queue workers
- Stateless API + load balancer
- CDN where appropriate
- Monitoring
- Horizontal API scaling
- Query optimization / optional read replicas later

Database remains financial and inventory source of truth.

---

# M. Required indexes — LOCKED (minimum set)

| Index | Why |
|-------|-----|
| `UNIQUE (users.phone_e164)` | OTP login identity |
| `UNIQUE (products.sku)` | Already exists — keep |
| `UNIQUE (branches.code)` | Already exists — keep; integrations use exact map, not fuzzy |
| `UNIQUE (branch_id, product_id)` on inventory | One row; lock target |
| `reservations(order_id)` unique where order_id not null and status ACTIVE (partial as needed) | One open hold per order |
| `reservations(expires_at) WHERE status = 'ACTIVE'` | Expiry worker |
| `orders(customer_id, created_at DESC)` | Order history / keyset pagination |
| `orders(branch_id, status)` | Branch queue |
| `orders(status)` | Ops filters (optional if composite above suffices — prefer composite) |
| `orders(created_at)` | Admin time range (often covered by composites) |
| `payments` / intents `(order_id)` | Checkout lookup |
| Unique provider transaction / webhook event | Payment idempotency |
| `cashback_ledger(commercial_transaction_id)` | Earn/use lookup + unique support |
| `cashback_ledger(customer_id / account_id, created_at DESC)` | Statement |
| Partial unique EARNED / USED (section G) | Financial safety |
| `notifications(user_id, created_at DESC)` | Inbox |
| `pos_transactions(receipt_id)` UNIQUE | Existing walk-in idempotency — keep |
| `integration_events(system_id, event_id)` UNIQUE | FOM/event retry |

Do not add redundant single-column indexes that duplicate the leading column of a composite unique index without a proven query need.

PostGIS: **not required for MVP**; revisit for advanced geo (Spec preference, not a Phase 3.1 hard dependency).

---

# N. Data migration requirements — LOCKED (prerequisites)

Before production cutover of constraints:

1. Inventory duplicate detection + merge report (§C).
2. Phone duplicate reconciliation plan (§D).
3. Cashback ledger duplicate earn audit + compensating reversals (§G).
4. OTP plaintext rows expired/deleted; hash-only path live (§E).
5. Versioned migration toolchain in place (§H).
6. Single cashback writer cutover plan (§F).
7. Q1 locked (`NEW_RESERVATIONS_ONLY`). Before **production** cutover: verify deployed DB has no open orders, or run env-specific backfill assessment if any exist.
8. FOM inventory writers remain disabled (§I).

No destructive drops of `product_stocks`, `loyalty_ledger`, `customers`, or `orders` without expand → dual-read → contract.

---

# 16. Open business questions — NOT LOCKED

Do **not** invent answers. Implementation may proceed on unrelated subsystems only where noted.

| # | Question | Why it matters | Depends | Proceed without it? |
|---|----------|----------------|---------|---------------------|
| 1 | ~~Stock cutover~~ | **LOCKED:** `NEW_RESERVATIONS_ONLY` (see §A). Production env open-order check remains a pre-cutover ops step. | Inventory, orders | Open-order env check before prod cutover |
| 2 | ~~Exact map of current order status strings → target state machine~~ | **LOCKED (architecture):** three-axis model — see `docs/PHASE_3_2_Q2_ORDER_STATE_LOCK.md`. Legacy string map documented; Q3/Q4 still open for FOM/earn endpoints. | Orders | Q3/Q4 still block FOM/earn wiring |
| 3 | FOM confirmation target: `COMPLETED` vs `READY_FOR_PICKUP`? | Branch ops UX; when stock consumes | Orders, inventory, FOM bridge | **No** for FOM order-complete path |
| 4 | ~~Cashback earn architecture~~ | **Q4 LOCKED:** see `docs/PHASE_3_2_Q4_CASHBACK_LOCK.md`. Delivery earn on COMPLETED; PAID≠earn; one commercial EARNED. **Pickup exact earn event still OPEN (Q3).** | Cashback, orders | Q3 for pickup trigger |
| 5 | Loyalty thresholds / rates / level names | **Q6 architecture LOCKED** (`docs/PHASE_3_2_Q6_LOYALTY_ARCHITECTURE_LOCK.md`): loyalty ≠ cashback ledger; history; eligible events ≠ PAID alone; idempotency; snapshots; config-driven direction. **Numeric/business policy still OPEN.** | Loyalty | Yes for architecture; no for shipping live tier rules |
| 6 | Downgrade / inactivity / evaluation period | **Business OPEN** under Q6; architecture forbids silent inflation and auto-coupling REVERSAL→downgrade | Loyalty | Yes until policy decided |
| 7 | Partial refund cashback policy | Reversal amounts (**Q5 technical locked**; formula OPEN). Refund→loyalty coupling also OPEN (Q6) | Cashback, payments, loyalty | Yes until refunds ship |
| 8 | `telegram_id`: nullable vs permanent synthetic `app:{phone}` | Unique identity alongside phone. **Q7 LOCKED:** Telegram must not silently bypass PHONE+OTP; linking requires verified flow. Exact UX OPEN. | Auth, users | Should decide before phone unique merge |
| 9 | One cart globally vs one cart per branch | Cart schema uniqueness | Cart | Yes short-term (today: one cart per customer) |
| 10 | OTP TTL and attempt limits | **Q7 architecture LOCKED** (`docs/PHASE_3_2_Q7_AUTH_OTP_SECURITY_LOCK.md`): hash/single-use/expiry/limits/distributed rate limit/no prod bypass. **Exact numeric values still OPEN.** | Auth | Yes with settings placeholders; must set before production OTP |
| 11 | Who may access branch payment secrets | RBAC / PCI-ish hygiene | Admin, payments | Yes until secrets table ships; must decide before secret table ACL |
| 12 | Official FOM stock sync contract | Inventory writers from FOM | Integration, inventory | **Yes** — inventory from FOM stays blocked |

---

# 17. Consistency check (no silent resolution)

| Sources | Result |
|---------|--------|
| AGENTS.md vs 3.1 | **Aligned:** evolve existing app; PG truth for inventory/finance; ledger cashback; no rewrite |
| MASTER_SPECIFICATION.md vs 3.1 | **Aligned** on physical/reserved/available, ledger, uniqueness. Spec PostGIS “preferred” vs 3.1 “not MVP-required” — **documented deferral, not a silent override** |
| Phase 2 architecture vs 3.1 | **Aligned** modular monolith; Redis non-authoritative |
| Phase 2.5 business rules vs 3.1 | **Aligned:** OTP-first; dual earn sources with one commercial earn; 30% configurable spend; FOM+app inventory intent with FOM stock **blocked** until contract (2.7) |
| Phase 2.7 FOM vs 3.1 | **Aligned:** no invented contract; loyalty bridge only for stock |
| Phase 3 DB design vs 3.1 | **3.1 supersedes** reservation status names, reservation authority, USE uniqueness, OTP, migration toolchain, dual-balance rule |

## Remaining tension (explicit, not silently fixed)

1. **Spec PostGIS preference** vs **3.1 MVP without PostGIS** — deferred with criteria; product may later require PostGIS.
2. **Phase 2.5 “both systems write inventory”** vs **3.1 FOM must not write until contract** — intentional: business goal remains; technical write path blocked until §16.12. Not a contradiction if read as staged.
3. **Open questions 1–4** block full inventory/order/cashback cutover; they do not invalidate the locked target model.

---

# Implementation prerequisites (before coding schema/app changes)

1. Q1–Q2, Q4–Q24 architecture principles locked (Q3 FOM semantics remain OPEN). **Production blockers remain** (Q24 A) — no blocker fixed in documentation locks. Product/vendor must still answer **Q3** and other OPEN policies before full production cutover. Numeric/provider/business policies called out as OPEN remain OPEN.
2. This document accepted as lock.
3. Versioned migration approach agreed (§H).
4. No UI redesign; preserve Expo app (AGENTS).
5. FOM stock remains out of scope until §16.12.

---

# Recommended next phase

**Phase 3.3 P1–P3 are IMPLEMENTED** (database foundation, security lockdown, sessions/RBAC).

**P4 inventory architecture is LOCKED** — see [`PHASE_3_2_P4_INVENTORY_ARCHITECTURE_LOCK.md`](PHASE_3_2_P4_INVENTORY_ARCHITECTURE_LOCK.md).

- Do **not** start P4 application/schema implementation until explicitly authorized.
- Q1/Q14 remain locked; Q3 and other OPEN policies remain OPEN.
- FOM inventory writers remain blocked until a verified stock contract (§I).

---

**END OF PHASE 3.1 REQUIRED FIXES LOCK**

---

**PHASE 3.1 COMPLETE — NO APPLICATION IMPLEMENTATION PERFORMED.**
