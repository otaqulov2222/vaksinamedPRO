# Admin Panel — Implementation Status

> Updated: 2026-09-25 (daily production checkpoint)  
> Primary: `docs/ADMIN_MASTER_SPECIFICATION.md`  
> UI/UX: `docs/ADMIN_UI_UX_AUDIT.md`, `docs/ADMIN_DESIGN_SYSTEM.md`  
> Production gaps: `docs/PRODUCTION_GAP_MATRIX.md`  
> Phase 11 audit: `docs/ADMIN_PHASE_11_MODULE_AUDIT.md`  

## Legend

| Status | Meaning |
|--------|---------|
| **IMPLEMENTED** | Real Admin UI + real API |
| **INTEGRATED** | Existing module wired into shell |
| **PARTIAL** | Real UI, incomplete |
| **API_ONLY** / **API_REQUIRED** | Needs backend work |
| **MISSING** | Not present |
| **CONTRACT_PENDING** | External blocker |
| **DISABLED** | Kill-switch off |
| **OPEN** | Follow-up |

---

## Daily checkpoint — 2026-09-25

| Gate | Status |
|------|--------|
| P0-1 Managed PG PITR + restore | **OPS_REQUIRED** (12.29) |
| P0-2 Merchant secret encryption | App boundary **READY_IN_REPO**; cloud KMS **OPS_REQUIRED** (12.28) |
| P0-3 Payme/Click sandbox E2E | **OPS_REQUIRED** |
| P0-4 Redis live verify | **OPS_REQUIRED** (Phase 12.30 **not started** today) |
| Production enablement | **CLOSED** |
| FOM writer / FOM POS | OFF / **CONTRACT_PENDING** |

---

## Phase 12.27 — P0 production gate verification

| Item | Status |
|------|--------|
| P0-1 Managed PG PITR + restore | **OPS_REQUIRED** (12.29 re-verified; no managed PG / DATABASE_URL here) |
| P0-2 Merchant KMS-at-rest | **OPS_REQUIRED** (12.28: encryption boundary implemented; cloud KMS still ops) |
| P0-3 Payme/Click sandbox E2E | **OPS_REQUIRED** (harness PENDING — credentials MISSING) |
| P0-4 Redis live verify | **OPS_REQUIRED** (code DONE; REDIS_URL MISSING) |
| Production readiness | Remains **NOT READY** |
| Production PSP / FOM enablement | **NOT PERFORMED** |
| Business engines / APIs / DB | unchanged |

**Test:** `tests/phase12-27-p0-gates.test.ts`

---

## Phase 12.26 — Production gap inventory

| Item | Status |
|------|--------|
| Authoritative register `docs/PRODUCTION_GAP_MATRIX.md` | **CREATED** |
| Production readiness | **NOT READY** |
| P0/P1/P2/P3 + EXTERNAL/OPS classified | **DOCUMENTED** |
| Business engines / APIs / DB / Admin redesign | unchanged |
| Invariant test | `tests/production-gap-matrix.test.ts` |

---

## Phase 12.25.1 — Sidebar icon system

| Item | Status |
|------|--------|
| Library: `lucide-react` (workspace catalog) | **IMPLEMENTED** |
| FINAL semantic mapping for all nav + Chiqish | **IMPLEMENTED** |
| Unicode/emoji sidebar glyphs removed | **IMPLEMENTED** |
| Routes / permissions / IA groups | **PRESERVED** |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `navIcons.tsx`, `App.tsx`, `nav.ts`, `styles.css`, `package.json`, `tests/admin-phase12-25-1-sidebar-icons.test.ts`

---

## Phase 12.25 — Cross-module UX consolidation

| Item | Status |
|------|--------|
| Shared Escape on DetailDrawer / ConfirmDialog | **IMPLEMENTED** |
| Status language: FAILED / CONTRACT_PENDING unified | **IMPLEMENTED** |
| Dead “Tez orada” nav chrome removed | **IMPLEMENTED** |
| Duplicate FOM Yangilash removed | **IMPLEMENTED** |
| PAGE_DESCRIPTIONS / nav icon polish | **IMPLEMENTED** |
| Honesty locks (FOM / Settings / Adminlar / Audit / Reports) | **PRESERVED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `ui.tsx`, `nav.ts`, `App.tsx`, `styles.css`, `FomPage.tsx`, `AuditPage.tsx`, `DeliveryPage.tsx`, `RatingsPage.tsx`, docs, `tests/admin-phase12-25-final-ux.test.ts`

