# Q21 + Q22 + Q23 + Q24 FINAL BATCH ANALYSIS — Security, Testing, Performance, Production Readiness

**Status:** ANALYSIS ONLY (not a lock)  
**Mode:** Documentation / analysis only — **no application implementation**  
**Must not reopen:** Q1–Q20; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision IDs | Q21 (security), Q22 (testing), Q23 (performance), Q24 (final readiness) |
| Implementation | Forbidden in this phase |
| Verdict | Architecture principles Q1–Q20 are largely locked; **runtime is not production-ready**. Critical blockers: unauthenticated privileged endpoints, payment stubs, inventory/cashback/RBAC gaps, no tests, no versioned migrations, thin ops/infra. |

---

# Q21 — Security / threat model / data protection

## 1. Current state

| Area | Evidence-backed status |
|------|------------------------|
| Customer AuthN | Phone OTP (hashed) + password; Telegram header auto-provision |
| Admin AuthN | Email/password → 12h HMAC; no MFA; no login rate limit |
| AuthZ / RBAC | Flat `requireAdmin`; cashier ≈ HQ on admin APIs |
| Branch isolation | POS sale only |
| Payment | Stub webhooks; open `simulate-success` |
| Delivery status | Unauthenticated → can complete + earn cashback |
| FOM sale | Unauthenticated bridge |
| OTP | Hash at rest; `devCode`/`000000` when Eskiz unset; console OTP in dev SMS |
| Secrets | Env + **hardcoded fallbacks**; seed passwords |
| Validation | Manual; Zod unused |
| Rate limit | In-memory auth/POS only |
| Audit | Narrow POS/FOM/branch |
| CORS | Reflect any origin + credentials |
| File upload | None |

## 2. Trust boundaries

```text
Customer Mobile  →  Public API  →  Auth  →  Business services
                                           ↓
                                      PostgreSQL (truth)
                                           ↕
                                      Redis (future, non-auth)
                                           ↓
                                      Workers (future)
                                           ↓
                         Payment | SMS | Delivery | FOM | Notify

Admin Web → Admin API → same services (must be stricter AuthZ)
```

| Boundary | Required control |
|----------|------------------|
| Mobile → API | AuthN + server validation |
| Admin → API | AuthN + RBAC + branch scope + audit |
| Webhooks → API | Signature/auth + idempotency + state rules |
| FOM → API | Authenticated contract (OPEN Q3) |
| Workers → domain | Capability-scoped (not super-admin) |
| API → Redis | Non-authoritative only |
| API → PG | Transactions/constraints |

## 3. Threats / gaps (evidence-backed)

| Gap | Evidence |
|-----|----------|
| Unauthenticated delivery complete | `POST /deliveries/:orderId/status` |
| Unauthenticated payment mark unpaid→paid | `POST /payments/:id/simulate-success` |
| Unauthenticated FOM sale | `POST /integrations/fom/sale` |
| Payment webhooks unauthenticated stubs | payme/click webhook routes |
| OTP bypass `000000` / `devCode` | `auth.ts` when `!ESKIZ_EMAIL` |
| OTP in console | `sms.ts` `[SMS:dev]` |
| Default HMAC secrets | `vaksinamed-*-secret` fallbacks |
| Seed passwords | `123456`, `vaksinamed`, `kassa123` |
| Flat admin AuthZ | any admin hits all `/admin/*` |
| Payment secrets writable by any admin | `PATCH /admin/branches` |
| Customer `passwordHash` in admin list | `GET /admin/customers` |
| Non-revocable tokens | logout client-only |
| Telegram auto-create bypasses OTP | `requireCustomer` |
| In-memory rate limits | multi-instance unsafe |

## 4. Data protection

Sensitive categories present or likely: phone, name, addresses, order history, payment metadata, loyalty/cashback, auth hashes, sessions.

**Principle:** minimum necessary exposure per role (customer ≠ cashier ≠ courier ≠ finance ≠ HQ).

No compliance certificates claimed.

## 5. Target architecture

Untrusted client → versioned API → server AuthN/AuthZ → domain services → PG truth; verified external callbacks; secrets in secret manager; fail closed; audit privileged ops; no prod bypasses.

