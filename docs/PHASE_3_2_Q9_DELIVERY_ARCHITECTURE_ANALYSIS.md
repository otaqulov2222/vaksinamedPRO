# Q9 ANALYSIS — Delivery Architecture, Couriers, Tracking and Delivery Safety

**Status:** ANALYSIS ONLY (not a lock)  
**Mode:** Documentation / analysis only — **no application implementation**  
**Depends on:** Q1 inventory; Q2 three-axis order state; Q4 cashback; Q8 payment; Q9 repo inspection  
**Must not reopen:** Q1, Q2, Q4, Q5, Q6, Q7, Q8; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | Q9 (analysis) |
| Scope | Delivery domain, couriers, zones, fees, tracking, COD, safety |
| Implementation | Forbidden in this phase |
| Verdict | **Thin scaffold** — `deliveries` 1:1 row + flat fee + unauthenticated status → complete; no courier/zones/providers/tracking |

---

# 1. Current delivery implementation

## Primary files

| Path | Role |
|------|------|
| `lib/db/src/schema/commerce.ts` | `deliveries` table |
| `artifacts/api-server/src/routes/orders.ts` | Create delivery row; cancel; serialize `delivery` |
| `artifacts/api-server/src/routes/payments.ts` | `POST /deliveries/:orderId/status` |
| `artifacts/api-server/src/lib/cashback.ts` | `DELIVERY_FEE = 15_000` |
| `artifacts/soglom-apteka/app/checkout.tsx` | Delivery UI + address + COD |
| `artifacts/admin-web/src/App.tsx` | Orders list; FOM confirm — **no** delivery controls |

## What exists

| Capability | Status |
|------------|--------|
| `deliveries` entity (1:1 order) | Yes |
| Delivery status updates | Yes — unauthenticated |
| Courier table / role | **Absent** |
| Delivery zones | **Absent** |
| Saved customer addresses | **Absent** |
| Live tracking / GPS | **Absent** |
| External delivery providers | **Absent** |
| Proof of delivery | **Absent** |
| Delivery audit | **Absent** |
| ETA engine | **Absent** (static `time_window` text) |

### `deliveries` columns

`id`, `order_id` (UNIQUE), `address`, `time_window`, `status`, `courier_name`

---

# 2. Delivery domain structure

| Model | Reality |
|-------|---------|
| Embedded in orders only | Partial — address/fee also on `orders` |
| Separate delivery entity | Partial — `deliveries` 1:1 |
| Mixed | **Yes** |

Target concept (not implemented):

```text
ORDER ↔ DELIVERY
  (branch, address snapshot, zone, fee, courier/provider, status, tracking, timestamps, failure)
```

Today: free-text address + fee on order; thin delivery row; no zone/provider/tracking/timestamps beyond defaults.

---

# 3. Delivery statuses

## Current `deliveries.status` (code allowlist)

```text
pending | assigned | on_the_way | delivered
```

**Absent:** accepted, preparing, picked_up, failed, cancelled, returned, in_transit (name differs: `on_the_way`).

## No transition graph

Any of the four can be POSTed at any time (skip / reverse allowed).

## Conceptual map to Q2 fulfillment (aspirational — not implemented as separate axes)

| Delivery (current / target idea) | Order fulfillment (Q2 target) |
|----------------------------------|-------------------------------|
| pending | CONFIRMED / PREPARING (unclear) |
| assigned | PREPARING |
| on_the_way | OUT_FOR_DELIVERY |
| delivered | COMPLETED |
| (missing failed/cancelled) | CANCELLED / reopen policy |

**Do not lock exact delivery status names** from this analysis — evidence is scaffold-level only.

Legacy order strings used: `awaiting_delivery`, `paid`, `completed`, `cancelled`, `pending_payment`.

---

# 4. Delivery → order coupling

| Event | Current effect |
|-------|----------------|
| Payment PAID (simulate) | Order → `paid` for delivery; delivery row **unchanged** |
| Delivery → `delivered` | Order → `completed` + `completeOrderCashback` |
| FOM / confirm-pos | Order → `completed` + cashback — **does not require** delivery `delivered` |

**Aligned with Q2/Q8 intent:** PAID alone does not complete delivery (simulate path leaves fulfillment incomplete until delivered).

**Gap:** FOM can complete a **delivery** order without walking the delivery lifecycle — conflicts with “FOM must not bypass delivery lifecycle for delivery orders.”

---

# 5. Courier model

| Expected | Present? |
|----------|----------|
| Courier user / profile / vehicle / availability | **No** |
| Courier role | Spec-only; seed roles `super_admin`, `cashier` |
| Assignment FK | **No** — free-text `courier_name` |
| Represented as | Neither customer nor admin — **no real model** |

---

# 6. Courier authorization

| Action | Who can today |
|--------|----------------|
| See delivery | Customer via order serialize (if loaded); admin via orders |
| Assign / start / mark delivered | **Anyone** calling unauthenticated `POST /deliveries/:orderId/status` |
| Modify address / fee after create | **No API** found |
| Customer mark DELIVERED / COMPLETED | Indirectly **yes** via open status endpoint |

