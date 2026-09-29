# Staging Infrastructure Blueprint

> **Phase 12.47** — Infrastructure provider selection framework & staging blueprint.  
> Date: 2026-09-28.  
> Status: **BLUEPRINT ONLY** — no provisioning, no credentials, no production enablement, no git.  
> Baseline: Phase 12.45 / 12.46 — **PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING**.

This document is the provider-neutral blueprint for provisioning a **real staging** environment.  
It does **not** select a cloud provider. It does **not** claim LIVE_VERIFIED for any P0/P1 gate.

---

## 1. Architecture (dependency map)

Minimum required by the application for staging (do not add unused components):

```
                    Internet
                       |
                    HTTPS
                       |
                 Reverse Proxy / LB  (optional but typical)
                       |
              +--------+--------+
              |                 |
             API              Admin (static or same deploy)
              |
       +------+------+---------+
       |      |      |         |
      PG    Redis  (Object*)  Workers
                       |
              External integrations (outbound HTTPS)
              /        |        \
           Payme     Click     Eskiz SMS
```

\* **Object storage**: MASTER_SPEC lists S3-compatible storage; runtime staging core path does **not** currently hard-require object storage for API/Admin/worker boot. Treat as **OPTIONAL** / Product decision (gap P1-6). Do not invent a requirement for minimum staging GO.

**Not in minimum topology:** Kubernetes (unless OPS chooses it), CDN/WAF (optional later), FOM writer, FOM_POS, external courier (all **CONTRACT_PENDING** / OFF).

---

## 2. Provider-neutral requirements

### A. PostgreSQL

| Requirement | Notes |
|-------------|-------|
| PostgreSQL-compatible | App uses Drizzle + postgres driver; PGlite **forbidden** staging/prod |
| Managed preferred | OPS operates backups/PITR |
| TLS | Prefer `sslmode=require` (or provider equivalent) in `DATABASE_URL` |
| Automated backups | Enabled + retention documented |
| PITR | Continuous WAL / continuous backup |
| Restore to disposable staging target | Empty restore drill evidence |
| Connection pooling | App pool + optional provider pooler; respect `PG_POOL_MAX` if set |
| Monitoring | Connections, storage, backup/PITR status |
| Access control | Least-privilege DB user; no public PG unless unavoidable |
| Private networking | Preferred when available |

### B. Redis

| Requirement | Notes |
|-------------|-------|
| Managed Redis | Staging/prod rate-limit SoT across instances |
| TLS | Prefer `rediss://` |
| Auth / ACL | Password or ACL; never log URL |
| Persistence | Rate-limit use: AOF/RDB policy **provider-appropriate**; Redis is **not** financial SoT |
| Monitoring | Availability, connections, latency |
| Multi-client | ≥2 API instances share counters |
| Failover / recovery evidence | Outage → 503 `RATE_LIMIT_REDIS_UNAVAILABLE`; recovery drill |

### C. Compute

| Requirement | Notes |
|-------------|-------|
| API process | Node API (`Dockerfile` present) |
| Admin | Static hosting or same deployment behind HTTPS |
| Always-on worker | Separate process or same image with worker entry; `ENABLE_BACKGROUND_WORKERS=1` |
| Restart policy | Process supervisor / platform restart |
| Logs | stdout/stderr aggregation without secrets |
| Health checks | `/api/health/live`, `/api/health/ready` |
| Env / secrets | Injected at runtime — never baked into image layers |

### D. KMS / Secrets

| Requirement | Notes |
|-------------|-------|
| Managed KMS **or** equivalent secret manager | Target production model |
| Service identity | IAM / workload identity |
| Key access policy | Least privilege to decrypt/inject KEK |
| Rotation | Documented + staging-tested |
| Audit trail | Who accessed keys |
| No secrets in source | Already: no hardcoded KEK; scrubbers **TEST_VERIFIED** |

**Current repo capability:** `ENVIRONMENT_KEK` via `MERCHANT_SECRET_KEK` + `enc:v1:` AES-256-GCM.  
**Target production capability:** KMS-backed / secret-manager-injected KEK (or envelope). **Do not rewrite crypto.**

### E. Object storage

