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
| P0-1 Managed PG PITR + restore | **OPS_REQUIRED** (12.37 re-verified) |
| P0-2 Merchant secret encryption | App boundary **READY_IN_REPO**; managed KMS **OPS_REQUIRED** (12.42) |
| P0-3 Payme/Click sandbox E2E | **OPS_REQUIRED** (12.40 Payme + 12.41 Click PENDING/NOT_RUN) |
| P0-4 Redis live verify | **OPS_REQUIRED** (12.38 re-verified: provider MISSING; live NOT_PROVEN) |
| HMAC legacy retirement | **OPS_REQUIRED** (12.39: telemetry/quiet/population NOT_PROVEN) |
| Production enablement | **CLOSED** |
| FOM writer / FOM POS | OFF / **CONTRACT_PENDING** |

---

## Phase 13.0 refinement — Dashboard (Network Operations Center)

Faqat vizual kompozitsiya o‘zgardi; API, filtrlar, KPI hisoblari va endpointlar (`/api/admin/dashboard`, `/api/pos/sales`, `/api/admin/audit`) o‘zgarmagan.

- **Ko‘z oqimi:** biznes → buyurtmalar → tarmoq → operatsiyalar. Manba tartibi vizual tartibga teng.
- **KPI band (`.dash-metrics`):** bitta surface, 4 katak: asosiy **Savdo** (kengroq, neytral fon, `fs-display`) + Buyurtmalar / Cashback / Filiallar. Taqqoslash faqat `showDelta` bo‘lsa ko‘rsatiladi, aks holda neytral “—” va izoh. Mijozlar soni Cashback detaliga, faol bronlar Buyurtmalar detaliga ko‘chdi (alohida Mijozlar/Bronlar KPI olib tashlandi).
- **Savdo dinamikasi (`.dash-sales`):** O‘rtacha chek · 7 kunlik jami · Eng yuqori kun, so‘ng real 7 kunlik grafik — ma’lumot bo‘lsa gridline, o‘q, shkala va tooltip; bo‘lmasa bir xil ramka ichida “Ma’lumot yetarli emas”. Xato holatida bar chizilmaydi.
- **Operatsion holat (`.dash-orders`):** buyurtma holatlari (Yakunlangan / Yetkazilmoqda / Rezerv) kichik indikator qatorlari bilan + ichida ixcham “Holat” bloki; tinch holatda bitta qator, sarlavha takrorlanmaydi.
- **Tarmoq:** xarita saqlangan; rail — Filial / Ochiq / 24/7 / Hudud real sonlari, hududlar bo‘yicha taqsimot chizig‘i (`network.regions`) va top hududlar.
- **Signallar (`.dash-signals`):** so‘nggi faollik + real buyurtma/kassa qatorlari (faqat mavjud bo‘lsa).
- **Ranglar:** binafsha faqat brend/aktiv holat va tarmoq vizualizatsiyasida; sariq faqat tanlov; surface’lar oq + hairline, og‘ir soya yo‘q. Header’dagi “Muammo yo‘q” ikkinchi darajali nuqta.
- **Responsive:** 1280 da 4 katakli band siqiladi, ≤1100 da asosiy katak to‘liq qator + 3 katak, ≤560 da bitta ustun; dashboard breakpointlari `Dashboard — Phase 13.0 reset` blokida jamlangan.

---

## Phase 13.10 — Filiallar

13.10: UI reconstruction over the existing GET/PATCH contracts (backend untouched). 13.10.1 (user request): full branch CRUD — new `POST` / `DELETE` routes, validated and extended `PATCH`. DB sxemasi va migratsiyalar o‘zgartirilmadi; RBAC kodlari o‘zgarmadi (`branches:read`, `branches:manage`).

