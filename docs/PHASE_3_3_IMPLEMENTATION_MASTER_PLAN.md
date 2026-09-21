# PHASE 3.3 — Implementation Master Plan

**Status:** PLANNING ONLY — **no implementation in this document**  
**Source:** Q1–Q24 architecture locks + repository evidence  
**Mode:** Convert locks → repository-specific production roadmap  
**Must not:** rewrite Expo app, invent PSP/FOM contracts, implement blockers, modify schema/API/UI/`.env`/packages/deploy  

---

## Document control

| Item | Value |
|------|--------|
| Purpose | Concrete, phased implementation roadmap for existing modular monolith |
| Non-goals | Greenfield rewrite; microservices split; mobile redesign |
| Canonical locks | `docs/PHASE_3_2_BUSINESS_DECISIONS.md` + Q2–Q24 lock docs |
| Prerequisites | `docs/PHASE_3_1_REQUIRED_FIXES_LOCK.md` |
| Engineering rules | `AGENTS.md`, `docs/MASTER_SPECIFICATION.md` |
| Readiness baseline | `docs/PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_LOCK.md` |

**Preserve:** existing Expo UI foundation (`artifacts/soglom-apteka`).  
**Evolve:** Express modular monolith (`artifacts/api-server`) + Drizzle schema (`lib/db`).

---

# TASK 1 — Current implementation inventory

| DOMAIN | Current implementation | Important files | Current risk | Target architecture | Migration complexity |
|--------|------------------------|-----------------|--------------|---------------------|----------------------|
| **1. Auth** | HMAC bearer tokens (customer 30d / admin 12h); Telegram header auto-provisions customer; phone+password register/login still live | `artifacts/api-server/src/lib/auth.ts`, `routes/auth.ts` | Non-revocable tokens; Telegram silent provision; password vs OTP primary inconsistency | Q7: phone+OTP primary; revocable sessions; AuthN≠AuthZ | Medium |
| **2. OTP** | Hashed OTP in `auth_otps`; SMS via Eskiz or `dev` provider; returns `devCode`; accepts `000000` when `ESKIZ_EMAIL` unset | `lib/auth.ts`, `lib/sms.ts` | Prod-usable bypass if Eskiz unset | Q7: no prod bypass; rate limits; single-use; no OTP in logs/responses | Low–medium |
| **3. Users** | `customers` table; identity via `telegram_id` / display phone; no `phone_e164` unique | `lib/db/src/schema/customers.ts` | Duplicate phones; weak identity | E.164 unique + cleanup; app identity mapping | Medium |
| **4. RBAC** | Flat `requireAdmin`; roles free-text (`super_admin`, `cashier` in seed); cashier can hit HQ APIs | `lib/auth.ts` `requireAdmin`, `routes/admin.ts`, `schema/admin.ts` | Privilege escalation | Q11 RBAC + branch scope; permission checks | High |
| **5. Branches** | Branch CRUD/list; payment merchant fields on branch; `assertStaffBranch` weak | `schema/branches.ts`, `routes/branches.ts`, `admin.ts` | Cross-branch leakage; secrets on branch | Server branch isolation; secret ACL | Medium |
| **6. Catalog** | Products + stocks join; admin product create seeds stock | `schema/catalog.ts`, `routes/catalog.ts` | Catalog conflated with stock qty | Q12: catalog ≠ inventory; lifecycle | Medium |
| **7. Search** | In-process filter/full scan of products | `routes/catalog.ts` | Unbounded at scale | Paginated search; engine OPEN | Medium |
| **8. Pricing** | Product `price` integer; server uses DB price at checkout | `orders.ts`, `money.ts` | No immutable price history / promo engine | Q13/Q15: server price + snapshots | Medium |
| **9. Promotions** | Display `promos` table; not applied as pricing rules | `catalog.ts` promos, `routes/catalog.ts` | Cosmetic only | Q15 server promo engine (policy OPEN) | High (policy-blocked partial) |
| **10. Cart** | Per-customer cart + items; authenticated | `schema/commerce.ts`, `routes/cart.ts` | No expiry/idempotency | Q13: cart ≠ order; validate at checkout | Low |
| **11. Checkout** | `POST /orders` creates order, decrements stock, USE cashback at create | `routes/orders.ts` | Consume-at-create; non-idempotent | Q13: validate→price→reserve→order→pay | High |
| **12. Inventory** | Single `product_stocks.quantity`; no UNIQUE(branch,product) in schema | `schema/catalog.ts`, `orders.ts` | Oversell; no reserve model | Q1/Q14 physical/reserved/available | High |
| **13. Reservations** | `orders.reserved_until` only; no `reservations` authority table | `commerce.ts` orders | No true hold | Q1/B: `reservations` + items | High |
| **14. Orders** | Single `status` + `fulfillment` | `commerce.ts`, `orders.ts` | Cannot express Q2 axes | Three-axis state | High |
| **15. Payments** | Local HTML checkout; `simulate-success`; Payme/Click webhooks echo-only | `routes/payments.ts`, `lib/payments.ts` | Anyone can mark paid | Q8 intent/attempt/txn + verified webhooks | High (**PSP contract OPEN**) |
| **16. Cashback** | `customers.balance` + `loyalty_ledger`; earn on delivery complete / FOM paths; USE at order create; `MAX_SPEND_RATIO = 1` | `lib/cashback.ts`, `orders.ts`, `pos.ts`, `fomBridge` | Balance as truth; spend 100%; USE timing | Q4/Q5 ledger + accounts; target 30% spend | High |
| **17. Loyalty** | `tier` string + rates in `cashback.ts`; ledger mixed with cashback | `customers.ts`, `loyalty.ts`, `cashback.ts` | Loyalty conflated with cashback | Q6 separate loyalty domain (policy OPEN) | Medium–high |
| **18. Delivery** | `deliveries` row; **unauthenticated** `POST /deliveries/:orderId/status` completes + earns | `payments.ts`, `commerce.ts` | Open completion → free cashback | Q9 authorized transitions | Medium |
| **19. FOM** | Open `POST /integrations/fom/sale`; `confirmFomSale`; POS `receiptId` unique | `integrations.ts`, `lib/fom.ts`, `fomBridge`, `pos.ts` | Unauthenticated sale; Q3 OPEN | Authenticated bridge; Q3-gated earn | Medium (**Q3 OPEN**) |
| **20. Notifications** | Sync OTP SMS only | `lib/sms.ts` | Blocks request; no outbox | Q10/Q16 outbox + workers | Medium |
| **21. Admin** | Vite admin-web; flat admin APIs | `artifacts/admin-web`, `routes/admin.ts` | Flat ACL; exposes sensitive fields | Q11 + least privilege | Medium |
| **22. API** | Unversioned `/api/*`; Express router compose | `routes/index.ts`, `app.ts` | No pagination/idempotency/versioning | Q17 versioned hardening | Medium |
| **23. Jobs** | None (no workers/outbox) | — | Expiry/notify/retry cannot scale | Q16 durable outbox + workers | High |
| **24. Database** | PG if `DATABASE_URL`; else PGlite; bootstrap + seed on start | `lib/db/src/index.ts`, `bootstrap.ts` | Demo DB path; auto-seed | PG truth; no PGlite prod | Medium |
| **25. Migrations** | **No `migrations/`**; drizzle-kit config; bootstrap DDL | `drizzle.config.ts`, `bootstrap.ts` | Uncontrolled schema drift | Q19 versioned migrations | High |
| **26. Observability** | Pino + `/healthz` | `lib/logger.ts`, `routes/health.ts` | No metrics/alerts/correlation | Q18 full observability | Medium |
| **27. Infrastructure** | Replit-oriented; `PRODUCTION.md` intent | `PRODUCTION.md` | No staging/CI/workers/Redis wiring | Q20 target topology | High (vendor OPEN) |
| **28. Testing** | **Zero** `*.test`/`*.spec`; no test scripts found | — | Cannot gate releases | Q22 critical automated suite | High |

