# Admin Panel — Implementation Status (Phase 7)

> Updated: 2026-09-24  
> Primary product reference: `docs/ADMIN_MASTER_SPECIFICATION.md`  
> Scope: Admin shell + connect existing APIs. No cashback/inventory/payment/FOM engine changes.

## Legend

| Status | Meaning |
|--------|---------|
| **IMPLEMENTED** | Real Admin UI + real API, production-usable for supported ops |
| **INTEGRATED** | Existing module wired into main shell (not rewritten) |
| **PARTIAL** | Real UI, but incomplete coverage vs master spec |
| **API_ONLY** | Backend exists; Admin UI not (or not fully) connected |
| **MISSING** | Not present in product |
| **CONTRACT_PENDING** | Honest blocker — external/vendor contract required |
| **DISABLED** | Explicitly off (kill-switch) |
| **OPEN** | Documented follow-up; not claimed complete |

---

## A. Module matrix

| Module | Status | Notes |
|--------|--------|-------|
| Admin shell / nav | **IMPLEMENTED** | Persistent sidebar, topbar, breadcrumbs, identity, branch scope label, logout, RBAC-aware |
| Dashboard | **IMPLEMENTED** | All KPIs from API rendered: revenue, orders, completed, delivering, reserved, customers, cashback (SoT), branches |
| Kassa POS | **INTEGRATED** | Existing `PosTerminal` in shell; financial engine untouched |
| Filiallar | **IMPLEMENTED** | List/search/edit; payment secrets never displayed (status flags + empty write fields) |
| Katalog | **IMPLEMENTED** | Products + stock axes Physical/Reserved/Available via `product_stocks` |
| Ombor / Inventory | **IMPLEMENTED** | Overview + controlled adjust + expire-due (`inventory:adjust`) |
| Buyurtmalar | **IMPLEMENTED** | P5 axes separate; filters/pagination/date/branch; server transitions only |
| Mijozlar | **IMPLEMENTED** | List/search/pagination + detail + cashback history (SoT) |
| Cashback / Loyalty | **IMPLEMENTED** | Liability + balances + ledger history; **no balance edit** (correction **OPEN**) |
| To‘lovlar | **IMPLEMENTED** | Payments list + intent snapshot + refund UI (PSP outbound **CONTRACT_PENDING**) |
| Aksiyalar | **IMPLEMENTED** | Read-only; **PROMO_MARKETING_ONLY** |
| Baholar | **IMPLEMENTED** | Branch-scoped ratings list |
| Yetkazib berish | **IMPLEMENTED** | `GET /admin/deliveries` + assign/status; external provider **CONTRACT_PENDING** |
| Hisobotlar | **PARTIAL** | Dashboard aggregates only — no dedicated reporting warehouse |
| Audit | **IMPLEMENTED** | Paginated read-only; secrets sanitized |
| FOM | **INTEGRATED** | One module; writer **DISABLED**; FOM_POS **CONTRACT_PENDING** |
| Sozlamalar / Admin users | **MISSING** | No admin-users/roles CRUD API — UI shows honest Tez orada |

---

## B. API surface newly connected in Phase 7

| Capability | Before | After |
|------------|--------|-------|
| Dashboard `completed` / `delivering` / `customers` | API yes, UI gap | **Surfaced** |
| `POST /admin/inventory/adjust` | API_ONLY | **UI connected** |
| `POST /admin/inventory/expire-due` | API_ONLY | **UI connected** |
| `GET /admin/customers/:id` | Missing | **Added** (read-only SoT cashback) |
| `GET /admin/customers/:id/cashback-history` | Missing | **Added** (reuses `getCustomerCashbackHistory`) |
| `GET /admin/payments/intents/:id` | API_ONLY | **UI connected** |
| `POST /admin/payments/intents/:id/refund` | API_ONLY | **UI connected** (honest CONTRACT_PENDING) |
| Delivery admin list | Missing | **`GET /admin/deliveries`** + UI |
| Delivery assign/status | API exists | **UI connected** |

---

## C. Authority locks (unchanged)

| Domain | Authority | Admin claim |
|--------|-----------|-------------|
| Cashback | `cashback_accounts` + `cashback_ledger` + `commercial_transactions` | View only; no direct balance edit |
| Inventory | `product_stocks` physical/reserved/available | Adjust only via server `adjustStock` |
| Payments | payment intents service | No production Payme/Click enable; secrets not shown |
| Orders | P5 FULFILLMENT / PAYMENT / RESERVATION | Separate axes; server transitions |
| FOM | Adapter contracts | Writer **DISABLED**; FOM_POS **CONTRACT_PENDING** |
| RBAC | Server `requirePermission` + branch scope | Sidebar hide ≠ authorization |

---

## D. RBAC navigation (UX)

| Role (typical) | Sees |
|----------------|------|
| `super_admin` / HQ | Full authorized module set + FOM + Settings placeholder |
| `cashier` | POS + products/orders/delivery (per seeded permissions); no dashboard/audit/cashback unless granted |

Server still enforces every route.

---

## E. Remaining OPEN / CONTRACT_PENDING / DISABLED

| Item | Status |
|------|--------|
| Cashback controlled correction UI | **OPEN** (no safe admin adjust API) |
| Secret encryption at rest (Payme/Click keys) | **OPEN** |
| Customer phone masking policy (detail full phone) | **OPEN** |
| PSP outbound refund Payme/Click | **CONTRACT_PENDING** |
| External delivery provider | **CONTRACT_PENDING** |
| FOM_POS commercial identity | **CONTRACT_PENDING** |
| FOM inventory writer | **DISABLED** |
| Admin users / roles CRUD | **MISSING** |
| Dedicated reporting beyond dashboard KPIs | **PARTIAL / MISSING** |
| Dashboard date-range / branch KPI filters | **MISSING** (API aggregates are global today) |
| Inventory low-stock alerts on dashboard | **MISSING** (not in dashboard API) |

---

## F. Tests / build

| Check | Result |
|-------|--------|
| `admin-web` typecheck | PASS |
| `admin-web` build | PASS |
| `api-server` typecheck | PASS |
| Contract tests | `admin-phase7-panel.test.ts` + updated phase 2/3/6/3h/3i/3j UI path assertions |

---

## G. Safety confirmation

- No git add / commit / push
- No cashback engine changes
- No inventory architecture changes (UI only + existing adjust API)
- No payment engine / production PSP enablement
- No FOM enablement
- No unnecessary migrations
- No production secrets in UI