---

## Phase 12.24 — FOM integration console

| Item | Status |
|------|--------|
| Source: `GET /integrations/fom/status` (admin auth) | **PRESERVED** |
| Inventory writer OFF / not misrepresented as synced | **IMPLEMENTED** |
| FOM_POS CONTRACT_PENDING honest | **IMPLEMENTED** |
| confirm-pos commercial identity = ORDER | **DOCUMENTED** |
| No invent probe / retry / sync / KPI / receipts | **IMPLEMENTED** |
| Secrets not rendered | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `FomPage.tsx`, `nav.ts`, `styles.css`, `ui.tsx` (NOT_SUPPORTED label), docs, `tests/admin-phase12-24-fom.test.ts`

---

## Phase 12.23 — Admin users & RBAC access boundary

| Item | Status |
|------|--------|
| Admin user list/create/update/delete API | **MISSING** (confirmed) |
| Role/permission assignment API | **MISSING** |
| Honest `AdminAccessPage` (no fake CRUD) | **IMPLEMENTED** |
| Session role + permissions from `/admin/me` (read-only) | **IMPLEMENTED** |
| Backend RBAC / branch scope described as enforcement | **DOCUMENTED** |
| Nav: Tizim → Adminlar (hqOnly) | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `AdminAccessPage.tsx`, `App.tsx`, `nav.ts`, `SettingsPage.tsx`, `styles.css`, `ui.tsx`, docs, `tests/admin-phase12-23-admin-users.test.ts`

---

## Phase 12.22 — Settings product reconstruction

| Item | Status |
|------|--------|
| No `/admin/settings` aggregate (honest) | **CONFIRMED** |
| Read-only cashback max spend via `GET /cashback/rules` | **IMPLEMENTED** |
| Admin users CRUD | **Hali ulanmagan** (API_REQUIRED) |
| No invent toggles / feature flags / secrets / save | **IMPLEMENTED** |
| Pointers: Filiallar / FOM (no secret dump) | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `SettingsPage.tsx`, `App.tsx`, `nav.ts`, `styles.css`, docs, `tests/admin-phase12-22-settings.test.ts`

---

## Phase 12.21 — Audit logs product reconstruction

| Item | Status |
|------|--------|
| Source: `GET /admin/audit` (limit/offset/action/entity) | **PRESERVED** |
| Filters: action (ilike) + entity (exact) only | **IMPLEMENTED** |
| No invent date/branch/actor/search/export/KPI/charts | **IMPLEMENTED** |
| Table + DetailDrawer (no raw JSON dump) | **IMPLEMENTED** |
| Client metadata scrub (token/otp/secret…) | **IMPLEMENTED** |
| Pagination: total / hasMore | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures) |

**Files:** `AuditPage.tsx`, `App.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-21-audit.test.ts`

---

## Phase 12.20 — Reports / Hisobotlar product reconstruction

| Item | Status |
|------|--------|
| Source: `GET /admin/dashboard` only (no dedicated reports API) | **PRESERVED** |
| Date/branch filters mapped to real `createdFrom`/`createdTo`/`branchId` | **IMPLEMENTED** |
| Removed invent AOV / completion % | **IMPLEMENTED** |
| Snapshot tables + scope notes (order vs global) | **IMPLEMENTED** |
| Deep reports: “Hali ulanmagan” (no fake charts/export) | **IMPLEMENTED** |
| Distinct from Dashboard composition | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **PASS** (Edge fixtures 1920→390) |

**Files:** `ReportsPage.tsx`, `App.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-20-reports.test.ts`

---

## Phase 12.19 — Promos / Aksiyalar product reconstruction

| Item | Status |
|------|--------|
| IA: Header → filters → count → dense tables → DetailDrawer | **IMPLEMENTED** |
| Read-only `GET /admin/promos` (promos + rewards); no invent CRUD | **PRESERVED** |
| `PROMO_MARKETING_ONLY` honesty (not pricing engine) | **PRESERVED** |
| No invent discount/dates/branch/KPI | **IMPLEMENTED** |
| Rewards: code/title/points/subtitle only (no fake price) | **IMPLEMENTED** |
| Cashback / Checkout untouched | unchanged |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1920 / 1600 / 1440 / 1280 / 1100 / 960 / 768 / 390 |

