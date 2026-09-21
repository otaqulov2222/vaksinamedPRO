# PHASE 3.2 — Business Decisions (progressive lock)

**Mode:** Documentation only. No application implementation.

---

## Q1 — Inventory cutover — LOCKED

| Field | Value |
|-------|--------|
| Decision | `NEW_RESERVATIONS_ONLY` |
| Canonical | `docs/PHASE_3_1_REQUIRED_FIXES_LOCK.md` §A |
| P4 implementation architecture | [`PHASE_3_2_P4_INVENTORY_ARCHITECTURE_LOCK.md`](PHASE_3_2_P4_INVENTORY_ARCHITECTURE_LOCK.md) (**LOCKED** — docs only; not yet implemented) |

---

## Q2 — Order state model — LOCKED

| Field | Value |
|-------|--------|
| Decision | Three-axis: `fulfillment_status` × `payment_status` × `reservation_status` |
| Canonical | [`PHASE_3_2_Q2_ORDER_STATE_LOCK.md`](PHASE_3_2_Q2_ORDER_STATE_LOCK.md) |

---

## Q3 — FOM confirmation / sale semantics — OPEN

| Field | Value |
|-------|--------|
| Status | **OPEN** — pending written FOM event semantics |

---

## Q4 — Cashback architecture — LOCKED

| Field | Value |
|-------|--------|
| Decision | Commercial identity; one EARNED; shared idempotent earn; ledger/account truth; PAID ≠ earn; delivery earn on COMPLETED; pickup earn depends on Q3; spend server-side configurable (target 30%); reversals required |
| Canonical | [`PHASE_3_2_Q4_CASHBACK_LOCK.md`](PHASE_3_2_Q4_CASHBACK_LOCK.md) |
| P6 implementation architecture | [`PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md`](PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md) (**LOCKED** — docs only; not yet implemented) |

---

## Q5 — Refund / cashback reversal — TECHNICAL LOCKED; BUSINESS POLICY OPEN

| Field | Value |
|-------|--------|
| Technical | Immutable EARNED; separate REVERSAL; idempotent refund identity; total reverse ≤ earned; commercial link; atomic account update; concurrency/money precision/audit |
| Business OPEN | Partial formula; already-used cashback; debt/block; promos; rounding; FOM/PSP refund contract; USE reverse on cancel |
| Canonical | [`PHASE_3_2_Q5_REFUND_REVERSAL_SAFETY_LOCK.md`](PHASE_3_2_Q5_REFUND_REVERSAL_SAFETY_LOCK.md) |
| P6 implementation architecture | Technical reversal paths under [`PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md`](PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md); partial formula remains OPEN |

---

## Q6 — Loyalty architecture principles — LOCKED; BUSINESS POLICY OPEN

| Field | Value |
|-------|--------|
| Locked | Loyalty ≠ cashback ledger; auditable history; eligible completion ≠ PAID alone; no silent inflation from cancel/refund; idempotent evaluation; earn amount immutable; rate snapshot; config-driven direction; REVERSAL ≠ auto downgrade; admin overrides RBAC if enabled; concurrency/retry safe |
| Business OPEN | Level names/count; thresholds; rates; upgrade/downgrade/inactivity/evaluation periods; refund→loyalty; partial refund→loyalty; admin override availability; promo precedence; effective dates; multi-level jump |
| Canonical | [`PHASE_3_2_Q6_LOYALTY_ARCHITECTURE_LOCK.md`](PHASE_3_2_Q6_LOYALTY_ARCHITECTURE_LOCK.md) |

---

## Q7 — Auth / OTP / session security architecture — LOCKED; NUMERIC POLICY OPEN

