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

---

## Phase 13.19 addendum — Trusted proxy

- The API resolves the client IP from the TCP peer: Express `trust proxy` is off, and boot refuses to start if it is enabled. `X-Forwarded-For` / `X-Real-IP` / `Forwarded` are ignored.
- The "Reverse Proxy / LB" boxes above are **not** a trusted-proxy contract. No proxy address / CIDR, hop count or header policy is defined.
- Behind any LB or TLS terminator, every client would share the proxy's address for rate limiting and auth-event IP. **Decide before routing staging traffic through a proxy.**
- Open decision: trusted proxy topology per environment (edge type, peer addresses / CIDRs, firewall so only the proxy reaches the API, `X-Forwarded-For` overwrite vs append, IPv6) — **TO_BE_AGREED** (OPS + SECURITY). Tracked as O-6 in `docs/PRODUCTION_GAP_MATRIX.md`; details in `docs/ADMIN_IMPLEMENTATION_STATUS.md` § Phase 13.19.

---

## Phase 13.20 addendum — DigitalOcean staging bootstrap (FRA1 candidate)

STAGING STATUS: **NOT PROVISIONED**. The repository is prepared, but no DigitalOcean resource exists and no evidence is attached. Every gate in § 18 keeps its status. The full readiness report and the 20-item smoke checklist (all NOT RUN / BLOCKED) are in `docs/ADMIN_IMPLEMENTATION_STATUS.md` § Phase 13.20.

### Repository changes this addendum relies on

| Change | Why |
|--------|-----|
| `Dockerfile`: `prod-deps` stage plus a runtime with workspace layout, production `node_modules` and `lib/db/migrations` | The previous runtime image could not boot. `ioredis` and `@electric-sql/pglite` are bundle externals and the migrations journal was missing |
| `dist/worker.mjs` (`src/worker.ts`) | A separate always-on worker process with no HTTP server, driving the existing `worker_jobs` runner |
| `CORS_ORIGIN` exact-origin allowlist | Replaces reflect-any once configured. Wildcards are rejected and staging requires `https` |
| CI runtime-image step | Proves the image resolves the externals and contains the migrations and both entrypoints |

### Target topology (not provisioned)

```
Internet ──HTTPS 443──▶ Edge (DO Load Balancer or on-host TLS proxy — TO_BE_AGREED)
                          ├── /api/*  ──HTTP──▶ API container(s)  node dist/index.mjs  (PORT 5000)
                          └── /*      ──────▶ Admin static build (artifacts/admin-web/dist), same origin

Worker container (node dist/worker.mjs, ENABLE_BACKGROUND_WORKERS=1) — no inbound

API, Worker ──TLS (verify-full, provider CA)──▶ DO Managed PostgreSQL (FRA1 candidate, VPC)
API         ──rediss://──────────────────────▶ DO Managed Valkey (FRA1 candidate, VPC)
API, Worker ──HTTPS 443──▶ checkout.test.paycom.uz · my.click.uz · notify.eskiz.uz
```

- **Admin must share the API origin.** `artifacts/admin-web/src/api.ts` uses `const API = ""` and has no build-time or runtime API URL. A DO Load Balancer alone cannot serve static files or route by path. The edge therefore needs either an on-host proxy that serves the Admin build and forwards `/api`, or another platform with path routing. **TO_BE_AGREED**.
- **Trusted proxy (13.19):** every edge option above is a proxy hop. With `trust proxy` off, all clients share the edge's address for rate limiting and auth-event IP. That is acceptable for a closed internal smoke test only. Decide O-6 before any load test or pilot traffic.
- **Worker:** the same image with `CMD ["node","--enable-source-maps","dist/worker.mjs"]`. Disable the image HEALTHCHECK for it, since it has no port. It may share the API Droplet at first (**TO_BE_AGREED**). Running several replicas is safe (SKIP LOCKED plus lease reclaim).

### Firewall matrix (only repo-confirmed ports)

| Source | Destination | Port / protocol | Basis |
|--------|-------------|-----------------|-------|
| Internet | Edge | 443 HTTPS | § 5 "Inbound public: 443 only" |
| Edge | API | `PORT` 5000 HTTP | `Dockerfile` `EXPOSE 5000` / `ENV PORT=5000` |
| Internet | API `PORT` | **deny** | Clients must not bypass the edge |
| Any | Worker | **deny all inbound** | `dist/worker.mjs` opens no port |
| API, Worker | Managed PostgreSQL | Provider-assigned port from DO connection details (not invented here) | VPC / trusted sources only |
| API | Managed Valkey | Provider-assigned port (not invented here) | VPC / trusted sources only |
| API, Worker | `checkout.test.paycom.uz`, `my.click.uz`, `notify.eskiz.uz` | 443 HTTPS outbound | Hosts from `paymeContract.ts`, `clickContract.ts`, `sms.ts` |
| Ops | Droplets (SSH / console) | **TO_BE_AGREED** | Not defined in repo |