---

# TASK 2 — Q24 A-blockers (confirmed)

| ID | Domain | Exact repository evidence | Why it blocks production | Affected files | Dependencies | Safest phase | Verification |
|----|--------|---------------------------|--------------------------|----------------|--------------|--------------|--------------|
| **A1** | Security / Delivery / Payment / FOM | `POST /deliveries/:orderId/status` no auth (`payments.ts`); `POST /payments/:id/simulate-success` no auth; `POST /integrations/fom/sale` no auth (`integrations.ts`) | Untrusted callers can complete orders, mark paid, trigger cashback | `payments.ts`, `integrations.ts`, related libs | AuthZ primitives (A5 partial); fail-closed | **P2** (after foundation) | Security tests: unauth → 401/403; no state change |
| **A2** | Payment | Local HTML checkout + `simulate-success`; Payme/Click webhooks return `{ok:true}` only | Real money cannot be settled safely | `payments.ts`, `lib/payments.ts` | **PSP contracts OPEN**; A7; Q8 schema | **P7** (contract-gated) | Integration against sandbox PSP; webhook verify tests |
| **A3** | Auth / OTP | `devCode` in OTP response when SMS provider `dev`; `000000` bypass when `!ESKIZ_EMAIL` (`auth.ts`) | Account takeover if deployed without Eskiz | `lib/auth.ts`, `lib/sms.ts` | Production env gates; secrets (A4) | **P2** | Prod-like env: bypass rejected; no `devCode` |
| **A4** | Secrets | `ADMIN_SECRET`/`CUSTOMER_SECRET` fallbacks `"vaksinamed-*-secret"`; seed `123456` / `vaksinamed` / `kassa123` (`seed.ts`) | Trivial credential/token forgery | `lib/auth.ts`, `seed.ts`, deploy config | Env separation; seed isolation | **P1–P2** | Boot fails closed without secrets; seed disabled in prod |
| **A5** | RBAC | `requireAdmin` only; cashier role seeded; HQ APIs not permission-scoped | Branch cashier can act as HQ | `admin.ts`, `auth.ts`, `adminUsers.role` | Permission matrix **OPEN**; branch scope | **P3** | AuthZ matrix tests per role |
| **A6** | Inventory | `orders.ts` decrements `product_stocks.quantity` at create; schema has only `quantity` | Conflicts with Q1 reserve lifecycle; oversell/refund unsafe | `orders.ts`, `catalog.ts` schema | Migrations (A8); reservation tables | **P4** | Concurrency reserve tests; no consume-at-create |
| **A7** | Checkout / Payment | No `Idempotency-Key` on `POST /orders` / payment mutations; open simulate | Duplicate orders/charges/USE | `orders.ts`, `payments.ts` | A6/A8; payment model | **P5–P7** | Retry same key → one effect |
| **A8** | Migrations | No `migrations/` directory; `bootstrapSchema` + kit push path | Uncontrolled prod schema change | `lib/db/*`, `drizzle.config.ts` | None (foundation) | **P1** | Migration apply/rollback drill on staging PG |
| **A9** | Backup/DR | Docs checklist only; no restore scripts/process in repo | Data loss irrecoverable | Ops docs/scripts (to create) | Prod PG (A12) | **P10** (before go-live) | Restore drill meets RPO/RTO (**OPEN** numbers) |
| **A10** | Testing | Zero automated test files/scripts | Cannot prove money/stock/auth safety | New test harness | Framework OPEN | **P1** (harness) then continuous | Critical suite green in CI |
| **A11** | Performance | No load/stress artifacts | Capacity claims unsafe | New load suite | Realistic staging | **P11** | Measured report; no invented RPS |
| **A12** | Database | `lib/db/src/index.ts` PGlite fallback; `PRODUCTION.md` forbids for prod traffic | Single-process demo DB unsuitable | `lib/db/src/index.ts` | Managed PG | **P1** | Prod boot requires Postgres URL; PGlite demoted to explicit local demo |