| Field | Value |
|-------|--------|
| Locked | E.164 phone identity + unique after cleanup; OTP hash/single-use/expiry/attempt+rate limits/concurrency-safe; no prod bypass/logging; distributed rate limits; revocable sessions; access vs renewable auth state; AuthN≠AuthZ; admin hardening; Telegram cannot silent-bypass; enumeration minimization; session registry; auth audit; secrets hygiene; PG identity / Redis temp |
| Open | Exact TTL/attempts/cooldowns/rates/lockout; token lifetimes/format; max devices; admin MFA; suspicious-login; SMS retry; Telegram UX; password/PIN secondary design |
| Analysis | [`PHASE_3_2_Q7_AUTH_OTP_SESSION_ANALYSIS.md`](PHASE_3_2_Q7_AUTH_OTP_SESSION_ANALYSIS.md) |
| Canonical | [`PHASE_3_2_Q7_AUTH_OTP_SECURITY_LOCK.md`](PHASE_3_2_Q7_AUTH_OTP_SECURITY_LOCK.md) |

---

## Q8 — Payment architecture / financial safety — LOCKED; PROVIDER CONTRACTS OPEN

| Field | Value |
|-------|--------|
| Locked | Payment ≠ fulfillment; server-authoritative payment; provider verify; intent/attempt/txn model; one capture; provider txn IDs; callback/refund idempotency; server amounts; exact money; secrets private; refund ≠ cashback REVERSAL; reconciliation required; retry-safe; PAID ≠ earn; payment ≠ inventory truth; auditable; client cannot set financial state |
| Open | Payme/Click contracts; signatures; methods; expiry/retry; pay-at-pickup; COD; refund business; reconcile frequency; secret ACL; FOM payment behavior; provider state maps |
| Analysis | [`PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_ANALYSIS.md`](PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_ANALYSIS.md) |
| Canonical | [`PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_LOCK.md`](PHASE_3_2_Q8_PAYMENT_ARCHITECTURE_LOCK.md) |

---

## Q9 — Delivery architecture / delivery safety — LOCKED; BUSINESS POLICIES OPEN

| Field | Value |
|-------|--------|
| Locked | Delivery ≠ order/payment/inventory/cashback; PICKUP≠DELIVERY channel; backend-controlled transitions; verified completion; FOM cannot bypass; courier actor+auth; assignment domain; immutable address snapshot; server fee; zone abstraction; internal/external providers; callback/idempotency/concurrency; failure states; cancel safety; Q1/Q4/Q8 boundaries; auditable; POD+tracking capability; scale direction |
| Open | Exact enums/maps; courier role model; assignment algorithm; zones/fees/ETA; POD method; providers; tracking; fail/return/cancel/COD/pay-at-delivery policies; hours/distance; address edit; notifications |
| Analysis | [`PHASE_3_2_Q9_DELIVERY_ARCHITECTURE_ANALYSIS.md`](PHASE_3_2_Q9_DELIVERY_ARCHITECTURE_ANALYSIS.md) |
| Canonical | [`PHASE_3_2_Q9_DELIVERY_ARCHITECTURE_LOCK.md`](PHASE_3_2_Q9_DELIVERY_ARCHITECTURE_LOCK.md) |

---

## Q10 — Notifications architecture — LOCKED; CHANNEL/PROVIDER POLICIES OPEN

| Field | Value |
|-------|--------|
| Locked | Notify failure ≠ business rollback; async commerce notify; durable outbox; idempotent dispatch; retry/DLQ; provider abstraction; Q7 OTP boundary; no secrets in payloads; multi-instance safe; auditable attempts; preferences ≠ business truth; localization = presentation |
| Open | Channels per event; providers; retry counts/timing; templates; preferences; languages; admin alerts; history UI; event catalog |
| Analysis | [`PHASE_3_2_Q10_Q11_NOTIFICATIONS_ADMIN_RBAC_ANALYSIS.md`](PHASE_3_2_Q10_Q11_NOTIFICATIONS_ADMIN_RBAC_ANALYSIS.md) §Q10 |
| Canonical | [`PHASE_3_2_Q10_Q11_NOTIFICATIONS_ADMIN_RBAC_LOCK.md`](PHASE_3_2_Q10_Q11_NOTIFICATIONS_ADMIN_RBAC_LOCK.md) §Q10 |

