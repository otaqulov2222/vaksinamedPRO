# Admin Design System (Phase 10)

> VaksinaMed Admin — operational enterprise console  
> Identity: deep purple primary · yellow accent · light neutral surfaces

## Principles

1. One product language across every module  
2. Information density without clutter  
3. Operational clarity over decoration  
4. Server-authoritative data only (no fake trends)  
5. Frontend permissions are UX only  

## Tokens

| Token | Value | Use |
|-------|-------|-----|
| `--vm-bg` | `#F4F6FA` | App background |
| `--vm-surface` | `#FFFFFF` | Cards / tables |
| `--vm-ink` | `#1F1235` | Primary text |
| `--vm-muted` | `#64748B` | Secondary text |
| `--vm-line` | `#E6EAF2` | Borders |
| `--vm-primary` | `#5C328E` | Brand / active |
| `--vm-primary-dark` | `#2A104E` | Sidebar / emphasis |
| `--vm-gold` | `#FFCC00` | Primary CTA / accent |
| `--vm-ok` | `#0F766E` | Success |
| `--vm-warn` | `#B45309` | Warning |
| `--vm-danger` | `#B91C1C` | Danger |
| `--vm-info` | `#1D4ED8` | Info |
| `--vm-radius-sm` | `8px` | Inputs / badges |
| `--vm-radius` | `12px` | Cards / buttons |
| `--vm-shadow` | soft elevation | Floating panels |
| `--vm-space-*` | 4 / 8 / 12 / 16 / 24 / 32 | Spacing scale |

## Typography

| Role | Class / element | Size / weight |
|------|-----------------|---------------|
| App brand | `.brand` | 15–16px / 800 |
| Page title | `.page-title` / `h1` | 22px / 700 |
| Section | `.section-title` / `h2` | 15px / 700 |
| Body | default | 14px / 400 |
| Meta | `.muted` / `.meta` | 12px / 400 |
| Money | `.money` | 15–22px / 700 tabular |
| KPI value | `.stat-value` | 22–26px / 800 tabular |

Font stack: `"Segoe UI", "Source Sans 3", system-ui, sans-serif` (operational, not marketing).

## Money format

`money(n)` → `125 500 so‘m` (space thousands, Uzbek so‘m suffix).  
Never invent currency conversion.

## Shared components (`src/ui.tsx`)

| Component | Role |
|-----------|------|
| `AdminPageHeader` | Title + description + actions |
| `FilterBar` / `FilterField` | Horizontal filter toolbar |
| `StatCard` | KPI label / value / unit / context |
| `StatusBadge` | Shared status tones |
| `SectionCard` | Section container with title/actions |
| `DataTable` | Scrollable table shell |
| `PaginationBar` | Prev / next / count |
| `EmptyState` | Honest empty |
| `ErrorState` | Message + retry |
| `LoadingBlock` | Skeleton / loading |
| `SearchInput` | Search field pattern |
| `ConfirmDialog` | Accessible confirm (when used) |
| `MoneyText` | Consistent money display |
| `StateBox` | Compose loading/error/empty |

## Status tones

| Tone | Use |
|------|-----|
| `ok` | COMPLETED, PAID, ACTIVE, OPEN |
| `warn` | PENDING, PREPARING, REFUNDED, Available≤0 |
| `danger` | FAILED, CANCELLED, EXPIRED |
| `info` | CONFIRMED, OUT_FOR_DELIVERY |
| `neutral` | CREATED, NONE, DISABLED, CONTRACT_PENDING |

Map **only existing backend statuses**.

## Shell

- Fixed desktop sidebar (collapsible), permission-aware groups  
- Topbar: breadcrumb + identity + HQ/branch + refresh + logout  
- Page content: `AdminPageHeader` → filters → content  

## Do not

- Fake charts / trends  
- Overuse gradients or cards  
- Expose secrets  
- Change financial engines

## Phase 12 — Premium visual redesign

Philosophy: operations center, not card gallery.