Do not invent additional A-blockers beyond this confirmed set.

---

# TASK 3 — Implementation dependency graph

Derived from repository coupling (not the generic example alone):

```text
P1  FOUNDATION
    (versioned migrations toolchain + PG-only prod path + seed isolation
     + test harness skeleton + fail-closed secrets boot)
        │
        ├─────────────── parallel ───────────────┐
        ▼                                        ▼
P2  EMERGENCY SECURITY                         P2b OBSERVABILITY BASE
    (close A1 endpoints; gate A3 OTP;          (correlation IDs, structured
     remove prod secret fallbacks A4)           log redaction — Q18 minimum)
        │
        ▼
P3  AUTH SESSIONS + RBAC SKELETON
    (revocable sessions; phone_e164; AuthZ middleware;
     branch isolation hooks — matrix details may stay OPEN)
        │
        ▼
P4  INVENTORY + RESERVATIONS (Q1/Q14)
    (physical/reserved; reservations authority;
     replace consume-at-create; NEW_RESERVATIONS_ONLY)
        │
        ▼
P5  ORDER THREE-AXIS + CHECKOUT IDEMPOTENCY (Q2/Q13)
    (fulfillment × payment × reservation; Idempotency-Key)
        │
        ├────────────────── parallel (after P5) ──────────┐
        ▼                                                 ▼
P6  CASHBACK LEDGER (Q4/Q5)                    P7  PAYMENTS (Q8)
    (accounts + ledger; spend cap;             (intent/attempt/txn;
     earn timing; USE not at create)            **BLOCKED on PSP contract**)
        │                                                 │
        └────────────────┬────────────────────────────────┘
                         ▼
P8  DELIVERY AuthZ + STATE (Q9)
    (authorized transitions; completion ≠ open webhook)
                         │
                         ▼
P9  FOM HARDENING
    (auth/idempotency now; **earn/completion semantics BLOCKED on Q3**)
                         │
                         ▼
P10 NOTIFICATIONS + OUTBOX + WORKERS (Q10/Q16)
    (reservation expiry; SMS/async; DLQ)
                         │
                         ▼
P11 API HARDENING + PAGINATION (Q17)
    (+ catalog bounds; admin least-privilege fields)
                         │
                         ▼
P12 BACKUP/DR + STAGING + CI GATES (A9, Q20)
                         │
                         ▼
P13 LOAD/STRESS (A11, Q23) → controlled production
```

### Parallelizable (explicit)

| Parallel set | Work | Constraint |
|--------------|------|------------|
| With P1 | Test harness design; docs; staging PG provisioning (ops) | No schema invent |
| P2 ∥ P2b | Endpoint lockdown ∥ log/correlation baseline | Share AuthZ helpers if needed |
| After P5 | P6 cashback ∥ P7 payment **scaffold** (not live PSP) | Live PSP needs contract |
| After P3 | Admin-web permission UI wiring ∥ API AuthZ | Mobile UI mostly untouched |
| Late | Advanced search / promo engine / MFA | Q24 C — not on critical path |

---

# TASK 4 — Implementation phases

## PHASE 1 — Production database foundation + test harness

| Field | Content |
|-------|---------|
| **Objective** | Adopt versioned migrations; require Postgres for non-demo; isolate seed; boot fail-closed on missing secrets; create automated test harness skeleton |
| **Why here** | Unlocks all schema work (A8/A12); makes later phases verifiable (A10); stops accidental PGlite/seed prod path |
| **Files/modules** | `lib/db/**`, `drizzle.config.ts`, `bootstrap.ts`, `seed.ts`, `index.ts`; new `migrations/`; test config under repo root / `artifacts/api-server` |
| **Database** | Migration toolchain; baseline capture of current schema; **no destructive rewrite** |
| **API** | Boot/health may distinguish ready vs demo; no business API redesign |
| **Mobile/UI** | None |
| **Security** | Secret fallbacks removed or fail-closed when `NODE_ENV=production` |
| **Dependencies** | None |
| **Rollback** | Keep bootstrap readable for local demo behind explicit flag; migrations reversible where additive |
| **Tests** | Harness smoke; migration apply on empty PG; seed-disabled assertion |
| **Acceptance** | `migrations/` exists and applies cleanly; prod path refuses PGlite; tests runnable in CI stub |

## PHASE 2 — Emergency security lockdown

| Field | Content |
|-------|---------|
| **Objective** | Close A1 privileged endpoints; gate A3 OTP bypasses; eliminate A4 prod secret fallbacks; stop auto Telegram provision for production traffic |
| **Why here** | Highest immediate exploit surface; mostly code gates before deep domain refactors |
| **Files** | `payments.ts`, `integrations.ts`, `lib/auth.ts`, `lib/sms.ts`, admin customer serializers |
| **Database** | Minimal (optional API keys / webhook secrets tables later) |
| **API** | Auth required on delivery status, FOM sale; simulate-success disabled or env-dev-only; webhooks reject unverified |
| **Mobile/UI** | None expected (simulate HTML is server-only) |
| **Security** | Fail closed |
| **Dependencies** | P1 |
| **Rollback** | Feature flags for staging simulate only |
| **Tests** | Unauth mutation → denied; OTP bypass rejected in prod-like config |
| **Acceptance** | A1/A3/A4 closed per evidence checklist |

