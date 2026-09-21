# Q12 + Q13 + Q14 LOCK — Catalog, Checkout/Pricing, Inventory Architecture

**Status:** LOCKED (technical architecture principles only)  
**Mode:** Documentation / design only — **no application implementation**  
**Depends on:** Q1 inventory; Q4/Q5 cashback; Q8 payment; Q12–Q14 analysis  
**Does not lock:** Search engine choice, fee/TTL/promo stacking numbers, FOM product/stock contracts  
**Must not reopen:** Q1–Q11; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision IDs | Q12 (catalog/search), Q13 (cart/checkout/pricing), Q14 (inventory deep-dive) |
| Implementation | Forbidden in this phase |
| Schema / migrations / API / UI / `.env` | Not modified in this phase |
| Prior analysis | [`PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_ANALYSIS.md`](PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_ANALYSIS.md) |

---

# Q12 — Catalog + search architecture

## 1. Product identity

**LOCKED:**

Product identity must **NOT** depend on display name.

Target architecture supports stable internal product identity and, where applicable: SKU, barcode, external/FOM identifier, other product identifiers.

Names/descriptions may change without changing product identity.

---

## 2. Catalog vs inventory

**LOCKED:**

| Domain | Role |
|--------|------|
| **Catalog** | WHAT a product is |
| **Inventory** | HOW MANY units exist at a branch |

Product/catalog records must not become a second source of inventory truth.

**Preserve Q1:** physical / reserved / available. Do not reopen Q1.

---

## 3. Branch availability

**LOCKED:**

Branch product availability must be derived from **authoritative inventory data**.

Do not maintain independent contradictory stock quantities inside catalog.

---

## 4. Price snapshot

**LOCKED:**

Historical orders must preserve their commercial pricing facts.

Changing the current product price must **NOT** rewrite old order prices.

Order items must eventually preserve necessary snapshot information such as: unit price, quantity, discount, final line amount.

Exact schema = implementation work.

---

## 5. Server-authoritative price

**LOCKED:**

Client must never be trusted as the final source for: product price, discount, promotion, cashback, delivery fee, order total.

Server recalculates authoritative checkout totals.

---

## 6. Search

**LOCKED:**

Search must support **bounded/paginated** queries.

No production search endpoint should depend on unbounded catalog loading.

Target architecture must support efficient: product search, SKU/barcode lookup where applicable, category filtering, brand filtering, branch availability filtering where needed, pagination, sorting.

Do **not** mandate Elasticsearch/OpenSearch. PostgreSQL search is acceptable initially if properly indexed and measured.

---

## 7. Search scalability

**LOCKED:**

Search architecture must be designed for: 200+ branches initially, 1000+ future, large product catalog, thousands of concurrent users.

Avoid: unbounded result sets, unnecessary branch-wide stock joins, N+1 queries, expensive repeated catalog scans.

Caching may aid read performance but must not create contradictory inventory truth.

---

## 8. Product lifecycle

**LOCKED:**

Products should have a controlled lifecycle capable of distinguishing active / discontinued / archived products.

Exact statuses and business policy remain **OPEN**.

---

## 9. Multilingual catalog

**LOCKED:**

Catalog architecture must support multilingual product content independently from product identity.

Exact languages and translation workflow remain **OPEN**.

---

## Q12 OPEN

- exact search engine  
- ranking algorithm  
- typo tolerance / synonyms  
- language list  
- product approval workflow  
- product archival rules  
- discontinued-product behavior  
- branch availability presentation  
- FOM product synchronization contract  
- image storage provider  
- branch-specific pricing policy  

---

# Q13 — Cart / checkout / pricing architecture

## 10. Cart is not order truth

**LOCKED:**

Cart is temporary customer intent. Order is the durable commercial record.

Cart changes must not rewrite historical orders.

---

## 11. Server-authoritative checkout

**LOCKED:**

Checkout server must independently calculate/validate: product availability, quantity, unit price, discounts, promotions, cashback usage, delivery fee, final total, branch, fulfillment channel.

Client values are hints only and must not be trusted as final commercial truth.

---

## 12. Checkout flow

**LOCKED target conceptual flow:**