**Files:** `PromosPage.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-19-promos.test.ts`

---

## Phase 12.18 — Delivery / Yetkazib berish product reconstruction

| Item | Status |
|------|--------|
| IA: Header → Holat/Filial → count → dense table → DetailDrawer | **IMPLEMENTED** |
| Server filters + pagination (`limit`/`offset`/`total`) | **IMPLEMENTED** |
| Assign + status via drawer; ConfirmDialog for status | **IMPLEMENTED** |
| ETA/courier/tracking honesty (no invent) | **IMPLEMENTED** |
| External sync honesty (`operatorCapabilityLabel`, no primary CONTRACT_PENDING) | **IMPLEMENTED** |
| Removed page-level action cards / Amallar row buttons / window.confirm | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1920 / 1600 / 1440 / 1280 / 1100 / 960 / 768 / 390 |

**Files:** `DeliveryPage.tsx`, `App.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-18-delivery.test.ts`

---

## Phase 12.17 — Branches / Filiallar product reconstruction

| Item | Status |
|------|--------|
| IA: Header → filters → count → dense table → DetailDrawer | **IMPLEMENTED** |
| Removed mini Ombor/Buyurtmalar/To‘lovlar tabs + softRequest side loads | **IMPLEMENTED** |
| Edit PATCH + ConfirmDialog; secrets MASK / write-only | **PRESERVED** |
| No invent create/delete (API has PATCH only) | **IMPLEMENTED** |
| Holat = Ochiq/Yopiq (`isOpen`) | **IMPLEMENTED** |
| Quiet Ombor link; no stock axes in Filiallar | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1920 / 1600 / 1440 / 1280 / 1100 / 960 / 768 / 390 |

**Files:** `BranchesPage.tsx`, `App.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-17-branches.test.ts`

---

## Phase 12.16 — Catalog product management reconstruction

| Item | Status |
|------|--------|
| IA: Header → filters → count → dense table → DetailDrawer | **IMPLEMENTED** |
| Master data columns only (no Fizik/Band/Mavjud table) | **IMPLEMENTED** |
| Create (POST) + edit (PATCH) in drawer; `products:manage` | **IMPLEMENTED** |
| Quiet Ombor reference + navigate to Inventory | **IMPLEMENTED** |
| No StatCard / fake price / fake discount | **IMPLEMENTED** |
| Holat = Retsept / Oddiy (API has no active flag) | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1920 / 1600 / 1440 / 1280 / 1100 / 960 / 768 / 390 |

**Files:** `CatalogPage.tsx`, `App.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-16-catalog.test.ts`; phase3 axes assertion moved to Inventory

---

## Phase 12.15 — Inventory / Stock product reconstruction

| Item | Status |
|------|--------|
| IA: Header → Filial/filters → count → dense table → DetailDrawer | **IMPLEMENTED** |
| Stock axes: Fizik / Band / Mavjud (server-authoritative) | **IMPLEMENTED** |
| HQ branch gate (no fake cross-branch aggregate) | **IMPLEMENTED** |
| Client filters on loaded branch list (q / kategoriya / mavjudlik) | **IMPLEMENTED** |
| Mavjud emas = Available ≤ 0 only (no invent threshold) | **IMPLEMENTED** |
| Adjust + expire-due via ConfirmDialog; `inventory:adjust` RBAC | **PRESERVED** |
| No StatCard KPI wall / no inventory value / no turnover | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1920 / 1600 / 1440 / 1280 / 1100 / 960 / 768 / 390 |

**Files:** `InventoryPage.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-15-inventory.test.ts`

---

## Phase 12.14 — Payments product reconstruction

| Item | Status |
|------|--------|
| IA: Header → filters → count → table → DetailDrawer | **IMPLEMENTED** |
| StatusLabelBadge + provider display labels | **IMPLEMENTED** |
| Honest filters on loaded list (no fake search API) | **IMPLEMENTED** |
| Intent drawer: payment ≠ order payment axis | **IMPLEMENTED** |
| Internal refund + ConfirmDialog; provider CONTRACT_PENDING | **PRESERVED** |
| No StatCard KPI wall / no secrets / no sourceKey-style chrome | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture (production CSS) at 1440 / 1280 / 960 / 768 / 390 |