- Content max ~1680px; sidebar ~212px; radius 6–8px; shadows off by default
- KPI hierarchy: stat-primary vs stat-secondary
- Sections can be section-flat (no nested card chrome)
- Compact tables (~44px rows), compact badges (4px radius)
- Dashboard: header+filters connected; ops row 2/3+1/3; orders+POS asymmetric
- Whitespace separates hierarchy — no giant empty regions

## Phase 12.2 — Premium Dashboard visual refinement

- Information levels: Biznes → Holat → Ops/Activity → Tezkor amallar
- Savdo uses stat-hero (dominant number); secondary KPIs dashed/quiet
- Quick actions: quick-tile (icon + title + hint), not plain ghost rows
- Activity sections full-width; empty states stay compact (dash-activity-empty)
- No fake trends; inventory empty prompts branch select only

## Phase 12.3 — Enterprise product UX/UI overhaul

### Information architecture
Nav groups: Umumiy · Savdo · Katalog va ombor · Mijozlar va loyalty · Operatsiya · Tahlil · Tizim

### Composition primitives
- MetricStrip — KPI strip (hero + cells), not equal card grids
- ops-block — titled operational sections
- quick-tile — compact shortcuts
- capability-grid — AVAILABLE vs API_REQUIRED honesty

### Shell
- Sidebar: brand mark, role/scope identity, group labels, left-accent active
- Topbar: Admin / Group / Page + context + operator chips

### Module states
Empty / loading / error via shared StateBox; ConfirmDialog for stock/finance risk actions.

## Phase 12.4 — Pixel-level product design reconstruction

### Content rules
- Operator language only on primary screens
- No debug metadata (scoped/global/TZ/cashback_accounts/server agregat) on Dashboard
- Page descriptions: one short sentence
- Technical jargon collapsed (FOM tech details) or rephrased (Reports: Hali ulanmagan)

### Layout rules
- Primary KPIs: one MetricStrip (not card grid)
- Secondary KPIs: quieter strip
- Activity: panel-plain (header + table), not card-in-card
- Topbar: breadcrumb + name · scope + actions

### Card usage
Cards only for meaningful grouping; tables sit on flat panels.

## Phase 12.5 — Dashboard composition rebuild

Mental model (fixed order):

1. **What is happening?** — `.cmd-strip` (Savdo hero + Buyurtmalar / Yakunlangan / Yetkazilmoqda)
2. **What needs attention?** — `.dash-attention` inventory signals (compact when empty)
3. **What should I do?** — `.qa-matrix` 2-column action tiles
4. **What happened recently?** — `.dash-activity` with Buyurtmalar | Kassa tabs

### Composition rules
- One business strip — not 4+4 equal KPI cards
- Secondary totals: `.dash-context-line` (quiet inline), never a competing strip
- Ops zone: ~60/40 (`.dash-ops-zone`)
- Empty: `.empty-inline` content-height only — no giant dashed rectangles
- Purple reserved for nav/brand accents; metrics surface stays neutral + gold Savdo accent
- Spacing rhythm: page/section ~16–24px; internal 10–14px

## Phase 12.6B — Dashboard operations center

```
Header (Sana · Filial · Yangilash)
→ .biz-snapshot (Savdo hero + Buyurtmalar / Yakunlangan / Yetkazish)
→ .dash-context-line (quiet totals)
→ .dash-ops-zone (E’tibor | Tezkor amallar) — one surface
→ .dash-activity (Buyurtmalar | Kassa tabs)
```

Rules: no card-on-card; Available≤0 only; StatusLabelBadge for fulfillment; empty = content height.

### Shell contract
```
Topbar breadcrumb (quiet location)
→ Page H1 (sole title owner)
→ optional one-line description
→ page actions
```
Do not triple the same title across topbar / H1 / section.

### Sidebar
- Quiet default rows (no filled button chrome)
- Active = gold left inset + weight (not purple fill)
- Identity: Brand → Name → Role → Scope (compact)
- Collapse preserves icons + title tooltips + aria-label

### Topbar
- Left: Admin / Group / Page (page muted vs H1)
- Right: scope (or name·scope when collapsed) · **Sessiya** · Chiqish
- Sessiya refreshes `/admin/me` + branches — not page data

