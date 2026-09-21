# Q9 LOCK — Delivery Architecture and Delivery Safety

**Status:** LOCKED (technical delivery architecture / safety only)  
**Mode:** Documentation / design only — **no application implementation**  
**Depends on:** Q1 inventory; Q2 three-axis order state; Q4 cashback; Q8 payment; Q9 analysis  
**Does not lock:** Numeric business policies or exact delivery enum/algorithm choices  
**Must not reopen:** Q1, Q2, Q4, Q5, Q6, Q7, Q8; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision ID | Q9 |
| Scope | Delivery domain, courier actors, assignment, zones, provider abstraction, completion safety |
| Implementation | Forbidden in this phase |
| Schema / migrations / API / UI / `.env` | Not modified in this phase |
| Prior analysis | [`PHASE_3_2_Q9_DELIVERY_ARCHITECTURE_ANALYSIS.md`](PHASE_3_2_Q9_DELIVERY_ARCHITECTURE_ANALYSIS.md) |

---

# IMPORTANT

**Do NOT lock numeric business policies.**

## MUST remain OPEN

- exact delivery status enum  
- exact transition map  
- courier employment / role model  
- assignment algorithm  
- delivery zones implementation (district / radius / polygon / PostGIS)  
- fee calculation rules  
- ETA rules  
- proof-of-delivery mechanism  
- external provider(s) and contracts  
- tracking implementation  
- failed delivery policy  
- return-to-branch policy  
- cancellation policy  
- COD / pay-at-delivery policy  
- delivery operating hours  
- maximum distance  
- customer address edit policy  
- notification policy  

---

# LOCKED decisions

## 1. Delivery as a separate domain

**LOCKED:**

Delivery is a separate operational domain from Order, Payment, Inventory, and Cashback.

```text
ORDER  ↔  DELIVERY
```

Payment must not become delivery truth.  
Inventory must not become delivery truth.  
Cashback must not become delivery truth.

---

## 2. Delivery channel

**LOCKED:**

Order channel is explicitly:

```text
PICKUP  |  DELIVERY
```

Delivery lifecycle applies **only** to DELIVERY orders.

PICKUP orders must **not** enter delivery states.

---

## 3. Backend-controlled delivery transitions

**LOCKED:**

Customer/client applications must never directly set authoritative delivery lifecycle states.

Delivery state transitions must be controlled by backend / domain authorization.

Customer must **NOT** be able to mark:

- DELIVERED  
- COMPLETED  
- PICKED_UP  
- IN_TRANSIT  

for their own order.

**Known critical gap:** current unauthenticated delivery status mutation. Do **not** fix in this phase.

---

## 4. Delivery vs order fulfillment

**LOCKED:**

Delivery status and order fulfillment status are **related but distinct**.

Conceptual relationship:

```text
DELIVERY (illustrative — exact enum OPEN):
  PENDING / ASSIGNED / PICKED_UP / IN_TRANSIT / DELIVERED / FAILED / CANCELLED

ORDER FULFILLMENT (Q2):
  CONFIRMED → PREPARING → OUT_FOR_DELIVERY → COMPLETED
```

Exact delivery enum names are **not** locked if implementation details are not finalized.

The final state transition mapping must be **explicit**.

---

## 5. Verified delivery completion

**LOCKED:**

Order delivery completion must be based on a **verified** delivery completion event.

The following alone must **NOT** complete a delivery order:

- payment PAID  
- courier assignment  
- OUT_FOR_DELIVERY  
- client request  
- arbitrary FOM callback  

Delivery completion must come from an authorized / verified delivery lifecycle event.

**Preserve Q4:** delivery cashback eligibility remains tied to the eligible COMPLETED event, not merely PAID or OUT_FOR_DELIVERY.

---

## 6. FOM delivery boundary

**LOCKED:**

FOM must **not** bypass the delivery lifecycle for DELIVERY orders.

For DELIVERY: FOM sale/payment events may provide commercial/payment information if the future FOM contract permits it.

They must not arbitrarily transform DELIVERY → COMPLETED without a valid delivery completion event.

**Q3 remains OPEN** for FOM semantics. Do not reopen Q3.

---

## 7. Courier authorization

**LOCKED:**

Courier actions must be authenticated and authorized.

Only authorized actors may: accept assignment, start delivery, mark pickup, update transit, mark delivered, report failure.

Admin/dispatcher permissions must be separate from courier permissions where appropriate.

Customer permissions must not include authoritative delivery completion.

---

## 8. Courier as an explicit actor

**LOCKED (direction):**

Courier must not be represented only as free-text `courier_name` for production delivery operations.

Target model must support explicit courier/actor identity and assignment relationship, capable of:

- courier identity  
- assignment  
- assignment timestamp  
- acceptance / rejection  
- reassignment  
- current status  
- delivery history  

Do **not** define final employee schema yet.

---

## 9. Delivery assignment

**LOCKED:**

Delivery assignment must be an explicit domain operation.

Must eventually support: assignment, acceptance/rejection, reassignment, timeout/unavailable courier, assignment history.

Do **not** lock assignment algorithm (nearest / round-robin / etc.).

---

## 10. Immutable order address snapshot

**LOCKED:**

Customer saved address ≠ historical order delivery destination.

When a DELIVERY order is created, the exact destination used must be preserved as an **immutable** order/delivery snapshot.

Later editing of saved addresses must not silently rewrite historical delivery destinations.

---

## 11. Server-calculated delivery fee

**LOCKED:**

Delivery fee is **server-authoritative**.

Client must not choose the final delivery fee.

The fee used for an order/delivery must be persisted and auditable.

Exact fee policy remains **OPEN**.

---

## 12. Delivery zone abstraction

**LOCKED:**

Delivery eligibility and pricing may depend on a branch/zone model.

Architecture must support: branch, delivery zone, eligibility, fee rules, operating constraints.

Do **not** lock district vs radius vs polygon vs PostGIS.

PostGIS remains deferred unless future scale/evidence requires it.

---

## 13. Internal / external provider abstraction

**LOCKED:**

Delivery domain must support both:

- INTERNAL VaksinaMed couriers  
- EXTERNAL delivery providers  

without coupling the entire order domain to one provider.

External provider identity must be distinct from internal delivery identity.

Do **not** invent provider APIs.

---

## 14. Provider callback safety

**LOCKED (for future external providers):**

Provider callbacks/events must eventually support:

- provider authentication / signature verification  
- stable provider event identity  
- provider delivery identity  
- idempotency  
- duplicate-event safety  
- invalid transition rejection  
- auditability  

Do not invent provider-specific signature rules.

---

## 15. Delivery event idempotency

**LOCKED:**

Duplicate or retried delivery events must not produce duplicate business effects.

Examples: duplicate DELIVERED, courier acceptance, assignment, provider webhook, network retry, concurrent status update.

The same logical delivery event must not: complete the order twice, earn cashback twice, consume inventory twice, or create duplicate audit effects.

---

## 16. Delivery concurrency

**LOCKED:**

Critical delivery transitions must be concurrency-safe.

Examples: two couriers accept the same delivery → only one wins; DELIVERED vs CANCELLED → no impossible final state.

---

## 17. Delivery failure states

**LOCKED (architectural requirement):**

Delivery domain must explicitly represent delivery failure.

Must eventually distinguish situations such as: customer unavailable, invalid address, courier unavailable, provider failure, failed delivery, returned delivery.

Exact enum names and business behavior remain **OPEN**.

---

## 18. Delivery cancellation safety

**LOCKED:**

Cancellation must respect the delivery lifecycle.

Cancellation before assignment differs from after assignment / after pickup / in transit / after delivery.

Final business policy remains **OPEN**.

Cancellation must not silently corrupt: payment, reservation, inventory, or cashback state.

---

## 19. Delivery + inventory boundary

**LOCKED (preserve Q1):**

Delivery events do not independently become inventory truth.

Inventory remains physical / reserved / available; reservation NONE → ACTIVE → FULFILLED / EXPIRED / CANCELLED.

Delivery completion may be one business trigger for reservation fulfillment according to the final order lifecycle, but delivery itself is **not** the inventory source of truth.

Do not reopen Q1.

---

## 20. Delivery + payment boundary

**LOCKED (preserve Q8):**

Delivery status must not substitute for payment status.

```text
PAID ≠ DELIVERED
DELIVERED ≠ automatically PAID
```

unless explicitly configured payment method / business policy requires payment at delivery.

Payment remains its own lifecycle.

---

## 21. Delivery + cashback boundary

**LOCKED (preserve Q4):**

Delivery cashback eligibility is based on the eligible COMPLETED fulfillment event.

Must **NOT** be triggered by: payment alone, courier assignment, PREPARING, OUT_FOR_DELIVERY.

One commercial transaction → at most one EARNED.

Do not reopen Q4.

---

## 22. Delivery address / fee auditability

**LOCKED:**

Production delivery must be able to audit important changes to: delivery address, delivery fee, courier assignment, delivery status, cancellation, failure, provider events.

---

## 23. Proof of delivery as a domain capability

**LOCKED:**

Architecture must support a future proof-of-delivery mechanism.

Possible mechanisms (OPEN choice): customer confirmation, OTP, signature, photo, courier confirmation, provider confirmation.

Do **not** choose the final mechanism now.

---

## 24. Tracking abstraction

