# Q12 + Q13 + Q14 BATCH ANALYSIS — Catalog/Search, Cart/Checkout/Pricing, Inventory Deep-Dive

**Status:** ANALYSIS ONLY (not a lock)  
**Mode:** Documentation / analysis only — **no application implementation**  
**Must not reopen:** Q1–Q11; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision IDs | Q12 (catalog/search), Q13 (cart/checkout/pricing), Q14 (inventory deep-dive vs Q1) |
| Implementation | Forbidden in this phase |
| Verdict | Flat catalog + in-memory search; server-priced checkout without promo engine or idempotency; stock = single `quantity` consume-at-create (conflicts with locked Q1) |

---

# Q12 — Catalog / Search

## 1. Current implementation

| Capability | Status |
|------------|--------|
| `products` + `product_stocks` | Exists |
| Categories / brands tables | **Missing** — free-text `category`, `manufacturer` |
| Images / barcodes | **Missing** |
| Search | Full-table select + in-memory `includes` |
| Pagination | **Missing** |
| Caching | **Missing** |
| Admin product list/create/patch | Exists; **no delete** |
| FOM product mapping | **Missing** |

**Primary files:** `lib/db/src/schema/catalog.ts`, `artifacts/api-server/src/routes/catalog.ts`, `admin.ts` product routes, mobile `catalog.tsx`.

## 2. Product identity

| Identifier | Present? |
|------------|----------|
| Internal `id` | Yes |
| `sku` UNIQUE | Yes |
| Barcode / GTIN | **No** |
| External / FOM product ID | **No** |
| Identity via display name | Must not — names change; today search uses names but identity is `id`/`sku` |

**Positive:** SKU unique exists. **Gap:** no barcode/external mapping.

## 3. Branch availability

- Catalog = product definition; stock = `product_stocks.quantity` per branch  
- API can attach `stock` when `branchId` query set; detail returns `availability`  
- **UI typically does not show branch stock**; checkout validates stock server-side  
- Must not duplicate inventory truth inside product rows — currently price lives on product; qty on stocks (good separation of qty, but qty model itself is legacy)

## 4. Pricing

| Aspect | Reality |
|--------|---------|
| Model | **Global** `products.price` integer |
| Branch-specific prices | **Absent** |
| Historical catalog price book | **Absent** |
| Order snapshot | `order_items.price` + title at create — **yes** |
| Client-supplied price | **Not** trusted at checkout |

## 5. Search

| Feature | Reality |
|---------|---------|
| Engine | In-memory after `SELECT * FROM products` |
| SQL ILIKE / FTS / OpenSearch | **No** |
| Fields | nameUz, nameRu, manufacturer, sku |
| Category filter | Exact string match (server) / hardcoded chips (client) |
| Brand / barcode / typo / synonym | **No** |
| Branch availability filter | Optional stock attach only |

## 6. Search scalability

| Risk | Detail |
|------|--------|
| Full catalog download | Server + often client |
| No pagination | Unbounded response |
| No product indexes | Beyond `sku` UNIQUE |
| N+1 | Mild on list; stock map when branchId |
| 1000+ branches / large catalog | **Not** production-ready as-is |

PostgreSQL search (ILIKE/FTS/trigram) may be enough initially — do not assume Elasticsearch unless chosen later.

## 7. Admin / catalog operations

- GET/POST/PATCH products; POST seeds stock on all branches  
- PATCH incomplete (no sku/manufacturer/icon/analogGroup)  
- No archive/soft-delete  
- Admin UI: create/list; weak Ru handling (often copies Uz)

## 8. Current gaps

1. No categories/brands/images/barcodes/branch prices  
2. In-memory full-scan search  
3. No pagination/indexes/caching  
4. No FOM product sync/mapping  
5. Multilingual display mostly Uz-only in UI  
6. Availability not surfaced in shopping UX  
7. No product active/archive workflow  

## 9. Target architecture

```text
PRODUCT (identity: id, sku, optional barcode/external ids)
  → ATTRIBUTES / MEDIA / LOCALIZED CONTENT
  → PRICE (global and/or branch — policy OPEN)
  → AVAILABILITY VIEW ← branch inventory (Q1 truth)
SEARCH ← indexed query + pagination + filters
```

## 10. LOCKED candidates (not locked this turn)

- Product identity ≠ display name  
- Catalog definition ≠ inventory truth  
- Prices server-authoritative; order lines snapshot commercial prices  
- Search must be server-side + paginated at production scale  
- External/FOM product IDs distinct from internal IDs when synced  

## 11. OPEN business decisions

