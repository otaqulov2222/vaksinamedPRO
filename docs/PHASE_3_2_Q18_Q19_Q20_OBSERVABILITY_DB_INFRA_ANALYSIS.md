# Q18 + Q19 + Q20 BATCH ANALYSIS — Observability, Database/Migrations, Infrastructure/Deployment

**Status:** ANALYSIS ONLY (not a lock)  
**Mode:** Documentation / analysis only — **no application implementation**  
**Must not reopen:** Q1–Q17; **Q3 remains OPEN**

---

## Document control

| Item | Value |
|------|--------|
| Decision IDs | Q18 (observability), Q19 (database/migrations), Q20 (infrastructure/deployment) |
| Implementation | Forbidden in this phase |
| Verdict | Thin Pino+healthz; dual PG/PGlite + bootstrap/push (no versioned migrations/backups); Replit-oriented hosting with PRODUCTION.md intent — Docker/CI/Redis/workers mostly absent |

---

# Q18 — Observability

## 1. Current implementation

| Capability | Status |
|------------|--------|
| Pino structured logs | Exists |
| pino-http access logs | Exists (slim) |
| `/api/healthz` | Exists (DB ping) |
| `audit_log` | Narrow (POS/FOM/branch) |
| Metrics / Prometheus | **Missing** |
| Tracing / APM / Sentry | **Missing** |
| Live vs ready | **Missing** |
| Alerting | **Missing** |

## 2. Logging

- Production: JSON pino; non-prod: pretty  
- Redacts Authorization/Cookie headers  
- Domain logs: POS, FOM, startup, errors  
- **Dangerous:** SMS `console.info` logs full OTP in dev; Eskiz errors via `console.error`  
- Spec: never log OTP (Q7)

## 3. Metrics

None implemented. Needed direction: request count/latency/errors, DB latency, queue depth, job/provider failures, plus business counters (orders, payments, delivery, reservation failures, cashback).

## 4. Request / correlation IDs

Internal `req.id` via pino-http; **not** echoed to clients or error JSON; not propagated to outbox/workers (workers absent).

## 5. Audit vs logs

| Concept | Reality |
|---------|---------|
| Operational logs | Pino |
| Business audit | `audit_log` — incomplete vs privileged ops (Q11) |

Must remain separate — logs cannot replace audit.

## 6. Health / readiness

Only `/api/healthz` (alive+DB). No `/live` vs `/ready` split.

## 7. Alerting

None. Needed classes: API error spikes, DB down, payment/FOM failures, queue backlog, worker failure, reservation failure spikes, auth abuse, unusual refund/payment activity — thresholds OPEN.

## 8. Security

| Good | Gap |
|------|-----|
| Header redaction | OTP in console; admin customer `passwordHash` exposure; no body-field redact; default secrets |

## 9. Current gaps

Structured logging incomplete for domain fields; no correlation to client; OTP log risk; thin audit; no metrics/tracing/alerts; no multi-instance log aggregation; no retention policy implementation.

## 10. Target architecture

```text
API / workers
  → structured logs (+ redaction)
  → correlation IDs across request → outbox → worker → provider
  → metrics + alerts
  → health live vs ready
  → audit tables for privileged business actions (≠ logs)
```

## 11. LOCKED candidates (not locked this turn)

- Structured production logs  
- No secrets/OTP in logs  
- Correlation/request IDs  
- Error observability  
- Technical/business metrics capability  
- Health/readiness separation  
- Critical alerting capability  
- Audit separate from logs  
- Retention capability  
- Multi-instance observability  

## 12. OPEN decisions

Monitoring/tracing/metrics providers; alert thresholds; retention duration; SLO/SLI; dashboard design; business metric definitions.

---

# Q19 — Database / Migrations

## 1. Current database

| Mode | Trigger |
|------|---------|
| PostgreSQL | `DATABASE_URL` postgres(ql) |
| PGlite | Fallback local `.data/pglite` |

Production direction: managed Postgres (`PRODUCTION.md`). PGlite = demo only.

## 2. Schema / migrations

- Schema: Drizzle models + `bootstrap.ts` `CREATE IF NOT EXISTS`  
- Optional `drizzle-kit push` / `push-force`  
- **No** versioned `migrations/` folder  
- Auto-seed on empty DB (demo credentials risk)  
- `auth_otps` in bootstrap/raw SQL only — Drizzle drift  

Phase 3.1 §H requires versioned migrations — **not adopted**.

## 3. Production safety

| Risk | Detail |
|------|--------|
| Bootstrap-only / push | Forbidden as sole prod strategy (Phase 3.1) |
| Seed on prod empty DB | Dangerous credentials |
| No FK / many missing uniques | Duplicate phones/stocks possible |
| Legacy inventory model | Conflicts with Q1 target |

## 4. Transactions

No widespread `db.transaction` for checkout/stock/cashback. Critical domains need appropriate boundaries (Q13/Q14) — gap.

## 5. Constraints

Present: some UNIQUE (sku, telegram_id, receipt_id, order code, …).  
Missing: phone_e164 unique, stock (branch,product), cashback commercial uniques, reservations, FKs, CHECKs.

## 6. Indexes

Sparse (OTP, POS, loyalty). Missing Phase 3.1 order/payment/inventory/reservation index set.

## 7. Pooling / timeouts

Default `pg.Pool` only — no max/idle/SSL/timeout config documented in code.

## 8. Backups / restore

**No** scripts. Spec/PRODUCTION checklist only.

## 9. Disaster recovery

Documented as policy (MASTER); no implemented recovery runbooks/scripts in repo. RPO/RTO OPEN.

## 10. Current gaps