**Files:** `PaymentsPage.tsx`, `App.tsx` (branches prop), `styles.css`, `nav.ts`, docs, `tests/admin-phase12-14-payments.test.ts`

---

## Phase 12.13 — Customers / Cashback / Ratings product reconstruction

| Item | Status |
|------|--------|
| Customers: search → count → dense table → DetailDrawer | **IMPLEMENTED** |
| Cashback ≠ Loyalty separation in drawer | **IMPLEMENTED** |
| Cashback: liability overview (dashboard SoT) + customer ledger drawer | **IMPLEMENTED** |
| Ledger: StatusLabelBadge entry types; no `sourceKey` chrome | **IMPLEMENTED** |
| Ratings: branch filter → count → table → DetailDrawer | **IMPLEMENTED** |
| Removed client “Sahifa o‘rtachasi” KPI | **IMPLEMENTED** |
| No fake metrics / no client finance math / no balance invent | **PRESERVED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixtures (production CSS) for Customers / Cashback / Ratings at 1440 / 1280 / 960 / 390 |

**Files:** `CustomersPage.tsx`, `CashbackPage.tsx`, `RatingsPage.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-13-crm.test.ts`

---

## Phase 12.12.1 — Orders visual / product refinement

| Item | Status |
|------|--------|
| Search-primary control hierarchy | **IMPLEMENTED** |
| Bron demoted to “Qo‘shimcha filtrlar” | **IMPLEMENTED** |
| Sana grouped (Dan–Gacha, same query params) | **IMPLEMENTED** |
| Enter applies search (SearchInput onSubmit) | **IMPLEMENTED** |
| Quiet result context (`N ta buyurtma`) | **IMPLEMENTED** |
| Compact table-surface empty state | **IMPLEMENTED** |
| Transition actions behind disclosure | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS** — Edge headless fixture with production `styles.css` at 1440 / 1280 / 960 / 390 |

**Files:** `OrdersPage.tsx`, `styles.css`, docs, `tests/admin-phase12-12-orders.test.ts`

---

## Phase 12.12 — Orders page product reconstruction

| Item | Status |
|------|--------|
| IA: Header → Control bar → Result count → Table → DetailDrawer | **IMPLEMENTED** |
| Operator table: Buyurtma / Mijoz / Filial / Holat / To‘lov / Summa / Vaqt | **IMPLEMENTED** |
| Row click opens DetailDrawer (no per-row Ko‘rish noise) | **IMPLEMENTED** |
| Payment ≠ fulfillment (separate StatusLabelBadge axes) | **IMPLEMENTED** |
| Tur / Bron demoted from table → drawer | **IMPLEMENTED** |
| Filters: q / holat / to‘lov / filial / bron / sana + Tozalash | **IMPLEMENTED** |
| Honest empty (no orders vs no filter results) | **IMPLEMENTED** |
| Cancel via ConfirmDialog; transitions / FOM via capabilities | **PRESERVED** |
| Server pagination (limit 25) | **PRESERVED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **VISUAL PASS NOT VERIFIED** (no browser automation this session) |

**Files:** `OrdersPage.tsx`, `styles.css`, `nav.ts`, docs, `tests/admin-phase12-12-orders.test.ts`

**Next:** Phase 12.13+ other modules if scheduled — not started.

---

## Phase 12.11.1 — Dashboard geometry / full-width

| Item | Status |
|------|--------|
| Root cause: `.dashboard { max-width: 1100px }` | **FIXED** |
| Dashboard fills `.main` (`width: 100%`, `max-width: none`) | **IMPLEMENTED** |
| Soft cap remains on `.main` via `--vm-content-max: 1680px` + `margin-inline: auto` | **PRESERVED** |
| Header / hero / rail / attention / activity share same width | **IMPLEMENTED** |
| Visual acceptance | **BROWSER VERIFY** |

**Files:** `styles.css`, `tests/admin-phase12-11-dashboard.test.ts`

---

## Phase 12.11 — Final Dashboard product reconstruction

| Item | Status |
|------|--------|
| Compact biz-hero (Savdo + period + orders) | **IMPLEMENTED** |
| Ops-rail (label-above-value, separators) | **IMPLEMENTED** |
| Attention: calm strip / gate / priority rows | **IMPLEMENTED** |
| Activity content-height when empty | **IMPLEMENTED** |
| Sparse DB intentional composition | **IMPLEMENTED** |
| No QA matrix / gradients / fake metrics | **IMPLEMENTED** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **BROWSER VERIFY** — not claimed PASS from tests |