### Environment contract

- **REQUIRED STAGING, API:** `APP_ENV=staging`, `NODE_ENV=production`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `ADMIN_SECRET`, `CUSTOMER_SECRET`, `POS_SECRET`, `MERCHANT_SECRET_KEK`, `FOM_WEBHOOK_SECRET`, `CORS_ORIGIN`.
- **REQUIRED STAGING, Worker:** the same database, KEK and app secrets, plus `ENABLE_BACKGROUND_WORKERS=1`.
- **OPTIONAL:** `PG_POOL_*`, `WORKER_POLL_INTERVAL_MS`, `WORKER_STALE_RUNNING_MS`, `PAYMENT_INTENT_TTL_MS`, `LOG_LEVEL`, HMAC window vars, `ESKIZ_*`, the sandbox harness vars.
- **Never set in staging:** `ALLOW_*` dev flags, `ENABLE_BACKGROUND_WORKERS_DEV`, PSP merchant flags (until the sandbox gate), or any trusted-proxy variable (none exists).
- **Placeholders:** `.env.example`. Real values live only in the DO encrypted environment or the team secret store, never in git.

### PostgreSQL TLS (corrects § 2A wording)

- With node-postgres 8.x (repo: `pg` 8.23), `sslmode=require` in the URL is treated as **verify-full**.
- Download the cluster CA from the provider, mount it as a file, and use `...?sslmode=verify-full&sslrootcert=<mounted CA path>`.
- Never use `sslmode=no-verify` or disable certificate verification.

### Database bootstrap procedure

1. Provision Managed PostgreSQL in the VPC. Restrict trusted sources to the API and Worker Droplets (plus the ops host used for migrations).
2. Create the database and app user. The app runs the drizzle migrator at boot (it creates the `drizzle` schema/table if missing), so verify that user's privileges at provisioning.
3. Store `DATABASE_URL` (with TLS params) in the secret store. Never print it.
4. **Migration release step, once, before scaling out:** either run `pnpm db:migrate` from an ops checkout, or start a **single** API instance (boot applies migrations). The migrator takes no advisory lock, so never start several instances at the same time on an unmigrated database.
5. Verify with `pnpm db:migrate:status`: 14 migrations, ending at `0013_auth_event_telemetry`. Check that `/api/health/ready` returns `driver: "postgres"`.
6. The demo seed never runs in staging. Never run destructive scripts (`ALLOW_DESTRUCTIVE_DB`, push `--force`) against staging.
7. Enable automated backups and PITR, then run the restore drill below.

### Backup / restore drill (NOT RUN)

1. Restore from backup or PITR into a **new** cluster.
2. Point a temporary API instance at it.
3. Check `/api/health/ready` (`driver: "postgres"`) and `db:migrate:status`.
4. Check row counts for the critical tables (orders, payments, payment_intents, cashback_ledger, product_stocks, reservations, worker_jobs, audit_log).
5. Record the restore duration and the measured RPO/RTO.

`pnpm backup:drill` is a PGlite non-production drill and is not evidence.

---

## Phase 13.21 — Staging provisioning package (DigitalOcean FRA1 candidate)

**CODE READY / INFRASTRUCTURE NOT PROVISIONED.** STAGING STATUS: **NOT PROVISIONED**. This section is the hand-over package for whoever provisions staging. No cloud resource, DNS record, domain or secret was created, and nothing below is staging evidence. Values not documented in the repository are marked **TBD** with an owner (OPS / SECURITY / DEVOPS / PROVIDER / BUSINESS). The 13.20 addendum above remains valid except where this section corrects it (outbound hosts and the migration step).

### A. Resource inventory