| Area | Status | Source |
| --- | --- | --- |
| Branch list | REAL | `GET /admin/branches` (`branches:read`, HQ only) — full list in one response, no pagination / search / filter params |
| Fields shown | REAL | `id`, `code`, `name`, `region`, `city`, `district`, `address`, `phone`, `hours`, `lat`, `lng`, `isOpen`, `is24h`, `createdAt`, `hasPayme`, `hasClick` |
| Create | REAL (13.10.1) | `POST /admin/branches` — `branches:manage` + HQ role; validated (`lib/adminBranches.ts`); unique code → 409 `BRANCH_CODE_TAKEN`; secrets encrypted; one transaction inserts the branch and a 0-quantity `product_stocks` row per product (same invariant as `POST /admin/products`); audit `branch.create` |
| Edit | REAL | `PATCH /admin/branches/:id` (`branches:manage` + `assertBranchScope`) — code, name, region, city, district, address, phone, hours, lat/lng, isOpen, is24h, merchant IDs, write-only secrets; invalid input → 400 `BRANCH_INVALID`; audit `branch.update` with changed field names + credential booleans |
| Delete | REAL (13.10.1, safe) | `DELETE /admin/branches/:id` — `branches:manage` + HQ role; 409 `BRANCH_IN_USE` while any order, POS sale, payment, payment intent, reservation, inventory movement, stocked product, staff account, rating, courier delivery or FOM receipt references the branch; otherwise one transaction removes zero stock rows, clears cart branch selections and deletes the branch; audit `branch.delete` |
| Secrets | MASKED | `toAdminBranchPaymentDto` returns `••••`; UI never seeds or re-sends the mask; audit log never stores secret values |
| KPI | REAL (client count) | total / open / closed / 24/7 / regions counted from the full loaded list (valid because the API has no pagination) |
| Search / filters | REAL (client-side, disclosed) | search on Enter over name, code, region, city, district, address, phone; status, region, 24/7 filters |
| Map | LINK ONLY | coordinates open an external map (no new dependency) |
| Branch-scoped list | CONTRACT_PENDING | GET is not branch-scoped for any holder of `branches:read` (today HQ only) |
| Concurrency | CONTRACT_PENDING | no version / ETag — last write wins (UI sends changed fields only) |

UI: header mode line ("Qo‘shish, tahrirlash va o‘chirish mumkin" / "Faqat o‘z filialingizni tahrirlash mumkin" / "Faqat ko‘rish — tahrirlash uchun ruxsat yo‘q"), Yangilash and (HQ) "Yangi filial"; 5 KPI cells; table Filial → Holat → Manzil → Ish vaqti → Aloqa → row actions (edit; delete for HQ); drawer view sections + footer Tahrirlash / O‘chirish; one form for create and edit (Asosiy ma’lumotlar, Manzil with coordinates, Ish rejimi va holat, To‘lov kabineti) with client validation mirroring the server. Every write goes form → ConfirmDialog (closing and deleting are danger) → API → notice → reload → shell branch list refreshed (`onBranchesChanged`). A refused delete shows the server's reference summary in the drawer with a "Filialni yopish" path. Responsive: hours column hidden ≤1100px, phone ≤900px, cards ≤560px (actions in the card), drawer fits 390px.

Security: unauthenticated 401, cashier 403 and no nav item (no `branches:*` in fallback or seeded grants); non-HQ create/delete denied and audited (`hq_required`). Only server texts carrying `BRANCH_INVALID` / `BRANCH_CODE_TAKEN` / `BRANCH_IN_USE` are shown; other failures use fixed copy. Performance: one list request; drawer opens from the list row; stale responses dropped via a request sequence guard.

Gaps: public `/branches` spreads merchant IDs; `city` duplicates `region` in current seed data; `hours` is free text next to `is24h`; no soft-delete/archive (would need a schema change) — branches with history can only be closed.

Tests: `artifacts/api-server/tests/admin-phase13-10-branches.test.ts`.

---

## Phase 13.9 — Baholar

Read-only UI reconstruction over the single existing admin contract. No backend, schema, RBAC or rating logic change.

| Area | Status | Source |
| --- | --- | --- |
| Ratings list | REAL | `GET /admin/ratings` (`ratings:read`, HQ only) — `limit` (default 50, max 100), `offset`, `total`, `hasMore`, fixed `createdAt desc` |
| Branch filter | REAL (server) | `branchId` via `resolveStaffBranchFilter`; non-HQ forced to own branch |
| Fields shown | REAL | `id`, `branchId` (name from loaded branch list), `orderId`, `employeeName`, `rating`, `comment`, `createdAt` |
| Scale | REAL | integer 1–5 enforced by `POST /ratings` (customer); no DB CHECK — out-of-range legacy values render raw |
| Search / score / date filters, sorting | NOT IMPLEMENTED | no API parameters |
| KPI (average, distribution) | NOT IMPLEMENTED | no aggregate API; only server `total` is shown |
| Customer / product relation | NOT EXPOSED | `customerId` omitted from DTO (least privilege); no product relation in model |
| Order code | CONTRACT_PENDING | DTO returns `orderId` only; UI shows `#id` |
| Tags | CONTRACT_PENDING | stored in `staff_ratings.tags`, not returned by admin API |
| Moderation / reply / delete / edit | NOT IMPLEMENTED | no endpoint, no status column; page has no mutation controls |