---

## Q11 — Admin / RBAC architecture — LOCKED; ROLE/PERMISSION POLICIES OPEN

| Field | Value |
|-------|--------|
| Locked | AuthN≠AuthZ; server-side AuthZ; RBAC + optional branch scope; branch isolation; restricted payment secrets; privileged audit; revocable admin sessions; login abuse protection; MFA capability; anti-escalation; courier AuthZ separate; workers cannot bypass AuthZ |
| Open | Role catalog; permission matrix; branch scope model; MFA mechanism; session TTL/devices; secret owners; cashier admin-web; cross-branch customer visibility; admin UI |
| Analysis | [`PHASE_3_2_Q10_Q11_NOTIFICATIONS_ADMIN_RBAC_ANALYSIS.md`](PHASE_3_2_Q10_Q11_NOTIFICATIONS_ADMIN_RBAC_ANALYSIS.md) §Q11 |
| Canonical | [`PHASE_3_2_Q10_Q11_NOTIFICATIONS_ADMIN_RBAC_LOCK.md`](PHASE_3_2_Q10_Q11_NOTIFICATIONS_ADMIN_RBAC_LOCK.md) §Q11 |

---

## Q12 — Catalog / search architecture — LOCKED; SEARCH/CONTENT POLICIES OPEN

| Field | Value |
|-------|--------|
| Locked | Identity ≠ name; catalog ≠ inventory; availability from Q1; price snapshots; server prices; paginated searchable catalog; scale design; product lifecycle; multilingual capability |
| Open | Search engine/ranking/typo/synonym; languages; approval/archival; OOS UX; FOM product sync; images; branch pricing |
| Analysis | [`PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_ANALYSIS.md`](PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_ANALYSIS.md) §Q12 |
| Canonical | [`PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_LOCK.md`](PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_LOCK.md) §Q12 |

---

## Q13 — Cart / checkout / pricing architecture — LOCKED; CART/PROMO POLICIES OPEN

| Field | Value |
|-------|--------|
| Locked | Cart ≠ order; server checkout; validate→price→reserve→order→pay; unpaid ≠ permanent consume; checkout idempotency; order snapshots; server promos; cashback under Q4/Q5; exact money formula; branch/channel validation |
| Open | Cart expiry/qty limits; price lock duration; promo stacking; cashback timing details; fee rules; address edit; idempotency-key design; unpaid TTL; guest cart; tax |
| Analysis | [`PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_ANALYSIS.md`](PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_ANALYSIS.md) §Q13 |
| Canonical | [`PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_LOCK.md`](PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_LOCK.md) §Q13 |

---

## Q14 — Inventory deep-dive architecture — LOCKED; OPERATIONAL WORKFLOWS OPEN

| Field | Value |
|-------|--------|
| Locked | PG inventory truth; physical/reserved/available; reservation lifecycle; no double reserve/consume/release; concurrency; oversell protection; movement audit; FOM no-write without contract; UNIQUE branch+product after merge; transfers/reconciliation capability; scale |
| Open | Transfer workflow; reconcile workflow; TTL/adjustment reason codes; POS consume policy details under Q1 |
| Analysis | [`PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_ANALYSIS.md`](PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_ANALYSIS.md) §Q14 |
| Canonical | [`PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_LOCK.md`](PHASE_3_2_Q12_Q13_Q14_CATALOG_CHECKOUT_INVENTORY_LOCK.md) §Q14 |
| P4 implementation architecture | [`PHASE_3_2_P4_INVENTORY_ARCHITECTURE_LOCK.md`](PHASE_3_2_P4_INVENTORY_ARCHITECTURE_LOCK.md) (**LOCKED** — docs only; not yet implemented) |

---