```text
Cart
  → validation
  → authoritative pricing
  → inventory reservation
  → order creation
  → payment flow
```

Exact transaction boundaries may be refined during implementation.

---

## 13. Inventory reservation at checkout

**LOCKED (preserve Q1/Q14):**

New production checkout must use the **reservation** model.

Do **NOT** use legacy `create order → immediately decrement stock` as the target architecture.

```text
available = physical - reserved

NONE → ACTIVE → FULFILLED
              → EXPIRED / CANCELLED
```

Do not reopen Q1.

---

## 14. Unpaid orders

**LOCKED:**

An unpaid order must not permanently consume physical inventory.

Unpaid checkout may hold inventory through an explicit reservation according to reservation policy.

Reservation expiry must release the hold.

Exact TTL remains **OPEN**.

---

## 15. Checkout idempotency

**LOCKED:**

Checkout must be idempotent.

The same logical checkout request must not create duplicate commercial orders because of: double tap, network retry, timeout, app restart, concurrent request, client retry.

Target architecture requires a stable idempotency strategy.

Exact key format remains **OPEN**.

---

## 16. Order price snapshot

**LOCKED:**

Once an order is created, commercial pricing facts must be preserved.

Future product price changes must not alter: old order unit price, old discounts, old line totals, old final total.

---

## 17. Promotions

**LOCKED:**

Promotion calculation is **server-side**.

Promotion policy must be deterministic and auditable.

Final stacking/priority rules remain **OPEN**.

---

## 18. Cashback USE

**LOCKED (preserve Q4/Q5):**

Cashback spending must be: server-authoritative, concurrency-safe, idempotent, represented through the financial ledger/account model.

Cancellation/refund must follow Q5 reversal rules.

Do not reopen Q4/Q5.

---

## 19. Order total

**LOCKED conceptual calculation:**

```text
PRODUCT SUBTOTAL
- eligible discounts
- cashback USED
+ delivery fee
= final payable amount
```

Only exact money representation may be used.

Do not assume tax behavior unless separately specified.

---

## 20. Branch / channel validation

**LOCKED:**

Checkout must validate selected: branch, PICKUP/DELIVERY channel, product availability, delivery eligibility where applicable, address where applicable.

Client selection must be validated server-side.

---

## Q13 OPEN

- cart expiry  
- quantity limits  
- price locking duration  
- promotion stacking / priority  
- cashback timing details  
- delivery fee rules  
- address edit policy  
- checkout idempotency-key exact design  
- unpaid order expiry TTL  
- guest cart support  
- tax policy  

---

# Q14 — Inventory deep-dive architecture

## 21. Inventory source of truth

**LOCKED:**

PostgreSQL is the authoritative inventory source.

Redis/cache is never inventory truth.

---

## 22. Physical / reserved / available

**LOCKED:**

Inventory must conceptually distinguish physical, reserved, available with:

```text
available = physical - reserved
```

Implementation must prevent contradictory representations.

---

## 23. Reservation lifecycle

**LOCKED:**

```text
NONE → ACTIVE → FULFILLED
ACTIVE → EXPIRED
ACTIVE → CANCELLED
```

Expiry/release must not consume stock.

Fulfillment consumes the reservation **exactly once**.

---

## 24. No double reserve / consume / release

**LOCKED:**

The same logical operation must not: reserve twice, consume twice, release twice.

All critical inventory transitions must be idempotent.

---

## 25. Concurrency safety

**LOCKED:**

Inventory operations must be concurrency-safe for: last-unit competition, simultaneous reservations, reservation+cancellation race, expiry+fulfillment race, concurrent consumption, concurrent adjustments.

The database must provide the authoritative consistency boundary.

---

## 26. Oversell protection

**LOCKED:**

Target architecture must prevent invalid states such as: `reserved > physical`, `available < 0`, or unintended negative physical stock.

Any exception for controlled stock adjustment must be explicit and auditable.

---

## 27. Inventory movement audit

**LOCKED:**

Inventory changes must eventually be explainable through explicit movement/reason records.

Target categories include: reserve, release, consume, adjustment, transfer, return, reconciliation/correction, approved external reconciliation.

Exact enum names = implementation work.

---

## 28. FOM inventory boundary

