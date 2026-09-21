# Q21 + Q22 + Q23 + Q24 FINAL LOCK — Security, Testing, Performance, Production Readiness

**Status:** LOCKED (final architecture principles + production-readiness findings)  
**Mode:** Documentation / design only — **no application implementation**  
**Depends on:** Q1–Q20 locks; Q21–Q24 analysis  
**Does not lock:** MFA, coverage %, RPS/SLO numbers, cloud/monitoring vendors, business policy catalogs  
**Must not reopen:** Q1–Q20; **Q3 remains OPEN**  
**Blockers:** Recorded — **not fixed** in this step

---

## Document control

| Item | Value |
|------|--------|
| Decision IDs | Q21 (security), Q22 (testing), Q23 (performance), Q24 (final readiness) |
| Implementation | Forbidden in this phase |
| Schema / migrations / API / UI / `.env` / packages / deploy | Not modified |
| Prior analysis | [`PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_ANALYSIS.md`](PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_ANALYSIS.md) |

---

# Q21 — Security / data protection

## LOCKED

1. **Client is untrusted.** Server is authoritative for: identity, authentication, authorization, branch scope, price, payment state, inventory, reservation state, order state, cashback, loyalty.

2. **Privileged operations require server-side authorization.**

3. **Branch isolation must be enforced server-side.**

4. **External callbacks/webhooks must be:** authenticated, verified, idempotent, replay/duplicate safe, audit-capable.

5. **Secrets must never be exposed to clients.**

6. **Never log:** OTP codes, passwords, authentication tokens, payment secrets, provider private credentials, unnecessary sensitive personal data.

7. **Development bypasses must not exist in production.**  
   Examples: `devCode`, `000000`, `simulate-success`, seed/default credentials, development-only authentication bypasses.

8. **Security failures must fail closed.**

9. **External providers must be treated as untrusted until authenticated/verified.**

10. **Security controls must work across multiple API instances and workers.**

11. **Redis/cache must not be the sole authority for security-critical state.**

12. **File uploads are untrusted input** and require validation/security controls.

13. **Sensitive data must be exposed according to role and least privilege.**  
    Customer, cashier, courier, admin, and super-admin access must be separated according to RBAC.

14. **Security-sensitive administrative actions require auditability.**

---

## Q21 OPEN

- MFA policy  
- exact password/session policy  
- exact rate limits  
- WAF/security provider  
- vulnerability scanner  
- penetration testing schedule  
- compliance/legal policy  
- exact data retention policy  

---

## Q21 known gaps (not fixed now)

Unauthenticated delivery status / simulate-success / FOM sale; OTP bypasses; default secrets; seed credentials; flat RBAC; payment secret ACL; sensitive field exposure; non-revocable tokens; Telegram auto-provision; in-memory rate limits.

---

# Q22 — Testing / QA

## LOCKED

1. **Production-critical business rules require automated tests**  
   (authN/AuthZ, branch isolation, order transitions, payment states, inventory reserve/release/consume, cashback earn/spend/reversal, promotions, reservation expiry, delivery transitions, webhook/FOM/refund idempotency).

2. **Pure business rules must be independently testable**  
   (pricing, promotion rules, cashback, loyalty, state transitions, eligibility).

3. **Critical cross-domain flows require integration tests**  
   (ORDER→RESERVATION→PAYMENT→FULFILLMENT→CASHBACK; FOM→COMMERCIAL→CASHBACK; REFUND→PAYMENT→CASHBACK REVERSAL).

4. **Concurrency-sensitive operations require race/concurrency tests.**

5. **Production migrations must be tested against representative existing data.**

6. **Critical customer journeys should eventually have E2E coverage.**

7. **Production deployment requires quality gates** conceptually:  
   lint/typecheck → unit → integration → migration validation → security checks → build → staging → controlled production.  
   Exact CI implementation remains **OPEN**.

---

## Q22 OPEN

- exact coverage percentage  
- test framework / E2E framework  
- CI provider  
- staging dataset  
- release approval mechanism  
- security test cadence  
- load-test schedule  

---

## Q22 known gaps (not fixed now)

Zero automated unit/integration/E2E/load tests found in repository; no CI test gate.

---

# Q23 — Performance / scalability

## LOCKED

1. Architecture direction supports: **200+ branches** initially, **1000+ future**, **thousands of concurrent users**.