### Buttons
| Class | Role |
|-------|------|
| `.primary` / `.btn-primary` | One major action |
| `.ghost` / `.btn-secondary` | Supporting (bordered, neutral) |
| `.linkish` / `.btn-tertiary` | Quiet chrome / navigation |
| `.btn-danger` / `.danger-btn` | Destructive |

### Surfaces
`.surface-page` · `.surface-ops` · `.surface-table` · `.surface-drawer` · `.surface-dialog`

### Status presentation (UI only)
`fulfillmentLabel` / `paymentLabel` / `reservationLabel` / `entryTypeLabel` / `StatusLabelBadge`  
Raw enums unchanged on the wire; `title` keeps enum for support.

### Technical copy
`operatorCapabilityLabel` · `isTechnicalChromeToken` — primary chrome must not show API_REQUIRED / CONTRACT_PENDING / endpoint paths / DB names.

## Phase 12.8 — Information Architecture + operator copy

### Navigation hierarchy
```
Boshqaruv → Dashboard
Savdo → Kassa POS, Buyurtmalar, To‘lovlar
Ombor → Ombor, Katalog, Aksiyalar
Mijozlar → Mijozlar, Cashback / Loyalty, Baholar
Tarmoq → Filiallar, Yetkazib berish
Tahlil → Hisobotlar, Audit
Tizim → FOM, Sozlamalar
```
Routes / permissions / server RBAC unchanged. FOM is system/integration, not daily ops.

### Navigation weight
| Weight | Items |
|--------|-------|
| primary | Dashboard, Kassa POS, Buyurtmalar, Ombor |
| secondary | To‘lovlar, Katalog, Mijozlar, Filiallar, Yetkazib berish |
| low | Aksiyalar, Cashback / Loyalty, Baholar, Hisobotlar, Audit |
| system | FOM, Sozlamalar |

Active: thin gold inset + stronger weight + subtle bg — no filled purple nav pills.

### Density foundation (`data-density` / `PAGE_DENSITY`)
| Density | Pages |
|---------|-------|
| high | Orders, Inventory, Audit, POS, Payments |
| medium-high | Customers, Catalog, Branches, Delivery, Cashback |
| medium | Dashboard, Reports, Ratings, Promos |
| low | FOM, Settings |

Module layout density rollout belongs to later phases; shared shell only prepares the contract.

## Phase 12.9 — Dashboard operations center

### Page story (fixed)
```
Header (Sana / Filial / Yangilash)
→ Bugungi savdo (ONE snapshot, Savdo dominant + gold)
→ quiet network metadata (not a KPI strip)
→ E’tibor talab qiladi (real work queue OR compact calm empty)
→ Faoliyat (Buyurtmalar / Kassa)
```

### Forbidden on Dashboard
- Quick-action matrix / sidebar mirror
- Equal-weight KPI card walls
- Giant empty attention rectangles
- Fake metrics / charts / thresholds / failed-payment invents
- Raw enum / DB / API chrome in primary UI

### Attention signals (existing API only)
- Inventory Available ≤ 0 → “Mavjud emas” (branch required)
- `kpis.delivering` → Yetkazilmoqda
- `orders - completed` → Ochiq buyurtmalar

## Phase 12.10 — Dashboard pixel reconstruction

### Visual composition
```
Dashboard + controls (equal-height Sana / Filial / Yangilash)
→ business-snapshot: Savdo hero row (gold inset) + 3 pipeline metrics
→ context-rail: Mijozlar / Cashback / Filiallar / Bronlar (quiet)
→ attention work queue (mark + title + detail + one CTA)
→ activity (Buyurtmalar | Kassa)
```

### Pixel rules
- Savdo ~36px; secondary ~24px; no gradient fills
- Gold inset only on Savdo hero
- Dense attention rows; calm empty content-height
- Attention: 2px semantic left edge + small mark (not colored cards)
- Empty calm: ✓ + two lines, content-height
- Vocabulary: `.dashboard` `.business-snapshot` `.context-rail` `.attention` `.activity`
- Module redesigns (Orders/POS/…) → Phase 12.12+

