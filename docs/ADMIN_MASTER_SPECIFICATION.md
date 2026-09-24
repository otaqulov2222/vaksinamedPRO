# VaksinaMed Admin Panel — Master Specification

> **Status:** Discovery document (read-only audit).  
> **Date:** 2026-09-24  
> **Scope:** Complete Admin Panel as the central management surface for the VaksinaMed platform.  
> **Not in scope of this document:** Implementing features, migrations, FOM/cashback/payment/inventory engine changes.

---

## 1. Purpose

The **VaksinaMed Admin Panel** (`artifacts/admin-web`) is the **staff / HQ operations console** for the loyalty pharmacy platform. It is **not** a customer app and **not** “just a FOM screen.”

It is responsible for letting authorized staff:

1. Operate **in-pharmacy POS (Kassa)** against live customers and cashback rules.
2. Operate **app orders** (fulfillment transitions, cancel, branch scope).
3. Configure **branch payment merchant keys** (Payme/Click) and inspect payment rows.
4. Manage **catalog products** and **view branch stock axes** (physical / reserved / available).
5. View **customers** (PII-minimized list + authoritative cashback balance).
6. View **promotions** (marketing content only).
7. View **staff ratings**, **audit log**, and an **honest FOM adapter status**.
8. See a **bounded HQ dashboard** of network KPIs.

**Server authority is mandatory.** The Admin UI is a client of `artifacts/api-server`. Hiding a nav tab is UX only; RBAC and branch scope are enforced on the API.

**Financial SoT (locked):** `cashback_accounts` + `cashback_ledger` + `commercial_transactions` (Universal Cashback 2.0).  
**Inventory SoT:** PostgreSQL `product_stocks` (+ reservation services).  
**Payment SoT:** `payment_intents` (+ captures); legacy `payments` is compatibility.  
**FOM:** bridge module only; inventory writer OFF; FOM_POS CONTRACT_PENDING.

---

## 2. System architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│ Mobile (Expo)       │     │ Admin Web (Vite/React)│
│ artifacts/          │     │ artifacts/admin-web   │
│   soglom-apteka     │     │  tabs: POS, Dash, …   │
└─────────┬───────────┘     └──────────┬────────────┘
          │ HTTP Bearer                │ HTTP Bearer (admin session)
          ▼                            ▼
┌──────────────────────────────────────────────────┐
│ API Server — artifacts/api-server                │
│ routes: auth, catalog, cart, orders, payments,   │
│         pos, loyalty, deliveries, admin,         │
│         integrations (FOM), workers, health      │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│ PostgreSQL (@workspace/db)                       │
│ commerce · inventory · cashback · payments ·     │
│ auth sessions/RBAC · admin_users · audit_log     │
└──────────────────────────────────────────────────┘
         ▲
         │ optional workers (PG job table; not Redis SoT)