## PHASE 3 — Auth sessions + RBAC skeleton

| Field | Content |
|-------|---------|
| **Objective** | Revocable sessions; `phone_e164`; AuthZ middleware with role+branch hooks; stop flat `requireAdmin` as sole gate |
| **Why here** | Needed before money/inventory mutations are trustworthy across actors |
| **Files** | `auth.ts`, `auth` routes, `admin.ts`, `schema/customers.ts`, `admin.ts` schema; new sessions tables |
| **Database** | sessions, otp hardening columns, phone_e164 + unique after cleanup |
| **API** | Logout revokes; admin routes check permissions |
| **Mobile/UI** | Login/OTP flows stay; may switch primary path to OTP without visual redesign (API/data) |
| **Security** | AuthN≠AuthZ; branch isolation |
| **Dependencies** | P1–P2; **permission matrix numbers remain OPEN** — implement enforceable skeleton + conservative defaults |
| **Rollback** | Dual-read tokens during compatibility window |
| **Tests** | Session revoke; cross-branch deny; role deny |
| **Acceptance** | Cashier cannot call HQ-only APIs; tokens revocable |

## PHASE 4 — Inventory + reservations (Q1)

| Field | Content |
|-------|---------|
| **Objective** | `physical`/`reserved`; `reservations` authority; replace consume-at-create; `NEW_RESERVATIONS_ONLY` |
| **Why here** | Blocks correct checkout/payment/cashback; A6 |
| **Files** | `schema/catalog.ts`, new reservation schema, `orders.ts`, catalog stock reads |
| **Database** | See Task 6 |
| **API** | Checkout reserves; cancel/expire releases; consume on fulfillment only |
| **Mobile/UI** | Cart/checkout UX preserved; stock labels may bind to `available` |
| **Security** | Server-only stock mutations |
| **Dependencies** | P1, P3 (actor for admin adjusts) |
| **Rollback** | Feature flag `inventory.reservations`; do not dual-path same order |
| **Tests** | Race two reserves; release; consume once; expire job |
| **Acceptance** | No quantity decrement at create; invariants hold |

## PHASE 5 — Order three-axis + checkout idempotency

| Field | Content |
|-------|---------|
| **Objective** | Q2 axes; checkout Idempotency-Key; unpaid ≠ consume |
| **Why here** | Orders currently single `status`; ties reservation+payment |
| **Files** | `commerce.ts` orders, `orders.ts`, serializers used by mobile |
| **Database** | New status columns; compatibility mapping from legacy `status` |
| **API** | Responses expose axes (additive fields preferred for mobile) |
| **Mobile/UI** | Order detail may map new fields → existing badges (**API/data integration**) |
| **Dependencies** | P4 |
| **Rollback** | Keep legacy `status` derived during compatibility |
| **Tests** | Illegal transitions rejected; idempotent POST /orders |
| **Acceptance** | Axes authoritative; one checkout effect per key |

## PHASE 6 — Cashback ledger + spend controls

| Field | Content |
|-------|---------|
| **Objective** | `cashback_accounts` + ledger truth; commercial identity; concurrency-safe USE; spend cap toward 30% configurable; earn rules per Q4 (delivery COMPLETED; pickup depends Q3) |
| **Architecture lock** | [`PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md`](PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md) (**LOCKED** — docs; implementation not performed in lock turn) |
| **Why here** | After order/reservation identity exists (P5) |
| **Files** | `cashback.ts`, `orders.ts`, `pos.ts`, `fomBridge`, `customers.balance` |
| **Database** | accounts, ledger, commercial_tx; balance derived/legacy |
| **API** | Spend/earn endpoints server-authoritative |
| **Mobile/UI** | Cashback screens preserved; balance from API |
| **Dependencies** | P5; Q3 for pickup earn |
| **Rollback** | Dual-write ledger + balance with reconciliation checks |
| **Tests** | Earn once; reverse ≤ earned; concurrent spend; idempotent USE (see P6 lock matrix A–R) |
| **Acceptance** | Ledger matches account; `MAX_SPEND_RATIO` not 1.0 in prod config direction |
| **Implementation order** | P6.0–P6.10 as locked in P6 architecture document |

## PHASE 7 — Payments (Q8) — contract-gated

| Field | Content |
|-------|---------|
| **Objective** | Intent/attempt/txn; verified webhooks; one-capture; remove prod simulate |
| **Architecture lock** | [`PHASE_3_3_P7_PAYMENT_ARCHITECTURE_LOCK.md`](PHASE_3_3_P7_PAYMENT_ARCHITECTURE_LOCK.md) (**LOCKED** — docs; implementation not performed in lock turn) |
| **Why here** | Needs stable order+amount snapshots from P5; cashback/inventory boundaries from P6/P4 |
| **Files** | `payments.ts`, `lib/payments.ts`, schema payments* |
| **Database** | intents/attempts/refunds/idempotency/webhook_events |
| **API** | No client-set PAID; webhook auth |
| **Mobile/UI** | Checkout payment method UI preserved; Expo redesign forbidden |
| **Dependencies** | P5; **official PSP contracts for P7.6** |
| **Rollback** | Keep simulate gated; additive migrations |
| **Tests** | Amount authority; one-capture; webhook idempotency; PAID≠earn/consume (see P7 lock) |
| **Acceptance** | Scaffold → verified adapter path without invented contracts; live capture blocked until contracts |
| **Implementation order** | P7.0–P7.10 as locked in P7 architecture document |