**OPTIONAL** for minimum staging until Product confirms media/CDN requirement (P1-6 **OPS_REQUIRED** / **OPEN**). Not required to close P0-1..P0-4.

---

## 3. Candidate provider capabilities (no winner)

Comparison framework only. **No scores. No automatic selection.**

Public product-category existence is noted where widely documented; **feature depth, region latency to Uzbekistan, SLA, and pricing are NOT_VERIFIED** in this phase unless OPS cites current provider docs.

| Capability | AWS | Google Cloud | Azure | DigitalOcean | Hetzner | Other |
|------------|-----|--------------|-------|--------------|---------|-------|
| Managed PostgreSQL product category exists | Documented category (e.g. RDS/Aurora) — details **NOT_VERIFIED** | Documented category (Cloud SQL) — **NOT_VERIFIED** | Documented category (Azure Database for PostgreSQL) — **NOT_VERIFIED** | Documented category (Managed Databases) — **NOT_VERIFIED** | Managed PG offering — **NOT_VERIFIED** | **NOT_VERIFIED** |
| PITR / continuous backup | **NOT_VERIFIED** (confirm in current docs) | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** |
| Managed Redis product category | Documented category (ElastiCache/MemoryDB) — **NOT_VERIFIED** | Documented category (Memorystore) — **NOT_VERIFIED** | Documented category (Azure Cache for Redis) — **NOT_VERIFIED** | Documented category — **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** |
| KMS / secrets manager | Documented category (KMS + Secrets Manager) — **NOT_VERIFIED** | Documented category (Cloud KMS + Secret Manager) — **NOT_VERIFIED** | Documented category (Key Vault) — **NOT_VERIFIED** | Secrets product — **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** |
| Compute (VM / container / PaaS) | **NOT_VERIFIED** sizing | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** |
| TLS termination / certs | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** |
| Private networking / VPC | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** |
| Monitoring / backup consoles | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** |
| Restore to disposable DB | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** |
| Uzbekistan / nearest-region latency | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** | **NOT_VERIFIED** |
| Operational complexity | **TO_BE_AGREED** (OPS) | **TO_BE_AGREED** | **TO_BE_AGREED** | **TO_BE_AGREED** | **TO_BE_AGREED** | **TO_BE_AGREED** |
| Migration portability | Prefer standard PG + Redis URLs + container image — app is cloud-neutral (`Dockerfile`) | same | same | same | same | same |

**Decision owner:** OPS + PRODUCT. Selection must cite current provider documentation and produce live evidence before any gate closes.

---

## 4. Staging topology (smallest realistic)

| Component | Purpose | Required resources | Network | Secrets | Health | Failure behavior | Backup |
|-----------|---------|--------------------|---------|---------|--------|------------------|--------|
| API | HTTPS JSON API | 1+ container process (image from `Dockerfile`) | Inbound 443 via LB/proxy; outbound to PG/Redis/PSP/SMS | `DATABASE_URL`, `REDIS_URL`, `MERCHANT_SECRET_KEK`, session secrets, optional Eskiz/sandbox | `/api/health/live`, `/api/health/ready` | Fail closed if PG/Redis/KEK missing in staging | N/A (stateless) |
| Admin | Operator UI | Static assets or reverse-proxied build | Inbound 443; calls API origin | None in static bundle for merchant secrets | UI load + API reachability | Degraded if API down | N/A |
| Worker | `worker_jobs` claim/reclaim | Always-on process; restart policy | Outbound PG (Redis not financial SoT; optional if shared rate-limit process) | Same DB/KEK as API; `ENABLE_BACKGROUND_WORKERS=1` | Process up + reclaim alerts | Stale RUNNING reclaim after `WORKER_STALE_RUNNING_MS` | N/A |
| Managed PostgreSQL | System of record | Single staging instance + disposable restore target | Private preferred; no public unless required | DB credentials in secret store | Provider metrics + app ready | App not ready | Automated + PITR **required** |
| Managed Redis | Shared rate-limit | Single staging instance | Private preferred | Redis auth in URL/secret | PING + provider metrics | API rate-limit 503 | Persistence policy **TO_BE_AGREED** |
| HTTPS endpoint | Public API/Admin | LB/proxy + cert | 443 only public | TLS cert/key via platform | TCP/HTTPS probe | Clients fail closed | N/A |
| Object storage | Media (if Product requires) | **OPTIONAL** | Private + signed URLs if used | Access keys if used | Provider health | Degrade media only | Versioning **TO_BE_AGREED** |
| Monitoring | Scrapes/alerts | Platform metrics or logs | Ops access | No app secrets in alert text | Dashboards for API/DB/Redis/worker | Alert on failure | N/A |

