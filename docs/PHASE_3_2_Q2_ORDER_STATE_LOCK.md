# Q2 LOCK — Three-Axis Order State Model

**Status:** LOCKED (architecture only)  
**Date context:** After Q2 refinement  
**Mode:** Documentation / design only — **no application implementation**

**Depends on:** Phase 3.1 inventory/reservation lock, Phase 2.5 cashback rules, Phase 2.7 FOM discovery  
**Does not lock:** Q3 (FOM confirm target), Q4 (cashback earn moment)

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | Q2 |
| Scope | Order / payment / reservation **state architecture** |
| Implementation | Forbidden in this phase |
| Schema / migrations | Not created in this phase |
| UI / API routes | Not modified in this phase |

---

# LOCKED decisions

## 1. Three independent state axes

Order lifecycle **must** use three independent axes. A single overloaded `orders.status` is **not** the long-term source of truth.

### A) `fulfillment_status`

| Value | Meaning |
|-------|---------|
| `CREATED` | Order record created; fulfillment not confirmed for branch ops |
| `CONFIRMED` | Accepted for fulfillment |
| `PREPARING` | Branch preparing |
| `READY_FOR_PICKUP` | Ready for customer pickup (**PICKUP channel only**) |
| `OUT_FOR_DELIVERY` | With courier (**DELIVERY channel only**) |
| `COMPLETED` | Terminal success |
| `CANCELLED` | Terminal cancel |

### B) `payment_status`

| Value | Meaning |
|-------|---------|
| `PENDING` | Not successfully paid |
| `PAID` | Payment verified / settled |
| `FAILED` | Payment failed |
| `REFUNDED` | Fully refunded |
| `PARTIALLY_REFUNDED` | Partially refunded |

Authoritative payment records remain in the payments / payment-intent domain. Order may denormalize for queries (see OPEN).

### C) `reservation_status`

| Value | Meaning |
|-------|---------|
| `NONE` | No active reservation entity |
| `ACTIVE` | Hold counts toward `reserved_quantity` |
| `EXPIRED` | Hold released by expiry |
| `CANCELLED` | Hold released by cancel |
| `FULFILLED` | Hold consumed into physical reduction |

**Authoritative** reservation entity: Phase 3.1 `reservations` (`orders.reservation_id`).  
`orders.reserved_until` is cache/display only — **not** stock authority.

---

## 2. Fulfillment channel (separate)

`orders.fulfillment` / channel remains **separate** from the three axes.

| Channel | Values |
|---------|--------|
| Supported | `PICKUP`, `DELIVERY` |

(Repository today uses lowercase `pickup` / `delivery` — normalize in migration later; meaning is locked.)

**Do not** overload `fulfillment_status` with payment or reservation meaning.

---

## 3. Legacy `orders.status`

| Rule | Detail |
|------|--------|
| Classification | **LEGACY** |
| Long-term SoT | **No** — must not remain source of truth |
| During migration | May be retained temporarily for compatibility |
| After compatibility period | **Deprecated** |
| Mapping | Deterministic mapping documented below; implementation deferred |

Client apps must **never** set lifecycle states directly. Transitions are backend/domain only.

---

## 4. Locked transition rules

### Fulfillment

```
CREATED → CONFIRMED
CONFIRMED → PREPARING
PREPARING → READY_FOR_PICKUP      [PICKUP only]
PREPARING → OUT_FOR_DELIVERY      [DELIVERY only]
READY_FOR_PICKUP → COMPLETED
OUT_FOR_DELIVERY → COMPLETED
Any permitted non-terminal → CANCELLED
```

### Payment

```
PENDING → PAID
PENDING → FAILED
PAID → REFUNDED
PAID → PARTIALLY_REFUNDED
```

### Reservation

```
NONE → ACTIVE
ACTIVE → EXPIRED
ACTIVE → CANCELLED
ACTIVE → FULFILLED
```

**Atomicity:** Reservation expiry or cancellation **must** release reserved stock in the **same** transactional business operation (Phase 3.1).

---

## 5. Locked invalid-state principles

| Principle | Rule |
|-----------|------|
| Payment vs complete | `COMPLETED` + `FAILED` is **invalid** |
| Online unpaid complete | `COMPLETED` + `PENDING` is **invalid for online payment** (Payme/Click) |
| Ready needs hold | `READY_FOR_PICKUP` requires `reservation_status = ACTIVE` under Phase 3.1 model |
| Delivery logistics | `OUT_FOR_DELIVERY` requires delivery logistics state |
| Channel | `OUT_FOR_DELIVERY` **invalid** for `PICKUP` |
| Channel | `READY_FOR_PICKUP` **invalid** for `DELIVERY` |
| Consume order | `FULFILLED` reservation **cannot** coexist with `CREATED` fulfillment |
| Cashback | `CANCELLED` with **unreversed** earned cashback is **business-invalid** |
| Cancel/expire | Reservation release and stock release **atomic** with cancellation/expiry |
| Stock | Consumption must **never** happen twice |

### Valid examples (locked as allowed)

- `PAID` + `PREPARING` — valid  
- `CONFIRMED` + `PENDING` (pay-at-branch / COD) — valid  
- `COMPLETED` + `PAID` + `FULFILLED` — valid  

### Invalid examples (locked as forbidden)