**LOCKED:**

Delivery domain must be capable of representing tracking information where supported.

Possible future sources: internal courier location, external provider tracking ID, tracking URL, last-known position.

Do **not** require live GPS now. Do not invent a tracking provider.

---

## 25. Delivery auditability

**LOCKED:**

Delivery lifecycle events must be auditable.

Target events: delivery created, assignment, acceptance, rejection, reassignment, pickup, in-transit, delivered, failed, cancelled, returned, address change, fee change, provider event.

Do not store unnecessary secrets.

---

## 26. Scalability direction

**LOCKED (direction):**

Architecture must support: 200+ branches initially, 1000+ future, many concurrent deliveries, courier status updates, external provider callbacks, retryable background processing.

Do not claim specific throughput/SLA without load testing.

---

# Current critical gaps (future work)

Do **not** fix in this phase:

1. Delivery mixed into order state  
2. No proper delivery transition graph  
3. Unauthenticated delivery status updates  
4. Customer/client can potentially complete delivery  
5. FOM can bypass delivery lifecycle  
6. Courier is free-text only  
7. No real courier assignment model  
8. No courier authorization model  
9. No immutable delivery address snapshot  
10. No delivery zones  
11. Static/simple delivery fee logic  
12. No real ETA engine  
13. No internal courier workflow  
14. No external provider abstraction  
15. No provider webhook security  
16. No tracking model  
17. No proof-of-delivery model  
18. No failed/returned delivery lifecycle  
19. Weak cancellation handling  
20. Weak delivery idempotency/concurrency  
21. No delivery audit trail  
22. Delivery scale model requires hardening  
23. COD incomplete / not production-ready  
24. Delivery + inventory interaction must align with Q1  
25. Delivery + payment interaction must align with Q8  

---

# LOCKED vs OPEN

## LOCKED

| # | Principle |
|---|-----------|
| 1 | Delivery is a separate domain |
| 2 | PICKUP and DELIVERY are distinct channels |
| 3 | Client cannot authoritatively complete delivery |
| 4 | Delivery transitions are backend-controlled |
| 5 | Delivery completion requires verified delivery lifecycle |
| 6 | FOM cannot bypass delivery lifecycle |
| 7 | Courier is an explicit authorized actor |
| 8 | Courier assignment is a domain operation |
| 9 | Historical delivery address must be preserved |
| 10 | Delivery fee is server-authoritative |
| 11 | Delivery zones are a supported architectural concept |
| 12 | Internal and external delivery providers are abstracted |
| 13 | Provider callbacks must be authenticated/idempotent |
| 14 | Delivery events must be idempotent |
| 15 | Critical delivery transitions must be concurrency-safe |
| 16 | Failed delivery must be explicitly represented |
| 17 | Cancellation must respect delivery lifecycle |
| 18 | Delivery is not inventory truth |
| 19 | Delivery is not payment truth |
| 20 | Delivery cashback follows Q4 completion rules |
| 21 | Delivery changes must be auditable |
| 22 | Proof-of-delivery capability required architecturally |
| 23 | Tracking capability may be supported without requiring live GPS |
| 24 | Architecture must scale horizontally |

## OPEN

| # | Decision |
|---|----------|
| 1 | Exact delivery status enum |
| 2 | Exact transition map |
| 3 | Courier employment / role model |
| 4 | Assignment algorithm |
| 5 | Delivery zones implementation |
| 6 | Fee calculation rules |
| 7 | ETA rules |
| 8 | Proof-of-delivery mechanism |
| 9 | External provider(s) |
| 10 | Provider contracts |
| 11 | Tracking implementation |
| 12 | Failed delivery policy |
| 13 | Return-to-branch policy |
| 14 | Cancellation policy |
| 15 | COD policy |
| 16 | Pay-at-delivery policy |
| 17 | Delivery operating hours |
| 18 | Maximum distance |
| 19 | Customer address edit policy |
| 20 | Notification policy |

---

# Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1 inventory | Not reopened — delivery ≠ inventory truth |
| Q2 three-axis | Reinforced — fulfillment related to but distinct from delivery status |
| Q3 FOM | Remains **OPEN** — FOM must not bypass delivery |
| Q4 cashback | Not reopened — earn on eligible COMPLETED only |
| Q5 refund/reversal | Not reopened |
| Q6 loyalty | Not reopened |
| Q7 auth/OTP | Not reopened |
| Q8 payment | Not reopened — PAID ≠ DELIVERED |

---

**Q9 LOCK COMPLETE — DELIVERY ARCHITECTURE AND DELIVERY SAFETY LOCKED — DELIVERY BUSINESS POLICIES REMAIN OPEN — NO IMPLEMENTATION PERFORMED.**