## Phase 12.12 — Orders operations console

### Page story (fixed)
```
Buyurtmalar + short operator description
→ Control bar (search / holat / to‘lov / filial / bron / sana / Qidirish / Tozalash)
→ Result count (server total only)
→ Dense order work queue (table)
→ DetailDrawer (full order story + capability actions)
```

### Table hierarchy
1. Buyurtma (code + quiet fulfillment kind)
2. Mijoz
3. Filial
4. Holat (fulfillment badge)
5. To‘lov (payment badge — separate axis)
6. Summa (right-aligned money)
7. Vaqt

Tur / Bron belong in the drawer, not the list.

### Drawer story
Customer → Delivery/fulfillment → Payment → Items → Cashback (if present) → Reservation

Actions only when capabilities allow (`canTransitionFulfillment`, `canConfirmPos`, `canCancel`).
Dangerous cancel → ConfirmDialog. No invented refund / ETA / timeline UI.

### Forbidden on Orders
- Card-on-card walls / StatCard KPI strip for decoration
- Raw enum chrome as primary labels
- Fake metrics / sample orders
- Merging payment into fulfillment
- Gradients / glassmorphism / giant empty boxes

## Phase 12.12.1 — Orders visual refinement

### Control hierarchy
```
Primary row: Search (dominant) + Holat + To‘lov + Filial + Qidirish (+ quiet Tozalash)
Secondary: Sana [dan–gacha] · Qo‘shimcha filtrlar → Bron
```

### Empty state
Keep table header; compact centered content-height empty row.
Title: “Buyurtmalar topilmadi”
No-filter description: “Buyurtmalar hozircha mavjud emas.”
Filter miss: “Tanlangan mezonlar…” + Filtrlarni tozalash

### Drawer actions
Primary/danger first. Fulfillment transitions behind “Holatni o‘zgartirish” disclosure (ghost buttons).

## Phase 12.13 — Customers / Cashback / Ratings

### Shared CRM IA
```
Header → compact controls → result count → table surface (+ empty) → DetailDrawer
```

### Customers
Mijoz / Loyalty / Cashback / Xaridlar. Cashback balance from `cashbackBalance` (accounts SoT).
Drawer: identity · cashback · loyalty (separated) · cashback history with StatusLabelBadge.

### Cashback
Authority: dashboard `kpis.cashback` liability + per-customer history.
No global ledger invent. No sourceKey. Entry detail via drawer selection.

### Ratings
Branch filter only. Server `total` only (no client average KPI).
Drawer: rating · order/branch/service · comment. No employee invent beyond `employeeName`.

## Phase 12.14 — Payments operations console

### IA
```
Header → Holat / Usul / Filial (local refine of loaded list) → count → table → DetailDrawer
```

### Honesty
- No server search/q — do not invent “Buyurtma yoki mijoz” search.
- Refund: internal write + ConfirmDialog; provider money movement CONTRACT_PENDING.
- Payment status ≠ fulfillment; order payment axis shown separately in drawer.
- No merchant secrets / paymeKey / clickSecret in UI.

## Phase 12.15 — Inventory / Ombor stock console

### IA
```
Header → Filial + Mahsulot / Kategoriya / Mavjudlik → count → table → DetailDrawer
```

### Stock axes (Uzbek operator chrome)
- Table order: Mahsulot → **Mavjud** → Fizik → Band → Holat → Filial
- Fizik / Band / Mavjud — server `physical` / `reserved` / `available`
- Mavjud visually primary; Mavjud emas when available ≤ 0
- No invent low-stock threshold; no cross-branch client sum
- Narrow: Filial column hidden (context in filter note); table scrolls inside surface

### Actions
- Korreksiya: `POST /api/admin/inventory/adjust` (`physicalDelta` + reason) + ConfirmDialog
- Expire-due: `POST /api/admin/inventory/expire-due` when `inventory:adjust`
- Never edit `available` directly

## Phase 12.16 — Catalog / Mahsulotlar product console