- Archival / discontinued / OOS display  
- Branch availability UX  
- Price source (global vs branch)  
- FOM product sync  
- Approval workflow  
- Image storage  
- Multilingual content policy  
- Ranking / typo / synonym  

---

# Q13 — Cart / Checkout / Pricing

## 1. Current cart

| Aspect | Reality |
|--------|---------|
| Scope | **One cart per customer** (`customer_id` UNIQUE) |
| Branch on cart | Nullable `branch_id` |
| Guest cart | **No** |
| Expiry | **No** |
| Item uniqueness | App merges by product; **no DB UNIQUE(cart, product)** |
| Stock on add | **Not** checked |
| Price in cart | Live join to `products.price` (not stored) |

## 2. Checkout flow

```text
Cart → server validate stock/branch/address
    → computeCashback (server)
    → insert order + order_items (price snapshot)
    → decrement stock (legacy)
    → USE cashback if requested
    → clear cart
    → create payment row
```

Client sends: `branchId`, `fulfillment`, `paymentMethod`, `address`, `useCashback` — **not** prices/totals.

## 3. Price calculation

```text
goodsSubtotal (Σ price × qty)
- cashbackUsed
+ deliveryFee (15_000 if delivery)
= payableTotal
```

Integer UZS; `Math.floor` on cashback. **No tax** in repo. Delivery fee hardcoded (Q9 OPEN policy).

## 4. Promotions

`promos` / `rewards` are **marketing / redeem-points** surfaces — **not** applied as checkout discounts. No stacking engine.

## 5. Cashback USE

| Event | Timing |
|-------|--------|
| USE | At **order create** (before PAID for online) |
| EARN | On delivery `delivered` or FOM complete (Q4-aligned intent) |
| Cancel | Restores balance; weak ledger reverse |
| Concurrency | Balance read/update without row lock — double-spend risk |

Gaps only — do not reopen Q4/Q5.

## 6. Branch / channel validation

| Check | Present? |
|-------|----------|
| Branch required | Yes |
| Stock at branch | Yes (TOCTOU) |
| Pickup vs delivery | Yes |
| Address ≥ 8 for delivery | Yes |
| Delivery eligibility/zones | **No** |
| Fee policy | Constant |

## 7. Idempotency

**Critical gap:** no checkout idempotency key; parallel/double-tap → **duplicate orders**; cart cleared only after insert; POS `receipt_id` is idempotent but cart checkout is not.

## 8. Security / trust boundary

| Client can set? | Trusted? |
|-----------------|----------|
| Price / total / fee / cashback amount | **No** (good) |
| Branch / channel / method / address / useCashback flag | Intent only; server recalculates money |

## 9. Current gaps

1. No checkout idempotency  
2. No transactional create (stock + cashback + order)  
3. Stock decrement at create (Q1 conflict)  
4. USE before payment (Q4/Q8 gap)  
5. No promo discount engine  
6. Hardcoded delivery fee  
7. No cart expiry / quantity policy enforcement  
8. Race oversell / cashback overspend  

## 10. Target architecture

```text
CART (intent)
  → VALIDATE (branch, channel, stock availability view)
  → SERVER PRICE + PROMOS + CASHBACK POLICY
  → RESERVE (Q1) + ORDER (commercial snapshot)
  → PAYMENT INTENT (Q8)
  → OUTBOX notify (Q10)
```

Idempotent checkout key; all money/stock server-controlled.

## 11. LOCKED candidates (not locked this turn)

- Client never authoritative for price/discount/fee/total/stock  
- Server recalculates checkout  
- Order items preserve historical commercial facts  
- Checkout must be idempotent under retry  
- Exact integer money representation  
- Cashback USE/EARN remain under Q4/Q5 boundaries  
- Payment/inventory truth remain Q8/Q1  

## 12. OPEN business decisions

- Cart scope (global vs per-branch)  
- Cart expiry / qty limits  
- Price lock duration  
- Promotion stacking  
- Cashback USE timing policy  
- Delivery fee rules  
- Address change after create  
- Idempotency-key policy  
- Unpaid order expiry  

---

# Q14 — Inventory deep-dive

## 1. Current stock model

| Field | Reality |
|-------|---------|
| `product_stocks.quantity` | Sole stock number |
| physical / reserved / available | **Missing** |
| UNIQUE(product, branch) | **Missing** |
| Writers | Order create/cancel, admin product create, seed |
| POS / FOM | **Do not** write stock (aligns with FOM boundary for future) |

Vs Q1 locked model: **legacy consume-at-create**.

## 2. Reservation model

| Target (Q1) | Current |
|-------------|---------|
| `reservations` + items | **Absent** |
| ACTIVE → FULFILLED / EXPIRED / CANCELLED | **Absent** |
| `orders.reserved_until` | Display TTL only; **no** expire worker / release |