## PHASE 8 — Delivery authorization (Q9)

| Field | Content |
|-------|---------|
| **Objective** | Authorized delivery transitions; completion triggers inventory consume + cashback only via server rules |
| **Why here** | A1 delivery path; depends on order axes + cashback/payment boundaries |
| **Files** | delivery routes (move out of open `payments.ts`), schema deliveries |
| **Database** | delivery status history; courier actor linkage |
| **API** | Courier/admin AuthZ |
| **Mobile/UI** | Tracking display binds to API statuses |
| **Dependencies** | P3, P5, P6 (earn on COMPLETED) |
| **Business OPEN** | Exact enums/POD/fees — implement locked safety first |
| **Tests** | Unauth status change denied; illegal transitions |
| **Acceptance** | No open completion endpoint |

## PHASE 9 — FOM hardening (Q3-aware)

| Field | Content |
|-------|---------|
| **Objective** | Authenticate FOM; idempotent receipt handling; **do not lock completion/earn semantics** |
| **Why here** | After auth + commercial identity |
| **Files** | `integrations.ts`, `fom.ts`, `fomBridge`, `pos.ts` |
| **Database** | FOM event/idempotency records |
| **API** | Signed/authenticated sale ingress |
| **Mobile/UI** | QR unchanged |
| **Dependencies** | P3, P6; **Q3 OPEN blocks pickup earn / sale-complete meaning** |
| **Tests** | Replay same receiptId; unauth rejected |
| **Acceptance** | A1 FOM closed; Q3 items remain OPEN |

## PHASE 10 — Outbox, workers, notifications

| Field | Content |
|-------|---------|
| **Objective** | Durable outbox; reservation expiry worker; async SMS/notify; retry/DLQ |
| **Why here** | Expiry required for Q1; notify must not rollback commerce |
| **Files** | new worker package/process; outbox schema; `sms.ts` async path |
| **Database** | outbox + attempts |
| **API** | HTTP returns after enqueue |
| **Dependencies** | P4 (expiry), P2 (no secrets in payloads) |
| **Tests** | At-least-once worker idempotency; expiry release |
| **Acceptance** | Multi-instance safe expiry; OTP SMS not sole sync critical path for commerce events |

## PHASE 11 — API hardening + pagination + field ACL

| Field | Content |
|-------|---------|
| **Objective** | Version prefix or compatibility layer; pagination; strip `passwordHash`/secrets from responses |
| **Why here** | Scale + Q17 after core domains stable |
| **Files** | `routes/*`, admin serializers, catalog list |
| **Dependencies** | P5+ |
| **Tests** | Page bounds; sensitive fields absent |
| **Acceptance** | Collection endpoints bounded; no secret leakage |

## PHASE 12 — Backup/DR, staging, CI quality gates

| Field | Content |
|-------|---------|
| **Objective** | Backup+restore drill; staging env; CI: lint→unit→integration→migration→security→build |
| **Why here** | A9 + go-live prerequisites; exact CI vendor OPEN |
| **Dependencies** | P1–P11 critical paths green |
| **Acceptance** | Restore proven; staging smoke; gates block bad deploys |

## PHASE 13 — Load/stress + controlled production

| Field | Content |
|-------|---------|
| **Objective** | Measure capacity (A11); controlled prod cutover |
| **Why here** | Last — no invented RPS |
| **Dependencies** | P12 |
| **Acceptance** | Written load report; go-live checklist vs Q24 A all cleared or explicitly waived by owner |

---

# TASK 5 — Preserve existing UI

## A. UI that should remain unchanged (visual baseline)

Per `AGENTS.md` + existing Expo app:

- Brand: logo, purple/yellow identity, colors, typography, spacing patterns  
- Bottom tabs + central QR  
- Home (`(tabs)/index.tsx`), catalog, product cards, cashback card, nearest pharmacy card  
- Profile structure (`profile.tsx`)  
- Cart / checkout **layout** (`cart.tsx`, `checkout.tsx`)  
- Order list/detail chrome (`purchases.tsx`, `order/[id].tsx`)  
- Cashback / bonuses screens  
- Welcome / language / branches map presentation  
- Admin-web overall shell unless AuthZ requires hiding controls  

## B. UI that only needs API/data integration

- Login / register / verify-otp → session revoke-aware tokens  
- Catalog/product stock labels → `available`  
- Checkout totals → server quote (already mostly server)  
- Order status badges → map three-axis fields  
- Cashback balance → ledger-backed balance API  
- Payment redirect URLs when real PSP lands  
- Delivery status display when statuses expand  

## C. UI that may need small production fixes (not redesign)

- `login.tsx` phone+password vs OTP-primary reconciliation (Q7) — flow wiring, not visual redesign  
- Hide/disable any client affordances that called simulate/dev paths (if present)  
- Error toasts for `STOCK_UNAVAILABLE` / auth errors  
- Admin-web: hide HQ nav for cashier (permission-driven)  

## D. UI that genuinely requires redesign

- **None required by repository evidence** for production roadmap  
- Advanced POD/tracking, promo builder, MFA UX → only if product later requests (Q24 C/D)

**Do not rewrite Expo. Do not replace navigation shell.**

---

# TASK 6 — Database migration strategy

Principles: additive → backfill → verify → constrain → switch readers/writers → drop legacy later.  
**Never** `push --force` on production. **Never** destructive drop before deterministic backfill/verification.