**Files:** `DashboardPage.tsx`, `styles.css`, docs, `tests/admin-phase12-11-dashboard.test.ts`

---

## Phase 12.10 — Dashboard pixel-level product reconstruction

| Item | Status |
|------|--------|
| Pre-impl KEEP/MOVE/MERGE/REDESIGN/REMOVE audit | **DONE** |
| Savdo hero row (34–40px) + subordinate pipeline | **IMPLEMENTED** |
| Context rail (not KPI cards) | **IMPLEMENTED** |
| Attention work queue (WHAT / WHY / CTA) | **IMPLEMENTED** |
| Priority: inventory → open orders → delivery | **IMPLEMENTED** |
| Compact calm empty with ✓ | **IMPLEMENTED** |
| No gradients / no QA matrix / no sidebar mirror | **IMPLEMENTED** |
| CSS vocabulary: dashboard / business-snapshot / context-rail / attention / activity | **IMPLEMENTED** |
| Other modules | **NOT THIS PHASE** |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **BROWSER VERIFY** — tests ≠ visual PASS |

**Files:** `DashboardPage.tsx`, `styles.css`, `App.tsx` (`onOpenDelivery`), docs, `tests/admin-phase12-10-dashboard.test.ts`

**Next:** Phase 12.11+ module redesigns (Orders/POS/…) if scheduled.

---

## Phase 12.9 — Dashboard operations center reset

| Item | Status |
|------|--------|
| Composition: Header → Bugungi savdo → E’tibor → Faoliyat | **IMPLEMENTED** |
| One business snapshot (Savdo dominant) | **IMPLEMENTED** |
| Quiet network metadata (not KPI strip) | **IMPLEMENTED** |
| Attention work queue from real API signals | **IMPLEMENTED** |
| Compact calm empty attention | **IMPLEMENTED** |
| Inventory Available≤0 only (operator “Mavjud emas”) | **IMPLEMENTED** |
| Quick-action / sidebar-mirror matrix removed | **IMPLEMENTED** |
| Activity prominent; StatusLabelBadge | **IMPLEMENTED** |
| Module redesigns (Orders/POS/…) | **NOT THIS PHASE** (12.10+) |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **BROWSER VERIFY** — tests ≠ visual PASS |

**Files:** `DashboardPage.tsx`, `styles.css`, `App.tsx` (prop cleanup), docs, `tests/admin-phase12-9-dashboard.test.ts`

**Next:** Phase 12.10 — Orders / POS / Payments / Inventory redesign.

---

## Phase 12.8 — Information Architecture + operator copy

| Item | Status |
|------|--------|
| Nav IA: Boshqaruv / Savdo / Ombor / Mijozlar / Tarmoq / Tahlil / Tizim | **IMPLEMENTED** |
| Nav weight (primary / secondary / low / system) | **IMPLEMENTED** |
| FOM moved to Tizim (route + RBAC unchanged) | **IMPLEMENTED** |
| Operator label helpers + StatusLabelBadge | **IMPLEMENTED** |
| Technical-copy suppression (presentation only) | **IMPLEMENTED** (light module adoption) |
| Page-header contract (topbar location / page H1) | **IMPLEMENTED** |
| Button hierarchy + surface + density foundations | **IMPLEMENTED** |
| Dashboard redesign / module redesigns | **NOT THIS PHASE** (12.9+) |
| Business engines / APIs / DB | unchanged |
| Visual acceptance | **BROWSER VERIFY** — tests ≠ visual PASS |

**Files:** `nav.ts`, `App.tsx`, `ui.tsx`, `styles.css`, selected pages (copy-only), docs, `tests/admin-phase12-8-ia-copy.test.ts`

**Next:** Phase 12.9 — Dashboard redesign on this IA foundation.

---

## Phase 12.6B — Dashboard Operations Center