PGlite vs PG discipline; migration maturity; push/bootstrap risk; duplicate stock/phone; cashback legacy balance; missing constraints/indexes; backup/restore; pooling; timeouts; reconciliation; migration testing.

## 11. Target architecture

```text
Versioned migrations → reviewed → staging → production
PostgreSQL = durable truth
Constraints + indexes for real queries
Pooled connections + timeouts
Backups + tested restore + DR procedure
```

## 12. LOCKED candidates (not locked this turn)

- PostgreSQL production source of truth  
- Versioned migrations  
- Migration safety  
- Business-history preservation  
- Backups/restore capability  
- DR capability  
- Appropriate transactions  
- Concurrency safety  
- Database constraints  
- Query-driven indexing  
- Controlled connection pooling  
- Database timeout capability  

## 13. OPEN decisions

Cloud PG provider; backup schedule/retention; RPO/RTO; read replicas; partitioning/sharding; pool sizes; timeout values; DB monitoring provider.

---

# Q20 — Infrastructure / Deployment

## 1. Current infrastructure

| Piece | Status |
|-------|--------|
| Dockerfile / compose | **Missing** |
| GitHub Actions CI | **Missing** |
| Replit autoscale + artifacts | Exists |
| EAS mobile builds | Exists |
| `PRODUCTION.md` | Short checklist |
| Redis / workers / CDN / WAF | Spec/mentions only |

## 2. Environments

Dev/demo via PGlite or local PG. Staging/production separation incomplete (no `.env.staging`/prod templates beyond example). Spec Phase 16 aspirational.

## 3. Secrets

`.env` gitignored; `.env.example` present. Hardcoded secret fallbacks remain (Q7 gap). No cloud secret manager wiring.

## 4. Networking

HTTPS required in PRODUCTION checklist; no TLS/LB/WAF config in repo. Spec: private DB, edge CDN/WAF/LB.

## 5. API deployment

Replit artifact: build API → node dist; health `/api/healthz`. Stateless JWT-like tokens → sticky sessions not required (`PRODUCTION.md`).

## 6. Worker deployment

**None** — workers don’t exist (Q16).

## 7. CI/CD

No pipelines. `post-merge.sh` = install + db push only. EAS for mobile store builds.

## 8. Scaling

Direction: multi-API + LB + Redis rate limits (`PRODUCTION.md`); 200→1000+ branches (locks). Capacity claims require load tests — not done.

## 9. Failure isolation

Partially by design intent (Q10 notify isolation); runtime still couples OTP SMS sync; open webhooks risk domain corruption. Provider isolation OPEN for hardening.

## 10. Backups / DR

Checklist only; no infra automation.

## 11. Current gaps

Production topology; cloud not selected; staging incomplete; secrets mgmt incomplete; LB/WAF/CDN incomplete; worker deploy incomplete; CI/CD incomplete; rollback incomplete; monitoring incomplete; backup/DR incomplete; autoscaling/load testing incomplete; network isolation incomplete.

## 12. Target architecture

```text
Edge (CDN/WAF/LB)
  → N× stateless API
  → M× workers (independent scale)
  → PostgreSQL (truth)
  → Redis (cache/rate/jobs — non-authoritative)
  → Object storage (media)
  → Secrets manager
CI/CD → staging → prod + rollback
Observability + backups + DR
```

## 13. LOCKED candidates (not locked this turn)

- Environment separation  
- Secure secrets management  
- HTTPS/TLS  
- Horizontally scalable API  
- Load-balancer/edge capability  
- Stateless API direction  
- Independently scalable workers  
- Redis non-authoritative  
- Object storage capability  
- Controlled CI/CD  
- Staging before production where practical  
- Safe deployment/rollback  
- 200→1000+ scale direction  
- Failure isolation  
- Network security  
- Health/readiness  
- Disaster recovery  

## 14. OPEN decisions

Cloud provider; exact topology; K8s vs managed containers/VMs; CDN/WAF/Redis/object storage/CI providers; autoscaling thresholds; instance sizes; network architecture; RPO/RTO; load-test capacity targets.

---

# Cross-domain risks

| Rule | Current risk |
|------|----------------|
| PG durable truth | PGlite fallback + bootstrap/push can confuse prod |
| Redis ≠ truth | Correctly unused; rate limits in-memory fail multi-instance |
| Secrets protected | Hardcoded fallbacks + seed credentials |
| API/workers independent scale | No workers |
| Dependency failure isolation | Sync SMS; open privileged endpoints |
| Controlled migration | Push/bootstrap only |
| Staging before prod | Incomplete |
| Rollback | Undocumented/unimplemented |
| Load testing before capacity claims | Not done |
| Health/readiness as deploy concern | Single healthz |
| Observability spans stack | Logs only |
| DR required | Policy only |

---

# Final recommendation

| Domain | Priority |
|--------|----------|
| **Q18** | Fix OTP/secret log leaks; add correlation IDs; metrics+alerts; separate live/ready |
| **Q19** | Adopt versioned migrations; forbid push-force prod; backups+restore drills; constraints/indexes per Phase 3.1 |
| **Q20** | Choose cloud topology; secrets manager; multi-API+LB+Redis; staging+CI/CD; deploy workers with Q16 |

Do **not** implement in this phase. Separate Q18/Q19/Q20 LOCK steps after review.

---

## Consistency with prior locks

| Lock | Status |
|------|--------|
| Q1–Q17 | Not reopened |
| Q3 | Remains OPEN |
| Q7/Q8/Q10/Q11/Q16/Q17 | Gaps reinforced |

---

**Q18 + Q19 + Q20 ANALYSIS COMPLETE — NO IMPLEMENTATION PERFORMED — OBSERVABILITY/DATABASE/INFRASTRUCTURE READY FOR REVIEW.**