| Migration theme | Prerequisite | Backfill | Compatibility period | Verification | Rollback |
|-----------------|--------------|----------|----------------------|--------------|----------|
| **Toolchain baseline** | Staging PG | Capture current bootstrap schema as migration 0001 | App still boots | migrate up on empty + copy of staging | migrate down if supported / restore backup |
| **users.phone_e164** | Baseline | Normalize from `phone` / `telegramId` app: | Dual-read phone | Duplicate report zero before UNIQUE | Keep old `phone` column |
| **OTP hardening** | phone_e164 | Hash-only already partial; add attempts/consumed cols | Old rows expire naturally | OTP single-use tests | Additive only |
| **sessions** | Auth phase | Issue new sessions on login; optional import none | Accept HMAC until sunset date | Revoke test | Feature flag sessions |
| **RBAC tables** | sessions | Map `admin_users.role` → role/permission rows | `requireAdmin` + new checks | Matrix tests | Keep role text |
| **product_stocks physical/reserved** | Baseline | `physical = quantity`, `reserved = 0` | Writers: new path only for new orders (Q1) | Invariants SQL check | Keep `quantity` as generated/compat mirror temporarily |
| **UNIQUE(branch_id,product_id)** | Merge duplicates | Merge script with audit | Read via unique row | Count duplicates = 0 | Restore from backup |
| **reservations + items** | stocks model | **No** backfill from historical orders (Q1 `NEW_RESERVATIONS_ONLY`); audit open orders in **deployed** env before cutover | Legacy open orders ops plan if any | New orders always linked | Flag off reservations |
| **orders three-axis** | reservations | Map legacy `status` → axes | Derive legacy `status` for old clients | Transition tests | Keep `status` column |
| **payments intent/attempt/txn** | orders axes | Wrap existing `payments` rows as intents | Old payment id still queryable | Idempotent webhook tests | Additive tables |
| **cashback_accounts** | customers | `account.balance = customers.balance` | Dual-write | Ledger sum = account | Stop ledger writer |
| **cashback ledger** | accounts | Optional historical import from `loyalty_ledger` kind filters — only if deterministic; else start ledger at cutover with opening balance entry | Old ledger read-only | Balance reconcile job | Opening balance reversing entry |
| **commercial_transaction identity** | orders + POS | Assign IDs to orders/pos_sales | Earn/USE require commercial id | Unique EARNED/USED | Additive |
| **idempotency keys** | — | Empty table | Required on new mutations | Duplicate key tests | TTL purge only |
| **audit enrichment** | — | Keep `audit_log` | Expand actors | Privileged action present | Additive |
| **outbox** | — | Empty | Writers enqueue | Worker processes | Pause workers |
| **delivery history** | deliveries | Snapshot current status | Old column remains | AuthZ tests | Additive |
| **FOM integration records** | — | Map `pos_sales.receipt_id` | POS path unchanged | Replay tests | Additive |

**Backup before every critical migration wave (P12 ops).**

---

# TASK 7 — Security implementation order

Safest sequence (fail closed early; deep RBAC after identity):

1. **Fail-closed secrets** (no hardcoded HMAC fallbacks in production boot) — with P1  
2. **Disable seed credentials path in production** — P1  
3. **Remove/gate OTP bypasses** (`devCode`, `000000`, console OTP) — P2  
4. **Disable or AuthZ `simulate-success`** — P2  
5. **Authenticate delivery status + FOM sale** — P2  
6. **Strip sensitive fields** from admin APIs — P2/P11  
7. **Authentication hardening** (OTP attempts, enumeration minimization) — P3  
8. **Revocable sessions** — P3  
9. **RBAC + branch isolation** — P3 (matrix OPEN → conservative denies)  
10. **Payment authorization** (no client PAID) — P7  
11. **Webhook verification** (payment/FOM/delivery) — P7/P8/P9  
12. **FOM authentication** — P9  
13. **Delivery authorization** (courier/admin) — P8  
14. **Distributed rate limiting** — with Redis non-authoritative (scale B; after P10 infra)  
15. **Audit logging** for privileged admin/payment/inventory — continuous from P3  

---

# TASK 8 — Inventory implementation order

Respect Q1:

```text
available = physical - reserved
AVAILABLE → RESERVED → CONSUMED
RESERVED → AVAILABLE (cancel/expire)
```

### Replace

| Legacy behavior | Location | Replacement |
|-----------------|----------|-------------|
| `quantity -= n` at `POST /orders` | `orders.ts` | RESERVE only (`reserved += n`) |
| `quantity += n` on cancel | `orders.ts` | RELEASE (`reserved -= n`) |
| Catalog shows `quantity` as availability | `catalog.ts` | Show/compute `available` |
| No row lock strategy | orders create | `SELECT … FOR UPDATE` / conditional update |

### Protect legacy data

- Backfill `physical = quantity`, `reserved = 0`  
- `NEW_RESERVATIONS_ONLY` — do not invent reservations for old orders  
- Before prod cutover: **audit deployed DB for open non-terminal orders** (env-specific)  
- Do not run old consume-at-create and new reserve on the same order path  
- Redis never stores authoritative stock  

### Order of work

1. Schema additive columns + backfill + check constraints  
2. UNIQUE(branch, product) after duplicate merge  
3. `reservations` / `reservation_items`  
4. Switch checkout writer  
5. Expiry worker (needs P10; until then conservative short TTL + admin release)  
6. Consume on fulfillment completion only  
7. Drop/ignore legacy `quantity` after mirror period  

---

# TASK 9 — Cashback implementation order

Respect Q4/Q5:

| Rule | Roadmap handling |
|------|------------------|
| One commercial identity | Introduce before earn/USE |
| One EARNED; idempotent | Unique constraint + shared earn function |
| Ledger truth; `cashback_accounts` target | P6 |
| `customers.balance` legacy/derived | Dual-write then derive |
| Reversal model | Immutable EARNED + REVERSAL rows |
| Server spend limit; target 30% | Replace `MAX_SPEND_RATIO = 1` in `cashback.ts` with configurable policy (exact prod % may stay config) |
| No earn on PAID alone | Keep; enforce in payment path |
| Pickup earn depends Q3 | **Do not implement pickup earn completion until Q3** |
| Delivery earn on COMPLETED | Wire via authorized delivery completion only |

### Replace vs keep

| Keep (evolve) | Replace |
|---------------|---------|
| `computeCashback` pure math structure | Spend ratio; earn timing call sites |
| Tier → bps helper (until Q6 policy) | Balance-as-truth updates scattered in `orders.ts` / POS |
| `pos_sales.receipt_id` uniqueness | Open FOM earn without auth |
| Delivery-earn-not-on-pay comment intent | USE at order create |

---

# TASK 10 — Payment implementation order

Respect Q8 and [`PHASE_3_3_P7_PAYMENT_ARCHITECTURE_LOCK.md`](PHASE_3_3_P7_PAYMENT_ARCHITECTURE_LOCK.md). Current = scaffold/mock (`simulate-success`, echo webhooks).

| Step | Status |
|------|--------|
| **P7.0 architecture lock** | **DONE (docs)** |
| Remove/gate simulate in prod | Implemented in P2; retain fail-closed |
| Payment status axis on order | P5 (done) |
| Intent / attempt / provider txn tables | P7.1 |
| Intent/attempt lifecycle | P7.2 |
| Idempotent create + one-capture | P7.3 |
| Webhook/event infrastructure | P7.4 |
| Provider adapter boundary | P7.5 |
| Server amounts only | P7 (throughout) |
| Idempotent callbacks | P7.4 |
| Refund model + ≠ cashback REVERSAL | P7.7 technical; **business refund policy OPEN** |
| Serializers / API compatibility | P7.8 |
| Test matrix / final audit | P7.9–P7.10 |
| Reconciliation job | P10/P12 (ops) |
| Secret isolation (no branch secrets to clients) | P2/P7 |
| **Payme/Click signature & state maps (P7.6)** | **BLOCKED / OPEN — provider contracts** |
| Live capture in production | **BLOCKED until contracts + sandbox proof** |

Do not invent provider APIs in this plan.

---

# TASK 11 — FOM implementation order

**Q3 remains OPEN — do not lock completion/sale semantics.**

### A. Can implement now safely

- Authenticate/verify FOM ingress (shared secret/mTLS/signature — mechanism chosen at impl time without inventing vendor API)  
- Reject unauthenticated `POST /integrations/fom/sale`  
- Idempotency on `receiptId` (already partial via POS)  
- Audit log all FOM events  
- Branch scope checks for actor  
- Separate FOM adapter interface from core cashback/inventory  

### B. Blocked by vendor contract

- Exact payload schema / auth scheme from vendor docs  
- Stock sync from FOM writing `physical` (forbidden until validated contract — Phase 3.1 §I)  
- Payment-inside-FOM coordination with PSP  

### C. Requires Q3 decision

- Whether FOM event means commercial completion for **pickup earn**  
- Whether FOM confirms reservation consume vs separate POS  
- Mapping FOM events → order fulfillment transitions  

---

# TASK 12 — Testing strategy by phase

| Phase | Unit | Integration | Concurrency | Migration | Security | E2E |
|-------|------|-------------|-------------|-----------|----------|-----|
| P1 | migration helpers | migrate up | — | apply/rollback | boot without secrets fails | — |
| P2 | gate helpers | endpoint denials | — | — | unauth A1; OTP bypass | — |
| P3 | token/session | login/logout revoke | parallel login | phone backfill | RBAC deny | login→me |
| P4 | available math | reserve/release/consume | double reserve | stock backfill | no client stock write | checkout stock |
| P5 | transition table | checkout idempotency | double checkout | status map | — | place order |
| P6 | compute/spend/reverse | earn once; USE | concurrent spend | account backfill | — | cashback show |
| P7 | amount/capture rules | webhook replay | double webhook | payment tables | webhook sig | pay sandbox |
| P8 | transition guards | complete delivery | — | — | courier AuthZ | track order |
| P9 | idempotency | FOM replay | duplicate sale | FOM records | FOM auth | QR→POS |
| P10 | retry/backoff | outbox deliver | multi-worker | outbox | payload redact | — |
| P11 | pagination | list bounds | — | — | field ACL | catalog scroll |
| P12 | — | staging smoke | — | restore drill | CI gates | critical journeys |
| P13 | — | — | load suite | — | — | soak |

Prioritize money/stock/auth/webhook paths always.

---

# TASK 13 — Rollout strategy

```text
LOCAL (PGlite or local PG explicit demo)
  → DEV (shared PG, migrations on)
  → STAGING (prod-like secrets, no seed passwords, PSP sandbox)
  → PRODUCTION (controlled)
```

| Control | Use |
|---------|-----|
| Feature flags | `inventory.reservations`, `payments.simulate`, `sessions.revocable`, `cashback.ledger` |
| Backward compatibility | Additive API fields; derived legacy `status`; dual-read phone |
| Migration verification | Row counts, invariant SQL, reconcile jobs before switch |
| Rollback | Flag off + restore backup for failed migration waves |
| Monitoring | Error rate, auth failures, reserve failures, payment webhook failures, outbox lag |
| Gradual rollout | Single branch → region → all (when multi-branch live) |
| Smoke tests | Auth OTP, catalog, checkout reserve, payment sandbox, order status |
| Backup | Mandatory before P4/P5/P6/P7 migration waves and prod cutover |

---