UI: header with "Faqat ko‘rish — baholarni o‘zgartirish API mavjud emas", server branch filter (HQ), table Baho → Buyurtma → Filial → Izoh → Sana, stars + number with tones (4–5 positive, 3 neutral, 2 warning, 1 negative), "Izohsiz" for empty comments, drawer Baho → Buyurtma → Filial → Izoh → collapsed technical section. Dates in Asia/Tashkent. Order column hidden ≤900px; cards ≤560px.

Security: unauthenticated 401, cashier 403 (no `ratings:read` in fallback or seeded grants), branch widening refused server-side. No detail route → no ID-based access surface. Performance: one list request with a count query; branch names resolved from the already-loaded branch list; drawer opens from the list row (no extra request).

Gaps: no rating aggregates, no search, no order code / tags in DTO, no DB range constraint on `rating`, legacy rows may have `order_id` null or a person name in `employee_name`, dev DB has 0 ratings.

Tests: `artifacts/api-server/tests/admin-phase13-9-ratings.test.ts`.

---

## Phase 13.8 — Cashback / Loyalty financial console

Read-only UI composition over existing contracts. No backend, schema, RBAC or cashback engine change.

| Area | Status | Source |
| --- | --- | --- |
| Liability KPI | REAL | `GET /admin/dashboard` → `kpis.cashback` = `sum(cashback_accounts.balance)` (requires `dashboard:read`) |
| Rules (max spend %, min purchase, tiers) | REAL | `GET /cashback/rules` (`getMaxSpendRatio` from settings) |
| Account list | REAL | `GET /admin/customers` (server `q`, limit/offset, SoT balance) |
| Account ledger | REAL | `GET /admin/customers/:id/cashback-history` (append-only `cashback_ledger`, "Yana ko‘rsatish") |
| Entry drawer | REAL | ledger row → commercial transaction → order / POS receipt / branch; REVERSAL section; technical collapsed |
| Cashback adjust / reverse / expire actions | NOT IMPLEMENTED | no admin write API; page performs no mutation |
| Original entry link for REVERSAL | CONTRACT_PENDING | history DTO does not expose `reverses_entry_id` |
| Ledger total count | CONTRACT_PENDING | history API returns no total |
| TTL (`ttlDays`) | NOT IMPLEMENTED | published in rules, not enforced by engine |
| Integrity check | CONTRACT_PENDING | `cashbackIntegrity` has no admin route |

UI details: entry tones EARN ok, USE info, REVERSAL warn, ADJUSTMENT neutral; dates in Asia/Tashkent; `sourceKey` / idempotency keys never rendered.

Data quality (reported, not fixed): legacy `customers.purchases_count` / `total_purchases` diverge from the ledger for seeded customers; default tier differs between schema ("Gold") and DTO/auth ("Silver"); unknown tiers fall back to 5%; tier auto-updates only on POS sales.

Tests: `artifacts/api-server/tests/admin-phase13-8-cashback.test.ts`.

---

## Phase 13.7 — Mijozlar customers console

| Item | Status |
|------|--------|
| API audit | `GET /api/admin/customers` (server `q` over first / last name, phone and telegram id; `limit` default 25, max 50; `offset`; server `total` / `hasMore`; newest id first), `GET /api/admin/customers/:id`, `GET /api/admin/customers/:id/cashback-history` (`limit` ≤100 / `offset`, no total). All require `customers:read` (super_admin only). No write, block, delete, export, sort or filter endpoints; no `customers:manage` |
| Identity / PII | DTO `toAdminCustomerListItem`: id, first / last name, `phoneMasked` (`+998 90 *** ** 67`), tier, purchasesCount, cashbackBalance. Full phone, telegram id, password hash and redeemed rewards are never returned; the UI states the full number is not available |
| Cashback | Balance from `cashback_accounts` (SoT), history from the `cashback_ledger` ⨝ `commercial_transactions` projection with server source labels (ORDER / POS / SYSTEM / FOM_POS). `savedAmount` shown as a profile counter, not a financial source. No correction API → read-only |
| Loyalty | Real `tier` text (Silver / Gold / Platinum in the engine) + purchases count / sum; rate is not returned by the admin API and is not recomputed in the UI |
| Orders / POS / branch | No customer-scoped order or POS list in the admin API; order codes, receipts and branch names appear only on ledger rows. No home branch |
| List | Server search (Enter / Qidirish), server pages via `PaginationBar`, `Jami N ta mijoz` from the server total; no KPI cards, filters or sorting |
| Drawer | Loaded on open only (detail + one history page, "Yana ko‘rsatish" for the next page): Mijoz → Loyalty → Cashback → Cashback tarixi → collapsed tech |
| Backend / API / data | **Unchanged** |

