# P5.0 — Order Architecture Lock

**Status:** LOCKED (architecture + P5.0–P5.4 implementation scope)  
**Source:** Completed P5 analysis (conversation) + Q2 / Q4 / Q9 / P4 locks  
**Mode:** Spec freeze — implementation of axes/transitions proceeds under this document

---

## Frozen decisions

### 1. Three independent order axes

| Axis | Column | Values |
|------|--------|--------|
| Fulfillment | `orders.fulfillment_status` | `CREATED` · `CONFIRMED` · `PREPARING` · `READY_FOR_PICKUP` · `OUT_FOR_DELIVERY` · `COMPLETED` · `CANCELLED` |
| Payment | `orders.payment_status` | `PENDING` · `PAID` · `FAILED` · `REFUNDED` · `PARTIALLY_REFUNDED` |
| Reservation (denorm) | `orders.reservation_status` | `NONE` · `ACTIVE` · `EXPIRED` · `CANCELLED` · `FULFILLED` |

Channel remains separate: `orders.fulfillment` = `pickup` | `delivery`.

Do **not** overload a single `orders.status` as long-term source of truth.

### 2. Inventory authority

- Authoritative hold/consume: **`reservations` table + P4 inventory services** (`reserveStock` / `releaseReservation` / `consumeReservation`).
- PostgreSQL is inventory truth. Redis is never inventory authority.

### 3. Reservation linkage

- **`orders.reservation_id`** is the only order→reservation linkage.
- **`orders.reserved_until`** is display/cache only — **not** reservation authority.

### 4. Payment must not consume inventory

`payment_status = PAID` (or payment simulate/webhook) **must not** call consume.

### 5. Inventory lifecycle (locked)

```
CREATE   → RESERVE
CANCEL   → RELEASE
FULFILL/COMPLETE → CONSUME
```

### 6–8. Legacy `orders.status`

- Retained temporarily for API/mobile compatibility.
- Dual-written / mapped during compatibility — **not** authoritative.
- Long-term: deprecated after compatibility window.

### 9. Cashback

Unchanged in P5. Q4/Q6 stand: **PAID ≠ earn**. Existing completion earn hooks keep current soft idempotency. No ledger redesign.

### 10. Real Payme / Click

**OPEN** — no live PSP in P5.

### 11. Q3 FOM semantics

**OPEN** — do not invent FOM contracts or FOM stock writers.  
Preserve existing FOM bridge behavior except where confirm-pos already wires authorized completion + P4 consume.

**Q3-sensitive (documented, not invented):**

| Path | Current preserved behavior | Not locked by P5 |
|------|----------------------------|------------------|
| Admin `confirm-pos` | COMPLETED + CONSUME + existing cashback hook | Whether FOM alone should equal COMPLETED vs READY |
| FOM `/integrations/fom/sale` + orderCode | Completes order + earn; **no** inventory mutate | Consume / READY / payment axis meaning |
| FOM stock | Writers remain OFF | Future stock contract |

### 12. Delivery domain

Rewrite deferred to **P8**. P5 only routes delivery *completion* through the order transition service without redesigning logistics.

### 13. Expo / mobile

**Forbidden** to redesign UI in P5. Additive axis fields in API responses are allowed.

### 14. P4 production cutover gates

Remain mandatory before relying on reservation path in deployed environments (`docs/PHASE_3_3_P4_CUTOVER_GATES.md`).

---

## Fulfillment transitions (locked)

```
CREATED → CONFIRMED | CANCELLED
CONFIRMED → PREPARING | CANCELLED
PREPARING → READY_FOR_PICKUP [pickup] | OUT_FOR_DELIVERY [delivery] | CANCELLED
READY_FOR_PICKUP → COMPLETED | CANCELLED
OUT_FOR_DELIVERY → COMPLETED | CANCELLED
```

Invalid: READY on delivery; OUT on pickup; mutate after COMPLETED/CANCELLED (except idempotent no-ops).

---

## Checkout initial axes (locked)

| Payment method | Channel | fulfillment_status | payment_status | reservation_status | legacy `status` |
|----------------|---------|--------------------|----------------|--------------------|-----------------|
| payme / click | either | CREATED | PENDING | ACTIVE | `pending_payment` |
| pay_at_branch / cod | pickup | CONFIRMED | PENDING | ACTIVE | `reserved` |
| pay_at_branch / cod | delivery | CONFIRMED | PENDING | ACTIVE | `awaiting_delivery` |

---

## Legacy backfill (deterministic; no invention)

| Legacy `status` | fulfillment_status | payment_status | reservation_status |
|-----------------|--------------------|----------------|--------------------|
| `pending_payment` | CREATED | PENDING | From reservation row if `reservation_id`, else NONE |
| `reserved` | CONFIRMED | PAID if any `payments.status='paid'`, else PENDING | From reservation / NONE |
| `awaiting_delivery` | CONFIRMED | Same payment inspect | From reservation / NONE |
| `paid` | CONFIRMED | PAID | From reservation / NONE |
| `completed` | COMPLETED | PAID if payment paid OR method ∈ {pay_at_branch,cod}; else PENDING (ambiguous — preserved, not invented FAILED) | From reservation / NONE |
| `cancelled` | CANCELLED | PAID if payment paid, else PENDING | From reservation / NONE |

Ambiguity: FOM historically set `completed` without updating payments — backfill does not invent REFUNDED/FAILED.

---

## Implementation batch coverage

| Step | Scope |
|------|--------|
| P5.0 | This lock |
| P5.1 | Additive columns, CHECKs, indexes, backfill |
| P5.2 | Order transition service |
| P5.3 | Checkout axes + dual-write + idempotency |
| P5.4 | Cancel / confirm-pos / delivery completion via service |
| P5.5 | Staff prepare / ready / out-for-delivery / complete endpoints |
| P5.6 | Additive serializers (axes + legacy status); public branch |
| P5.7 | Expanded transition / inventory / AuthZ contract matrix |
| P5.8 | Legacy status compatibility period (`PHASE_3_3_P5_8_LEGACY_STATUS_COMPATIBILITY.md`) |

**Out of this batch:** live PSP · cashback redesign · FOM invent · delivery rewrite (P8) · Expo UI redesign.

---

## Explicitly not invented

COD + OUT + PENDING policy · pay-at-pickup READY + PENDING policy · refund workflows · FOM COMPLETED vs READY · live PSP · cashback redesign · delivery rewrite · Expo redesign.