# TASK 14 — Final master phase table

| PHASE | OBJECTIVE | DEPENDENCIES | RISK | CAN PARALLELIZE | BLOCKER |
|-------|-----------|--------------|------|-----------------|---------|
| **P1** | Migrations + PG prod path + seed isolation + test harness | — | Medium | Ops staging PG; harness design | **A8, A12, A10** |
| **P2** | Close open endpoints; OTP/secret gates | P1 | Medium | P2b observability base | **A1, A3, A4** |
| **P3** | Sessions + RBAC skeleton + phone_e164 | P1–P2 | High | Admin UI hide/show | **A5**; matrix OPEN |
| **P4** | Q1 inventory/reservations | P1, P3 | High | Catalog read adapters | **A6** |
| **P5** | Q2 order axes + checkout idempotency | P4 | High | Mobile status mapping | **A7** (checkout) |
| **P6** | Q4/Q5 cashback ledger | P5 | High | Pure `computeCashback` tests | Q3 for pickup earn; architecture: [`PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md`](PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md) |
| **P7** | Q8 payments real path | P5; **PSP contract for live capture** | High | Intent schema + adapter boundary before live PSP | **A2**; contracts OPEN; architecture: [`PHASE_3_3_P7_PAYMENT_ARCHITECTURE_LOCK.md`](PHASE_3_3_P7_PAYMENT_ARCHITECTURE_LOCK.md) |
| **P8** | Q9 delivery AuthZ | P3, P5, P6 | Medium | Tracking display | Delivery policy OPEN |
| **P9** | FOM auth/idempotency | P3, P6 | Medium | Adapter interface | **Q3 OPEN** for semantics |
| **P10** | Outbox/workers/notify/expiry | P4, P2 | Medium | SMS provider swap | Retry topology OPEN |
| **P11** | API versioning/pagination/ACL | P5+ | Low–med | Admin serializers | Format details OPEN |
| **P12** | Backup/DR + staging + CI gates | P1–P11 critical | Medium | Docs/runbooks | **A9**; vendors OPEN |
| **P13** | Load/stress + prod cutover | P12; A cleared | High | — | **A11**; capacity OPEN |

---

# TASK 15 — First implementation phase (exactly one)

## FIRST: **PHASE 1 — Production database foundation + test harness**

### Why first

1. **A8** (no versioned migrations) and **A12** (PGlite prod unsuitability) block every safe schema change for inventory, sessions, cashback, payments.  
2. Without a migration toolchain, P4–P7 cannot land without `bootstrap`/`push` risk forbidden by Q19.  
3. **A10** test harness must exist before claiming A1–A7 fixes are verified.  
4. Closing endpoints (P2) is urgent but must sit on a known DB/boot/secret discipline from P1 — otherwise “prod” still boots with fallbacks/PGlite/seed.  
5. Repository evidence: `lib/db/src/index.ts` dual-mode + `bootstrapSchema` + **zero** `migrations/` + **zero** tests.

### Files likely affected

- `lib/db/src/index.ts` — prod requires Postgres; PGlite explicit demo only  
- `lib/db/src/bootstrap.ts` — stop being sole prod schema authority  
- `lib/db/src/seed.ts` — disable auto-seed when production  
- `lib/db/drizzle.config.ts` — migrations out directory  
- New: `lib/db/migrations/**` (or repo-standard path)  
- New: test runner config + smoke tests (framework choice **OPEN** — select at implementation)  
- Possibly `PRODUCTION.md` cross-links (docs only if touched)  
- Package scripts for `migrate` / `test` (when implementation authorized)

### Prerequisites

- Access to a Postgres instance for local/dev/staging  
- Decision: migration runner = Drizzle Kit migrate (aligned with existing drizzle) — confirm at impl  
- No PSP/FOM contracts needed  
- No mobile changes  

### Expected changes (when authorized later)

- Baseline migration matching current schema  
- Boot fail-closed without `DATABASE_URL` postgres in production mode  
- Boot fail-closed without `ADMIN_SECRET` / `CUSTOMER_SECRET` in production  
- Seed not applied automatically in production  
- `pnpm test` (or chosen runner) executes at least one smoke test  

### Tests

- Migration applies on empty Postgres  
- Production-mode boot refuses PGlite and missing secrets  
- Seed skipped in production-mode  

### Acceptance criteria

- [ ] Versioned migrations directory exists and is the prod schema path  
- [ ] Production configuration cannot silently use PGlite  
- [ ] Automated test command exists and passes smoke suite  
- [ ] No business domain rewrite yet (inventory/payments untouched)  
- [ ] No `.env` committed; no blocker “fixed” beyond foundation scope  

**Do not implement Phase 1 in this planning step.**

---

# Remaining OPEN decisions (carry forward)

1. Q3 FOM event semantics  
2. Payment provider contracts  
3. Delivery business policies  
4. Loyalty business rules  
5. Promotion business rules  
6. OTP numeric policy  
7. Admin role/permission matrix  
8. Cloud provider/topology  
9. Monitoring provider  
10. Backup RPO/RTO  
11. Load-test targets / exact capacity  
12. Test/E2E/CI framework choices  
13. Other OPEN items from Q1–Q24 locks  

---

# Consistency

| Item | Status |
|------|--------|
| Q1–Q24 locks | Not reopened |
| Expo UI foundation | Preserved |
| Modular monolith | Preserved |
| Implementation in this step | **None** |

---

**IMPLEMENTATION MASTER PLAN COMPLETE — Q1–Q24 ARCHITECTURE LOCKS CONVERTED INTO REPOSITORY-SPECIFIC IMPLEMENTATION ROADMAP — NO IMPLEMENTATION PERFORMED.**