## 6. LOCKED candidates (not locked this turn)

- Client untrusted; server authoritative for identity/AuthZ/price/payment/inventory/cashback/loyalty/order state  
- Privileged ops require server AuthZ; branch scope enforced server-side  
- Webhooks authenticated + idempotent  
- Secrets never to clients; OTP/tokens never in logs  
- Dev bypasses/default credentials must not exist in production  
- Privileged ops auditable; fail closed  
- Providers untrusted until verified  
- Controls valid multi-instance; Redis not sole security authority  
- Uploads untrusted  

## 7. OPEN

Security/WAF provider; MFA policy; password/session policy; exact rate limits; pen-test schedule; scanner provider; compliance; legal retention.

---

# Q22 — Testing / QA / release quality

## 1. Current state

**No** `*.test.*` / `*.spec.*` files found.  
**No** `test`/`vitest`/`jest`/`playwright` scripts in package.json.  
Quality relies on manual use + docs.

## 2. Existing tests

None in repository.

## 3. Critical flow coverage

All critical flows **uncovered** by automation: auth, RBAC, reservation, payment, cashback earn/spend/reversal, FOM idempotency, refunds, promotions, delivery transitions, webhooks.

## 4. Concurrency tests

Absent — needed for last-unit reservation, checkout races, cashback spend, duplicate callbacks, promo limits.

## 5. Migration tests

Absent — Phase 3.1 requires testing against representative data; no migration runner yet.

## 6. E2E

Absent — journeys (register→cart→checkout→pay→pickup/delivery→cashback) not automated.

## 7. Release gates

No CI test gate. Spec/Q17/Q20 direction: lint → unit → integration → migration → security → build → staging → prod.

## 8. Gaps

Entire automated QA stack missing: unit, integration, concurrency, migration, E2E, load, security tests, fixtures, CI execution.

## 9. LOCKED candidates (not locked this turn)

- Production-critical business rules need automated coverage  
- Pure rules unit-testable without providers  
- Cross-domain integration tests for order/reserve/pay/fulfill/cashback; FOM commercial; refund→reversal  
- Concurrency tests for races  
- Migration tests on representative data  
- Critical-journey E2E (not every screen)  
- Release gates before production  

## 10. OPEN

Coverage %; frameworks; CI provider; staging dataset; approval process; pen-test cadence; load-test schedule.

---

# Q23 — Performance / load / scalability validation

## 1. Current state

No benchmarks, load tests, or measured latency/RPS in repo.  
Scale direction locked conceptually (200→1000+ branches; thousands concurrent) — **unproven**.

## 2. Bottlenecks (evidence-based likelihood, not measured)

| Bottleneck | Evidence |
|------------|----------|
| PGlite | Local single-process fallback |
| In-memory rate limits | Not shared across instances |
| Sync Eskiz OTP SMS | Blocks auth request |
| No queues/workers | Retry/long work on HTTP path |
| Full-catalog in-memory search | Unbounded product load |
| Unbounded admin/list APIs | No pagination |
| Stock check-then-update | Race + lock pressure when fixed |
| Cashback balance race | Read-modify-write |
| Default DB pool | No sizing |
| Payment stubs | Not real provider latency |

## 3. Database performance

Missing indexes (orders, payments, inventory composites); full table scans for catalog; no query timing metrics.

## 4. API performance

Many list endpoints return all rows; N+1 limited but scan-heavy; CORS/open endpoints amplify abuse load risk.

## 5. Queue / worker performance

N/A — workers absent; when added, must scale independently (Q16/Q20).

## 6. Load testing

Not present. Required scenarios eventually: OTP/login, catalog/search, cart/checkout/reserve, payment callbacks, cashback, status poll, delivery updates, admin, notify jobs, FOM events.

## 7. Scale direction

Locked target: 200+ → 1000+ branches; thousands concurrent users. Capacity via load/stress testing only — **do not claim RPS**.

## 8. Gaps

No load tests; no pagination; no Redis for shared limits; sync providers; missing indexes; no connection pool policy; no CDN/cache strategy implementation.