| Item | Status |
|------|--------|
| Composition: Snapshot → Context → Attention+Actions → Activity | **IMPLEMENTED** |
| Business snapshot (`.biz-snapshot`, Savdo dominant) | **IMPLEMENTED** |
| Quiet secondary context line | **IMPLEMENTED** |
| Unified ops zone (~60/40, one surface) | **IMPLEMENTED** |
| Inventory attention (Available≤0 only, compact empty) | **IMPLEMENTED** |
| Quick action tiles with contextual hints | **IMPLEMENTED** |
| Activity tabs + StatusLabelBadge | **IMPLEMENTED** |
| Content-driven empty states | **IMPLEMENTED** |
| Business engines | unchanged |
| Visual acceptance | **BROWSER VERIFY** |

**Files:** `DashboardPage.tsx`, `styles.css`, docs, `tests/admin-phase12-6b-dashboard.test.ts`

---

## Phase 12.6A — Enterprise Shell + Navigation

| Item | Status |
|------|--------|
| Sidebar quiet nav (not filled buttons) | **IMPLEMENTED** |
| Brand → operator → role → scope hierarchy | **IMPLEMENTED** |
| Topbar: quiet breadcrumb + scope + Sessiya + Chiqish | **IMPLEMENTED** |
| Session refresh accurate label (not fake page refresh) | **IMPLEMENTED** |
| Page-header title contract (H1 owns title) | **IMPLEMENTED** |
| Button hierarchy: primary / secondary / tertiary / danger | **IMPLEMENTED** (shared CSS) |
| Surface system classes | **IMPLEMENTED** |
| Status label helpers (Uzbek presentation) | **IMPLEMENTED** (helpers; module adoption later) |
| Technical-copy helpers | **IMPLEMENTED** |
| Module page compositions (Dashboard/Orders/…) | **NOT THIS PHASE** |
| Business engines | unchanged |
| Visual acceptance | **BROWSER VERIFY** |

**Files:** `App.tsx`, `ui.tsx`, `styles.css`, docs, `tests/admin-phase12-6a-shell.test.ts`

---

## Phase 12.5 — Dashboard composition rebuild

| Item | Status |
|------|--------|
| Mental model: Happening → Attention → Do → Recent | **IMPLEMENTED** |
| Business snapshot: single cmd-strip (Savdo hero) | **IMPLEMENTED** |
| Secondary totals demoted to context line | **IMPLEMENTED** |
| Ops zone 60/40 (inventory + qa-matrix) | **IMPLEMENTED** |
| Activity tabs (Buyurtmalar / Kassa) | **IMPLEMENTED** |
| Content-driven empty-inline states | **IMPLEMENTED** |
| Business engines | unchanged |
| Visual acceptance | **BROWSER VERIFY** — do not claim PASS without hard-refresh inspection |

---

## Phase 12.4 — Pixel-level product design reconstruction

| Item | Status |
|------|--------|
| Content audit (debug language removed from operator surfaces) | **IMPLEMENTED** |
| Topbar simplified | **IMPLEMENTED** |
| Dashboard flat panels + MetricStrip | superseded by 12.5 cmd-strip |
| FOM status + collapsed technical details | **IMPLEMENTED** |
| Reports / Settings / Cashback operator copy | **IMPLEMENTED** |
| Business engines | unchanged |
| Visual PASS claim | superseded by 12.5 |

---

## Phase 12.3 — Enterprise product UX/UI overhaul

| Item | Status |
|------|--------|
| Product IA navigation groups | **IMPLEMENTED** |
| Sidebar / topbar control center | **IMPLEMENTED** |
| Dashboard MetricStrip ops center | superseded by 12.5 |
| Reports AVAILABLE vs API_REQUIRED | **IMPLEMENTED** |
| Settings capability sections | **IMPLEMENTED** |
| Cashback financial strip | **IMPLEMENTED** |
| POS spend label honesty (server maxSpend) | **IMPLEMENTED** |
| Business engines | unchanged |

---

## Phase 12.2 — Premium Dashboard visual refinement

| Item | Status |
|------|--------|
| KPI hierarchy (Savdo hero + secondary quiet) | **IMPLEMENTED** (evolved in 12.5) |
| Compact filters in header | **IMPLEMENTED** |
| Inventory purposeful empty + real table | **IMPLEMENTED** |
| Quick action tiles | **IMPLEMENTED** (matrix in 12.5) |
| Orders/POS full-width compact empties | **IMPLEMENTED** |
| Fake trends / invented thresholds | none |
| Business logic | unchanged |

---

## Phase 12.1 — CSS / styling regression fix