---

## Phase 13.6 — Aksiyalar promotions console

| Item | Status |
|------|--------|
| API audit | Only `GET /api/admin/promos` (`promos:read`, super_admin) returning the full `promos` and `rewards` tables (no search / filter / pagination / limit). Public `GET /api/catalog/promos` serves active promos to the mobile app. No create / update / delete / toggle endpoints; no `promos:manage` permission |
| Promo model | Marketing banner: `title`, `subtitle`, `tag` (free text), `icon`, `background`, `active`. No period, discount type / value, scope (branch / product / category / segment), usage limit, redemption counter or analytics |
| Integration | Orders, POS, FOM, payments and cashback code never read `promos`; checkout ignores client `discount` (`PROMO_MARKETING_ONLY`) |
| Rewards | Separate tab "Cashback sovg‘alari": loyalty catalog redeemed once per customer via `/api/loyalty/redeem` → `useCashback` (cashback balance debit). Shown as a loyalty item, never as a promotion; redemption counts not exposed to admin |
| Status | Real `active` boolean only: Faol (shown in the app) / Nofaol (hidden). `tag` is displayed as free text and never parsed as a period |
| Honesty | Free text that reads like a %, discount, cashback or bonus promise is flagged ("Matnda va’da — tizim qo‘llamaydi") because no engine fulfils it |
| Controls | Search (Enter / Qidirish) + Holat filter over the complete list, stated in the UI; counts (jami / faol / nofaol) come from the complete response |
| Drawer | Promo: Aksiya → Holat → Ta’sir (price / POS / cashback: none; period / scope / limit: not in system) → collapsed tech. Reward: Sovg‘a → Almashtirish → collapsed tech |
| Backend / API / data | **Unchanged** |

---

## Phase 13.5 — Katalog product catalog console

| Item | Status |
|------|--------|
| API audit | Read: `GET /api/catalog/products` (public; server-side `q` over nameUz / nameRu / manufacturer / sku, exact `category`, `sort` default / name / price_asc / price_desc, `limit` ≤ 50, `offset`, `total`, `hasMore`; optional `branchId` adds `availableQuantity`), `GET /api/catalog/categories` (distinct product categories). Admin: `GET /api/admin/products` (`products:read`, unbounded, no search — no longer used by Katalog), `POST /api/admin/products` and `PATCH /api/admin/products/:id` (`products:manage`, audited) |
| Not available in API | Product status / activation, delete / archive, category management, images / media, barcode, import / export, admin-scoped paginated list, server validation of create / edit input |
| Controls | Search first (server-side, Enter / Qidirish, ≤80 chars, clearing reloads) · Kategoriya (from categories endpoint) · Saralash (server sort). The former client-only prescription filter was removed — the API cannot filter by it |
| Table | Mahsulot (initial mark + name, SKU · manufacturer) → Kategoriya → Narx (integer `money()` + unit) → Retsept badge; branch staff also see a read-only "Filialda" available column for their own branch. 50 per page with server total; ≤900px category column hidden; ≤560px rows become cards |
| Drawer | Mahsulot → Narx va tasnif → Ombor (relation only, link to Ombor) → collapsed Texnik ma’lumotlar (ID, created, app icon code) |
| Create / edit | Only with `products:manage`; fields limited to what POST / PATCH accept; integer price validation; `ConfirmDialog` before write; edit sends only changed fields (fixes description being blanked by the old form, whose list DTO had no description). Create copy states the real backend side effect: every branch gets a starting physical quantity of 10 without an inventory movement |
| Backend / API / data | **Unchanged** — no new endpoints, schema or inventory writers |

---

## Phase 13.4 — Ombor operations console