Do **not** invent exact CPU/RAM. Use P13/P13.1 as **OBSERVED TEST RESULT** only after staging exists; not **PRODUCTION CAPACITY**.

---

## 5. Network model

```
Internet ──HTTPS:443──▶ Reverse Proxy/LB ──▶ API
Internet ──HTTPS:443──▶ Reverse Proxy/LB ──▶ Admin ──HTTPS──▶ API

API ──TLS──▶ PostgreSQL (private)
API ──TLS──▶ Redis (private)
API ──HTTPS outbound──▶ Payme / Click / Eskiz

Worker ──TLS──▶ PostgreSQL
Worker ── (Redis only if same process needs rate-limit; jobs SoT = PG)
Worker ──HTTPS outbound──▶ providers if job type requires
```

| Rule | Requirement |
|------|-------------|
| Inbound public | 443 only (API + Admin hostnames) |
| PostgreSQL / Redis | **Not** publicly exposed unless absolutely required; prefer private network / allowlist |
| TLS | HTTPS for clients; TLS to PG/Redis preferred |
| CORS | Staging Admin origin + any approved web origins via `CORS_ORIGIN` (when configured); mobile uses API URL directly |
| Trusted origins | Explicit staging Admin + API public URL; never copy production origins blindly |

---

## 6. Environment separation

| Concern | LOCAL | STAGING | PRODUCTION |
|---------|-------|---------|------------|
| `APP_ENV` / `NODE_ENV` | development | staging | production |
| `DATABASE_URL` | Local PG or PGlite (dev only) | Managed PG TLS | Managed PG TLS (separate instance) |
| `REDIS_URL` | Optional / memory fallback allowed in **dev** | Managed Redis required | Managed Redis required |
| `MERCHANT_SECRET_KEK` | Optional/dev | Required | Required (prefer KMS-injected) |
| Payme / Click merchant flags | 0 unless local sandbox harness | Sandbox E2E may use sandbox vars; **keep production flags OFF** until GO | Explicit enable only after sandbox PASS + GO |
| Sandbox vars (`PAYME_SANDBOX_*`, `CLICK_SANDBOX_*`, `SANDBOX_E2E_RUN`) | Optional harness | Staging only | **Must not** reuse staging sandbox secrets as live |
| Eskiz | Dev bypass possible | Staging/prod-like credentials | Production credentials |
| Workers | Dev flag optional | `ENABLE_BACKGROUND_WORKERS=1` for always-on | Same after drills |
| CORS / API public URL | localhost | Staging hostnames | Production hostnames |
| `EXPO_PUBLIC_API_URL` | localhost | Staging HTTPS API | Production HTTPS API |

**Never copy production credentials into staging.** Never commit `.env`.

---

## 7. PostgreSQL plan (P0-1)

Lifecycle:

1. Provision managed PostgreSQL (provider **TO_BE_AGREED**)  
2. Enforce TLS  
3. Create DB + least-privilege user  
4. Configure `DATABASE_URL` in secret store (value never printed)  
5. Run migrations (`pnpm db:migrate` / deploy migrate step) — versions **0000–0010**  
6. Verify migration version  
7. Enable automated backups  
8. Enable PITR / continuous backup  
9. Restore into **empty disposable** staging DB  
10. Point temporary app or smoke against restored DB → `/api/health/ready`  
11. Smoke tests  
12. Optional: staging-appropriate P13/P13.1 load (**OBSERVED TEST RESULT** only)

**Evidence to close P0-1:** URL configured · ready healthy (`driver=postgres`) · migrations applied · backups ON · PITR ON · restore success · app on restored DB · restore duration logged · RPO/RTO recorded (targets **TO_BE_AGREED** until Product/OPS agree).