| Item | Status |
|------|--------|
| Root cause | Vite **dev** transform served styles.css with empty __vite__css (HMR/cache corruption on long-lived server) |
| Source CSS / import | Intact (main.tsx → ./styles.css; tokens --vm-* present; production build CSS ~20KB) |
| Fix | Cleared Vite cache + restarted Admin Vite; **no UI redesign**, no business logic changes |
| Browser verify | Dev CSS module non-empty after restart |

---

## Phase 12 — Premium visual redesign

| Item | Status |
|------|--------|
| Density tokens (sidebar/radius/shadow/content max) | **IMPLEMENTED** |
| Sidebar quieter / narrower | **IMPLEMENTED** |
| Compact topbar (no pill chips) | **IMPLEMENTED** |
| Dashboard KPI hierarchy + ops grid | **IMPLEMENTED** |
| Flat sections / less card nesting | **IMPLEMENTED** |
| Compact empty states | **IMPLEMENTED** |
| Module token cascade | **INTEGRATED** (global CSS) |
| Business logic | unchanged |

---

## Phase 11 — Deep operator UX

| Module | Status | Notes |
|--------|--------|-------|
| Filiallar | **PASS** | FilterBar, DetailDrawer tabs, ConfirmDialog, secrets masked |
| Katalog | **PASS** | FilterBar, DetailDrawer, no fake discounts |
| Ombor | **PASS** | Available<=0 only, ConfirmDialog adjust |
| Buyurtmalar | **PASS** | ConfirmDialog cancel; 3-axis detail |
| Mijozlar | **PASS** | DetailDrawer tabs, SoT cashback |
| Cashback | **PASS** | SoT labels retained |
| To‘lovlar | **PASS** | Intent drawer; refund CONTRACT_PENDING |
| Kassa POS | **PASS** | Step chrome; engine untouched |
| Yetkazib berish | **PARTIAL** | External ETA CONTRACT_PENDING |
| Aksiyalar | **PASS** | PROMO_MARKETING_ONLY |
| Baholar | **PARTIAL** | Real list |
| Audit | **PASS** | DetailDrawer + honest filters (12.21) |
| Hisobotlar | **PASS** | Snapshot + Hali ulanmagan (12.20); no invent KPIs |
| FOM | **PASS** | Status console; writer OFF; FOM_POS pending (12.24) |
| Sozlamalar | **PARTIAL** | Cashback % read-only; Adminlar → separate boundary (12.23) |
| Adminlar | **PARTIAL** | Access boundary; CRUD API_REQUIRED |
| ConfirmDialog / DetailDrawer | **IMPLEMENTED** | ui.tsx |

---

## Phase 10 — Enterprise UI/UX

| Item | Status | Notes |
|------|--------|-------|
| UI/UX audit | **IMPLEMENTED** | `docs/ADMIN_UI_UX_AUDIT.md` |
| Design system tokens | **IMPLEMENTED** | CSS `--vm-*` + `docs/ADMIN_DESIGN_SYSTEM.md` |
| Shared components (`ui.tsx`) | **IMPLEMENTED** | Header, FilterBar, StatCard, StatusBadge, DataTable, Pagination, Empty/Error/Loading |
| Sidebar redesign | **IMPLEMENTED** | Groups, icons, collapse, `aria-current`, permission-aware |
| Top header | **IMPLEMENTED** | Breadcrumb + identity chip + HQ/branch + refresh + logout |
| Page header system | **IMPLEMENTED** | `PAGE_DESCRIPTIONS` + `AdminPageHeader` |
| Dashboard polish | **IMPLEMENTED** | FilterBar, StatCards, SectionCard tables, Omborga o‘tish |
| Money format `125 500 so‘m` | **IMPLEMENTED** | `money()` display-only |
| Status badge system | **IMPLEMENTED** | ok/warn/danger/info/neutral + shared tone helpers |
| Orders / Cashback / Reports / Settings polish | **IMPLEMENTED** | Shared components |
| Other modules token alignment | **INTEGRATED** | Same CSS + PageHeader descriptions; deeper FilterBar migration incremental |
| Fake trends / charts | **DISABLED** | Not added |
| Business logic changes | — | None |

---

## Phase 9A — Module matrix (current)