**LOCKED:**

FOM must **NOT** become an inventory writer until the real FOM stock contract is obtained and validated.

Do not invent FOM stock APIs. Do not reopen Phase 2.7 / Q1.

---

## 29. Branch stock uniqueness

**LOCKED:**

There must be one authoritative inventory record per **BRANCH + PRODUCT**.

Existing duplicate `product_stocks` problem must be resolved through deterministic migration/merge before enforcing uniqueness.

Do **not** blindly delete duplicates.

---

## 30. Stock transfers

**LOCKED (capability):**

Inventory system must eventually support branch-to-branch stock transfers.

Transfer must be auditable with explicit source / destination / quantity / status.

Exact workflow remains **OPEN**.

---

## 31. Stock reconciliation

**LOCKED:**

Architecture must support reconciliation between physical count vs system inventory.

Adjustments must eventually record: actor, quantity change, reason, timestamp, branch/product, audit information.

Exact workflow remains **OPEN**.

---

## 32. Inventory scalability

**LOCKED:**

Inventory architecture must support: 200+ branches, 1000+ future, high concurrent checkout, many reservations, background expiry jobs, branch/product reads.

Avoid long-running transactions and unnecessary hot-row contention.

Do not claim throughput/SLA without load testing.

---

# Cross-domain locks

**LOCKED boundaries:**

1. Catalog does not own inventory truth  
2. Cart does not own final pricing truth  
3. Client does not own payment truth  
4. Payment does not own inventory truth  
5. Delivery does not own inventory truth  
6. Cashback does not own order/payment truth  
7. Reservation is authoritative for reserved stock  
8. Order items preserve historical commercial facts  
9. Critical money and stock changes are server-controlled  
10. Duplicate checkout/business requests must be idempotent  
11. Unpaid orders do not permanently consume physical stock  
12. FOM does not write inventory without the real contract  

---

# Current gaps (future work)

Do **not** fix in this phase.

### Q12

- search scalability / indexing  
- pagination hardening  
- product identifier normalization  
- catalog/inventory separation hardening  
- multilingual catalog handling  
- FOM product mapping  

### Q13

- checkout idempotency  
- server-side total hardening  
- reservation-before-consume model  
- unpaid stock hold expiry  
- promotion engine hardening  
- cashback concurrency  
- branch/channel validation  

### Q14

- physical / reserved / available implementation  
- reservation state machine  
- inventory uniqueness  
- concurrency locks  
- oversell protection  
- movement audit  
- reconciliation  
- stock transfers  
- reservation expiry worker  
- FOM stock boundary enforcement in future writers  
- legacy decrement-at-create migration  

---

# LOCKED vs OPEN (summary)

## LOCKED (all three)

| Domain | Core locks |
|--------|------------|
| Q12 | Identity ≠ name; catalog ≠ inventory; availability from inventory; price snapshots; server prices; paginated search; scale design; product lifecycle; multilingual content capability |
| Q13 | Cart ≠ order; server checkout; reserve-then-order flow; unpaid ≠ permanent consume; checkout idempotency; order snapshots; server promos; cashback under Q4/Q5; exact money total formula; branch/channel validation |
| Q14 | PG inventory truth; physical/reserved/available; reservation lifecycle; no double ops; concurrency; oversell protection; movement audit; FOM boundary; UNIQUE branch+product; transfers/reconciliation capability; scale |

## OPEN (selected)

Search engine/ranking; promo stacking; TTLs; fee rules; cart expiry; guest cart; tax; transfer/reconcile workflows; FOM product/stock contracts; languages; archival rules.

---

# Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1 inventory | Reinforced — not reopened |
| Q2 three-axis | Not reopened |
| Q3 FOM | Remains **OPEN** |
| Q4 / Q5 cashback | Reinforced — not reopened |
| Q6–Q11 | Not reopened |
| Q8 payment / Q9 delivery | Reinforced — neither owns inventory truth |

---

**Q12 + Q13 + Q14 LOCK COMPLETE — CATALOG, CHECKOUT/PRICING, AND INVENTORY ARCHITECTURE LOCKED — BUSINESS POLICIES REMAIN OPEN — NO IMPLEMENTATION PERFORMED.**