Current status: **OPS_REQUIRED** / **NOT_PROVEN**.

---

## 8. Redis plan (P0-4)

1. Provision managed Redis  
2. TLS (`rediss://` preferred)  
3. Authentication / ACL  
4. Configure `REDIS_URL` (never log)  
5. Warm PING at API boot  
6. API instance A  
7. API instance B  
8. Shared rate-limit key test  
9. Redis outage → expect 503 `RATE_LIMIT_REDIS_UNAVAILABLE` (no memory fallback)  
10. Recovery test after Redis returns  

**Evidence to close P0-4:** live Redis · PING · dual-instance share · fail-closed · recovery · no memory fallback · no secrets in logs.

Current status: **OPS_REQUIRED** / **NOT_PROVEN**.

---

## 9. Worker plan (O-4)

Deployment:

- Same container image or dedicated worker service  
- `ENABLE_BACKGROUND_WORKERS=1`  
- Always-on process calling claim loop / `runDueWorkerJobs` path as documented in runbook  
- Restart policy (platform)  
- `WORKER_STALE_RUNNING_MS` configured (default 30m; must exceed longest handler)  
- Logs + `WORKER_STALE_JOB_RECLAIMED` alerts  

**Kill drill (staging only — never production):**

1. Worker A claims job → RUNNING  
2. Terminate Worker A  
3. Job becomes stale after lease  
4. Worker B reclaims  
5. Worker B completes  
6. Late Worker A cannot commit (LEASE_LOST)  
7. No duplicate financial effect  

Current: reclaim **TEST_VERIFIED**; live drill **OPS_REQUIRED** / **NOT_PROVEN**.

---

## 10. KMS plan (P0-2)

| Layer | Model |
|-------|-------|
| Application ciphertext | `enc:v1:` AES-256-GCM (preserve; do not rewrite) |
| Decrypt boundary | WeakMap runtime isolation — **READY_IN_REPO** |
| Current key source | `ENVIRONMENT_KEK` (`MERCHANT_SECRET_KEK`) |
| Target | KMS-backed or secret-manager-injected KEK; envelope encryption **if** provider requires |
| IAM | Service identity may read KEK only |
| Rotation | New KEK → re-encrypt / migrate helper → retire old |
| Recovery | Backup of ciphertext DB + KEK access procedure |
| Audit | Provider key-access logs |

Env KEK ≠ managed KMS. Gate remains **OPS_REQUIRED** until live evidence.

---

## 11. PSP staging (Payme / Click)

Use already verified contracts (Phases 12.31 / 12.32). **Do not invent endpoints.**

### Payme prerequisites (P0-3a)

| Item | Requirement |
|------|-------------|
| Creds | `PAYME_SANDBOX_KEY`, `PAYME_SANDBOX_MERCHANT_ID` (staging secrets) |
| Opt-in | `SANDBOX_E2E_RUN=1` |
| Checkout | Non-prod default / `PAYME_CHECKOUT_BASE_URL` per `.env.example` |
| Callback | Staging API `{API}/api/payments/payme/merchant` registered with Payme sandbox |
| Production flag | Keep `PAYME_MERCHANT_API_ENABLED=0` until production GO |
| Harness | `pnpm sandbox:e2e` |
| Paths | Create → CheckPerform → Perform → capture → duplicate → cancel path per contract |
| Outbound refund | **CONTRACT_PENDING** (E-4) |

### Click prerequisites (P0-3b)

| Item | Requirement |
|------|-------------|
| Creds | `CLICK_SANDBOX_SECRET`, `CLICK_SANDBOX_SERVICE_ID`, `CLICK_SANDBOX_MERCHANT_ID` |
| Opt-in | `SANDBOX_E2E_RUN=1` |
| Callback | `{API}/api/payments/click/merchant` |
| Production flag | `CLICK_MERCHANT_API_ENABLED=0` until GO |
| Paths | Prepare → Complete → duplicate Complete → error≠0 cancel path |
| Outbound refund | **CONTRACT_PENDING** |

Current: **OPS_REQUIRED** / **NOT_RUN** (credentials absent).

