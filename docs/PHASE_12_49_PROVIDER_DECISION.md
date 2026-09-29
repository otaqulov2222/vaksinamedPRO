# Phase 12.49 — Provider Decision & Final Staging Architecture

> **Decision document only.** No provisioning · no credentials · no production enablement · no git.  
> Date: 2026-09-28.  
> Baseline: [`docs/PHASE_12_48_PROVIDER_RESEARCH.md`](./PHASE_12_48_PROVIDER_RESEARCH.md).  
> **PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING**

---

## 1. Decision criteria (VaksinaMed)

Critical requirements evaluated against Phase 12.48 **VERIFIED** evidence only:

1. Managed PostgreSQL  
2. PITR  
3. Backup  
4. Restore  
5. TLS  
6. HA path  
7. Managed Redis/Valkey  
8. Redis TLS/auth  
9. Multi-instance rate limiting (app + shared Redis)  
10. KMS **or** secure secret-management path for `MERCHANT_SECRET_KEK`  
11. Always-on worker  
12. HTTPS  
13. Monitoring  
14. Private networking  
15. Operational simplicity  
16. Staging cost (verifiable)  
17. Production scaling path  
18. Region suitable for Uzbekistan (geographic; latency unmeasured)  
19. Provider portability (`DATABASE_URL` / `REDIS_URL`)  
20. Future 1000+ branch architecture (scaling path, not capacity claim)

Classifications: **FITS** | **FITS_WITH_TRADEOFFS** | **DOES_NOT_FIT_CURRENT_REQUIREMENTS**

Hard-gate outcomes: **PASS** | **PASS_WITH_TRADEOFF** | **FAIL**

---

## 2. Hard-gate evaluation (Phase 12.48 only)

| Gate | AWS | GCP | Azure | DigitalOcean | Hetzner |
|------|-----|-----|-------|--------------|---------|
| Managed PG | PASS | PASS | PASS | PASS | **FAIL** |
| PITR | PASS | PASS | PASS | PASS (7-day window) | **FAIL** |
| Restore | PASS | PASS | PASS | PASS | **FAIL** |
| TLS (PG) | PASS | PASS | PASS | PASS | N/A |
| HA path | PASS | PASS | PASS | PASS (standby) | **FAIL** |
| Managed Redis/Valkey | PASS | PASS | PASS | PASS | **FAIL** |
| Redis TLS | PASS | PASS | PASS | PASS | N/A |
| Redis auth | PASS | PASS | PASS | PASS | N/A |
| KMS / secret path | PASS (KMS+SM) | PASS (KMS+SM) | PASS (Key Vault) | **PASS_WITH_TRADEOFF** (no cloud KMS; env/secret inject) | **FAIL** |
| Always-on worker | PASS | PASS_WITH_TRADEOFF (Cloud Run) / PASS (GCE) | PASS_WITH_TRADEOFF (min replicas) | PASS (Droplet) | PASS (compute only) |
| HTTPS | PASS | PASS | PASS | PASS | PASS |
| Private network | PASS | PASS | PASS | PASS (VPC) | PASS |
| Monitoring | PASS | PASS | PASS | PASS | PASS_WITH_TRADEOFF |
| Backup (managed PG) | PASS | PASS | PASS | PASS | **FAIL** |
| Future scaling | PASS | PASS | PASS | PASS (plan upgrades) | FAIL for managed DB path |
| Staging price verifiable | DEPENDS_ON_PLAN | DEPENDS_ON_PLAN | DEPENDS_ON_PLAN | **PASS** (DB+Valkey list VERIFIED; compute DEPENDS_ON_PLAN) | FAIL (no managed stack) |

### Fit summary

| Option | Provider | Fit |
|--------|----------|-----|
| A | AWS | **FITS** (full KMS; staging USD **DEPENDS_ON_PLAN**; higher ops surface) |
| B | Google Cloud | **FITS_WITH_TRADEOFFS** (worker on Cloud Run needs min instances; else GCE) |
| C | Azure | **FITS_WITH_TRADEOFFS** (worker min replicas; staging USD **DEPENDS_ON_PLAN**) |
| D | DigitalOcean | **FITS_WITH_TRADEOFFS** (managed PG+Valkey+Droplets **VERIFIED**; cloud KMS **NOT_AVAILABLE**) |
| E | Hetzner | **DOES_NOT_FIT_CURRENT_REQUIREMENTS** (managed PG/Redis/KMS **NOT_AVAILABLE**) |

