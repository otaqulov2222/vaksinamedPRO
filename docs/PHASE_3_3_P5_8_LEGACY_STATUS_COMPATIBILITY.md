# P5.8 — Legacy `orders.status` Compatibility Period

**Status:** Compatibility active (P5 complete)  
**Axes SoT:** `fulfillment_status` · `payment_status` · `reservation_status`  
**Legacy field:** `orders.status` — **compatibility only**, not long-term source of truth

---

## How axes are persisted

| Field | Authority | Writer |
|-------|-----------|--------|
| `fulfillment_status` | Order transition service | `applyOrderTransition` / checkout `initialAxesForCheckout` |
| `payment_status` | Denormalized; payments table remains payment truth | Transition + payment simulate |
| `reservation_status` | Denormalized mirror of `reservations.status` \| `NONE` | Transition inventory hooks + checkout |
| `reservation_id` | Linkage to P4 reservation authority | Checkout |
| `reserved_until` | Display/cache only | Checkout (pickup) |

---

## How legacy `status` is derived

Dual-written on every transition via `deriveLegacyStatus()`:

| Axes (summary) | Legacy `status` |
|----------------|-----------------|
| `CANCELLED` | `cancelled` |
| `COMPLETED` | `completed` |
| Online + `PENDING` / `CREATED` | `pending_payment` |
| Delivery + `PAID` (not completed) | `paid` |
| Delivery (other non-terminal) | `awaiting_delivery` |
| Pickup (other non-terminal) | `reserved` |

Legacy is **never** authoritative for inventory or staff transitions.

---

## Consumers still relying on legacy `status` (repository evidence)

| Consumer | Usage |
|----------|--------|
| Expo `app/order/[id].tsx` | Displays `order.status`; cancel gate on `completed`/`cancelled` |
| Expo `app/(tabs)/purchases.tsx` | Filters/badges via `order.status` (`isProgress` / `isDelivered` / `isCancelled`) |
| Admin dashboard KPIs | Counts `completed` / `reserved` / `awaiting_delivery` / `paid` |
| Older API clients | May read `status` only |

API responses remain **additive**: axes + legacy `status` both present.

---

## Conditions before retiring legacy `status`

Do **not** drop the column until all of the following:

1. Expo / admin clients read axes (or a derived badge API) instead of `status`.
2. Compatibility window agreed with product owners.
3. No production client traffic depends on legacy strings (telemetry / release gate).
4. Versioned migration to drop/deprecate is reviewed under P1 migrate discipline + backup.
5. P4 inventory cutover gates already satisfied for reservation path.

Until then: **keep dual-write; do not remove `orders.status`.**

---

## Channel transition note (P5.5)

Valid operational paths:

- **Pickup:** `CONFIRMED → PREPARING → READY_FOR_PICKUP → COMPLETED`
- **Delivery:** `CONFIRMED → PREPARING → OUT_FOR_DELIVERY → COMPLETED`

`READY_FOR_PICKUP → OUT_FOR_DELIVERY` is **invalid** (channel conflict) and is rejected by the transition service.

---

## Out of scope / unchanged

Q3 FOM OPEN · real Payme/Click OPEN · cashback redesign · delivery domain rewrite (P8) · Expo UI redesign · P4 production cutover gates remain mandatory.