---

## 12. SMS (Eskiz)

| Item | Value / status |
|------|----------------|
| Credentials | `ESKIZ_EMAIL`, `ESKIZ_PASSWORD` — OPS inject; never commit |
| Sender | `ESKIZ_FROM` optional; code default `"4546"` if unset |
| Endpoints (in-repo) | `https://notify.eskiz.uz/api/auth/login`, `https://notify.eskiz.uz/api/message/sms/send` |
| Timeout / retry | Provider HTTP behavior as implemented; do not invent extra retries here |
| Rate limit | App OTP rate limits via Redis in staging/prod |
| Logging | OTP plaintext never logged in production-like |
| Failure | Unconfigured prod-like → 503; send failure → 502 |

Live credentials: **OPS_REQUIRED** / **NOT_PROVEN**.

---

## 13. Mobile

| Item | Requirement |
|------|-------------|
| Config | `EXPO_PUBLIC_API_URL` → staging **HTTPS** API (no auth architecture change) |
| Session | Login / OTP / register issue **s1** |
| Token | Opaque client store; **no** client HMAC creation |
| Logout | Revokes session |
| Expiry | Expired s1 → re-authenticate |

HMAC dual-accept remains ON until quiet period evidence (P1-3). Do not fabricate deadline.

---

## 14. TLS / domain

Example hostnames only (do **not** invent the real domain):

- `api-staging.<domain>`
- `admin-staging.<domain>`

Required:

- HTTPS with valid certificate  
- CORS for Admin origin  
- Secure cookies if applicable to Admin session model  
- Mobile `EXPO_PUBLIC_API_URL` = API staging HTTPS origin  

Domain selection: **TO_BE_AGREED** (OPS + PRODUCT).

---

## 15. Observability (minimum)

| System | Signals |
|--------|---------|
| API | Uptime, 5xx, latency, `/health/live` + `/health/ready` |
| PostgreSQL | Connections, CPU/storage where exposed, backup status, PITR status |
| Redis | Availability, connections, latency |
| Worker | Process running, stale reclaim alerts, FAILED/DEAD jobs |
| Payments | Adapter/callback failures |
| SMS | Send failures (redacted) |

No APM vendor selected in this phase.

---

## 16. Backup / DR

| Item | Status |
|------|--------|
| Backup | Required on managed PG |
| PITR | Required |
| Restore drill | Required on disposable staging DB |
| RPO target | **TO_BE_AGREED** |
| RTO target | **TO_BE_AGREED** |

Do not invent numeric RPO/RTO. Measure restore duration after first drill; Product/OPS agree targets.

---

## 17. Cost model (checklist only)

No fabricated prices. Resource checklist for OPS quoting later:

| Resource | Needed for staging? |
|----------|---------------------|
| Compute (API + Worker + optional Admin host) | Yes |
| Managed PostgreSQL | Yes |
| Managed Redis | Yes |
| Object storage | Optional (P1-6) |
| Bandwidth / egress | Yes |
| Monitoring / log retention | Yes |
| KMS / secrets manager | Yes (or equivalent) |
| Backups / PITR storage | Yes |
| TLS certificates | Yes |

Cite **current** provider pricing in a separate OPS note when researched — not in this blueprint as invented numbers.

---

## 18. Evidence gates (unchanged statuses)

| Gate | Blueprint status | Operational status |
|------|------------------|--------------------|
| P0-1 PostgreSQL + PITR + restore | Blueprint **DONE** (this doc) | **OPS_REQUIRED** |
| P0-2 KMS / KEK | Blueprint **DONE** | **OPS_REQUIRED** |
| P0-3a Payme sandbox | Blueprint **DONE** | **OPS_REQUIRED** |
| P0-3b Click sandbox | Blueprint **DONE** | **OPS_REQUIRED** |
| P0-4 Redis | Blueprint **DONE** | **OPS_REQUIRED** |
| O-4 Worker live | Blueprint **DONE** | **OPS_REQUIRED** / **NOT_PROVEN** |
| P1-3 HMAC | Blueprint notes only | **OPS_REQUIRED** / **NOT_PROVEN** |
| SMS Eskiz | Blueprint **DONE** | **OPS_REQUIRED** |
| E-1..E-4 | Out of minimum staging unless product requires | **CONTRACT_PENDING** |
| Provider selected | — | **TO_BE_AGREED** / **NOT_VERIFIED** capabilities pending OPS |