---

## 3. SELECTED STAGING PROVIDER

**SELECTED STAGING PROVIDER: DigitalOcean**

### WHY (factual only)

1. **Managed PostgreSQL** with automated daily backups, **PITR (7-day)**, restore to **new** cluster, TLS required, VPC, HA via standby — all **VERIFIED** (Phase 12.48 §5).  
2. **Managed Valkey** (Redis-compatible) with TLS + auth — **VERIFIED**; sufficient for shared rate-limit (financial SoT remains PostgreSQL).  
3. **Always-on worker** on Droplet — **VERIFIED** without Cloud Run always-on caveats.  
4. Application already boots with `DATABASE_URL`, `REDIS_URL`, `MERCHANT_SECRET_KEK` — **no code changes** required for provider switch.  
5. **Published list prices** for PG + Valkey enable a concrete **STAGING ESTIMATE** fragment; hyperscaler totals remain **DEPENDS_ON_PLAN** / calculator-only.  
6. Regions **FRA1 / AMS3 / BLR1** documented with Managed Databases availability — geographic candidates for Uzbekistan users (latency **LIVE_LATENCY_TEST_REQUIRED**).  
7. Does **not** require inventing unsupported managed DB/Redis (unlike Hetzner).  
8. Portability retained: standard connection URLs; can move to AWS/GCP/Azure later without rewriting payment/delivery/FOM adapters.

### TRADEOFFS (factual)

1. **No AWS/GCP/Azure-class KMS** — **NOT_AVAILABLE** on DigitalOcean. Staging uses **ENVIRONMENT_KEK** (`MERCHANT_SECRET_KEK`) injected as a secret env var. **This is not equivalent to managed KMS.** P0-2 remains **OPS_REQUIRED** until SECURITY accepts ENVIRONMENT_KEK for production **or** migrates KEK custody to a hyperscaler KMS / external vault.  
2. PostgreSQL PITR retention **7 days** (shorter than some hyperscaler edition windows).  
3. Valkey daily PITR — **NOT_AVAILABLE** (acceptable: Redis is not financial SoT).  
4. Droplet / LB / bandwidth exact USD — **DEPENDS_ON_PLAN** until SKUs chosen at provision.  
5. Production 1000+ branch capacity — **NOT** claimed; requires staging P13/P13.1 + sizing. **PRODUCTION SIZE NOT FINALIZED**.

---

## 4. NON-SELECTED PROVIDERS

| Provider | Reason (factual) |
|----------|------------------|
| **AWS** | Full fit including KMS (**PASS**). Not selected for **first staging** because exact staging monthly total is **NOT_VERIFIED** / **DEPENDS_ON_PLAN**, and ops surface is larger. Remains primary **portability / production-upgrade** candidate if SECURITY requires cloud KMS. |
| **Google Cloud** | Full managed fit; Cloud Run worker is **PASS_WITH_TRADEOFF**. Same staging-price gap as AWS. |
| **Azure** | Full managed fit with Key Vault; worker **PASS_WITH_TRADEOFF**. Same staging-price gap. |
| **Hetzner** | **DOES_NOT_FIT_CURRENT_REQUIREMENTS** — managed PostgreSQL, managed Redis/Valkey, and KMS **NOT_AVAILABLE** on Hetzner Cloud without inventing self-managed DB architecture (forbidden by project gates). |

---

## 5. SELECTED REGION

| Item | Value |
|------|--------|
| **Primary candidate** | DigitalOcean **FRA1** (Frankfurt) |
| Justification | Documented Managed PostgreSQL + Valkey availability; EU geography relevant to Uzbekistan users |
| Alternate | **AMS3** (Amsterdam) or **BLR1** (Bangalore) if FRA1 capacity/pricing differs at provision time |
| Latency claim | **None** |
| Status | **LIVE_LATENCY_TEST_REQUIRED** after staging exists |

---

## 6. STAGING ARCHITECTURE (concrete)