| RESOURCE | PURPOSE | EXPECTED TYPE | REGION | NETWORK EXPOSURE | STATUS | BLOCKER |
|----------|---------|---------------|--------|------------------|--------|---------|
| API compute | `node dist/index.mjs` container (port 5000) | DO Droplet running the API image. SIZE: TBD during provisioning based on measured staging load | FRA1 (12.49 primary; AMS3 / BLR1 alternates) | Private; inbound only from the HTTPS edge on 5000 | NOT PROVISIONED | Account access (OPS); registry O-2 (DEVOPS) |
| Worker compute | `node dist/worker.mjs` container, no HTTP | Same image; separate container, may share the API Droplet at first (**TO_BE_AGREED**, OPS). SIZE: TBD during provisioning based on measured staging load | FRA1 | No inbound | NOT PROVISIONED | Same as API |
| Managed PostgreSQL | System of record; migrations 0000–0013 | DO Managed PostgreSQL, 2 GiB single-node (12.49 staging sizing, ~$30.45/mo list) | FRA1 | VPC / trusted sources only; TLS verify-full | NOT PROVISIONED | Account access (OPS) |
| Managed Valkey | Shared rate-limit storage (`rl:v1:<sha256>`) | DO Managed Valkey, 1 GiB single-node (12.49 staging sizing, $15/mo list) | FRA1 | VPC / trusted sources only; `rediss://` | NOT PROVISIONED | Account access (OPS) |
| Container registry | Store the CI-built image | **DECISION REQUIRED** (O-2) | — | — | NOT SELECTED | O-2 (DEVOPS) |
| HTTPS edge | TLS termination; serve the Admin static build; forward `/api/*` on the same origin | **TO_BE_AGREED** (OPS + SECURITY): an on-host reverse proxy, or a DO Load Balancer in front of a path-routing proxy. A DO Load Balancer alone cannot serve static files or route by path | FRA1 | Public 443 | NOT PROVISIONED | Edge decision; O-6 for anything beyond a closed smoke test |
| Domain / DNS | `https://<staging-domain>/` | TBD | — | Public DNS | NOT SELECTED | Domain decision (BUSINESS) |
| Firewall | Enforce the matrix in § C | DO Cloud Firewall on Droplets plus managed-database trusted sources (rules in § C) | FRA1 | — | NOT PROVISIONED | Compute + edge decision (OPS) |
| Monitoring / alerts | Availability, error and job-health signals (§ O) | DO metrics (12.49) plus pino JSON logs with alert codes; alert destination **TBD** | — | — | NOT PROVISIONED | Alert destination (OPS) |

Droplet, Load Balancer and production sizes are not documented ("DEPENDS_ON_PLAN" in 12.49; "PRODUCTION SIZE NOT FINALIZED"). No total cost is claimed beyond the documented PostgreSQL + Valkey subtotal (~$45.45/mo list).

### B. Network topology (target, not provisioned)

```
Browser / mobile / Telegram ──HTTPS 443──▶ HTTPS edge (https://<staging-domain>)
                                             ├── /api/*  ──HTTP 5000──▶ API  (node dist/index.mjs)
                                             └── /*      ──▶ Admin static build (artifacts/admin-web/dist)

API     ──VPC──▶ Managed PostgreSQL (TLS verify-full + provider CA file)
API     ──VPC──▶ Managed Valkey (rediss://)
Worker  ──VPC──▶ Managed PostgreSQL              (no Valkey, no inbound)
Release ──VPC──▶ Managed PostgreSQL              (one-off: node dist/migrate.mjs)

API ──HTTPS 443 outbound──▶ notify.eskiz.uz (OTP SMS) · router.project-osrm.org (GET /api/maps/route)
Payme / Click / FOM ──HTTPS 443 inbound via edge──▶ /api/payments/{payme,click}/{merchant,webhook} · /api/integrations/fom/sale
```

Corrections to the 13.20 addendum, from the 13.21 code and bundle audit:

- **Payme and Click are not server-side outbound calls.** `checkout.test.paycom.uz` / `checkout.paycom.uz` (`paymeContract.ts`) and `my.click.uz/services/pay` (`clickContract.ts`) are checkout URLs returned to the browser. The PSP merchant APIs are **inbound** callbacks, disabled by default (`PAYME_MERCHANT_API_ENABLED` / `CLICK_MERCHANT_API_ENABLED` unset).
- **The API makes two outbound calls:** `notify.eskiz.uz` (`sms.ts`) and `router.project-osrm.org` (`routes/maps.ts`, the public OSRM demo server). Whether staging or production may depend on that public server is **TBD** (BUSINESS).
- **The worker needs neither Valkey nor the internet.** `dist/worker.mjs` contains no Redis client and none of the provider hosts. The notification job is a no-op (`NOOP_OR_SYNC_SMS`), the FOM retry calls the in-process `processFomSale`, and the external delivery retry returns `CONTRACT_PENDING`.

### C. Firewall matrix