## 9. LOCKED candidates (not locked this turn)

- Paginated collections  
- Heavy work async  
- Indexed search strategy  
- Avoid N+1  
- Short inventory critical sections  
- Don’t hold DB tx while calling providers  
- Background jobs for retryable work  
- Cache ≠ business truth  
- Horizontal API; independent workers  
- Pool accounts for API+worker concurrency  
- Evidence-driven optimization  
- Capacity via load testing  

## 10. OPEN

Exact RPS/users/latency SLO; DB/Redis sizing; instance/worker counts; autoscaling thresholds; load-test tooling; CDN/cache strategy; search engine choice.

---

# Q24 — Final production readiness / architecture gap audit

## 1. Architecture summary

**Locked (docs):** modular monolith; three-axis orders; PG inventory/cashback/payment/delivery/auth/RBAC/jobs/API/ops principles (Q1–Q20).

**Runtime:** Expo mini-app + Express API + Drizzle/bootstrap DB; marketing promos; stub payments; thin delivery; OTP SMS; Replit-oriented host; **not** matching locked production architecture.

## 2. Critical blockers (A — before production)

Evidence-backed:

| Blocker | Related Q |
|---------|-----------|
| Unauthenticated delivery complete + cashback earn | Q9, Q4, Q21 |
| Unauthenticated `simulate-success` payment | Q8, Q21 |
| Unauthenticated / unverified FOM sale | Q3, Q8, Q21 |
| Payment provider stubs (no verify) | Q8 |
| OTP `000000`/`devCode`/console OTP without production gate | Q7, Q21 |
| Default HMAC secrets / seed credentials if used in prod | Q7, Q20, Q21 |
| Flat admin AuthZ (cashier≈superuser) + secret write | Q11, Q21 |
| Inventory consume-at-create (≠ Q1 reserve model) | Q1, Q13, Q14 |
| Checkout non-idempotent (duplicate orders) | Q13, Q17 |
| No versioned migrations; push/bootstrap sole evolution | Q19 |
| No production backup/restore proven | Q19, Q20 |
| No automated tests for critical money/stock/auth | Q22 |
| PGlite/demo mode unsuitable for production traffic | Q19, Q20 |

## 3. Required before production scale (B)

| Item | Related Q |
|------|-----------|
| Distributed rate limiting (Redis) | Q7, Q17, Q20 |
| Outbox + workers (notify, expiry, reconcile) | Q10, Q16 |
| Paginated catalog/search + indexes | Q12, Q17, Q23 |
| RBAC + branch isolation across admin/POS | Q11 |
| Revocable sessions | Q7 |
| Real Payme/Click + webhook auth | Q8 |
| Reservation lifecycle + uniqueness constraints | Q1, Q14, Q19 |
| Cashback ledger authority / USE timing alignment | Q4, Q5, Q13 |
| Observability: metrics, alerts, correlation IDs | Q18 |
| Multi-API + LB + staging + CI/CD | Q20 |
| Load/stress testing | Q23 |
| Close sensitive field leaks (passwordHash, secrets in responses) | Q21 |

## 4. Post-production improvements (C)

Promo engine; multilingual catalog polish; delivery POD/tracking; MFA rollout; advanced tracing; object storage media; read replicas when evidence requires; richer E2E.

## 5. Future / optional (D)

External delivery providers; advanced search engine; partitioning/sharding; compliance certifications; personalization.

## 6. Final target architecture

```text
CUSTOMER MOBILE
        ↓
HTTPS / WAF / LOAD BALANCER
        ↓
VERSIONED API
        ↓
MODULAR MONOLITH
        ↓
PostgreSQL ← source of truth
        ↕
Redis ← cache / rate-limit / job coordination only
        ↓
Outbox → Workers → External providers
          (Payment | SMS | Delivery | FOM | Notifications)

Also: Object Storage | Observability | Audit | CI/CD | Staging | Production | Backup/DR
```

Preserve Expo/UI foundation (AGENTS). No vendor selected beyond current Eskiz/Replit/EAS evidence.

## 7. Production readiness checklist

