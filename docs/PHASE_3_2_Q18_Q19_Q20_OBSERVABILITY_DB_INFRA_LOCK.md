# Q18 + Q19 + Q20 LOCK — Observability, Database/Migration Safety, Infrastructure/Deployment

**Status:** LOCKED (technical architecture principles only)  
**Mode:** Documentation / design only — **no application implementation**  
**Depends on:** Q16–Q17 locks; Q18–Q20 analysis; Phase 3.1 migration direction  
**Does not lock:** Monitoring/cloud providers, numeric RPO/RTO, pool sizes, alert thresholds, SLO numbers  
**Must not reopen:** Q1–Q17; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision IDs | Q18 (observability), Q19 (database/migrations), Q20 (infrastructure/deployment) |
| Implementation | Forbidden in this phase |
| Schema / migrations / API / UI / `.env` / packages / deploy config | Not modified in this phase |
| Prior analysis | [`PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_ANALYSIS.md`](PHASE_3_2_Q18_Q19_Q20_OBSERVABILITY_DB_INFRA_ANALYSIS.md) |

---

# Q18 — Observability / logging / monitoring

## LOCKED

1. **Production logging must be structured and machine-readable.**  
   Support where applicable: timestamp, severity, service/module, request ID, correlation ID, event/action, resource ID, branch ID.

2. **NEVER log sensitive information.**  
   Never log: passwords, OTP codes, access/refresh tokens, payment secrets, provider private credentials, unnecessary payment credentials, unnecessary sensitive personal data.

3. **Production requests must support request/correlation IDs.**  
   Important async flows should preserve correlation where possible:

```text
API → DB transaction → outbox → worker → provider → callback
```

4. **Errors must be observable and classified.**  
   Distinguish conceptually: validation, business, authentication, authorization, provider failure, infrastructure failure, unexpected application error.  
   Internal details must not be returned to clients.

5. **Production architecture must support technical and business metrics.**  
   Technical: request count, latency, error rate, DB latency, queue depth, worker failures, provider failures.  
   Business/ops: orders, payments, delivery completion, reservation failures, cashback events.  
   Exact names/thresholds remain **OPEN**.

6. **Health and readiness are separate.**  
   Liveness = process alive. Readiness = safe to receive traffic (may depend on critical dependencies).  
   Do not expose sensitive internals.

7. **Production must support critical alerting.**  
   Classes include: API error spikes, DB unavailable, payment/FOM failures, queue backlog, worker failures, reservation failures, notification failure spikes, authentication abuse, unusual payment/refund activity.  
   Numeric thresholds remain **OPEN**.

8. **Operational logs are NOT a replacement for business audit records.**  
   Audit required for privileged/business-sensitive actions (admin permissions, payment secrets, inventory/cashback adjustments, refunds, privileged order changes, branch config).

9. **Logging must have lifecycle/retention capability.**  
   Exact retention duration remains **OPEN**.

10. **Observability must work across multiple API and worker instances.**  
    Do not depend on one machine’s local log file as the only production observability source.

---

## Q18 OPEN

- monitoring provider  
- metrics backend  
- tracing provider  
- error tracking provider  
- dashboard design  
- alert thresholds  
- log retention duration  
- SLO/SLI numbers  
- exact business metric definitions  

---

## Q18 current gaps (future work)

Do not fix now: OTP/console secret leakage; correlation IDs not echoed; thin audit coverage; no metrics/tracing/alerts; no live/ready split; no multi-instance log aggregation/retention policy.

---

# Q19 — Database / migration production safety

## LOCKED

1. **PostgreSQL is the production source of truth** for durable business data  
   (users, orders, payments, cashback, loyalty, inventory, reservations, products, branches, audit).  
   Redis/cache is never authoritative for these domains.

2. **Production schema changes MUST use versioned, reviewable migrations.**  
   Do **NOT** use uncontrolled: production bootstrap-only schema creation, destructive schema push, force push, automatic uncontrolled schema synchronization.