2. **DO NOT claim exact throughput or concurrency guarantees without measurement.**

3. **Capacity must be established through realistic load/stress testing.**

4. Load testing must eventually cover: OTP/login, catalog, search, product detail, cart, checkout, inventory reservation, payment callbacks, cashback, order status, delivery, admin, notification workers, FOM events.

5. **Collection APIs must be bounded/paginated.**

6. **Heavy operations must not unnecessarily block synchronous HTTP requests.**

7. **Database queries must avoid obvious N+1 patterns.**

8. **Inventory critical sections must remain short.**

9. **External provider calls must not unnecessarily hold database transactions open.**

10. **Retryable/long-running work belongs in background jobs.**

11. **Caching may improve performance but never becomes business truth.**

12. **API instances must be horizontally scalable.**

13. **Worker capacity must scale independently from API capacity.**

14. **Connection pooling must account for total API + worker concurrency.**

15. **Performance optimization must be evidence-driven.**

---

## Q23 OPEN

- exact RPS / concurrent-user target / latency SLO  
- DB / Redis sizing  
- worker / API instance counts  
- autoscaling thresholds  
- load-test framework  
- CDN/cache strategy  
- search engine  

---

## Q23 known gaps (not fixed now)

No benchmarks/load tests; unbounded catalog/lists; sync SMS; no workers; likely PGlite/in-memory rate-limit bottlenecks (unmeasured).

---

# Q24 — Final production readiness

## Classification

| Class | Meaning |
|-------|---------|
| **A** | BLOCKER BEFORE PRODUCTION |
| **B** | REQUIRED BEFORE PRODUCTION SCALE |
| **C** | IMPORTANT AFTER INITIAL PRODUCTION |
| **D** | FUTURE / OPTIONAL |

---

## Q24 A — Current production blockers

Confirmed by repository evidence (not fixed in this step):

| # | Blocker | Evidence basis |
|---|---------|----------------|
| 1 | Open/unauthenticated privileged endpoints | Delivery status; FOM sale; payment simulate-success |
| 2 | Payment simulation/stub flow | Local HTML + `simulate-success`; Payme/Click webhooks echo-only |
| 3 | Development OTP/authentication bypasses | `devCode`, `000000` when Eskiz unset; SMS console OTP |
| 4 | Default/seed production-inappropriate credentials or secrets | Hardcoded HMAC fallbacks; seed passwords |
| 5 | Flat/insufficient RBAC | `requireAdmin` only; cashier can access HQ admin APIs |
| 6 | Inventory consume-at-create vs locked reservation architecture | `product_stocks.quantity` decremented at order create |
| 7 | Non-idempotent checkout/payment-sensitive mutations | No checkout Idempotency-Key; open simulate path |
| 8 | Lack of controlled versioned production migrations | Bootstrap + `drizzle-kit push` only; no migrations/ |
| 9 | Lack of production backup/restore capability | Checklist/docs only; no scripts/process in repo |
| 10 | Lack of critical automated tests | No `*.test`/`*.spec` or test scripts found |
| 11 | Lack of load/stress validation | No benchmarks in repo |
| 12 | PGlite/local-demo unsuitable as production database | Dual-mode fallback; PRODUCTION.md forbids for prod traffic |

No additional blockers invented beyond this evidence set.

---

## Q24 B — Required before scale

Not claimed as implemented:

- distributed rate limiting  
- durable outbox  
- worker architecture  
- retry/DLQ  
- production RBAC  
- real payment provider integration  
- revocable sessions  
- API versioning/hardening  
- pagination  
- observability (metrics/alerts/correlation)  
- multi-instance API  
- staging  
- CI/CD  
- production secrets management  
- webhook authentication/idempotency  
- backup/DR validation  
- load testing  

---

## Q24 C — Post-initial-production

Based on audit findings (important, not A/B blockers for first careful cutover after A cleared):

- advanced promotion engine  
- advanced delivery tracking / POD  
- MFA  
- advanced search  
- read replicas / partitioning when evidence requires  
- additional analytics  
- advanced performance optimization  

---

## Q24 D — Future / optional

- external delivery providers beyond initial scope  
- compliance certifications  
- sharding  
- heavy personalization  

Do not prematurely require.

---

## Q24 final target architecture

