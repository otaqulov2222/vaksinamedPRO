# Admin Phase 11 — Module Audit

> Date: 2026-09-25  
> Rule: Inspect existing API + UI only. No invented endpoints.

## Matrix

| Module | UI | API | Real Data | Search | Filter | Pagination | Detail | Actions | Missing |
|--------|----|-----|-----------|--------|--------|------------|--------|---------|---------|
| Filiallar | PARTIAL | `GET/PATCH /admin/branches` | PASS | PARTIAL (client) | PARTIAL | API_REQUIRED (full list) | PARTIAL (inline edit) | PASS (manage) | Branch stats; server search/pagination |
| Katalog | PARTIAL | `GET/POST/PATCH /admin/products` | PASS | PARTIAL (client) | PARTIAL (branch) | API_REQUIRED | PARTIAL | PASS (manage) | Server page; barcode field if absent |
| Ombor | PARTIAL | products+`POST /admin/inventory/adjust` | PASS | PARTIAL | PARTIAL | API_REQUIRED | PARTIAL | PASS (adjust) | Threshold policy MISSING; server page |
| Buyurtmalar | PASS | `/admin/orders` + transitions | PASS | PASS | PASS | PASS | PASS | PASS (backend-gated) | — |
| Mijozlar | PARTIAL | customers + cashback-history | PASS | PASS | PARTIAL | PASS | PARTIAL | PASS (read) | Tier server filter if missing |
| Cashback | PASS | SoT + history | PASS | PASS | PARTIAL | PARTIAL (history) | PASS | DISABLED (correction OPEN) | Global ledger list API |
| To‘lovlar | PARTIAL | `/admin/payments` + intents | PASS | API_REQUIRED | PARTIAL | PARTIAL (limit 200) | PARTIAL | CONTRACT_PENDING (refund) | Server filters/pagination |
| Kassa POS | PASS | `/api/pos/*` | PASS | N/A | branch | N/A | receipt | PASS | — (engine freeze) |
| Yetkazib berish | PARTIAL | `/admin/deliveries` | PASS | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PASS | External ETA CONTRACT_PENDING |
| Aksiyalar | PARTIAL | `/admin/promos` | PASS | API_REQUIRED | PARTIAL | API_REQUIRED | PARTIAL | PARTIAL | Pricing engine N/A (marketing only) |
| Baholar | PARTIAL | `/admin/ratings` | PASS | API_REQUIRED | PARTIAL | PASS | PARTIAL | read-only | Staff rating if unsupported |
| Audit | PARTIAL | `/admin/audit` | PASS | PARTIAL | PARTIAL | PASS | read-only | read-only | — |
| Hisobotlar | PARTIAL | dashboard aggregates | PASS | N/A | PARTIAL | N/A | N/A | N/A | Deep reports API_REQUIRED |
| FOM | PASS (honest) | fom/status | PASS | N/A | N/A | N/A | status | DISABLED / CONTRACT_PENDING | Writer OFF; FOM_POS pending |
| Sozlamalar | API_REQUIRED | — | — | — | — | — | — | — | Admin users CRUD |

## Legend applied

- **PASS** — operational enough for Phase 11 target  
- **PARTIAL** — real but incomplete UX  
- **API_REQUIRED** — backend missing  
- **CONTRACT_PENDING** — external blocker  
- **DISABLED** — kill-switch / intentionally off  

## Phase 11 post-implementation (operator UX)

| Module | Result |
|--------|--------|
| Filiallar | **PASS** |
| Katalog | **PASS** |
| Ombor | **PASS** |
| Buyurtmalar | **PASS** |
| Mijozlar | **PASS** |
| Cashback | **PASS** |
| To‘lovlar | **PASS** (refund UI gated + CONTRACT_PENDING) |
| Kassa POS | **PASS** (UI steps only) |
| Yetkazib berish | **PARTIAL** |
| Aksiyalar | **PASS** (marketing-only) |
| Baholar | **PARTIAL** |
| Audit | **PASS** |
| Hisobotlar | **PARTIAL** / deep **API_REQUIRED** |
| FOM | **PASS** (honest DISABLED / CONTRACT_PENDING) |
| Sozlamalar | **API_REQUIRED** |

Shared: ConfirmDialog, DetailDrawer, Tabs, FeedbackBanner — **IMPLEMENTED**.