| SOURCE | DESTINATION | PORT/PROTOCOL | PURPOSE | PUBLIC? | REQUIRED? | STATUS |
|--------|-------------|---------------|---------|---------|-----------|--------|
| Internet | HTTPS edge | 443/TCP (HTTPS) | Admin, customer and PSP / FOM callback entry | YES | YES | NOT PROVISIONED |
| HTTPS edge | API | 5000/TCP HTTP (`Dockerfile` `EXPOSE 5000`, `ENV PORT=5000`) | Forward `/api/*` | NO | YES | NOT PROVISIONED |
| Internet | API 5000 | **DENY** | Clients must not bypass the edge | NO | YES (deny) | NOT PROVISIONED |
| Admin (browser) | API | No separate rule: same-origin `/api` through the edge on 443 | Admin calls `""` + `/api/...` | — | NO | N/A |
| API | Managed PostgreSQL | Use provider-assigned endpoint/port from provisioned resource. | System of record | NO | YES | NOT PROVISIONED |
| Worker | Managed PostgreSQL | Use provider-assigned endpoint/port from provisioned resource. | `worker_jobs` | NO | YES | NOT PROVISIONED |
| Release job (`dist/migrate.mjs`, same image) | Managed PostgreSQL | Use provider-assigned endpoint/port from provisioned resource. | Controlled migration step | NO | YES | NOT PROVISIONED |
| API | Managed Valkey | Use provider-assigned endpoint/port from provisioned resource. | Rate-limit storage; boot PING | NO | YES | NOT PROVISIONED |
| Worker | Managed Valkey | — | Not used (no Redis client in `dist/worker.mjs`) | NO | NO | N/A |
| API | Payme (`checkout*.paycom.uz`) | — | Not a server call: checkout URL handed to the browser | — | NO | N/A |
| API | Click (`my.click.uz`) | — | Not a server call: checkout URL handed to the browser | — | NO | N/A |
| Payme / Click | HTTPS edge → `/api/payments/{payme,click}/{merchant,webhook}` | 443/TCP (HTTPS) | Merchant API callbacks (flags off by default) | YES | Only after the sandbox gate | BLOCKED — PSP source addresses **TBD** (PROVIDER) |
| FOM POS | HTTPS edge → `/api/integrations/fom/sale` | 443/TCP (HTTPS) | Sale webhook (`FOM_WEBHOOK_SECRET`) | YES | When the FOM contract exists | **CONTRACT_PENDING** |
| API | `notify.eskiz.uz` | 443/TCP (HTTPS) outbound | OTP SMS | — | YES when `ESKIZ_*` is set | NOT PROVISIONED |
| API | `router.project-osrm.org` | 443/TCP (HTTPS) outbound | `GET /api/maps/route` | — | Optional (route preview) | TBD (BUSINESS) |
| Worker | External providers | — | No outbound provider call in the current code | — | NO | N/A |
| API / Worker hosts | Container registry | 443/TCP (HTTPS) outbound | Image pull | — | YES | BLOCKED — O-2 |
| Operator | Droplets (SSH / console) | TBD | Administration | TBD | TBD | TBD (OPS) — not defined in the repository |

PostgreSQL and Valkey are never exposed publicly. The provider's trusted-sources list should contain only the API / worker host(s), plus the host that runs the release step if it is different.

### D. Environment and secrets inventory

Only secrets that the repository reads are listed. CURRENT STATUS describes the staging secret store, which does not exist yet; no value is written anywhere in this document.