## Q15 — Promotions / pricing rules — LOCKED; STACKING/ELIGIBILITY OPEN

| Field | Value |
|-------|--------|
| Locked | Server pricing; deterministic/explainable; base≠promo; immutable history; effective dates; concurrency-safe usage limits; auditable application; promo≠inventory/payment truth; must not bypass cashback/loyalty |
| Open | Stacking; priority; exclusive/combinable; eligibility; min/max; targeting; cashback/loyalty/fee interaction; exact limits; timezone |
| Analysis | [`PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_ANALYSIS.md`](PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_ANALYSIS.md) §Q15 |
| Canonical | [`PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_LOCK.md`](PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_LOCK.md) §Q15 |

---

## Q16 — Background jobs / queues / outbox — LOCKED; RETRY/TOPOLOGY OPEN

| Field | Value |
|-------|--------|
| Locked | Durable outbox; transactional with business change; at-least-once; idempotent workers; retry/backoff/DLQ; multi-instance; Redis≠money/inventory truth; repeat-safe schedules; observability; worker AuthZ bounds; no blocking HTTP for long work |
| Open | Exact outbox impl; Redis vs BullMQ; retry counts/timing; DLQ retention; which events first |
| Analysis | [`PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_ANALYSIS.md`](PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_ANALYSIS.md) §Q16 |
| Canonical | [`PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_LOCK.md`](PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_LOCK.md) §Q16 |

---

## Q17 — API architecture / reliability — LOCKED; FORMAT DETAILS OPEN

| Field | Value |
|-------|--------|
| Locked | Versioned APIs; server validation; safe error model; mutation idempotency; bounded pagination; server AuthZ; webhook auth/idempotency; correlation IDs; async offload; upload security capability; observability; health/readiness separation |
| Open | Exact version/error/idempotency/pagination formats; CORS; metrics/SLOs; health dependency policy |
| Analysis | [`PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_ANALYSIS.md`](PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_ANALYSIS.md) §Q17 |
| Canonical | [`PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_LOCK.md`](PHASE_3_2_Q15_Q16_Q17_PROMOTIONS_JOBS_API_LOCK.md) §Q17 |

---

## Q18 — Observability — LOCKED; PROVIDER/THRESHOLD DETAILS OPEN

| Field | Value |
|-------|--------|
| Locked | Structured logs; no secrets/OTP in logs; correlation IDs; error classification; metrics capability; health≠readiness; alerting capability; audit≠logs; retention capability; multi-instance observability |
| Open | Monitoring/tracing/metrics/error providers; dashboards; alert thresholds; retention duration; SLO/SLI; exact business metric definitions |
| Analysis | [`PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_ANALYSIS.md`](PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_ANALYSIS.md) §Q18 |
| Canonical | [`PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_LOCK.md`](PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_LOCK.md) §Q18 |

---

## Q19 — Database / migration safety — LOCKED; PROVIDER/RPO DETAILS OPEN

| Field | Value |
|-------|--------|
| Locked | PG production truth; versioned migrations; migration safety; history preservation; backups/restore; DR capability; appropriate transactions; concurrency; DB constraints; query-driven indexes; pooling; timeouts; replicas/partition/shard deferred |
| Open | PG provider; backup schedule/retention; RPO/RTO; replicas; partitioning; sharding; pool sizes; timeout values; DB monitoring provider |
| Analysis | [`PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_ANALYSIS.md`](PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_ANALYSIS.md) §Q19 |
| Canonical | [`PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_LOCK.md`](PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_LOCK.md) §Q19 |

---

## Q20 — Infrastructure / deployment — LOCKED; CLOUD/VENDOR DETAILS OPEN

