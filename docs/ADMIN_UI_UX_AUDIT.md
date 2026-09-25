# Admin Panel — UI/UX Audit (Phase 10)

> Date: 2026-09-25  
> Scope: Entire Admin frontend (`artifacts/admin-web`) after Phase 9  
> Rule: Presentation only — no financial / inventory / payment / FOM engine changes

## Cross-cutting findings (top 10)

1. **Inconsistent page chrome** — Most pages use `PageHeader` + `card` + `toolbar`, but density, margins, and subtitle quality vary.
2. **Duplicate titles** — Shell `topbar` and page `PageHeader` both show the page title (wastes vertical space).
3. **Weak filter toolbar** — Native full-width `<select>` / `<input>` in a loose flex row; no shared FilterBar pattern.
4. **KPI cards** — Plain cards + `<h2>` numbers; no shared StatCard, unit, or context hierarchy.
5. **Loading / empty / error** — Mix of `StateBox`, raw `<p className="muted">Yuklanmoqda…</p>`, and bare text; few retries.
6. **No shared Pagination** — Prev/Next duplicated per page with different markup.
7. **Badge tones duplicated** — `fulfillmentTone` / `paymentTone` copied across Dashboard, Orders, Payments.
8. **Sidebar density** — Dark purple sidebar is brand-correct but compressed (11–13px), weak icons, heavy gradient.
9. **Typography** — Inter/system only; financial numbers lack dedicated hierarchy class.
10. **Responsive** — Basic breakpoints exist; tables overflow without intentional scroll wrappers; sidebar stacks fully at 960px.

## Module matrix

| Module | Hierarchy | Layout | Spacing | Tables | Filters | L/E/E states | Consistency | Priority polish |
|--------|-----------|--------|---------|--------|---------|--------------|-------------|-----------------|
| Dashboard | Weak (raw h2 KPIs) | Filter card + KPI grids + tables | Uneven inline margins | OK but dense | Native selects | StateBox only | Good API wiring | **P0** filters, StatCard, sections |
| Kassa POS | OK operational | 3-col grid | POS-specific | N/A cart | Branch select | Custom banners | Separate visual language | **P1** align tokens |
| Filiallar | OK | List + edit form | OK | Basic | Client search | StateBox | Secrets masked well | **P1** table + status |
| Katalog | OK | Toolbar + optional form + table | OK | Basic | Client search | StateBox | Create form heavy | **P1** DataTable |
| Ombor | Strong (P/R/A) | Branch gate + summary + adjust | OK | Good | Branch + search | StateBox | Adjustment dialog OK | **P1** summary StatCards |
| Buyurtmalar | Good (3 statuses) | Filters + table + detail | Busy toolbar | Good | Server filters | Partial (no StateBox) | Detail cards nested | **P0** FilterBar + detail sections |
| Mijozlar | OK | List + detail | OK | Good | Server search | StateBox | Cashback SoT correct | **P1** profile layout |
| Cashback | Strong content | Summary + list + history | OK | Good | Search | Mixed | Liability SoT | **P0** source badges |
| To‘lovlar | OK | Table + snapshot | OK | Good | Weak (none on list) | StateBox | Refund gated | **P1** filters if API |
| Aksiyalar | Marketing-only clear | Cards + rewards table | OK | OK | None | StateBox | Card-heavy | **P1** simplify |
| Baholar | OK | Filters + table | OK | OK | Server | StateBox | OK | **P2** |
| Yetkazib berish | Busy | Filters + forms | Crowded | OK | Server | StateBox | CONTRACT notes | **P1** |
| Hisobotlar | Partial | KPI grids | OK | N/A | None | StateBox | Honest API_REQUIRED | **P2** polish only |
| Audit | OK | Filters + table | OK | OK | Server | StateBox | OK | **P1** |
| FOM | Honest statuses | Status cards | OK | Sync tables | Refresh | StateBox | Not default home | **P2** match system |
| Sozlamalar | Honest API_REQUIRED | Static | OK | Status table | N/A | N/A | Placeholder | **P2** Settings groups |

## Shared component gaps (pre-Phase 10)

| Needed | Exists? |
|--------|---------|
| AdminPageHeader | Partial (`PageHeader`) |
| FilterBar / FilterField | No |
| StatCard | No |
| StatusBadge | Partial (`Badge`) |
| DataTable shell | No (raw `.table`) |
| Pagination | No |
| EmptyState / ErrorState / Skeleton | Partial (`StateBox`) |
| MoneyDisplay | Via `money()` only |
| ConfirmDialog | Native `confirm` only |
| BranchSelector | Inline selects |
| SearchInput | Raw inputs |

## Accessibility gaps

- Sidebar buttons lack icons/`aria-current`
- Focus rings not defined
- Status conveyed mostly by color (badges have text — OK if labels stay)
- Confirm dialogs are browser-native (not labelled)

## Performance notes

- Orders / Customers / Audit / Ratings use server pagination — **keep**
- Branches / Catalog / Inventory client-filter after full fetch — acceptable for current scale; document for 1000+ branches later
- Dashboard limited recent rows — **OK**

## Decision for Phase 10

Build **one design system** (tokens + shared components) and apply across shell + all modules.  
**No business logic changes.** No fake metrics/trends.