| SECRET | PURPOSE | STAGING REQUIRED? | STORAGE | ROTATION | CURRENT STATUS |
|--------|---------|-------------------|---------|----------|----------------|
| `DATABASE_URL` (PostgreSQL user + password) | API, worker and release job connection; carries `sslmode` / `sslrootcert` | YES | Secret store **TBD** (OPS; DO encrypted env or team store) | TBD — no documented procedure (OPS) | MISSING |
| PostgreSQL CA certificate (file; not a secret) | TLS verify-full against the provider CA | YES | Mounted file on API / worker / release hosts; path referenced by `sslrootcert` | Follows the provider CA | MISSING |
| `REDIS_URL` (Valkey password) | Rate-limit storage | YES (API) | Secret store TBD | TBD — no documented procedure (OPS) | MISSING |
| `ADMIN_SECRET` | Admin token signing key (`auth.ts`); fail-closed at boot | YES | Secret store TBD | TBD — no documented procedure (SECURITY) | MISSING |
| `CUSTOMER_SECRET` | Customer token signing + OTP hash pepper (`auth.ts`); fail-closed | YES | Secret store TBD | TBD (SECURITY) | MISSING |
| `POS_SECRET` | Signed POS QR tokens (`pos.ts`); fail-closed | YES | Secret store TBD | TBD (SECURITY) | MISSING |
| `FOM_WEBHOOK_SECRET` | FOM sale webhook auth (`securityEnv.ts`) | YES (fail-closed in production-like) | Secret store TBD | TBD (SECURITY) | MISSING |
| `MERCHANT_SECRET_KEK` | AES-GCM `enc:v1` key for branch Payme / Click merchant secrets stored in the DB | YES | Secret store TBD (ENVIRONMENT_KEK; no managed KMS, 12.49) | New KEK → re-encrypt → retire old (§ 10) | MISSING |
| `ESKIZ_EMAIL` / `ESKIZ_PASSWORD` | Eskiz SMS login (`sms.ts`) | YES for OTP SMS | Secret store TBD | TBD (OPS) | MISSING |
| `PAYME_SANDBOX_KEY` | Payme sandbox E2E harness | Only for the sandbox gate | Secret store TBD | Rotate if compromised (runbook § sandbox) | MISSING |
| `CLICK_SANDBOX_SECRET` | Click sandbox E2E harness | Only for the sandbox gate | Secret store TBD | Rotate if compromised (runbook § sandbox) | MISSING |
| Branch Payme key / Click secret | Per-branch merchant credentials | When PSP is enabled | PostgreSQL, encrypted with the KEK (not env) | TBD (SECURITY) | MISSING |

Non-secret identifiers (`PAYME_SANDBOX_MERCHANT_ID`, `CLICK_SANDBOX_SERVICE_ID` / `MERCHANT_ID`, `ESKIZ_FROM`) and plain config (`APP_ENV=staging`, `NODE_ENV=production`, `PORT=5000`, `CORS_ORIGIN`, `ENABLE_BACKGROUND_WORKERS=1` on the worker) belong in the environment config, not the secret store. Placeholders only: `.env.example`. There is no trusted-proxy variable.

### E. PostgreSQL package