| Domain | Status | Evidence | Next action | Q |
|--------|--------|----------|-------------|---|
| SECURITY | **BLOCKED** | Open privileged endpoints; secret fallbacks | Close endpoints; fail closed; secret manager | 21 |
| AUTH | **GAP** | OTP bypass/devCode; non-revocable tokens | Prod gate; sessions | 7 |
| RBAC | **BLOCKED** | Flat requireAdmin | Permission matrix + branch scope | 11 |
| PAYMENT | **BLOCKED** | Simulate + stub webhooks | Real providers + verify + remove open simulate | 8 |
| INVENTORY | **BLOCKED** | Consume-at-create | Implement Q1 reserve model | 1,14 |
| ORDER | **GAP** | Legacy status; no axes in schema | Three-axis implementation | 2 |
| CASHBACK | **GAP** | USE at create; earn path open via delivery | Ledger + timing + AuthZ on complete | 4,5 |
| DELIVERY | **BLOCKED** | Unauthenticated status | AuthZ + verified complete | 9 |
| FOM | **OPEN/BLOCKED** | No contract; open endpoint | Authenticated contract (Q3) | 3 |
| NOTIFICATIONS | **GAP** | OTP SMS only; sync | Outbox workers | 10,16 |
| DATABASE | **GAP** | Bootstrap/push; PGlite | Versioned migrations + prod PG | 19 |
| MIGRATIONS | **BLOCKED** | No migrations/ | Adopt versioned migrations | 19 |
| API | **GAP** | No versioning/pagination/idempotency | Harden per Q17 | 17 |
| JOBS | **GAP** | None | Outbox/workers | 16 |
| OBSERVABILITY | **GAP** | Pino + healthz | Metrics/alerts/IDs | 18 |
| INFRASTRUCTURE | **GAP** | Replit + docs | Topology + staging + CI/CD | 20 |
| TESTING | **BLOCKED** | Zero automated tests | Critical suite + CI gates | 22 |
| PERFORMANCE | **BLOCKED** | No load tests | Load/stress before capacity claims | 23 |
| BACKUP/DR | **BLOCKED** | Checklist only | Backups + restore drills | 19,20 |

Legend: **READY** = none for production cutover; most are GAP/BLOCKED/OPEN.

## 8. Remaining open decisions

- Q3 FOM semantics / auth contract  
- Payme/Click production contracts  
- Delivery business policies (COD, POD, zones, fees)  
- Loyalty numeric/business rules  
- Promotion stacking/eligibility  
- OTP numeric policy  
- Admin role/permission matrix  
- Cloud provider/topology  
- Monitoring provider  
- Backup schedule / RPO / RTO  
- Load-test targets / exact capacity  
- MFA policy  

## 9. Final recommendation

1. **Do not ship production traffic** on current runtime without clearing A-blockers.  
2. Treat Q1–Q20 locks as the implementation constitution.  
3. Priority sequence: **security endpoints + auth bypasses → payments verify → inventory reservation → RBAC → migrations/backups → tests/CI → outbox/workers → observability → load test → staged deploy**.  
4. Resolve **Q3** before locking pickup earn/completion wiring.  
5. Preserve Expo mobile foundation; evolve backend toward locked architecture.

---

# Cross-domain final rules (preserve)

1. PostgreSQL = business truth  
2. Redis = non-authoritative  
3. Client untrusted  
4. Server controls business state  
5. Money/inventory transactional + idempotent  
6. External callbacks authenticated + idempotent  
7. Workers at-least-once + idempotent  
8. Versioned migrations  
9. Protected secrets  
10. Automated tests for critical flows  
11. Load testing before capacity claims  
12. Full-stack observability  
13. Tested backup/restore  
14. Provider failure isolation  
15. Preserve existing UI/mobile foundation  

---

## Consistency

Q1–Q20 not reopened. Q3 remains OPEN.

---

**Q21 + Q22 + Q23 + Q24 ANALYSIS COMPLETE — NO IMPLEMENTATION PERFORMED — FINAL SECURITY/TESTING/PERFORMANCE/PRODUCTION READINESS AUDIT COMPLETE.**