| Item | Status |
|------|--------|
| API audit | Same contract: `GET /api/admin/products?branchId=` (`products:read`; HQ passes a branch, branch staff are forced to their own branch by `resolveStaffBranchFilter`; returns every product with `stock {physical, reserved, available}` from `product_stocks`, no pagination / search / thresholds / timestamps); `POST /api/admin/inventory/adjust {branchId, productId, physicalDelta, reason, idempotencyKey?}` (`inventory:adjust` + `assertBranchScope`, physical only, never below 0 or below reserved, audited); `POST /api/admin/inventory/expire-due` (`inventory:adjust`, **network-wide** sweep of due ACTIVE reservations, ≤100 per call) |
| Not available in API | Network aggregate stock, multi-branch list, stock movements history, reservation list, low-stock policy, transfers, batches / expiry, FOM stock sync |
| Scope | Branch selector is the first control (HQ only); branch staff see their server-resolved branch read-only; stale branch responses are dropped |
| Summary | Mahsulot · Mavjud · Mavjud emas (incl. "to‘liq rezervda") · Rezervda (SKU + units) · Nomuvofiq (only if >0) — computed from the **complete** list of the selected branch; labelled with the branch name, never as network totals |
| Table | Mahsulot (name + SKU · category, one line) → Fizik → Rezerv → **Mavjud** (server value) → Holat; right-aligned integers, 44px rows, client pages of 50; ≤560px rows become cards (product + available + status first) |
| Status | Presentation-only from server axes: Mavjud (ok) · Mavjud emas (warn) · To‘liq rezervda (info) · Nomuvofiq (danger: available < 0 or reserved > physical, shown uncorrected). No threshold invented |
| Drawer | Qoldiq (Fizik / Rezerv / Mavjud) → Mahsulot → Filial → Rezerv (reservations are the authority; no reservation list API) → Korreksiya (`inventory:adjust` only) → collapsed Texnik ma’lumotlar |
| Adjustment | Integer ± delta + required reason; client guards mirror server rules; `ConfirmDialog` shows branch, product, delta, physical/available before → after; stable `idempotencyKey` per confirmed input; 403 / 404 / 409 / network errors in Uzbek; list revalidated after success or 409 |
| FOM | Read from `GET /api/integrations/fom/status`: subtle info "FOM inventar yozuvchisi faol emas"; no sync / import / push actions |
| Labels | Shared `stockAxisLabel` / `stockAxisShort`: reserved axis renamed **Band → Rezerv** |
| Visual refinement | Two-tier controls (Filial scope row first, highlighted while HQ has no branch; Mahsulot / Kategoriya / Mavjudlik below, disabled until stock loads); no-branch state = neutral "—" summary placeholders ("Filial tanlanmagan", hidden ≤560px) + compact "Avval filialni tanlang" guide whose "Filialni tanlash" button only focuses the existing selector; distinct states: no branch · empty branch · no filter match · load error · skeleton |
| Backend / API / data | **Unchanged** — no new endpoints, writers or schema |

---

## Phase 13.3 — To‘lovlar operations console