| Field | Value |
|-------|--------|
| Locked | Env separation; secrets; HTTPS/TLS; horizontal API; edge/LB capability; stateless API; independent workers; Redis non-authoritative; object storage; CI/CD; staging; safe deploy/rollback; 200→1000+ direction; failure isolation; network security; health/readiness; DR |
| Open | Cloud provider; topology; K8s vs managed; CDN/WAF/Redis/object/CI providers; autoscaling thresholds; instance sizes; network design; capacity targets; RPO/RTO |
| Analysis | [`PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_ANALYSIS.md`](PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_ANALYSIS.md) §Q20 |
| Canonical | [`PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_LOCK.md`](PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_LOCK.md) §Q20 |

---

## Q21 — Security / data protection — LOCKED; POLICY DETAILS OPEN

| Field | Value |
|-------|--------|
| Locked | Client untrusted; server authoritative; server AuthZ + branch scope; verified idempotent webhooks; secrets never to clients; never log OTP/tokens/secrets; no prod bypasses; fail closed; providers untrusted until verified; multi-instance controls; Redis≠security authority; untrusted uploads; least-privilege data; privileged audit |
| Open | MFA; password/session policy; rate limits; WAF/scanner; pen-test schedule; compliance; retention |
| Analysis | [`PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_ANALYSIS.md`](PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_ANALYSIS.md) §Q21 |
| Canonical | [`PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_LOCK.md`](PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_LOCK.md) §Q21 |

---

## Q22 — Testing / QA — LOCKED; FRAMEWORK/COVERAGE DETAILS OPEN

| Field | Value |
|-------|--------|
| Locked | Automated tests for critical money/stock/auth/webhooks; unit-testable pure rules; integration flows; concurrency tests; migration tests on representative data; critical E2E journeys; release quality gates |
| Open | Coverage %; frameworks; CI provider; staging dataset; approval mechanism; security/load schedules |
| Analysis | [`PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_ANALYSIS.md`](PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_ANALYSIS.md) §Q22 |
| Canonical | [`PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_LOCK.md`](PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_LOCK.md) §Q22 |

---

## Q23 — Performance / scalability — LOCKED; NUMERIC CAPACITY OPEN

| Field | Value |
|-------|--------|
| Locked | 200→1000+ direction; no unmeasured throughput claims; load/stress required; paginated APIs; async heavy work; short inventory sections; no provider-held DB txs; jobs for retries; cache≠truth; horizontal API; independent workers; pooled connections; evidence-driven optimization |
| Open | RPS/users/SLO; sizing; instance counts; autoscaling; load-test tooling; CDN/cache; search engine |
| Analysis | [`PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_ANALYSIS.md`](PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_ANALYSIS.md) §Q23 |
| Canonical | [`PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_LOCK.md`](PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_LOCK.md) §Q23 |

---

## Q24 — Final production readiness — LOCKED; PRODUCTION BLOCKERS REMAIN

| Field | Value |
|-------|--------|
| Locked | A/B/C/D classification; 12 A-blockers recorded; B scale prerequisites; target architecture; readiness checklist; cross-domain final principles; Expo UI preserved |
| Status | System **not READY** while A-blockers remain — **no implementation in this step** |
| Open | Q3 FOM; PSP contracts; delivery/loyalty/promo policies; OTP numbers; RBAC matrix; cloud/monitoring; RPO/RTO; capacity targets |
| Analysis | [`PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_ANALYSIS.md`](PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_ANALYSIS.md) §Q24 |
| Canonical | [`PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_LOCK.md`](PHASE_3_2_Q21_Q22_Q23_Q24_SECURITY_TESTING_PERF_READINESS_LOCK.md) §Q24 |

---

## Phase 3.3 — Implementation master plan — PLANNING ONLY

| Field | Value |
|-------|--------|
| Status | **PLANNING COMPLETE** — roadmap only; **no implementation performed** |
| Canonical | [`PHASE_3_3_IMPLEMENTATION_MASTER_PLAN.md`](PHASE_3_3_IMPLEMENTATION_MASTER_PLAN.md) |
| First phase (when authorized) | **P1** — Production database foundation + test harness (A8/A12/A10) |
| Blockers | Q24 A-blockers remain until implementation phases clear them |
| Must not reopen | Q1–Q24 locks; Q3 remains OPEN |