3. **Production migrations must be:** deterministic, reviewable, compatible with existing data, tested before production, designed to avoid unnecessary long locks, reversible where practical.

4. **Data migrations must preserve business history.**  
   Do not casually delete orders, payments, cashback ledger, inventory movements, reservations, audit history.  
   Duplicate records must be reconciled using deterministic rules.

5. **Production database requires backup and restore capability**  
   (regular backups, verification, restore testing, retention). Exact schedule **OPEN**.

6. **Production requires disaster recovery capability**  
   (backup, restore, recovery procedure, ownership, data-loss tolerance, recovery-time expectations).  
   Do not invent numeric RPO/RTO.

7. **Critical money/inventory/reservation/cashback transitions** must use appropriate database transaction boundaries.  
   Do not require one giant transaction for everything.

8. **Critical concurrent operations must be concurrency-safe**  
   (inventory reservation, cashback spend, payment capture, refund, promotion usage, order transitions).

9. **Important business invariants should be enforced close to the database** where practical  
   (unique identity, branch/product uniqueness, one commercial EARNED/USED, payment capture uniqueness, foreign-key integrity).

10. **Indexes must be query-driven**  
    (users/phone, products/identifiers, branches, inventory, reservations, orders/items, payments, cashback, delivery, audit, integration events).  
    Do not create indexes blindly.

11. **Production DB access must use controlled connection pooling**  
    (API instances, workers, admin traffic, background jobs, DB max connections).

12. **Production DB operations need timeout/cancellation protection.**  
    Slow queries must not consume resources indefinitely.

13. **Read replicas, partitioning, and sharding remain deferred** until workload evidence requires them.

---

## Q19 OPEN

- PostgreSQL cloud provider  
- backup schedule  
- retention period  
- RPO / RTO  
- read replicas  
- partitioning / sharding  
- pool sizes  
- exact query timeout values  
- database monitoring provider  

---

## Q19 current gaps (future work)

Do not fix now: versioned migrations absent; bootstrap/push risk; missing constraints/indexes; weak transactions; default pooling; no backup/restore scripts; seed-on-empty-DB risk; PGlite vs PG discipline.

---

# Q20 — Infrastructure / deployment / cloud / scaling

## LOCKED

1. **Environments must be separated:** development, staging, production.  
   Production credentials/configuration must not be reused in development.

2. **Secrets must never be committed to source control** and never exposed to clients.  
   Production secrets must eventually use appropriate secure secret management.

3. **Production API/admin/customer traffic must use HTTPS/TLS.**

4. **Architecture must support horizontally scalable API instances** behind an appropriate traffic layer where justified (load balancer, WAF, CDN/edge).  
   Do not select a vendor.

5. **API instances must be stateless for correctness.**  
   Do not depend on process-local state for: sessions, business truth, rate limiting correctness, inventory, money, orders.  
   Shared/durable systems must own durable state.

6. **Workers must scale independently from API instances.**

7. **Redis may support:** caching, rate limiting, queue coordination, temporary distributed locks where justified.  
   Redis **MUST NOT** become source of truth for: money, inventory, orders, reservations, cashback.

8. **Appropriate object storage** must be used for large files/media rather than putting large binary data unnecessarily into PostgreSQL. Access must be controlled.

9. **Production deployment must eventually use controlled CI/CD** supporting: build validation, tests, migration validation, versioned artifacts, controlled deployment, rollback capability.

10. **Staging/pre-production must be used before production where practical.**  
    Staging must never accidentally use destructive production credentials.

11. **Production rollout must support safe deployment and rollback.**

12. **Architecture direction must support:** 200+ branches initially, 1000+ future, thousands of concurrent users.  
    Do **NOT** claim exact throughput. Capacity must be proven through load/stress testing.

13. **External dependency failures must be isolated**  
    (SMS ≠ stop catalog; payment ≠ corrupt inventory; delivery provider ≠ corrupt order truth; notification ≠ rollback commerce; analytics ≠ stop checkout).