- `READY_FOR_PICKUP` + inactive reservation (`NONE` / `EXPIRED` / `CANCELLED`) under Phase 3.1  
- `COMPLETED` + `FAILED`  
- `OUT_FOR_DELIVERY` without delivery logistics  
- Double stock consume  

*(COD + `OUT_FOR_DELIVERY` + `PENDING`, and pay-at-pickup + `READY` + `PENDING`, remain **OPEN** policy — see §OPEN.)*

---

## 6. Inventory (preserved from Phase 3.1) — LOCKED

```
available = physical - reserved
```

- Reservation is authoritative for holds.  
- PostgreSQL is inventory truth.  
- Redis is **never** inventory truth.  
- Q1 cutover: `NEW_RESERVATIONS_ONLY` (no backfill from repo-defined open orders; production env check caveat remains).

---

## 7. Cashback (preserved from Phase 2.5) — LOCKED principles only

| Rule | Status |
|------|--------|
| `PAID` alone does **not** automatically earn cashback | LOCKED |
| Earn uses commercial transaction identity / idempotency | LOCKED |
| Earn timing (which fulfillment event) | **OPEN — Q4** |
| Reversal required when business-invalid earn remains | LOCKED |
| Implement earn timing in this Q2 lock | **Forbidden** |

---

## 8. FOM (preserved from Phase 2.7 / 3.1) — LOCKED boundary

| Rule | Status |
|------|--------|
| FOM must **not** write authoritative inventory until real FOM stock contract | LOCKED |
| Current FOM bridge = loyalty / commercial where already supported | LOCKED |
| FOM confirm → `COMPLETED` vs `READY_FOR_PICKUP` | **OPEN — Q3** |
| FOM completion / payment axis updates detail | **OPEN — Q3** |

---

# LEGACY compatibility rules

## Legacy `orders.status` values (repository)

`pending_payment` · `reserved` · `awaiting_delivery` · `paid` · `completed` · `cancelled`

## Deterministic mapping document (not implemented)

| Legacy `orders.status` | `fulfillment_status` | `payment_status` | `reservation_status` (Q1) | Ambiguity / inspection |
|------------------------|----------------------|------------------|---------------------------|-------------------------|
| `pending_payment` | `CREATED` | `PENDING` | `NONE` | Legacy already decremented stock at create; do **not** invent an `ACTIVE` reservation row under Q1. Ops cancel/restock is separate. |
| `reserved` | `CONFIRMED` | **Inspect** `payment_method` + `payments.status` | `NONE` | **HIGH ambiguity:** after create + `pay_at_branch` → usually `PENDING`; after online pay then pickup → usually `PAID`. **Do not invent** from status string alone. |
| `awaiting_delivery` | `CONFIRMED` | **Inspect** method + payments | `NONE` | Unpaid COD/branch vs waiting courier — payment from records; delivery sub-status on `deliveries`. |
| `paid` | `CONFIRMED` | `PAID` | `NONE` | Means paid delivery order, **not** completed. |
| `completed` | `COMPLETED` | **Inspect:** if online use payments; if `pay_at_branch`/`cod` and completed, prefer treat as `PAID` unless evidence of failure/refund | `NONE` (semantic fulfill done; no new reservation row) | FOM historically set `completed` without updating `payments` — **inspect before inventing**. |
| `cancelled` | `CANCELLED` | **Inspect** payments (may be `PENDING` or `PAID` needing refund) | `NONE` | `PAID` + `CANCELLED` without refund = flagged inconsistency. Cashback USE restore / earn reversal must be audited separately. |

**Rule:** Where ambiguous, **require inspection** of `payments` / `payment_method` (and delivery rows). Never invent payment success.

Temporary dual-write / dual-read of legacy `orders.status` during compatibility is allowed; after period, deprecate.

---

# OPEN decisions (NOT LOCKED)

| ID | Question |
|----|----------|
| **Q3** | FOM confirm target: `COMPLETED` vs `READY_FOR_PICKUP` |
| **Q4** | Cashback earning fulfillment event/state |
| — | Exact stock **consumption** event (READY / FOM close / COMPLETED / courier handoff) |
| — | COD: allow `OUT_FOR_DELIVERY` + `PENDING`? |
| — | Pay-at-pickup: allow `READY_FOR_PICKUP` + `PENDING`? |
| — | Rare legacy unpaid orders whose stock was already consumed at create |
| — | Denormalize `payment_status` / `reservation_status` on `orders` vs derive from authoritative tables |
| — | UI display label derived from the three axes (recommended approach, not locked UX copy) |

---

# Dependencies

| This lock enables | Still blocked on |
|-------------------|------------------|
| Order domain design with three axes | Q3 for FOM transition endpoints |
| Deprecation plan for `orders.status` | Q4 for earn wiring |
| Clear invalid-state tests later | Consumption-event decision for inventory consume |
| Alignment with Phase 3.1 reservations | Production open-order env check (Q1 caveat) |

---

# Consistency

| Source | Result |
|--------|--------|
| AGENTS.md | Aligned — backend-controlled state; no client authority |
| Phase 3.1 | Aligned — reservation authority, inventory formula, Q1 |
| Phase 2.5 | Aligned — PAID ≠ earn; earn identity/idempotency |
| Phase 2.7 | Aligned — FOM not inventory writer |
| Prior single-status Q2 proposal | **Superseded** by this three-axis lock |

---

**Q2 LOCK COMPLETE — THREE-AXIS ORDER STATE MODEL LOCKED — NO IMPLEMENTATION PERFORMED.**