| Module | UI | API | Real data? | Status |
|--------|----|-----|------------|--------|
| Dashboard | `DashboardPage` | `GET /admin/dashboard` (+ filters) | Yes | **IMPLEMENTED** |
| POS | `PosTerminal` | `/api/pos/*` | Yes | **INTEGRATED** |
| Branches | `BranchesPage` | `/admin/branches` | Yes | **IMPLEMENTED** |
| Catalog | `CatalogPage` | `/admin/products` | Yes | **IMPLEMENTED** |
| Inventory | `InventoryPage` | products + adjust | Yes | **IMPLEMENTED** |
| Orders | `OrdersPage` | `/admin/orders` + transitions | Yes | **IMPLEMENTED** |
| Customers | `CustomersPage` | customers + cashback-history | Yes (SoT) | **IMPLEMENTED** |
| Cashback | `CashbackPage` | SoT ledger/history | Yes | **IMPLEMENTED** |
| Payments | `PaymentsPage` | payments + intents | Yes | **IMPLEMENTED** |
| Promotions | `PromosPage` | `/admin/promos` | Yes (marketing) | **IMPLEMENTED** |
| Ratings | `RatingsPage` | `/admin/ratings` | Yes | **IMPLEMENTED** |
| Delivery | `DeliveryPage` | `/admin/deliveries` | Yes | **IMPLEMENTED** |
| Reports | `ReportsPage` | dashboard aggregates + filters | Yes (snapshot) | **PARTIAL** (deep API_REQUIRED) |
| Audit | `AuditPage` | `/admin/audit` | Yes | **IMPLEMENTED** |
| FOM | `FomPage` | fom/status | Yes (honest) | **INTEGRATED** |
| Settings / Admin users | `SettingsPage` + `AdminAccessPage` | `/cashback/rules`; `/admin/me` | Partial | **PARTIAL** |

---

## Phase 9 — Dashboard ops

| Item | Status | Notes |
|------|--------|-------|
| Date filter (today / yesterday / 7d / 30d / custom) | **IMPLEMENTED** | Server: `createdFrom`/`createdTo` Asia/Tashkent |
| Branch filter | **IMPLEMENTED** | Server: `branchId` + `resolveStaffBranchFilter` |
| Order KPIs scoped | **IMPLEMENTED** | revenue, orders, completed, delivering, reserved |
| Customers / cashback / branches counts | **IMPLEMENTED** | Global SoT snapshot (documented) |
| Inventory snapshot | **IMPLEMENTED** | Requires branch; Available≤0 factual — **no threshold policy** |
| Low-stock threshold rule | **MISSING** | Not invented |
| Recent orders + open detail | **IMPLEMENTED** | Customer identity; navigates to Orders |
| Recent POS | **PARTIAL** | `GET /pos/sales` when `pos:sales:read` |

### KPI authority (Phase 9E)

| KPI | Source | Date scope | Branch scope |
|-----|--------|------------|--------------|
| Savdo / completed / delivering / reserved / orders | `orders` aggregate | Yes | Yes |
| Mijozlar | `customers` count | Global | Global |
| Cashback | `sum(cashback_accounts.balance)` | Global | Global |
| Filiallar | `branches` count | Global | Global |
| Inventory list | `product_stocks` | N/A | Required branch |

---

## Phase 9N–O

| Item | Status |
|------|--------|
| Admin user CRUD | **ADMIN_USER_MANAGEMENT = API_REQUIRED** |
| Deep reports / CSV / charts | **API_REQUIRED / MISSING** |
| Reports operational snapshot (dashboard reuse) | **IMPLEMENTED** (12.20 honesty) |

---

## Remaining OPEN / CONTRACT_PENDING / DISABLED

| Item | Status |
|------|--------|
| Cashback correction workflow | **OPEN** |
| Secret encryption at rest | **OPEN** |
| PSP outbound refund | **CONTRACT_PENDING** |
| External delivery | **CONTRACT_PENDING** |
| FOM_POS | **CONTRACT_PENDING** |
| FOM inventory writer | **DISABLED** |
| Inventory low-stock threshold policy | **MISSING** (not invented) |
| Admin users / roles API | **API_REQUIRED** |
| Deeper FilterBar migration on every list page | **PARTIAL** (tokens applied; Orders/Cashback/Dashboard complete) |

---

## Safety

- No financial engine / 30% / FOM enable / inventory architecture changes  
- No unnecessary migrations  
- No git add/commit/push in Phase 12  
- Not claimed production-ready