14. **Internal infrastructure services should not be publicly exposed unnecessarily.**

15. **Health/readiness must be usable by load balancers/orchestrators.**

16. **Infrastructure must have a documented recovery path** for: database, API, worker, Redis, external provider, host/region failure where applicable.  
    Do not claim specific RPO/RTO.

---

## Q20 OPEN

- cloud provider  
- exact deployment topology  
- Kubernetes vs managed containers/VMs  
- CDN / WAF / Redis / object storage / CI/CD providers  
- autoscaling thresholds  
- exact instance sizes  
- exact network topology  
- load-testing capacity targets  
- RPO/RTO numbers  

---

## Q20 current gaps (future work)

Do not fix now: production topology; cloud selection; staging incomplete; secrets mgmt incomplete; LB/WAF/CDN incomplete; worker deploy incomplete; CI/CD incomplete; rollback incomplete; monitoring incomplete; backup/DR incomplete; autoscaling/load testing incomplete; network isolation incomplete.

---

# Cross-domain locks

**LOCKED:**

1. PostgreSQL = durable business truth  
2. Redis = non-authoritative support system  
3. Production secrets are externalized/protected  
4. API and workers are independently scalable  
5. External dependency failures are isolated  
6. Production schema changes use controlled versioned migrations  
7. Staging precedes production where practical  
8. Production deployment has rollback capability  
9. Capacity claims require load/stress testing  
10. Health/readiness support deployment decisions  
11. Observability spans API, workers, DB, providers, and infrastructure  
12. Disaster recovery exists architecturally  

---

# LOCKED vs OPEN

## Q18 LOCKED

| Principle |
|-----------|
| Structured logs |
| Sensitive-data redaction |
| Correlation/request IDs |
| Error observability |
| Technical/business metrics capability |
| Health/readiness separation |
| Alerting capability |
| Audit separate from logs |
| Retention capability |
| Multi-instance observability |

## Q18 OPEN

Providers; tracing; metrics backend; thresholds; retention duration; dashboards; SLO/SLI numbers.

## Q19 LOCKED

| Principle |
|-----------|
| PostgreSQL source of truth |
| Versioned migrations |
| Migration safety |
| History preservation |
| Backups/restore capability |
| Disaster recovery |
| Appropriate transactions |
| Concurrency safety |
| DB constraints |
| Query-driven indexes |
| Connection pooling |
| Timeout/cancellation protection |

## Q19 OPEN

Provider; backup schedule; retention; RPO/RTO; replicas; partitioning; sharding; pool sizes; timeout values.

## Q20 LOCKED

| Principle |
|-----------|
| Environment separation |
| Secrets management |
| HTTPS/TLS |
| Horizontal API scaling |
| Load-balancer/edge capability |
| Stateless API |
| Independently scalable workers |
| Redis non-authoritative role |
| Object storage |
| Controlled CI/CD |
| Staging |
| Safe deployment/rollback |
| 200→1000+ architecture direction |
| Failure isolation |
| Network security |
| Health/readiness |
| Disaster recovery |

## Q20 OPEN

Cloud provider; exact topology; K8s vs managed; CDN/WAF; Redis/object storage/CI providers; autoscaling thresholds; instance sizes; network design; capacity targets; RPO/RTO.

---

# Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1–Q2, Q4–Q17 | Not reopened |
| Q3 FOM | Remains **OPEN** |
| Q7/Q8 secrets & OTP | Reinforced — never log |
| Q10/Q16 outbox/workers | Reinforced — correlation + independent scale |
| Q11 audit | Reinforced — audit ≠ logs |
| Q17 API reliability | Reinforced — health/readiness, errors |
| Phase 3.1 §H migrations | Reinforced |

---

**Q18 + Q19 + Q20 LOCK COMPLETE — OBSERVABILITY/DATABASE/INFRASTRUCTURE ARCHITECTURE LOCKED — OPEN PROVIDER/POLICY DETAILS REMAIN OPEN — NO IMPLEMENTATION PERFORMED.**