- DO Managed PostgreSQL, FRA1, VPC / trusted sources only, 2 GiB single-node (12.49).
- **TLS:** `pg` 8.23 treats `sslmode=require` as verify-full, so the provider's CA must be supplied. Download the CA from the provisioned cluster (contents not reproduced here), mount it read-only as a file, and reference it in the URL: `postgres://<user>:<password>@<provider-host>:<provider-port>/<db>?sslmode=verify-full&sslrootcert=<mounted CA path>`. The mount path is chosen at provisioning (OPS); it is not in `.env.example`. Never use `sslmode=no-verify` or disable verification.
- **Pool:** `PG_POOL_MAX` (default 20), `PG_POOL_IDLE_MS`, `PG_POOL_CONNECT_TIMEOUT_MS` (`lib/db/src/poolConfig.ts`). Size the total (API replicas × max + worker + release job's 1) against the provider's connection limit, which is **TBD** until provisioning.
- **Boot guards:** `assertProductionDatabaseConfig` refuses staging without a `postgres://` URL, with `DB_DRIVER=pglite`, or without `ADMIN_SECRET` / `CUSTOMER_SECRET`. The demo seed never runs in staging.
- Migrations: § L. Backup / PITR: § M.

### F. Valkey package

- DO Managed Valkey, FRA1, VPC / trusted sources only, 1 GiB single-node (12.49). Used by the API only.
- `REDIS_URL=rediss://<user>:<password>@<provider-host>:<provider-port>` (format from `lib/redis.ts`; host, port and user come from the provisioned resource).
- **Startup:** `assertProductionRedisConfig` requires `REDIS_URL`; `warmRedisForBoot` connects and PINGs, and production-like boot exits on failure. Boot log: `rateLimitStorage: "redis"`.
- **Failure:** the limiter fails closed (HTTP 503 `RATE_LIMIT_REDIS_UNAVAILABLE`); there is no in-memory fallback in staging. Readiness stays PostgreSQL-only (12.38 contract, pinned by `phase12-38-redis-staging-gate`).
- **TLS certificate:** `rediss://` uses Node's default certificate verification and the app has no CA-file option for Valkey. Whether the provider's Valkey certificate verifies against the default trust store must be confirmed at provisioning — **TBD** (PROVIDER). If it does not, that is a code change, not a reason to disable verification.

### G. API deployment package

| Check | Evidence (repository / local) | Status |
|-------|-------------------------------|--------|
| `dist/index.mjs`, `dist/worker.mjs`, `dist/migrate.mjs` | `build.mjs` entry points; local build emits all three | CODE READY |
| Production dependencies only | `prod-deps` stage: `pnpm install --frozen-lockfile --prod --no-optional --filter @workspace/api-server...` | CODE READY (13.20 local prod-only install) |
| `ioredis` + `@electric-sql/pglite` present at runtime | Both are bundle externals; PGlite is still imported statically by the bundle even in staging; CI step `EXTERNALS_OK` | CODE READY; CI not run |
| Migrations in image | `COPY --from=build /app/lib/db/migrations ...`; CI `test -f /app/lib/db/migrations/meta/_journal.json` | CODE READY; CI not run |
| Non-root, healthcheck, no baked secrets | `USER appuser`; `HEALTHCHECK /api/health/live`; PSP / worker flags `0` | CODE READY |
| Graceful shutdown / secret validation | Boot guards (DB, Redis, KEK, CORS, no trust proxy) | CODE READY |
| `docker build` | — | **BLOCKED — Docker unavailable** locally; CI not executed |

Commands (actual `artifacts/api-server/package.json` scripts): `start` = `node --enable-source-maps ./dist/index.mjs` (API; there is **no** `start:api` script), `start:worker`, `migrate:release`, `migrate:release:status`. In the image: `CMD ["node","--enable-source-maps","dist/index.mjs"]` (default).

### H. Worker deployment package

- Same image, `CMD ["node","--enable-source-maps","dist/worker.mjs"]`, `ENABLE_BACKGROUND_WORKERS=1`, the database secrets and KEK; no `REDIS_URL` needed. Disable the image HEALTHCHECK for it (no port).
- Source of truth: the PostgreSQL `worker_jobs` table. Claims use FOR UPDATE SKIP LOCKED with leases; stale RUNNING jobs are reclaimed after `WORKER_STALE_RUNNING_MS` (default 30 min). No other queue, no BullMQ.
- Tick: enqueue idempotent hourly sweeps, then drain due jobs in batches of 20, at most 10 batches per tick; poll interval `WORKER_POLL_INTERVAL_MS` (default 15 s, clamped 1–300 s); ticks never overlap.
- SIGTERM / SIGINT: stop scheduling, wait up to 25 s for the in-flight tick, exit 0 when drained.
- No public inbound traffic. Several replicas are safe. The API never starts workers (`workersAutoStart: false`).

### I. Admin deployment package

- `artifacts/admin-web/src/api.ts` uses `const API = ""`, so the build calls same-origin `/api`. The edge serves `artifacts/admin-web/dist` and forwards `/api/*` on one hostname. No build change is needed.
- 13.21 bundle scan (`artifacts/admin-web/dist`): no database URL, no provider credential, no secret variable names, no private address and no hard-coded API hostname (results in `docs/ADMIN_IMPLEMENTATION_STATUS.md` § Phase 13.21).
- A separate Admin hostname would require an application change (an API base URL), which is not done.

### J. Domain / TLS plan

- Target structure: `https://<staging-domain>/` serves the Admin static build and `https://<staging-domain>/api/*` reaches the API. The domain is **not decided** (BUSINESS); no hostname is hard-coded in application code.
- Certificate issuance and renewal depend on the edge choice — **TBD** (OPS).
- `CORS_ORIGIN` lists only real cross-origin browser clients, each an exact `https://` origin with no path, no trailing slash and no wildcard (boot fails otherwise in staging). Same-origin Admin needs no entry. Leaving it unset keeps legacy reflect mode and logs a boot warning, so set it in staging.

### K. Trusted-proxy cutover requirements — O-6 TRUSTED PROXY CUTOVER BLOCKER

Current state (13.19, authoritative): Express `trust proxy` is off and `assertNoProxyTrust(app)` refuses to boot if it is enabled. Forwarding headers are ignored, and every rate-limit key and auth-event IP comes from the TCP peer.

Why it matters: behind any HTTPS edge, every client reaches the API from the edge's address. All clients then share one rate-limit identity, and auth-event IP telemetry records the edge instead of the client. That is acceptable for a closed internal smoke test only.

Before trust can be enabled, OPS + SECURITY must provide:

1. The exact proxy type.
2. The exact proxy IPs / CIDRs.
3. Forwarding-header behaviour (overwrite vs append `X-Forwarded-For`).
4. The firewall restriction ensuring only the proxy reaches the API.
5. The TLS termination point.
6. The expected proxy chain.
7. Test evidence.

Only then is an address-restricted trust configuration (never `true`, never a hop count, never a broad range) a reviewed code change. Nothing changes at runtime in this phase.

### L. Migration release procedure — O-8

Journal: 14 migrations, ending at `0013_auth_event_telemetry`. This phase adds no migration.

13.21 code (deployment blocker fixed, CODE READY):

- **The release entry point** is `dist/migrate.mjs` (`artifacts/api-server/src/migrate.ts`, which calls `@workspace/db/release`). It runs no seed and no HTTP server, uses one pooled connection, never prints the URL, and exits non-zero unless every journal migration is applied, no unknown applied hash exists, and the critical tables are present.
- **Two modes:** `--status` is read-only; without the flag it applies the migrations.
- **API boot and the release step share one PostgreSQL advisory lock** (`lib/db/src/migrationLock.ts`). Concurrent starts are therefore serialized: one applies, the others wait, then find nothing pending.

LOCAL evidence (embedded PostgreSQL 18.4, temp directory; **not staging evidence**):

- Status on an empty database: exit 1, 14 pending.
- Two concurrent apply runs: both exited 0, with 14 applied and no error.
- Status afterwards: exit 0, ending at `0013_auth_event_telemetry`.
- A repeated apply: a no-op.

Controlled sequence:

1. Provision PostgreSQL (§ E).
2. Verify network / TLS: the CA is mounted and the release host is in trusted sources.
3. Verify `DATABASE_URL` is set in the secret store (never print it).
4. Run `node --enable-source-maps dist/migrate.mjs --status` in a one-off container of the release image. On a new database, expect exit 1 with 14 pending.
5. Run `node --enable-source-maps dist/migrate.mjs` **once**, as a single one-off job.
6. Verify the journal: the report shows `pendingTags: []`, `appliedCount: 14`, `lastJournalTag: "0013_auth_event_telemetry"`.
7. Verify critical tables: the report shows `missingCriticalTables: []` (lists from `lib/db/src/health.ts`).
8. Start the API replicas (boot finds nothing pending).
9. Start the worker.
10. Run the smoke tests (§ P).

Rollback: drizzle migrations are forward-only and no down-migration procedure exists. A bad migration is fixed by a new forward migration, or by restore under controlled recovery (§ M / § Q).

### M. Backup / PITR procedure (NOT RUN)

Configuration: enable automated backups and PITR on the managed cluster (12.48 verified a 7-day PITR capability; retention for staging is **TBD**, OPS).

Evidence drill (each step is NOT RUN):

1. Insert controlled staging test data.
2. Verify the backup / PITR configuration.
3. Restore to an isolated new cluster.
4. Run `dist/migrate.mjs --status` against it and confirm exit 0 at `0013`.
5. Check the critical records: orders, payments, `payment_intents`, `cashback_ledger`, `product_stocks`, reservations, `worker_jobs`, `audit_log`.
6. Point a temporary API at it and confirm `/api/health/ready` returns `driver: "postgres"`.
7. Record the restore duration.
8. Record RPO / RTO evidence.
9. Delete the restored cluster safely.

`pnpm backup:drill` (PGlite) is not evidence.

### N. Container registry — O-2

**STATUS = DECISION REQUIRED** (DEVOPS). No registry is selected or created; CI builds the image but does not push. Alternatives, **none selected**: DigitalOcean Container Registry, GitHub Container Registry, or another OCI registry. The decision needs a push policy (CI on main / tags), image tagging (immutable digest per release), pull credentials on the Droplets, and retention.

### O. Monitoring / alerting

Present today: pino JSON logs with redaction; log-based alert codes (`emitAlert` in `lib/alerts.ts`: `PAYMENT_*`, `WORKER_JOB_FAILED`, `WORKER_JOB_DEAD`, `WORKER_QUEUE_BACKLOG`, `WORKER_STALE_JOB_RECLAIMED`, `FOM_*`, `DELIVERY_PROVIDER_FAILURE`, `CASHBACK_*`, `RATE_LIMITED`, `RATE_LIMIT_REDIS_UNAVAILABLE`); health endpoints; DO metrics (12.49). No metrics / APM platform is selected, and none is added here.

| Area | Required signal | Source available today | Status |
|------|-----------------|------------------------|--------|
| API | Availability | `/api/health/live`, `/api/health/ready` (external probe needed) | TBD |
| API | HTTP errors / latency | pino-http request logs | TBD (no aggregation) |
| API | Auth failures | `auth_events` table + logs | TBD |
| API | Rate-limit failures / Redis errors | `RATE_LIMITED`, `RATE_LIMIT_REDIS_UNAVAILABLE` log alerts | TBD |
| API | DB errors | readiness 503 + error logs | TBD |
| Worker | Running / failed / stale-reclaimed jobs, latency | `worker_jobs` rows; `WORKER_*` log alerts | TBD |
| PostgreSQL | Connection health, errors, storage, CPU / memory | Provider metrics | TBD |
| Valkey | Availability, memory, connection errors | Provider metrics; boot PING | TBD |

Alert destination: **STATUS = TBD** (OPS). The runbook's severity table (Sev-1 pages on-call) has no configured channel.

### P. Smoke-test procedure

The evidence checklist (INFRA / APPLICATION / SECURITY / RESILIENCE, each NOT RUN / PASS / FAIL / BLOCKED) is in `docs/ADMIN_IMPLEMENTATION_STATUS.md` § Phase 13.21. Nothing is PASS, because nothing is provisioned.

### Q. Rollback

- **Application:** redeploy the previous image digest (needs O-2) with the previous release's environment.
- **Database:** no destructive rollback and no down migrations. Use forward-fix migrations; restore (§ M) only under controlled recovery with an owner sign-off.
- **Worker:** stop the worker; queued jobs stay in `worker_jobs` (RUNNING ones are reclaimed after `WORKER_STALE_RUNNING_MS`); start the previous worker image.
- **Admin:** redeploy the previous static build.
- **Configuration:** revert environment changes one at a time, then restart. Never "fix" an outage by disabling TLS verification, the limiter or the boot guards.

### R. Cost / size

Documented only: PostgreSQL 2 GiB (~$30.45/mo) and Valkey 1 GiB ($15/mo) list prices from 12.49. Droplets, the Load Balancer, the registry and bandwidth are **TBD** (DEPENDS_ON_PLAN).

### S. Deployment order (runbook — do not execute without authorization)

| Phase | Step | Depends on | Owner |
|-------|------|-----------|-------|
| A | Cloud account / access, team roles | Authorization | OPS |
| B | VPC / network in FRA1 | A | OPS |
| C | Managed PostgreSQL + CA download + trusted sources | B | OPS |
| D | Managed Valkey + trusted sources | B | OPS |
| E | Registry (O-2 decision) + CI push | A | DEVOPS |
| F | API / worker compute | B, E | OPS |
| G | Firewall (§ C) | F | OPS + SECURITY |
| H | Domain / DNS (`<staging-domain>`) | Domain decision | BUSINESS + OPS |
| I | TLS / HTTPS edge (same origin: static Admin + `/api`) | F, H | OPS |
| J | Migration release (`dist/migrate.mjs --status`, then apply once) | C, E | DEVOPS |
| K | API (`APP_ENV=staging`, secrets, `CORS_ORIGIN`) | J, D | DEVOPS |
| L | Worker (`ENABLE_BACKGROUND_WORKERS=1`) | J | DEVOPS |
| M | Admin static build on the edge | I | DEVOPS |
| N | Provider sandbox credentials (Payme, Click, Eskiz) | K | PROVIDER + BUSINESS |
| O | Smoke tests (§ P) | K, L, M | OPS |
| P | Load / concurrency (preconditions below) | O, R | OPS |
| Q | Backup / restore drill (§ M) | C | OPS |
| R | Trusted-proxy decision (O-6, § K) | I | OPS + SECURITY |

Load-test preconditions: real PostgreSQL, real Valkey, the real API and a live worker, never PGlite. Before testing, O-6 must be decided (otherwise every virtual client shares the edge's rate-limit identity), the limiter's behaviour understood, database capacity and connection limits known, the worker deployed, and the § O signals observable. The 1000+ branch load test is not run in this phase.

### Blockers (with owners)

| # | Blocker | Category |
|---|---------|----------|
| 1 | No authorization / account access to create DigitalOcean resources | OPS |
| 2 | Registry not selected (O-2) | DEVOPS |
| 3 | Staging domain not decided | BUSINESS |
| 4 | Edge type not decided (static Admin + `/api` on one origin) | OPS |
| 5 | Trusted-proxy topology (O-6) | SECURITY + OPS |
| 6 | Secret store not chosen; every staging secret MISSING | OPS + SECURITY |
| 7 | Valkey certificate trust with Node defaults unverified | PROVIDER |
| 8 | PSP callback source addresses / sandbox credentials; Eskiz credentials | PROVIDER |
| 9 | Alert destination not chosen | OPS |
| 10 | Production use of the public OSRM routing server | BUSINESS |
| 11 | `docker build` and the CI runtime checks not executed | DEVOPS |