```text
CUSTOMER MOBILE
        ↓
HTTPS / WAF / LOAD BALANCER
        ↓
VERSIONED API
        ↓
MODULAR MONOLITH
        ↓
PostgreSQL = business truth
        ↕
Redis = cache / rate-limit / coordination only
        ↓
DURABLE OUTBOX
        ↓
WORKERS
        ↓
EXTERNAL PROVIDERS (Payment | SMS | Delivery | FOM | Notifications)

Supporting: Object Storage | Observability | Audit | CI/CD | Staging | Production | Backup/DR
```

**Preserve existing Expo/mobile UI foundation. Do not rewrite the mobile application.**

---

## Q24 production readiness checklist

| DOMAIN | STATUS | EVIDENCE | REQUIRED NEXT ACTION | RELATED Q |
|--------|--------|----------|----------------------|-----------|
| Security | **BLOCKED** | Open privileged endpoints; secret fallbacks | Close endpoints; fail closed; secret hygiene | 21 |
| Auth | **GAP** | OTP bypass/devCode; non-revocable tokens | Production gates; revocable sessions | 7, 21 |
| RBAC | **BLOCKED** | Flat `requireAdmin` | Permission matrix + branch scope | 11, 21 |
| Payment | **BLOCKED** | Simulate + stub webhooks | Real PSP + verify; remove open simulate | 8, 21 |
| Inventory | **BLOCKED** | Consume-at-create | Implement Q1 reservation model | 1, 13, 14 |
| Orders | **GAP** | Legacy single status | Three-axis implementation | 2 |
| Cashback | **GAP** | USE at create; open complete paths | Ledger authority + AuthZ on earn | 4, 5 |
| Delivery | **BLOCKED** | Unauthenticated status | Authorized verified completion | 9, 21 |
| FOM | **OPEN** | No written contract; open endpoint | Authenticated FOM contract (Q3) | 3 |
| Notifications | **GAP** | OTP SMS sync only | Outbox + workers | 10, 16 |
| Database | **GAP** | PG/PGlite; missing constraints | Prod PG + constraints | 19 |
| Migrations | **BLOCKED** | No versioned migrations | Adopt versioned migrations | 19 |
| API | **GAP** | No versioning/pagination/idempotency | Harden per Q17 | 17 |
| Jobs | **GAP** | No workers/outbox | Implement Q16 | 16 |
| Observability | **GAP** | Pino + healthz | Metrics/alerts/IDs | 18 |
| Infrastructure | **GAP** | Replit + docs intent | Topology + staging + CI/CD | 20 |
| Testing | **BLOCKED** | Zero automated tests | Critical suite + gates | 22 |
| Performance | **BLOCKED** | No load tests | Load/stress before capacity claims | 23 |
| Backup/DR | **BLOCKED** | Docs checklist only | Backups + restore drills | 19, 20 |

The system as a whole is **not READY** while A-blockers remain.

---

## Q24 remaining open decisions

1. Q3 FOM event semantics  
2. Payment provider contracts  
3. Delivery business policies  
4. Loyalty business rules  
5. Promotion business rules  
6. OTP numeric policy  
7. Admin role/permission matrix  
8. Cloud provider/topology  
9. Monitoring provider  
10. Backup / RPO / RTO  
11. Load-test targets  
12. Exact production capacity  
13. Other OPEN items listed under Q1–Q23 locks (thresholds, stacking, fee rules, etc.)  

Do not invent answers.

---

# Final cross-domain principles

**LOCKED:**

1. PostgreSQL is durable business truth.  
2. Redis is non-authoritative.  
3. Client is untrusted.  
4. Server controls business state.  
5. Money/inventory require transactional and idempotent safety.  
6. External callbacks require authentication and idempotency.  
7. Workers assume at-least-once execution.  
8. Production schema changes require versioned migrations.  
9. Production secrets are protected.  
10. Critical business flows require automated tests.  
11. Capacity claims require load testing.  
12. Observability spans the full system.  
13. Backup/restore must be tested.  
14. External provider failures must not corrupt unrelated domains.  
15. Existing mobile UI/foundation must be preserved.  

---

# Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1–Q20 | Not reopened — reinforced by final principles |
| Q3 FOM | Remains **OPEN** |

---

**Q21 + Q22 + Q23 + Q24 LOCK COMPLETE — FINAL SECURITY/TESTING/PERFORMANCE/PRODUCTION READINESS ARCHITECTURE LOCKED — PRODUCTION BLOCKERS REMAIN — NO IMPLEMENTATION PERFORMED.**