| Item | Status |
|------|--------|
| API audit | Same contract: `GET /api/admin/payments` (latest ≤200 legacy rows, branch-scoped, **no filters / pagination / dates**), `GET /api/admin/payments/intents/:id` (intent, attempts, capture, refunds, `refundableAmount`, `orderPaymentStatus`), `POST /api/admin/payments/intents/:id/refund {reason, amount?}` (`payments:manage`) |
| Status strip | Jami yozuv · To‘langan (count + sum) · Kutilmoqda (count + sum) · Qaytarilgan (count, "shundan N qisman") · Boshqa (only if >0). Counted from the loaded rows **only when the response is below the 200-row cap** (complete set in the operator's scope); capped responses show "jami hisoblanmaydi". Sums only when all rows share one currency; refunded amounts are not in the list DTO, so that group is a count |
| Table | Buyurtma #orderId (primary) · To‘lov #id (+ "tarixsiz yozuv") → Summa (right-aligned, strong) → Holat → Usul (Payme / Click marked as online PSP) → Filial; ≤1100px the branch moves under the identity, ≤560px rows stack as compact cards (no horizontal table scroll); row click / Enter / Space opens the drawer; client-side pages of 25 |
| Filters | Holat / Usul / Filial (only when >1 branch loaded) — options come from loaded rows, applied client-side with an explicit note; no search / date filter (API has none) |
| Status tones | Shared `paymentTone`: PAID ok, PENDING family (incl. legacy `awaiting_pos`, `pending_keys`) warn, FAILED danger, REFUNDED **neutral** (was amber), PARTIALLY_REFUNDED **info** |
| Drawer | Buyurtma → To‘lov → Urinishlar (compact list) → Qabul qilish → Qaytarish (refundable, refunded total, refund rows) → collapsed Texnik ma’lumotlar (intent / capture / refund ids, merchant, external ref) |
| Refund | Danger button only when `payments:manage` + `refundableAmount > 0` + intent PAID / PARTIALLY_REFUNDED; `ConfirmDialog` with integer amount ≤ refundable (full = `{reason}`, partial adds `amount`); idempotent replay reported as such |
| Provider refund | Not connected for Payme / Click — operator copy "Provayder orqali qaytarish hozircha ulanmagan", internal record only; cashback not auto-reversed |
| States | Table skeleton, distinct empty / filtered-empty copy, Uzbek list / detail / refund errors (no raw server messages) |
| Backend / API / data | **Unchanged** — no new endpoints, no fake data |

---

## Phase 13.2 — Buyurtmalar operations console

| Item | Status |
|------|--------|
| API audit | Same contract: `GET /api/admin/orders?limit&offset&q&fulfillmentStatus&paymentStatus&reservationStatus&branchId&createdFrom&createdTo`, `GET /api/admin/orders/:id` (+ `capabilities`), `POST /api/orders/:id/confirm|prepare|ready|out-for-delivery|complete`, `POST /api/orders/:id/confirm-pos {receiptId}`, `POST /api/orders/:id/admin-cancel` |
| Table | Buyurtma (code · item count · branch for HQ) · Mijoz · Buyurtma holati · To‘lov · Yetkazish · Summa · Vaqt — row click / Enter / Space opens the drawer |
| Filters | Search (code, name, phone) + fulfillment / payment / reservation / branch (HQ only) / date range — all server-side, selects apply on change |
| Status axes | Fulfillment, payment and reservation are three separate badges; payment REFUNDED is neutral (not the PENDING amber), reservation CANCELLED neutral |
| Drawer | Mijoz (phone masked by default) → Buyurtma (items + totals) → To‘lov → Bron → Yetkazish (real `deliveries` row only) → collapsed Texnik ma’lumotlar |
| Actions | Next steps mirror `FULFILLMENT_GRAPH` + channel rules (parity test); gated by `canTransitionFulfillment` / `canConfirmPos` / `canCancel`; Yakunlash, FOM tasdiq and Bekor qilish go through `ConfirmDialog` |
| States | Table skeleton while loading, distinct empty / filtered-empty copy, Uzbek operator errors (no raw server enums), feedback inside the drawer |
| Not exposed | `POST /orders/:id/refund-cashback` (policy OPEN) — no refund button |
| Backend / API / data | **Unchanged** — no new endpoints, no fake data |

---

## Phase 13.1 — Kassa POS transaction workspace

| Item | Status |
|------|--------|
| API audit | Same contract: `POST /api/pos/lookup {qr}`, `POST /api/pos/preview {qr, amount, cashbackToUse}`, `POST /api/pos/sale {qr, amount, cashbackToUse, branchId}`, `POST /api/pos/void {receiptId}`, `GET /api/pos/sales?branchId&limit=25` |
| Capability scope | Amount-based loyalty POS — **no product search, cart or payment-method API**, so none shown |
| Layout | Numbered flow (Mijoz → Xarid summasi → Cashback) + sticky current check (total + single primary CTA) + sales history; container-query composition |
| Cashback | Available balance · server limit (`preview.maxSpend`, `maxSpendRatio`) · use (slider, 0 / Maks) — values from server only |
| Receipt / void | Success receipt in the check panel; void via shared `ConfirmDialog` (server keeps the 15-minute rule) |
| Errors | Domain Uzbek messages from the server; network / 5xx / technical text mapped to operator copy |
| Keyboard | Scan autofocus, F2 → scan, lookup → amount, Enter in amount → pay button, Escape clears scan field |
| POS hardcoded colors | **0** — legacy `.pos-*` colors re-expressed on design tokens |
| Backend / API / data | **Unchanged** — no new endpoints, no fake data |

---

## Phase 13.0 reset — Enterprise Operations Console (design system + shell + Dashboard)

| Item | Status |
|------|--------|
| Design tokens (brand, accent, surfaces 0–3, radius, elevation, type, motion) | **DONE** — `styles.css` foundation, no gradients/textures |
| Shell: sidebar (brand + operator head, quiet groups, accent active line, separate logout), topbar (breadcrumb + date) | **DONE** |
| Primitives: buttons (primary/secondary/tertiary/danger), inputs, badges, table, drawer, states | **DONE** — shared CSS, module code unchanged |
| Dashboard: overview (sales on brand surface + 7-day bars, orders stacked status) → key metrics strip → operational signals → order lists → network | **DONE** — same endpoints, no new data |
| Login default credentials | **REMOVED** (UI state only; auth unchanged) |
| Remaining modules on the new system | **OPEN** — awaiting visual approval |

### Phase 13.0 final gate

| Item | Status |
|------|--------|
| 7-day chart | **REAL API** — 7 × `GET /api/admin/dashboard?createdFrom=d&createdTo=d`, `kpis.revenue` + `kpis.orders`; on failure no bars are drawn (no zero fallback) |
| Branch network map | **REAL API** — `GET /api/admin/branches` rows (region/city, lat/lng, `isOpen`, `is24h`); region outlines are static OSM geography; `isOpen` is the configured branch flag, not live opening hours |
| Breadcrumb | **FIXED** — group segment dropped when it equals the page title (Ombor, Mijozlar) |
| Drawer / dialog focus | **FIXED** in `ui.tsx` (`useModalFocus`): focus in, Tab trap, Escape, focus restore, stacked modals, `aria-modal` + `aria-labelledby` |
| Hardcoded colors in global primitives | **0** — moved to tokens; 9 remain in the legacy POS slice (module scope, untouched) |

---

## Phase 12.49 — Provider decision

| Item | Status |
|------|--------|
| Decision | `docs/PHASE_12_49_PROVIDER_DECISION.md` |
| Staging provider | **DigitalOcean** (not provisioned) |
| Production gates closed? | **No** |
| Admin UI change | None |

---

## Phase 12.48 — Provider research

| Item | Status |
|------|--------|
| Research | `docs/PHASE_12_48_PROVIDER_RESEARCH.md` |
| Provider / provisioning | **None** — **TO_BE_AGREED** |
| Production gates closed? | **No** |
| Admin UI change | None |

---

## Phase 12.47 — Staging infrastructure blueprint

| Item | Status |
|------|--------|
| Blueprint | `docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md` |
| Provider / provisioning | **None** — **TO_BE_AGREED** |
| Production gates closed? | **No** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.47.

---

## Phase 12.46 — Staging infrastructure bootstrap

| Item | Status |
|------|--------|
| Staging evidence checklists | Documented in gap matrix |
| Production gates closed? | **No** — still **OPS_REQUIRED** / **CONTRACT_PENDING** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.46.

---

## Phase 12.45 — Final full-system gap re-audit

| Item | Status |
|------|--------|
| Admin honesty console (12.6A–12.25) | **READY_IN_REPO** / **TEST_VERIFIED** |
| Admin users CRUD API | **MISSING** (honest UI) |
| Deep reports / export | **Hali ulanmagan** (honest) |
| FOM / external delivery / PSP refund | **CONTRACT_PENDING** / OFF |
| Production | **NOT READY — OPERATIONAL EVIDENCE MISSING** |
| Admin UI redesign this phase | **None** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.45.

---

## Phase 12.44 — Worker live crash / recovery operational gate

| Item | Status |
|------|--------|
| Reclaim implementation | **READY_IN_REPO** / **TEST_VERIFIED** |
| Staging worker / PostgreSQL | **MISSING** / **NOT_PROVEN** |
| Live crash drill | **NOT_PROVEN** |
| Gate | **OPS_REQUIRED** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.44.

---

## Phase 12.43 — External delivery production contract gate

| Item | Status |
|------|--------|
| Internal delivery Admin UI | **READY_IN_REPO** |
| External provider | **MISSING** → **CONTRACT_PENDING** |
| Tracking / ETA | **CONTRACT_PENDING** (honest Hali ulanmagan) |
| Live provider E2E | **NOT_PROVEN** |
| Gate | **CONTRACT_PENDING** / **OPS_REQUIRED** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.43.

---

## Phase 12.42 — Merchant secret KMS operational gate

| Item | Status |
|------|--------|
| App enc:v1 AES-GCM boundary | **READY_IN_REPO** / **TEST_VERIFIED** |
| Managed KMS | **MISSING** → **OPS_REQUIRED** |
| MERCHANT_SECRET_KEK (workspace) | **MISSING** |
| Branches UI secret exposure | Write-only / masked — no plaintext seed from API |
| Production PSP | **OFF** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.42.

---

## Phase 12.41 — Click sandbox E2E operational gate

| Item | Status |
|------|--------|
| Adapter / Shop API (in-repo) | **READY_IN_REPO** / **VERIFIED_IN_REPO** |
| Sandbox credentials / live E2E | **MISSING** / **NOT_RUN** |
| Outbound refund | **CONTRACT_PENDING** |
| Production Click | **OFF** |
| Gate | **OPS_REQUIRED** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.41.

---

## Phase 12.40 — Payme sandbox E2E operational gate

| Item | Status |
|------|--------|
| Adapter / Merchant RPC (in-repo) | **READY_IN_REPO** / **VERIFIED_IN_REPO** |
| Sandbox credentials / live E2E | **MISSING** / **NOT_RUN** |
| Outbound refund | **CONTRACT_PENDING** |
| Production Payme | **OFF** |
| Gate | **OPS_REQUIRED** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.40.

---

## Phase 12.39 — HMAC legacy retirement operational gate

| Item | Status |
|------|--------|
| Admin s1 issuance / opaque Bearer | **DONE** / **READY_IN_REPO** |
| Admin HMAC construction | **Absent** |
| Legacy dual-accept | Still **ON** (default) |
| Telemetry / quiet / population | **NOT_PROVEN** |
| Gate | **OPS_REQUIRED** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.39.

---

## Phase 12.38 — Production Redis staging gate

| Item | Status |
|------|--------|
| Managed provider / REDIS_URL | **MISSING** |
| TLS / AUTH / live PING / failover | **NOT_PROVEN** |
| Gate | **OPS_REQUIRED** |
| Provider invented? | **No** |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.38.

---

## Phase 12.37 — Managed PostgreSQL staging gate

| Item | Status |
|------|--------|
| Managed provider / staging DATABASE_URL | **MISSING** |
| PITR / restore / RPO / RTO | **NOT_PROVEN** / **NOT_ESTABLISHED** |
| Gate | **OPS_REQUIRED** |
| Provider invented? | **No** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.37.

---

## Phase 12.36 — Worker crash recovery

| Item | Status |
|------|--------|
| Stale RUNNING reclaim | **READY_IN_REPO** / **TEST_VERIFIED** |
| Production worker kill drill | **OPS_REQUIRED** (12.44 re-verified) |
| Admin UI change | None |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.36.

---

## Phase 12.35 — Failure recovery & resilience

| Item | Status |
|------|--------|
| In-repo fail-closed / idempotency | **READY_IN_REPO** / **TEST_VERIFIED** |
| Real staging/production outage drills | **OPS_REQUIRED** / **NOT_PROVEN** |
| RPO / RTO | **NOT_ESTABLISHED** |
| Production enablement | **CLOSED** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.35.

---

## Phase 12.34 — Mobile s1.* migration readiness

| Item | Status |
|------|--------|
| Admin auth | Unaffected (`s1.*` issuance DONE; dual-accept still ON) |
| Mobile s1-only production proof | **NOT_PROVEN** |
| Legacy HMAC disabled this phase? | **No** |
| Retirement gate | **OPS_REQUIRED** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.34.

---

## Phase 12.33 — HMAC legacy auth gate

| Item | Status |
|------|--------|
| Admin login → `s1.*` | **DONE** |
| Legacy admin HMAC dual-accept | Still **ON** by default |
| Legacy HMAC CLOSED | **No** — **OPS_REQUIRED** / **NOT_PROVEN** |
| Blind removal performed? | **No** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.33.

---

## Phase 12.32 — Click sandbox E2E gate

| Item | Status |
|------|--------|
| Shop API + adapter (Prepare/Complete) | **READY_IN_REPO** |
| Sandbox credentials | **MISSING** |
| Live sandbox E2E | **NOT RUN** → **OPS_REQUIRED** / PENDING |
| Outbound Click refund / SHA1 Merchant API | **CONTRACT_PENDING** |
| Production Click | **OFF** |
| Credentials invented? | **No** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.32.

---

## Phase 12.31 — Payme sandbox E2E gate

| Item | Status |
|------|--------|
| Merchant API + adapter (core settle) | **READY_IN_REPO** |
| Sandbox credentials | **MISSING** |
| Live sandbox E2E | **NOT RUN** → **OPS_REQUIRED** / PENDING |
| Outbound Payme refund | **CONTRACT_PENDING** |
| Production Payme | **OFF** |
| Credentials invented? | **No** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.31.

---

## Phase 12.30 — Redis production gate

| Item | Status |
|------|--------|
| In-repo client + fail-closed + rate-limit | **READY_IN_REPO** |
| FakeRedis multi-instance / atomic tests | **TEST VERIFIED** |
| `REDIS_URL` / live PING / TLS | **MISSING** / **NOT_PROVEN** |
| Production Redis gate | **OPS_REQUIRED** |
| Provider invented? | **No** |

See `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.30.

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
| External delivery | **CONTRACT_PENDING** (12.43 re-verified) |
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