---

## Phase 3.3 P1 — Database foundation — IMPLEMENTED

| Field | Value |
|-------|--------|
| Status | **IMPLEMENTED** (P1 only) |
| Canonical | [`PHASE_3_3_P1_DATABASE_FOUNDATION.md`](PHASE_3_3_P1_DATABASE_FOUNDATION.md) |
| Cleared foundation gaps | Versioned migrations path (A8 tooling); PG production gate (A12 discipline); test harness start (A10 foundation) |
| Still remaining | Full A-blocker closure (open endpoints, inventory, payments, etc.) — **P2+** |
| Next | **P2** only when explicitly authorized |

---

## Phase 3.3 P2 — Emergency security lockdown — IMPLEMENTED

| Field | Value |
|-------|--------|
| Status | **IMPLEMENTED** (P2 only) |
| Canonical | [`PHASE_3_3_P2_SECURITY_LOCKDOWN.md`](PHASE_3_3_P2_SECURITY_LOCKDOWN.md) |
| Cleared | Open payment/delivery/FOM/confirm-pos; OTP/dev bypasses; secret fallbacks; passwordHash/secret leaks; minimal HQ AuthZ |
| Deferred | Full Q7 sessions; Q8 PSP; Q9 delivery; Q11 matrix; domain redesigns |
| Next | **P3** only when explicitly authorized |

---

## Phase 3.3 P3 — Sessions / RBAC / authorization — IMPLEMENTED

| Field | Value |
|-------|--------|
| Status | **IMPLEMENTED** (P3 only); post-audit **SAFE TO KEEP ALL** |
| Deferred | Redis rate limits; MFA; full future role catalog |
| Next inventory phase | **P4** only when explicitly authorized |

---

## Phase 3.3 P4 — Inventory architecture — LOCKED (docs only)

| Field | Value |
|-------|--------|
| Status | **ARCHITECTURE LOCKED** — documentation only; **implementation authorized separately** (P4.1–P4.10 completed with cutover gates) |
| Canonical | [`PHASE_3_2_P4_INVENTORY_ARCHITECTURE_LOCK.md`](PHASE_3_2_P4_INVENTORY_ARCHITECTURE_LOCK.md) |
| Preserves | Q1 `NEW_RESERVATIONS_ONLY`; Q14 principles; FOM inventory write block; Q3 OPEN |
| Cutover | [`PHASE_3_3_P4_CUTOVER_GATES.md`](PHASE_3_3_P4_CUTOVER_GATES.md) |

---

## Phase 3.3 P5 — Order architecture — LOCKED / IMPLEMENTED

| Field | Value |
|-------|--------|
| Status | **IMPLEMENTED** (P5.0–P5.8); axes + transition service; legacy `status` compatibility |
| Canonical | [`PHASE_3_3_P5_ORDER_ARCHITECTURE_LOCK.md`](PHASE_3_3_P5_ORDER_ARCHITECTURE_LOCK.md) |
| Compatibility | [`PHASE_3_3_P5_8_LEGACY_STATUS_COMPATIBILITY.md`](PHASE_3_3_P5_8_LEGACY_STATUS_COMPATIBILITY.md) |

---

## Phase 3.3 P6 — Cashback financial safety architecture — LOCKED (docs only)

| Field | Value |
|-------|--------|
| Status | **ARCHITECTURE LOCKED** — documentation only; **no implementation performed** |
| Canonical | [`PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md`](PHASE_3_3_P6_CASHBACK_ARCHITECTURE_LOCK.md) |
| Preserves | Q4/Q5 technical locks; Q3 OPEN for pickup earn; partial refund formula OPEN |
| Implementation | **Forbidden** until P6 implementation is explicitly authorized |
| Next | P6.1–P6.10 only when explicitly authorized |