┌────────┴────────┐
│ workers / jobs  │
└─────────────────┘
```

| Layer | Path | Role |
|-------|------|------|
| Mobile | `artifacts/soglom-apteka` | Customer loyalty app |
| Admin UI | `artifacts/admin-web` | Staff/HQ console |
| API | `artifacts/api-server` | Single HTTP authority |
| DB | `lib/db` | Schema, migrations, seed |
| Docs/locks | `docs/*` | Architecture locks (cashback, payments, FOM, RBAC) |

---

## 3. Admin modules

### 3.1 Module map (product reality)

```
ADMIN (admin-web)
│
├── Kassa POS .................... EXISTS (UI + API)
├── Dashboard .................... EXISTS (partial KPIs)
├── Filiallar .................... EXISTS (list + payment keys edit)
├── Katalog ...................... EXISTS (list/create/patch + stock axes view)
├── Inventory ops ................ API EXISTS / UI MISSING
├── Buyurtmalar .................. EXISTS (list/detail/transitions)
├── Mijozlar ..................... EXISTS (list only; read)
├── Cashback / Loyalty ops ....... PARTIAL (view via customers/dashboard; no correction UI)
├── To‘lovlar .................... EXISTS (payment rows + branch keys)
├── Aksiyalar .................... EXISTS (read; PROMO_MARKETING_ONLY)
├── Baholar ...................... EXISTS (list; branch-scoped)
├── Yetkazib berish .............. API EXISTS / UI MISSING (external CONTRACT_PENDING)
├── Audit ........................ EXISTS (paginated list)
├── FOM adapter .................. EXISTS (status honesty only; HQ nav)
├── Admin users / RBAC UI ........ MISSING (seed + DB roles exist; no manage UI)
└── Settings ..................... NOT IMPLEMENTED (system_settings table exists for spend ratio etc.)
```

| Module | Status |
|--------|--------|
| Dashboard | **EXISTS** |
| POS / Kassa | **EXISTS** |
| Filiallar | **EXISTS** (no create API in admin routes) |
| Katalog | **EXISTS** |
| Inventory (dedicated screen) | **MISSING BUT REQUIRED** (API `inventory:adjust` exists) |
| Buyurtmalar | **EXISTS** |
| Mijozlar | **EXISTS** (VIEW only) |
| Cashback dashboard/history/correction | **PARTIAL** / correction **OPEN** |
| To‘lovlar | **EXISTS** |
| Aksiyalar | **EXISTS** (marketing) |
| Baholar | **EXISTS** |
| Yetkazib berish | **PARTIAL** (API; no admin tab; external CONTRACT_PENDING) |
| Audit | **EXISTS** |
| FOM | **EXISTS** (status module only) |
| Admin users / RBAC manage | **MISSING BUT REQUIRED** (`rbac:manage` permission reserved) |
| Settings / rules UI | **MISSING** |
| Reporting suite | **PARTIAL** (dashboard only) |
| Company / multi-tenant HQ org | **NOT PART OF PRODUCT** (single-tenant pharmacy network) |

---

## 4. Module responsibilities

### 4.1 Responsibility matrix (business areas)

| Area | Classification | Evidence |
|------|----------------|----------|
| Company / org management | **NOT IMPLEMENTED** | No company entity |
| Branch management | **PARTIAL** | List + PATCH; no POST create in `admin.ts` |
| Pharmacy / FOM ops | **PARTIAL** | FOM status + webhook; writer OFF |
| Product / catalog | **REAL** | GET/POST/PATCH products |
| Inventory | **PARTIAL** | Stock axes on catalog; adjust API without UI |
| Orders | **REAL** | List/detail + staff transitions |
| Customers | **PARTIAL** | Paginated list; no edit/block |
| Loyalty / cashback | **PARTIAL** | View balances; no admin correction UI |
| POS | **REAL** | Full lookup/preview/sale/void |
| Payments | **PARTIAL** | Keys + list; refunds CONTRACT_PENDING |
| Promotions | **PARTIAL** | Marketing read-only |
| Ratings | **PARTIAL** | Read list |
| Delivery | **PARTIAL** | API assign/status; UI absent; external pending |
| Reporting | **PARTIAL** | Dashboard aggregates only |
| Audit | **REAL** | Paginated audit_log |
| User/employee admin | **NOT IMPLEMENTED** (UI/API) | Seeded `admin_users` only |
| System configuration | **NOT IMPLEMENTED** (UI) | `system_settings` used by engine |

---

## 5. RBAC

### 5.1 Roles (actual)

| Role code | Seeded | Notes |
|-----------|--------|-------|
| `super_admin` | Yes (`admin@vaksinamed.uz`) | HQ; all permissions (DB seed + fallback) |
| `cashier` | Yes (`kassa@vaksinamed.uz`, `branchId=12`) | POS + orders ops; no customers/audit/branches manage |
| Legacy `admin` / `hq` | Normalized → HQ | `normalizeAdminRole` / `isHqAdminRole` |

Source: `lib/db/migrations/0001_sessions_rbac.sql`, `lib/db/src/seed.ts`, `artifacts/api-server/src/lib/rbac.ts`.

### 5.2 Permission catalog (code)

`dashboard:read`, `branches:read`, `branches:manage`, `products:read`, `products:manage`, `orders:read`, `orders:confirm_pos`, `orders:cancel`, `customers:read`, `payments:read`, `payments:manage`, `promos:read`, `ratings:read`, `audit:read`, `pos:lookup`, `pos:preview`, `pos:sale`, `pos:void`, `pos:sales:read`, `delivery:update`, `inventory:adjust`, `rbac:manage`.

### 5.3 Role × capability matrix (from fallback + typical seed)

| Action / area | super_admin | cashier |
|---------------|-------------|---------|
| POS lookup/preview/sale/void/sales | ALLOW | ALLOW |
| Dashboard | ALLOW | DENY |
| Branches read/manage | ALLOW | DENY |
| Catalog read | ALLOW | ALLOW |
| Catalog manage (create/patch) | ALLOW | DENY |
| Inventory adjust API | ALLOW | DENY |
| Orders read | ALLOW | ALLOW |
| Orders confirm / fulfill transitions | ALLOW | ALLOW (`orders:confirm_pos`) |
| Orders cancel | ALLOW | DENY (seeded; OPEN policy note in admin order detail) |
| Customers read | ALLOW | DENY |
| Payments read | ALLOW | DENY |
| Promos read | ALLOW | DENY |
| Ratings read | ALLOW | DENY |
| Audit read | ALLOW | DENY |
| Delivery update API | ALLOW | ALLOW |
| FOM status (admin auth) | ALLOW | ALLOW (any authenticated admin) |
| RBAC manage | ALLOW (perm exists) | DENY — **no API/UI implemented** |

Nav visibility mirrors permissions (UX); server still returns 401/403.

---

## 6. Branch scope

| Rule | Behavior |
|------|----------|
| HQ (`super_admin` / legacy HQ) | May omit branch filter (global) or pass `branchId` |
| Cashier | Forced to `admin_users.branch_id`; foreign branch → **403** |
| Enforcement | `resolveStaffBranchFilter`, `assertBranchScope`, `assertStaffBranch` (POS) |

Applies to: orders, products stock query, ratings, payments list, POS sale branch, deliveries, inventory adjust.

---

## 7. Financial authority

| Concern | Authority |
|---------|-----------|
| Cashback balance | `cashback_accounts.balance` (SoT) |
| Cashback history | `cashback_ledger` ⨝ `commercial_transactions` |
| Spend cap | Server `getMaxSpendRatio` / default **30%** |
| Order totals | Server checkout (`products.price`); client `total`/`discount`/`cashbackAmount` ignored |
| POS amounts | Server `previewPosSale` / `confirmPosSale` |
| `customers.balance` | **Mirror only** — never independent SoT |

Admin must **not** become a second financial writer. No Admin UI may overwrite balances.

---

## 8. Inventory authority

| Axis | Meaning |
|------|---------|
| `physical_quantity` | On-hand |
| `reserved_quantity` | Held by ACTIVE reservations |
| `available_quantity` | Generated / derived: physical − reserved |

| Writer | Status |
|--------|--------|
| Checkout `reserveStock` | REAL |
| Complete `consumeReservation` | REAL |
| Cancel/expiry `releaseReservation` | REAL |
| Admin `POST /admin/inventory/adjust` | REAL API; **no admin-web UI** |
| FOM inventory writer | **DISABLED** (`FOM_INVENTORY_WRITER_ENABLED = false`) |

Admin catalog **displays** axes; it must not invent stock client-side.

---

## 9. Cashback authority (Admin view)

| Capability | Status |
|------------|--------|
| Dashboard sum of account balances | REAL |
| Customer list `cashbackBalance` (SoT join) | REAL |
| Customer cashback history in Admin | **NOT IMPLEMENTED** (mobile has `/loyalty/cashback-history`) |
| Manual grant/deduct UI | **OPEN** — BUSINESS_DECISION_REQUIRED |
| Order `refund-cashback` | REAL API (order-scoped EARN reversal); limited Admin exposure |
| Cancel → USE REVERSAL | REAL (order lifecycle) |

Ledger entry types: `EARN`, `USE`, `REVERSAL`, `ADJUSTMENT` (seed/opening — not Admin correction UI).  
Commercial sources: `ORDER`, `POS`, `SYSTEM`, `FOM_POS` (FOM_POS contract pending).

---

## 10. Payment authority

| Item | Status |
|------|--------|
| Branch Payme/Click keys | REAL (plaintext at rest — encryption OPEN) |
| Keys in API responses | MASKED (`••••`) |
| Payment list Admin | REAL (scoped) |
| Capture / intents | REAL (P7) |
| PSP refunds | **CONTRACT_PENDING** |
| Payme/Click live merchant enable | Flags off by default in hardening |
| Separation from cashback | Explicit — payment PAID ≠ cashback EARN |

---

## 11. Order authority

### Axes (P5)

- **Fulfillment:** CREATED → CONFIRMED → PREPARING → READY_FOR_PICKUP | OUT_FOR_DELIVERY → COMPLETED | CANCELLED  
- **Payment:** PENDING | PAID | FAILED | REFUNDED | PARTIALLY_REFUNDED  
- **Reservation:** NONE | ACTIVE | EXPIRED | CANCELLED | FULFILLED  

### Admin can

- List/filter/paginate orders (branch-scoped).
- View detail with separate axes + capabilities.
- Staff transitions: confirm / prepare / ready / out-for-delivery / complete (`orders:confirm_pos`).
- Admin cancel (`orders:cancel`) — releases reservation; may reverse USE; does **not** invent PSP refund.
- confirm-pos shortcut (FOM-oriented COMPLETED + consume) — commercial identity remains **ORDER** / `order:{id}`.

### Admin cannot (by design)

- Invent new statuses.
- Earn cashback on PAID alone (EARN only on fulfillment COMPLETED via `completeOrderCashback`).

---

## 12. FOM authority (one module)

| Fact | Value |
|------|-------|
| Role | Integration **status + webhook bridge** — not the whole Admin |
| Inventory writer | **OFF / DISABLED** |
| FOM_POS external receipt | **CONTRACT_PENDING** |
| confirm-pos commercial | **ORDER** / `order:{orders.id}` |
| Admin UI | Honest OFF / CONTRACT_PENDING — no fake Connected |

Do not invent receipt IDs or vendor fields.

---

## 13. Audit

| Action examples | Logged? |
|-----------------|---------|
| `admin.login` | Yes |
| `pos.sale` / `pos.void` | Yes |
| `branch.update` (id only) | Yes |
| `product.create` / `product.update` | Yes |
| `order.transition.*` / `order.confirm_pos` / `order.cancel` | Yes |
| `inventory.adjust` / `inventory.expire_due` | Yes |
| `fom.sale_confirmed` | Yes (FOM path) |
| Cashback EARN/USE/REVERSAL | Ledger SoT — **not** duplicated as second financial audit |

Gaps: no comprehensive coverage guarantee for every delivery assign; customer Admin edits N/A; secrets must never appear in payload.

---

## 14. Reporting

| Report | Status | Source |
|--------|--------|--------|
| Revenue (completed legacy status) | PARTIAL | `orders` aggregate |
| Order counts / reserved / delivering | PARTIAL | legacy `orders.status` filters |
| Customers count | REAL | `customers` count |
| Branches count | REAL | `branches` count |
| Cashback liability sum | REAL | `sum(cashback_accounts.balance)` |
| Recent orders | REAL | last 8 |
| POS sales report | PARTIAL | POS sales list API; weak reporting UX |
| Cashback issued/used period reports | NOT IMPLEMENTED |
| Inventory / low stock report | NOT IMPLEMENTED |
| Delivery / FOM ops reports | NOT IMPLEMENTED |
| Time-range / branch-scoped dashboard filters | NOT IMPLEMENTED |

Dashboard does **not** currently filter by branch or date range.

---

## 15. Mobile ↔ Admin mapping

| Mobile Feature | Admin Module | API | DB | Admin Action |
|----------------|--------------|-----|----|--------------|
| Login / OTP / register | — | `/api/auth/*` | `customers`, `auth_sessions` | None (customer auth) |
| Profile / edit | Mijozlar (view) | loyalty/auth | `customers` | VIEW list only |
| Catalog / product | Katalog | `/api/catalog/*`, `/api/admin/products` | `products`, `product_stocks` | VIEW / CREATE / PATCH |
| Branches | Filiallar | `/api/branches`, `/api/admin/branches` | `branches` | VIEW / PATCH keys & fields |
| Cart / checkout | — | `/api/cart`, `POST /api/orders` | `carts`, `orders`, `reservations` | Indirect via Orders |
| Orders | Buyurtmalar | `/api/orders/*`, `/api/admin/orders` | `orders`, axes | VIEW / transition / cancel |
| Cashback / history | Mijozlar / Dashboard | `/api/loyalty/cashback-history` | ledger + accounts | VIEW balance (list); history UI missing |
| Loyalty tier / QR | POS | `/api/pos/*` | customers + SoT | POS scan/sale |
| Payments | To‘lovlar / Filiallar | payments + branch keys | intents, payments, branches | VIEW / configure keys |
| Delivery | (no tab) | `/api/deliveries/*` | `deliveries` | API only |
| Promotions | Aksiyalar | `/api/catalog/promos`, `/api/admin/promos` | `promos` | VIEW (marketing) |
| Ratings | Baholar | ratings create (mobile) + admin list | `staff_ratings` | VIEW |
| Notifications | — | workers NOTIFICATION | jobs | NOT IMPLEMENTED ops UI |
| Help / about / language | — | static | — | NOT PART OF ADMIN |
| Support chat | — | — | — | NOT IMPLEMENTED |

---

## 16. Missing capabilities

| Capability | Business need | Current | Dependencies | Risk | Priority |
|------------|---------------|---------|--------------|------|----------|
| Admin user / role / branch assignment UI | Hire cashiers; rotate access | Seed only; `rbac:manage` unused | Auth RBAC tables | HIGH ops | **P0** |
| Inventory management UI | Stock corrections without SQL | API exists | `inventory:adjust`, audit | MEDIUM | **P0** |
| Delivery ops UI | Assign courier / status | API exists; external CONTRACT_PENDING | deliveries API | MEDIUM | **P1** |
| Customer detail + cashback history | Support / disputes | List only | loyalty history API reuse | MEDIUM | **P1** |
| Cashback reports / reconciliation UI | Finance ops | Dashboard sum only | ledger read models | HIGH if wrong SoT | **P1** |
| Controlled cashback correction | Disputes / goodwill | OPEN — policy required | Business decision + ledger writers | CRITICAL if invented wrong | **P2** (policy first) |
| Branch create UI/API | Network growth | PATCH only | branches schema | LOW–MED | **P2** |
| Promo pricing engine | Real discounts | PROMO_MARKETING_ONLY | Business decision | HIGH if bolted on | **OPEN** |
| Secret encryption at rest | Prod keys | PLAINTEXT columns | KMS/Vault | HIGH compliance | **OPEN** (external) |
| Settings UI (spend ratio etc.) | Ops without DB | `system_settings` | cashback lock | MEDIUM | **P2** |
| Full analytics / exports | Management | Partial dashboard | queries, branch scope | MEDIUM | **P2** |
| Customer block / support tools | Abuse | Missing | policy | MEDIUM | **P3** |
| Notifications admin | Campaigns | Worker stub | provider | LOW | **P3** |

---

## 17. Production requirements (Admin-relevant)

- PostgreSQL required (not PGlite) for production-like.
- Admin/customer secrets via env (`ADMIN_SECRET`, etc.).
- Session revocation on logout.
- RBAC + branch scope on every mutating route.
- Merchant keys masked in DTOs; never log secrets.
- PSP merchant APIs and FOM writer remain gated.
- Demo seed never in production (`ALLOW_DEMO_SEED`).

---

## 18. Open external / ops dependencies

| Item | Status |
|------|--------|
| Secret encryption at rest (KMS/Vault) | **OPEN** |
| Redis production configuration (rate limits) | **OPEN** |
| PostgreSQL backup / PITR | **OPEN** |
| FOM_POS vendor contract | **OPEN** |
| Q3 FOM pickup earn timing | **OPEN** |
| Controlled cashback correction policy + UI | **OPEN** |
| Promo ↔ pricing product decision | **OPEN** (currently marketing-only proven) |
| External delivery provider | **CONTRACT_PENDING** |
| PSP refunds | **CONTRACT_PENDING** |

---

## Appendix A — Admin API surface (primary)

| Method | Path | Permission |
|--------|------|------------|
| POST | `/api/admin/login` | public (rate-limited) |
| POST | `/api/admin/logout` | session |
| GET | `/api/admin/me` | admin |
| GET | `/api/admin/dashboard` | `dashboard:read` |
| GET/PATCH | `/api/admin/branches` | read / `branches:manage` |
| GET/POST/PATCH | `/api/admin/products` | read / `products:manage` |
| GET | `/api/admin/orders`, `/api/admin/orders/:id` | `orders:read` |
| GET | `/api/admin/customers` | `customers:read` |
| GET | `/api/admin/ratings` | `ratings:read` |
| GET | `/api/admin/promos` | `promos:read` |
| GET | `/api/admin/audit` | `audit:read` |
| GET | `/api/admin/payments` | `payments:read` |
| GET | `/api/admin/payments/intents/:id` | `payments:read` |
| POST | `/api/admin/payments/intents/:id/refund` | `payments:manage` (PSP outbound still CONTRACT_PENDING) |
| POST | `/api/admin/inventory/adjust` | `inventory:adjust` (API only — no admin-web UI) |
| POST | `/api/admin/inventory/expire-due` | `inventory:adjust` |
| POST | `/api/pos/*` | pos:* |
| POST | `/api/orders/:id/{confirm,prepare,ready,out-for-delivery,complete,admin-cancel,confirm-pos,refund-cashback}` | orders:* |
| * | `/api/deliveries/*` | `delivery:update` (staff; no admin-web tab) |
| GET | `/api/integrations/fom/status` | admin auth |

## Appendix B — Dashboard metrics (actual)

| KPI | Source | Time range | Branch scope | Quality |
|-----|--------|------------|--------------|---------|
| revenue | `sum(orders.total) where status=completed` | all-time | global | PARTIAL (legacy status) |
| orders | `count(orders)` | all-time | global | REAL count |
| completed / reserved / delivering | legacy `orders.status` filters | all-time | global | PARTIAL vs P5 axes |
| customers | `count(customers)` | all-time | global | REAL |
| branches | `count(branches)` | all-time | global | REAL |
| cashback | `sum(cashback_accounts.balance)` | point-in-time | global | REAL SoT |
| cashbackSource | literal `"cashback_accounts"` | — | — | REAL metadata |
| recentOrders | last 8 orders | — | global | REAL |

**Admin UI currently renders:** revenue, orders, reserved, branches, cashback (+ recent orders).  
**API also returns but UI does not show:** `completed`, `delivering`, `customers`, `cashbackSource`.  
Dashboard does **not** currently filter by branch or date range.

## Appendix C — Workers (ops, not Admin tabs)

PostgreSQL `worker_jobs` (no Redis queue SoT). No auto-loop on API boot; gated by `ENABLE_BACKGROUND_WORKERS` / `POST …/workers/run-due`.

| Job type | Purpose |
|----------|---------|
| `reservation_expiry` | Expire/release inventory reservations |
| `payment_expiry` | Fail stale unpaid intents; release reservation |
| `fom_retry` | Idempotent FOM sale retry; writer stays OFF |
| `notification` | Best-effort stub |
| `delivery_provider_retry` | External adapter → CONTRACT_PENDING |
| `cashback_integrity` | Read-only ledger ↔ account check |

## Appendix D — Business flows (reference)

**App order:** Customer → Mobile catalog → Branch → Cart → `POST /orders` (reserve + optional USE) → Payment → Admin fulfill → COMPLETED → EARN (`ORDER` / `order:{id}`).

**POS:** QR → lookup → preview (30% clamp) → sale → commercial `POS` / `receipt:{id}` → USE/EARN ledger → receipt; audit `pos.sale`.

**FOM:** External webhook / confirm-pos bridge → ORDER commercial identity; inventory writer OFF; FOM_POS pending.

**Admin ops:** Login → RBAC nav → operate module → API → PostgreSQL → UI refresh; logout revokes session.

---

*End of master specification. Implementation work must treat this document as the product map; FOM remains one module among many.*
*Discovery cross-checked with parallel codebase exploration (admin/RBAC/schema + mobile/cashback/payments).*