**Critical risk:** customer (or attacker) can mark any order’s delivery `delivered` → order `completed` + cashback earn.

---

# 7. Assignment

| Mechanism | Status |
|-----------|--------|
| Manual / automatic / nearest / round-robin | **None** |
| Current | Optional `courierName` string on status POST |
| Reassignment / rejection / timeout / capacity | **Absent** |

Future requirements (direction only): assignment, reassignment, rejection, timeout, unavailable courier, capacity — algorithms **OPEN**.

---

# 8. Address

| Field | On order/delivery | Saved address book |
|-------|-------------------|--------------------|
| Free-text address | Yes | No |
| Region / city / district / street / building / apt / entrance / floor | No structured fields | No |
| Lat / lng | No | No |
| Delivery instructions | Via optional `comment` on order only | No |
| Recipient name / phone | No separate fields | No |

**Snapshot:** address copied to `orders.address` and `deliveries.address` at create; no update-address API → de facto stable, but **not** an explicit immutable snapshot model (no versioning / structured audit).

Customer saved-address change after checkout: N/A (no saved addresses).

---

# 9. Delivery zones

**None** in repository.

No zone tables, district rules, radius eligibility, fee-by-zone, min order, max distance, or zone ETA.

`haversineKm` used for **branch search distance**, not delivery coverage.

PostGIS remains deferred (Phase 3) — not required by current code evidence.

---

# 10. Delivery fee

| Aspect | Reality |
|--------|---------|
| Source | Server constant `DELIVERY_FEE = 15_000` |
| Persisted | `orders.delivery_fee` |
| Client | Displays `rules.deliveryFee` (default 15000) — **not** authoritative at create |
| Zone / distance / promo / loyalty / time / provider | **Not** used |

Server-calculated and persisted — **positive** relative to client trust; hardcoded value is a **business/config gap**.

---

# 11. ETA

| Feature | Status |
|---------|--------|
| Dynamic ETA | **Absent** |
| Persisted estimate | Static text `time_window` (default “Bugun 10:00 — 18:00”) |
| Provider-based ETA | **Absent** |

Document as **future capability**.

---

# 12. Internal couriers

**Not actually supported** as a system.

Planned architecture only: courier identity, auth, assignment, tracking, POD, failure handling — **not implemented**.

---

# 13. External delivery providers

**None.**

No provider order create, provider delivery ID, webhook, status mapping, cancel/fee contracts.

Document as **future capability**. Do not invent provider APIs.

---

# 14. Webhooks

No external delivery webhooks exist.

**Future requirements (direction):** authentication/signature, provider event ID, idempotency, replay protection, status ordering, reject invalid transitions.

---

# 15. Tracking

| Feature | Status |
|---------|--------|
| Live courier location | **Absent** |
| Customer tracking UI | **Absent** (order detail ignores delivery sub-status) |
| Tracking URL / provider tracking ID | **Absent** |
| Maps route helper | `GET /maps/route` (OSRM) — **not** wired to deliveries |

Future capability only.

---

# 16. Proof of delivery

**Absent.**

Options for later business decision (OPEN): customer confirmation, OTP, signature, photo, courier confirmation, provider confirmation.

No evidence of a chosen method.

---

# 17. Failure handling

| Scenario | Current handling |
|----------|------------------|
| Customer unavailable / wrong address | **No** failed/returned status |
| Courier / provider unavailable | **No** model |
| Failed delivery | **No** `failed` status |
| Partial delivery | **No** |
| Returned order | **No** |

Only path to “done” is `delivered` or FOM complete / cancel.

---

# 18. Cancellation

| Stage | Behavior |
|-------|----------|
| Before/after assignment / in transit | Customer cancel allowed if order not `completed`/`cancelled` — **no** delivery-stage guard |
| After delivery | Blocked (`completed`) |
| Delivery row on cancel | **Not** updated (may stay `on_the_way`) |
| Inventory | Restock on cancel (legacy decrement model) |
| Payment | No PSP refund (Q8 gap) |
| Cashback | USE restored; EARN only if already completed (cancel blocked then) |

Gaps vs Q5/Q8: cancel during transit lacks logistics + payment + reservation coordination policy.

---

# 19. Payment interaction

| Mode | Supported as string? | Lifecycle complete? |
|------|----------------------|---------------------|
| Online prepaid (payme/click) | Scaffold | Simulate only (Q8) |
| Pay-at-branch on delivery order | Yes | Payment often stays `awaiting_pos` after complete |
| COD | Yes (UI + method) | **Incomplete** — delivered/complete does not set payment PAID |

**Must not assume:** PAID → DELIVERED or DELIVERED → PAID unless policy says so (Q8).

---

# 20. Inventory interaction

Current (legacy):

- Stock decremented at **order create** (including delivery)  
- `reservedUntil` **null** for delivery  
- Cancel restocks  
- Delivery `delivered` does **not** perform a separate consume event (already decremented)

**Q1/Q2 target interaction (direction):**

| Delivery event | Reservation target |
|----------------|--------------------|
| Order confirmed / reserved | ACTIVE |
| Delivery completed | FULFILLED (consume) |
| Cancel before dispatch | CANCELLED (release) |
| Failed / return | Policy OPEN — release or adjust |