Blueprint **DONE** ≠ gate **DONE**.

---

## 19. Provisioning sequence (provider-neutral)

Aligned with Phase 12.46:

1. Select provider (**TO_BE_AGREED** — not automatic)  
2. Managed PostgreSQL + TLS  
3. Backups + PITR  
4. Empty restore drill  
5. Managed Redis + TLS/auth  
6. Secrets / KEK (env or KMS inject)  
7. API staging deploy  
8. Admin staging deploy  
9. Worker always-on + kill drill  
10. Eskiz staging credentials  
11. Payme sandbox E2E  
12. Click sandbox E2E  
13. Mobile `EXPO_PUBLIC_API_URL`  
14. HMAC telemetry / quiet (do not disable yet)  
15. Failure-recovery drills  
16. Staging acceptance  

Owners: OPS, BACKEND, SECURITY, FINANCE, MOBILE, PRODUCT (role names only).

---

## 20. Open decisions

| Decision | Status | Owner |
|----------|--------|-------|
| Cloud / hosting provider | **TO_BE_AGREED** | OPS + PRODUCT |
| Region / latency to Uzbekistan | **NOT_VERIFIED** | OPS |
| Exact RPO / RTO targets | **TO_BE_AGREED** | PRODUCT + OPS |
| Staging domain names | **TO_BE_AGREED** | OPS + PRODUCT |
| Object storage for launch | **TO_BE_AGREED** (P1-6) | PRODUCT |
| KMS product vs secret-manager-injected env KEK for first staging | **TO_BE_AGREED** | SECURITY + OPS |
| Admin hosting (same origin vs separate static) | **TO_BE_AGREED** | OPS |
| Whether FOM / courier / outbound refund block production GO | Scope-dependent; remain **CONTRACT_PENDING** | PRODUCT + FINANCE |

---

## Final decision (Phase 12.47)

**PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING**

No provider selected. No infrastructure provisioned. No production enablement. No fabricated evidence.

See also: `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.47, `docs/PRODUCTION_OPS_RUNBOOK.md`, Phase 12.45 / 12.46.

---

## Phase 12.48 addendum — Provider research

Verified current-provider research is in [`docs/PHASE_12_48_PROVIDER_RESEARCH.md`](./PHASE_12_48_PROVIDER_RESEARCH.md).

- Capabilities marked **VERIFIED** / **NOT_VERIFIED** / **NOT_AVAILABLE** / **DEPENDS_ON_PLAN**.
- DigitalOcean Managed PostgreSQL PITR (7-day) + Managed Valkey TLS: **VERIFIED** with published list prices.
- AWS / GCP / Azure managed PG + Redis/Valkey + KMS: capabilities **VERIFIED**; staging USD **DEPENDS_ON_PLAN** (calculator).
- Hetzner Cloud managed PostgreSQL / managed Redis / KMS: **NOT_AVAILABLE**.
- No provider selected. Latency: **LIVE_LATENCY_TEST_REQUIRED**.
- Operational P0/P1 gates remain **OPS_REQUIRED** / **CONTRACT_PENDING**.

---

## Phase 12.49 addendum — Provider decision

**SELECTED STAGING PROVIDER: DigitalOcean** (FRA1 candidate).

See [`docs/PHASE_12_49_PROVIDER_DECISION.md`](./PHASE_12_49_PROVIDER_DECISION.md).

- Fit: **FITS_WITH_TRADEOFFS** (no cloud KMS → ENVIRONMENT_KEK).
- Hetzner: **DOES_NOT_FIT_CURRENT_REQUIREMENTS**.
- No provisioning in this phase. Latency: **LIVE_LATENCY_TEST_REQUIRED**.
- Operational P0/P1 gates remain **OPS_REQUIRED** / **CONTRACT_PENDING**.
- Production remains **NOT READY — OPERATIONAL EVIDENCE MISSING**.