### IA
```
Header → Qidiruv / Kategoriya / Holat → count → table → DetailDrawer (view/edit/create)
```

### Catalog ≠ Inventory
- Table: Mahsulot · **Narx** · Holat · Kategoriya · SKU
- No Fizik/Band/Mavjud primary columns
- Drawer: quiet Ombor note + optional link to Inventory
- Create POST + edit PATCH when `products:manage`; no delete API
- Narrow: SKU column hidden ≤480px; table scrolls in surface

## Phase 12.17 — Branches / Filiallar network console

### IA
```
Header → Qidiruv / Holat / Hudud → count → table → DetailDrawer (view/edit)
```

### Network ≠ Inventory / Orders / Payments
- Table: Filial · Holat · Manzil · Telefon · Ish vaqti
- No mini module tabs / softRequest side panels
- Edit: PATCH + ConfirmDialog; secrets write-only (`••••` never re-posted)
- No invent create/delete
- Quiet “Omborni ko‘rish →”

## Phase 12.18 — Delivery / Yetkazib berish operations console

### IA
```
Header → Filial / Holat → count → table → DetailDrawer (assign / status / external check)
```

### Honesty
- No invent ETA / map / tracking / fake courier
- `timeWindow` shown only when server provides it; else “Yetkazish vaqti hali aniqlanmagan.”
- External provider: operator label via `operatorCapabilityLabel` (not raw CONTRACT_PENDING chrome)
- Real actions only: assign, status transition, external sync probe

## Phase 12.19 — Promos / Aksiyalar marketing console

### IA
```
Header → Qidiruv / Holat → count → promo table → rewards table → DetailDrawer
```

### API capability matrix
| Capability | Support |
|------------|---------|
| List promos + rewards | `GET /admin/promos` |
| Create / edit / delete | **MISSING** |
| Discount / dates / branch scope | **MISSING** |
| Checkout pricing apply | **NO** — `PROMO_MARKETING_ONLY` |

### Honesty
- Faol/Nofaol from `active` only
- No invent % discount, KPI, validity period
- Rewards show points/code — not invent price
- Cashback clearly separated

## Phase 12.20 — Reports / Hisobotlar snapshot console

### IA
```
Header → Davr / Filial → order KPI table → global snapshot table → Hali ulanmagan list
```

### Source of truth
- Reuses `GET /admin/dashboard` (no dedicated reports endpoint)
- Order KPIs: date/branch scoped
- Customers / cashback / branches: global SoT (documented)
- No invent AOV, completion %, charts, CSV export

## Phase 12.21 — Audit investigation console

### IA
```
Header → Amal / Obyekt filters → count → event table → DetailDrawer
```

### API capability matrix
| Capability | Support |
|------------|---------|
| List | `GET /admin/audit` |
| Filters | `action` (ilike), `entity` (exact) |
| Pagination | `limit` / `offset` / `total` / `hasMore` |
| Fields | actor, action, entity, createdAt, metadata (sanitized) |
| Date / branch / actor / search / export / IP / UA | **MISSING** |
| Detail endpoint | **MISSING** — drawer uses list row |

### Honesty / privacy
- Known action labels only; unknown → `Amal: [technical]`
- No raw JSON dump in table; structured context + collapsed technical
- Client scrub mirrors server sensitive keys (token/otp/secret/…)
- No invent security KPI / charts / severity

## Phase 12.22 — Settings configuration console

### IA
```
Header → info banner → Cashback (read-only) → Boshqaruv → Boshqa joyda
```

### API capability matrix
| Setting | Read | Write | UI |
|---------|------|-------|-----|
| Cashback max spend % | `GET /cashback/rules` → `maxSpendPercent` | **MISSING** | Faqat ko‘rish |
| Admin users CRUD | **MISSING** | **MISSING** | Pointer → Adminlar |
| Feature flags / maintenance / secrets | **MISSING** | **MISSING** | Not rendered |
| Branch payment keys | Filiallar module | Filiallar | Pointer only |
| FOM status | FOM module | — | Pointer only |

### Honesty
- No `/admin/settings` aggregate
- No Save buttons
- No invent loyalty tiers as settings
- No secret exposure