```
                    Internet (Uzbekistan / global)
                              |
                           HTTPS:443
                              |
                    DigitalOcean Load Balancer
                    (optional but recommended)
                              |
              +---------------+---------------+
              |                               |
         API Droplet(s)                  Admin (static on
         (Node / Docker)                 same Droplet path
              |                          or DO Spaces+CDN /
              |                          separate Droplet)
              |
       +------+------+------------------+
       |      |      |                  |
   Managed  Managed  Worker Droplet     Secrets (env /
   PostgreSQL Valkey  (always-on;       DO encrypted env;
   (FRA1 VPC) (FRA1)  ENABLE_BACKGROUND  never in git)
                      _WORKERS=1)
              |
       Outbound HTTPS (application-level)
       /          |          \
   Payme       Click       Eskiz
   sandbox     sandbox     SMS
```

| Component | Role | Notes |
|-----------|------|-------|
| Managed PostgreSQL | SoT | TLS; backups+PITR on; restore target = new disposable cluster |
| Managed Valkey | Rate-limit share | `rediss://` / TLS; auth password; not financial SoT |
| API Droplet | HTTPS API | Inject `DATABASE_URL`, `REDIS_URL`, KEK, app secrets |
| Worker Droplet | `worker_jobs` | Same image/env DB+KEK; restart policy; may share API host initially (**TO_BE_AGREED** at provision) |
| Admin | Operator UI | Points at staging API origin |
| Mobile | Expo | `EXPO_PUBLIC_API_URL` = staging HTTPS API |
| Object storage | **OPTIONAL** | Spaces only if Product requires (P1-6) |
| Payme/Click/Eskiz | External | Sandbox/staging creds only; production flags **OFF** |

**Hyperscaler check:** App can use `DATABASE_URL` + `REDIS_URL` + secret injection + worker/API env on AWS/GCP/Azure **without code changes** — retained as migration path.

---

## 7. PRODUCTION FUTURE ARCHITECTURE (not provisioned)

| Layer | Staging | Production (future) |
|-------|---------|---------------------|
| Provider | DigitalOcean (selected) | Same **or** migrate to AWS/GCP/Azure if KMS/HA/region evidence requires — **TO_BE_AGREED** |
| PostgreSQL | Single-node or +standby | HA standby (or hyperscaler Multi-AZ); larger plan after load |
| Valkey | Single-node staging | HA standby if rate-limit availability requires |
| API | 1+ Droplet | Scale horizontally; shared Valkey |
| Worker | Always-on | ≥1 always-on; reclaim drills proven |
| Secrets | ENVIRONMENT_KEK | Prefer KMS-backed KEK if production SECURITY requires |
| PSP flags | **0** | Explicit GO only after sandbox PASS |
| Sizing | Small STAGING ESTIMATE | **PRODUCTION SIZE NOT FINALIZED** |

Staging resources ≠ production capacity. P13/P13.1 = **OBSERVED TEST RESULT ≠ PRODUCTION CAPACITY**.

---

## 8. SECRET ARCHITECTURE

**Never print values.**

| Secret | Source | Storage | Injection | Rotation | Access boundary | Logging |
|--------|--------|---------|-----------|----------|-----------------|---------|
| `DATABASE_URL` | DO Managed PG connection string | DO control panel / encrypted team secret store | Env on API + worker only | Rotate DB password via DO; update env | Private VPC preferred; no public PG | Never log URL |
| `REDIS_URL` | DO Managed Valkey | Same | Env on API (+ worker if needed) | Rotate Valkey password | VPC / trusted sources | Never log URL |
| `MERCHANT_SECRET_KEK` | Generated 32-byte key | Encrypted env / vault (**not** git) | Env at process start | Re-encrypt `enc:v1` rows then retire old KEK | API + worker only | Never log KEK |
| Branch Payme/Click secrets | Admin write | DB as `enc:v1` ciphertext | Decrypt → WeakMap at payment boundary | Update via Admin (blank ≠ erase) | Payment adapters only | Scrubbed in DTO/audit |
| `ADMIN_SECRET` / `CUSTOMER_SECRET` / `POS_SECRET` | Generated | Encrypted env | Env | Rotate + force re-login | API | Never log |
| Eskiz `ESKIZ_EMAIL` / `ESKIZ_PASSWORD` / `ESKIZ_FROM` | Eskiz account | Encrypted env | Env | Provider portal + env update | SMS module | No OTP plaintext in prod-like |
| Payme/Click sandbox harness vars | PSP sandbox console | Staging secrets only | Harness env; `SANDBOX_E2E_RUN=1` | Rotate in PSP console | Staging only | Never commit |