Do not invent a new stock model; current decrement-at-create conflicts with Q1 (already recorded under Q8).

---

# 21. Cashback interaction

**Preserve Q4:**

Delivery earn is tied to eligible **completion** (`delivered` → `completed` in current code), **not** to PAID, OUT_FOR_DELIVERY, or courier assignment alone.

Gap: unauthenticated `delivered` can trigger earn — safety issue, not a Q4 reopen.

---

# 22. Concurrency / retries

| Scenario | Current | Required principle (direction) |
|----------|---------|--------------------------------|
| Duplicate status updates | Allowed; re-complete mostly no-op on cashback if earn exists | Idempotent transitions |
| Double assignment | Text overwrite of `courier_name` | Explicit assignment identity |
| Concurrent accept | N/A (no accept) | Lock / claim |
| Delivered twice | Re-sets completed; earn guarded by ledger | Transition guard |
| Cancel vs delivered race | Possible inconsistency | Ordered domain rules |

---

# 23. Audit

Delivery assignment / transit / delivered / fee / address changes: **not** in `audit_log`.

FOM/POS/branch updates only.

---

# 24. Scalability

| Concern | Current fitness |
|---------|-----------------|
| 200–1000+ branches | Branch catalog exists; delivery not branch-zoned |
| Concurrent deliveries | Single unauthenticated updater — unsafe |
| Courier assignment | None — bottleneck if manual only later |
| Provider callbacks | N/A |
| Tracking / notifications | Absent |
| Status writes | No rate limit / auth / idempotency keys |

**Bottlenecks:** open financial/logistics mutation endpoint; no partitioned courier workload model; hardcoded fee; no zone sharding.

---

# 25. Business decisions required (OPEN)

1. Internal courier operating model  
2. External delivery providers  
3. Delivery zones  
4. Delivery fee rules  
5. ETA policy  
6. Courier assignment policy  
7. Courier rejection / reassignment  
8. Proof-of-delivery method  
9. Failed delivery policy  
10. Return-to-branch policy  
11. Customer cancellation policy  
12. COD availability  
13. Pay-at-delivery availability  
14. Delivery address editing after order creation  
15. Recipient substitution policy  
16. Delivery operating hours  
17. Maximum delivery distance  
18. External provider fallback  
19. Delivery notification policy  
20. Tracking availability  

Do **not** invent answers.

---

# 26. Target delivery architecture (conceptual)

```text
ORDER
  ↓
DELIVERY
  - branch
  - customer
  - immutable address snapshot
  - delivery zone
  - fee (server)
  - courier OR provider
  - delivery status
  - tracking identity
  - timestamps
  - audit events

Internal:  DELIVERY → COURIER → STATUS
External:  DELIVERY → PROVIDER → PROVIDER_DELIVERY_ID → WEBHOOK → VERIFIED STATUS

Order fulfillment (Q2):
CONFIRMED → PREPARING → OUT_FOR_DELIVERY → COMPLETED
```

Payment remains Q8; inventory remains Q1; cashback earn remains Q4 completion.

---

# 27. LOCKED vs OPEN (analysis recommendation — **not yet Q9 LOCK**)

## Candidates for future technical LOCK

| Principle | Rationale |
|-----------|-----------|
| Delivery separate from order/payment domains | Mixed today |
| Customer cannot mark delivered/completed | Violated |
| Delivery transitions backend-controlled | Violated |
| Delivery status ≠ order fulfillment status (related) | Collapsed today |
| FOM cannot bypass delivery lifecycle for delivery orders | FOM bypasses |
| Delivery fee server-calculated | Mostly true; config OPEN |
| Historical address preserved | De facto; needs explicit snapshot |
| Courier actions require authorization | Missing |
| Provider callbacks authenticated + idempotent | Future |
| Delivery events auditable | Missing |
| Duplicate delivery events safe | Weak |
| Completion tied to verified delivery event | Open endpoint |
| Delivery cashback follows Q4 completion | Aligned intent |
| Delivery ≠ inventory truth independently | Preserve Q1 |
| Internal + external provider abstraction | Spec intent |
| Provider IDs ≠ internal IDs | Future |

## Remain OPEN

All business policies in §25; exact status vocabularies; fee amounts; zone geometry (PostGIS yes/no); POD method; COD/pay-at-delivery.

**This Q9 document does not lock the candidates above.** A separate Q9 LOCK step is required.

---

## Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1 inventory | Not reopened — delivery consume/release interaction documented |
| Q2 three-axis | Reinforced — fulfillment ≠ payment; delivery status should not replace axes |
| Q3 FOM | Remains OPEN — FOM bypass of delivery noted |
| Q4 cashback | Reinforced — earn on completion path |
| Q5 / Q6 / Q7 | Not reopened |
| Q8 payment | Reinforced — PAID ≠ delivered; COD payment incomplete |

---

**Q9 ANALYSIS COMPLETE — NO IMPLEMENTATION PERFORMED — DELIVERY ARCHITECTURE READY FOR REVIEW.**