## Phase 12.23 — Admin access / RBAC boundary

### IA
```
Header → unavailable management rows → Hozir ishlayotgan (enforcement) → Joriy sessiya
```

### Capability matrix
| Capability | API | UI |
|------------|-----|-----|
| Admin user list/CRUD | **MISSING** | Hali ulanmagan |
| Role assignment | **MISSING** | Hali ulanmagan |
| Permission matrix edit | **MISSING** | Hali ulanmagan |
| Branch assignment UI | **MISSING** | Hali ulanmagan |
| Current session role/perms | `GET /admin/me` | Faqat ko‘rish |
| RBAC enforcement | Server `requirePermission` | Documented as Majburiy |
| Branch scope | `assertBranchScope` | Documented as Majburiy |

### Honesty
- Distinguishes enforcement vs management
- No fake admin table / Create / Edit / Delete
- No password/token exposure
- Seed roles named only (`super_admin`, `cashier`)

## Phase 12.24 — FOM integration console

### IA
```
Header → Holat → Inventar chegarasi → Savdo/POS → Operator amallari → Texnik (collapsed)
```

### Capability matrix
| Capability | Support |
|------------|---------|
| Status | `GET /integrations/fom/status` |
| Sale webhook | `POST /integrations/fom/sale` (external; not Admin UI) |
| Inventory writer | **OFF** / `fomInventoryWriterEnabled: false` |
| FOM_POS | **CONTRACT_PENDING** |
| confirm-pos identity | **ORDER** / `order:{id}` |
| Admin probe / retry / sync | **MISSING** |
| Mapping / reconciliation KPIs | **MISSING** |

### Honesty
- No MetricStrip KPI wall
- No invent Connected / synced / receipt
- Secrets not shown (auth described as masked)

## Phase 12.25 — Cross-module UX consolidation

### Shared rules (final)
- **Headers:** `AdminPageHeader` + `PAGE_DESCRIPTIONS`; Yangilash tertiary when refresh is real
- **Filters:** `.crm-controls` / `FilterField`; only API-backed filters
- **Tables:** `.crm-surface` + `DataTable`; horizontal scroll inside surface on mobile
- **Drawers:** `DetailDrawer` — Escape closes; backdrop + Yopish; width md/lg
- **Dialogs:** `ConfirmDialog` — Escape cancels when not busy
- **Status language:** PENDING→Kutilmoqda · FAILED→Amal bajarilmadi · CANCELLED→Bekor qilingan · CONTRACT_PENDING / API_REQUIRED→Hali ulanmagan · NOT_SUPPORTED→Qo‘llab-quvvatlanmaydi
- **Empty ≠ error ≠ unauthorized**
- **No “Tez orada”** nav chrome
- **Money:** `money()` integer so‘m; **dates:** `fmtDate` (Asia/Tashkent presentation)

### Final nav IA
Boshqaruv · Savdo · Ombor · Mijozlar · Tarmoq · Tahlil · Tizim

### Preserved honesty
Reports / Audit / Settings / Adminlar / FOM limitations from 12.20–12.24 unchanged.

## Phase 12.25.1 — Sidebar icons (lucide)

Library: `lucide-react` only.

| Nav | Icon |
|-----|------|
| Dashboard | LayoutDashboard |
| Kassa POS | MonitorSmartphone |
| Buyurtmalar | ShoppingBag |
| To‘lovlar | CreditCard |
| Ombor | Warehouse |
| Katalog | PackageSearch |
| Aksiyalar | BadgePercent |
| Mijozlar | Users |
| Cashback / Loyalty | WalletCards |
| Baholar | Star |
| Filiallar | Store |
| Yetkazib berish | Truck |
| Hisobotlar | ChartNoAxesCombined |
| Audit | ClipboardCheck |
| FOM | Cable |
| Adminlar | ShieldUser |
| Sozlamalar | Settings2 |
| Chiqish | LogOut |

Geometry: 20px icon container · 16px SVG · 10px gap · stroke 1.75 · muted inactive · gold active.