### DigitalOcean KMS limitation (explicit)

- Cloud KMS product: **NOT_AVAILABLE**.  
- Mitigation: **ENVIRONMENT_KEK** already **READY_IN_REPO** / **TEST_VERIFIED** (`enc:v1` AES-256-GCM + WeakMap).  
- Ops must store KEK outside git, restrict who can read Droplet env, and document rotation.  
- **Do not claim ENVIRONMENT_KEK = managed KMS.**  
- P0-2 gate status remains **OPS_REQUIRED** (evidence of secure inject + plaintext migration; optional later KMS upgrade).

---

## 9. STAGING COST MODEL

### Assumptions

- Region: FRA1 (candidate).  
- PG: Managed PostgreSQL **2 GiB** single-node (Phase 12.48 list ~**$30.45**/mo) — **VERIFIED** list price.  
- Valkey: **1 GiB** single-node (**$15**/mo) — **VERIFIED**.  
- API Droplet, Worker Droplet, Load Balancer, Spaces, bandwidth overage: **DEPENDS_ON_PLAN** (choose at provision; do not fabricate Droplet USD here).  
- No HA standby in initial staging (optional later; doubles DB/Valkey node cost per DO docs).  
- Labels: **STAGING ESTIMATE** only — not a quote; re-check [DO pricing](https://www.digitalocean.com/pricing/managed-databases) at purchase.

| Line | Status | ~USD/mo |
|------|--------|---------|
| Managed PostgreSQL 2 GiB | **VERIFIED** list | ~30.45 |
| Managed Valkey 1 GiB | **VERIFIED** list | 15.00 |
| API compute (Droplet) | **DEPENDS_ON_PLAN** | — |
| Worker compute | **DEPENDS_ON_PLAN** | — |
| Admin hosting | Often $0 if same Droplet | **DEPENDS_ON_PLAN** |
| Load balancer | **DEPENDS_ON_PLAN** | — |
| Object storage | Optional | **DEPENDS_ON_PLAN** |
| Backups | Included in managed PG (per DO docs) | included in PG line |
| Monitoring | DO metrics | included / **DEPENDS_ON_PLAN** |
| KMS | N/A (env KEK) | 0 platform KMS fee |
| Bandwidth | DO allowances | **DEPENDS_ON_PLAN** |
| **Subtotal VERIFIED (DB+Valkey only)** | | **~$45.45** |
| **MONTHLY STAGING ESTIMATE (full)** | | **~$45.45 + Droplet(s) + LB (DEPENDS_ON_PLAN)** |

---

## 10. PRODUCTION COST MODEL

**PRODUCTION SIZE NOT FINALIZED.**

Scaling drivers (measure on staging):

- 200 / 500 / 1000+ branches  
- Concurrent users / RPS  
- DB storage + connections  
- Redis/Valkey memory  
- Worker job throughput  
- Payment + SMS traffic  
- Bandwidth  
- HA (standby multipliers)  
- PITR retention needs  
- Monitoring  

No fabricated production monthly total.

---

## 11. LATENCY PLAN

Status: **LIVE_LATENCY_TEST_REQUIRED**

After staging exists, from Tashkent:

1. API TCP/TLS latency  
2. End-to-end paths that exercise PostgreSQL and Valkey via API  
3. API p50 / p95 / p99 (`/health/live`, `/health/ready`)  
4. Orders, inventory, cashback, checkout (sandbox) latency  

Do not claim latency now.

---

## 12. PORTABILITY

| Concern | Mechanism |
|---------|-----------|
| PostgreSQL | `DATABASE_URL` only — migrate dump/restore to RDS/Cloud SQL/Azure Flexible |
| Redis/Valkey | `REDIS_URL` / `rediss://` — point at ElastiCache/Memorystore/Azure Cache |
| Object storage | Optional; keep S3-compatible API if introduced |
| Payments | Payme/Click adapters already contract-based |
| Delivery | Adapter + **CONTRACT_PENDING** |
| FOM | Contract boundary; writer OFF |
| Avoid | Provider-specific business logic in app code |

---

## 13. PROVISIONING PLAN (future — do not execute now)

| Step | Action |
|------|--------|
| 1 | Create DigitalOcean account/project (OPS) |
| 2 | Create VPC in FRA1 (or chosen region) |
| 3 | Create Managed PostgreSQL (staging size) |
| 4 | Confirm backups + PITR enabled; document retention (7d) |
| 5 | Create Managed Valkey (TLS/auth) |
| 6 | Create API Droplet (Docker image from repo `Dockerfile`) |
| 7 | Create Worker Droplet or second process; restart policy |
| 8 | Configure secrets (DB/Redis/KEK/app/Eskiz) — never git |
| 9 | Configure HTTPS (LB + cert) |
| 10 | Deploy API |
| 11 | Deploy Admin |
| 12 | Run migrations 0000–0010 |
| 13 | Health: `/api/health/live` + `/api/health/ready` |
| 14 | Smoke tests |
| 15 | Redis multi-instance rate-limit test |
| 16 | Worker crash/reclaim drill |
| 17 | Payme sandbox E2E (`SANDBOX_E2E_RUN=1`) |
| 18 | Click sandbox E2E |
| 19 | SMS Eskiz staging test |
| 20 | P13/P13.1 staging load |
| 21 | Latency measurement (Tashkent) |
| 22 | Complete production gate evidence package |

**This phase does not execute any step.**

---

## 14. GO / NO-GO MATRIX

| Gate | Provider support | Current status | Evidence required | Can close in staging? |
|------|------------------|----------------|-------------------|------------------------|
| P0-1 PG/PITR | PASS (DO managed PG) | **OPS_REQUIRED** | Live URL, ready, migrate, backup, PITR, empty restore, RPO/RTO | Yes (after provision) |
| P0-2 KMS/KEK | PASS_WITH_TRADEOFF (ENVIRONMENT_KEK) | **OPS_REQUIRED** | KEK injected securely; plaintext migrated; SECURITY acceptance that env KEK ≠ cloud KMS | Partially (KEK ops); full cloud KMS **No** on DO |
| P0-3a Payme | App-level | **OPS_REQUIRED** | Sandbox creds + `sandbox:e2e` PASS | Yes |
| P0-3b Click | App-level | **OPS_REQUIRED** | Sandbox + E2E PASS | Yes |
| P0-4 Redis | PASS (Valkey) | **OPS_REQUIRED** | PING, dual-instance, fail-closed, recovery | Yes |
| O-4 Worker | PASS (Droplet) | **OPS_REQUIRED** / **NOT_PROVEN** | Kill drill | Yes |
| SMS | App-level Eskiz | **OPS_REQUIRED** | Live send without bypass | Yes |
| P1-3 HMAC | App-level | **OPS_REQUIRED** / **NOT_PROVEN** | s1 population + quiet | Yes (ops) |
| E-1 FOM | CONTRACT | **CONTRACT_PENDING** | Vendor contract | If FOM required |
| E-2 FOM_POS | CONTRACT | **CONTRACT_PENDING** | Vendor contract | If required |
| E-3 Delivery | CONTRACT | **CONTRACT_PENDING** | Courier contract | If required |
| E-4 PSP refund | CONTRACT | **CONTRACT_PENDING** | Provider refund API | If in scope |

**No gate closed in this phase.**

---

## 15. What DigitalOcean closes vs leaves open

| Closes path for | Leaves open |
|-----------------|-------------|
| P0-1 evidence (managed PG+PITR) | Actual live restore drill |
| P0-4 evidence (managed Valkey) | Dual-instance live drill |
| O-4 always-on worker host | Live kill drill |
| Staging cost predictability (DB+cache) | Droplet/LB exact cost; production size |
| | P0-2 cloud KMS (tradeoff / ENVIRONMENT_KEK) |
| | P0-3a/b, SMS, HMAC quiet, E-* contracts |
| | Production GO |

---

## 16. Final decision

**SELECTED STAGING PROVIDER: DigitalOcean**  
**SELECTED REGION CANDIDATE: FRA1 (Frankfurt)** — latency **LIVE_LATENCY_TEST_REQUIRED**

**PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING**

No provisioning · no credentials · no production enablement · no fabricated evidence · no git.

See: `docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md`, `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.49, `docs/PHASE_12_48_PROVIDER_RESEARCH.md`.