## 3. Lifecycle

| Target | Current |
|--------|---------|
| AVAILABLE → RESERVED → CONSUMED | Create **decrements** immediately |
| RESERVED → AVAILABLE | Cancel **increments**; no expire path |
| Idempotent reserve/consume/release | **Not** enforced |

## 4. Concurrency

No `db.transaction`, no `FOR UPDATE`, no conditional `quantity >= n` update → classic last-unit race / oversell / double-restock cancel race.

## 5. Overselling

Possible: two checkouts both pass check then decrement; `Math.max(0,…)` hides negative without preventing oversell; unpaid online holds stock until cancel.

Can yield logical `available < 0` relative to promises even if column stays ≥ 0.

## 6. FOM boundary

**Preserved positively:** FOM/POS do not write inventory today.  
**Critical if added without contract:** any stock writer without real FOM contract violates Phase 2.7 / Q1.

## 7. Audit

No inventory movement ledger. Order stock changes unaudited. `audit_log` covers POS/FOM/branch, not stock qty.

## 8. Transfers

**Absent** — future capability (source/dest/qty/status/auth/audit).

## 9. Reconciliation

No physical-count vs system adjustment workflow (reason/actor/audit). Needed for production.

## 10. Scalability

| Concern | Status |
|---------|--------|
| Indexes on stocks | Missing |
| Hot product×branch rows | Will need short locked updates |
| Reservation cleanup jobs | Missing |
| Redis | May cache availability views; **never** inventory truth (Q1) |

## 11. Current gaps

1. No physical/reserved/available  
2. No reservations authority  
3. Consume-at-create including unpaid  
4. No UNIQUE stock row  
5. No locking/transactions  
6. No movements / transfers / adjustments  
7. No expiry release  
8. No inventory audit trail  
9. Oversell races  
10. Align implementation with Q1 `NEW_RESERVATIONS_ONLY` cutover  

## 12. Target architecture (Q1 — already locked)

```text
physical, reserved, available = physical - reserved
NONE → ACTIVE → FULFILLED | EXPIRED | CANCELLED
PostgreSQL truth; Redis non-authoritative
```

## 13. LOCKED candidates (reinforce Q1 — not new reopen)

Q1 already locks core model. Additional analysis candidates for a possible Q14 lock (if done later):

- No double reserve/consume/release  
- Conditional updates / row locks for last-unit safety  
- UNIQUE(branch, product) after cleanup  
- Inventory movements explain every qty change  
- FOM must not write stock without contract  
- Payment/delivery must not become inventory truth (Q8/Q9)  

## 14. OPEN business decisions

- Reservation TTL / unpaid hold policy  
- Oversell compensation policy  
- Transfer workflows  
- Adjustment reason codes  
- Physical count process  
- Minimum stock / alerts  
- Whether POS walk-in ever reserves vs immediate consume under Q1  

---

# Cross-domain risks

| Boundary | Status |
|----------|--------|
| 1. Catalog ≠ inventory truth | Qty separate; model legacy |
| 2. Cart ≠ final pricing truth | Live price at checkout; OK if server recalculates |
| 3. Client ≠ payment truth | Q8; checkout amounts OK |
| 4. Payment ≠ inventory truth | Unpaid still decrements — **violation of spirit of Q1/Q8** |
| 5. Delivery ≠ inventory truth | Delivery complete does not consume (already consumed) |
| 6. Cashback ≠ order/payment truth | USE at create; EARN on complete |
| 7. Reservation authoritative for reserved | **Missing** |
| 8. Order items historical facts | Price/title snapshot **yes** |
| 9. Money/stock server-controlled | Money yes; stock races |
| 10. Duplicate requests idempotent | Checkout **no** |

---

# Final recommendation

| Domain | Priority |
|--------|----------|
| **Q12** | Paginated SQL search + indexes; keep identity on id/sku; plan barcode/external IDs; don’t embed stock truth in product |
| **Q13** | Checkout idempotency + transactional pricing; keep server money authority; align USE/reserve with Q1/Q4/Q8 |
| **Q14** | Implement Q1 physical/reserved/available + reservations; stop consume-at-create; uniqueness + locking; movement audit |

Do **not** implement in this phase. Separate Q12/Q13/Q14 LOCK steps after review.

---

## Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1 | Not reopened — deep-dive documents implementation gap vs lock |
| Q2–Q11 | Not reopened |
| Q3 | Remains OPEN |

---

**Q12 + Q13 + Q14 ANALYSIS COMPLETE — NO IMPLEMENTATION PERFORMED — CATALOG/CHECKOUT/INVENTORY READY FOR REVIEW.**
