# Phase 12.48 — Real Cloud Provider Research & Staging Cost Model

> **Research only.** No provisioning · no accounts · no credentials · no deployment · no production enablement · no git.  
> Date: 2026-09-28.  
> Baseline: Phase 12.47 blueprint + Phase 12.45/12.46 gates.  
> Decision unchanged: **PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING**

Sources are **official provider documentation / pricing pages** cited below.  
Where price or capability was not confirmed against a current official page in this session, status = **NOT_VERIFIED**.  
Do not treat blog posts or third-party comparisons as VERIFIED.

---

## 1. Scope

VaksinaMed staging needs (from blueprint):

- Managed PostgreSQL + backups + PITR + restore to disposable target  
- Managed Redis/Valkey + TLS + auth (rate-limit; not financial SoT)  
- Compute: API + always-on worker + Admin HTTPS  
- Secrets / KMS (or equivalent injection of `MERCHANT_SECRET_KEK`)  
- Monitoring, private networking preferred  
- Regions geographically nearer to Uzbekistan (latency = **LIVE_LATENCY_TEST_REQUIRED**)

**No provider selected.** Options A/B/C below are non-ranked.

---

## 2. AWS (research)

### 2.1 RDS PostgreSQL

| Item | Status | Evidence |
|------|--------|----------|
| Managed PostgreSQL | **VERIFIED** | Amazon RDS for PostgreSQL product |
| Automated backups | **VERIFIED** | [USER_WorkingWithAutomatedBackups](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html) |
| PITR | **VERIFIED** | [USER_PIT](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html) — restore to point in time creates new instance |
| Multi-AZ / HA | **VERIFIED** | [RDS Multi-AZ](https://aws.amazon.com/rds/features/multi-az/) |
| TLS | **VERIFIED** | RDS SSL/TLS via parameter groups (force_ssl etc.) — confirm config at provision time |
| VPC / private networking | **VERIFIED** | RDS in VPC |
| Monitoring | **VERIFIED** | CloudWatch integration (product category) |
| Exact staging USD price | **DEPENDS_ON_PLAN** | Region + instance class + storage + Multi-AZ; use [AWS Pricing Calculator](https://calculator.aws/) — **NOT_VERIFIED** as a single USD figure in this doc |

### 2.2 ElastiCache (Valkey / Redis OSS)

| Item | Status | Evidence |
|------|--------|----------|
| Valkey / Redis OSS managed | **VERIFIED** | ElastiCache for Valkey and Redis OSS |
| TLS in transit | **VERIFIED** | [in-transit encryption](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/in-transit-encryption.html) |
| Auth (AUTH / IAM / RBAC) | **VERIFIED** | [encryption / auth](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/encryption.html) |
| Encryption at rest | **VERIFIED** | Same encryption docs |
| Multi-AZ / failover | **VERIFIED** (capability) | Replication groups / Multi-AZ; exact SKU **DEPENDS_ON_PLAN** |
| Exact staging USD | **DEPENDS_ON_PLAN** | [ElastiCache pricing](https://aws.amazon.com/elasticache/pricing/) — figure **NOT_VERIFIED** here |

### 2.3 Compute / HTTPS / worker

| Item | Status | Notes |
|------|--------|-------|
| Container / VM options | **VERIFIED** | ECS/Fargate, EKS, EC2 — product categories exist |
| HTTPS / LB | **VERIFIED** | ALB/NLB + ACM |
| Always-on worker | **VERIFIED** (pattern) | Long-running ECS service / EC2 process; suitable for `ENABLE_BACKGROUND_WORKERS=1` |
| Secret injection | **VERIFIED** | Secrets Manager → task env / sidecar patterns |

### 2.4 Secrets

| Item | Status | Evidence |
|------|--------|----------|
| AWS KMS | **VERIFIED** | KMS product |
| Secrets Manager | **VERIFIED** | [Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/data-protection.html) — encrypts with KMS |
| Fit for `MERCHANT_SECRET_KEK` | **VERIFIED** (model) | Inject 32-byte KEK into API/worker env from Secrets Manager; app crypto remains `enc:v1` |

### 2.5 AWS unresolved

- Exact Frankfurt/Mumbai staging monthly total → **NOT_VERIFIED** (calculator required)  
- Live latency from Tashkent → **LIVE_LATENCY_TEST_REQUIRED**  
- Which compute SKU for worker → **TO_BE_AGREED**

---

## 3. Google Cloud (research)

### 3.1 Cloud SQL PostgreSQL

| Item | Status | Evidence |
|------|--------|----------|
| Managed PostgreSQL | **VERIFIED** | Cloud SQL for PostgreSQL |
| Automated backups | **VERIFIED** | Official backup docs |
| PITR | **VERIFIED** | [PITR](https://cloud.google.com/sql/docs/postgres/backup-recovery/pitr) — always creates **new** instance |
| HA (regional) | **VERIFIED** | [configure-ha](https://cloud.google.com/sql/docs/postgres/configure-ha); backups+PITR required for HA |
| Editions | **VERIFIED** | Enterprise / Enterprise Plus — [editions](https://cloud.google.com/sql/docs/postgres/editions-intro); PITR retention windows differ by edition |
| TLS / private IP | **VERIFIED** (capability) | Cloud SQL TLS + private IP / PSC patterns — confirm at provision |
| Monitoring | **VERIFIED** | Cloud Monitoring integration |
| Exact staging USD | **DEPENDS_ON_PLAN** | [Cloud SQL pricing](https://cloud.google.com/sql/pricing) — **NOT_VERIFIED** single figure |

### 3.2 Memorystore (Redis / Valkey)

| Item | Status | Evidence |
|------|--------|----------|
| Redis / Valkey managed | **VERIFIED** | [Memorystore](https://cloud.google.com/memorystore) |
| TLS | **VERIFIED** | In-transit encryption docs for Redis / Valkey / Cluster |
| HA / failover | **VERIFIED** (capability) | Standard tier / Valkey HA; SLA claims on product page |
| Networking | **VERIFIED** (capability) | VPC / Private Service Connect (Valkey/Cluster) |
| Exact staging USD | **DEPENDS_ON_PLAN** | Memorystore pricing pages — **NOT_VERIFIED** here |

### 3.3 Compute / worker

| Item | Status | Notes |
|------|--------|-------|
| Cloud Run (API) | **VERIFIED** | Suitable for request-driven API |
| Cloud Run always-on worker | **DEPENDS_ON_PLAN** | Official: default CPU throttled after request; background needs **instance-based billing** + **minimum instances ≥ 1** ([billing settings](https://cloud.google.com/run/docs/configuring/billing-settings), [autoscaling](https://cloud.google.com/run/docs/about-instance-autoscaling)). Idle instances can still be shut down without min instances. |
| Compute Engine / GKE | **VERIFIED** | Always-on worker straightforward on VM/GKE Deployment |
| HTTPS | **VERIFIED** | Cloud Load Balancing / Cloud Run HTTPS |

**Do not assume Cloud Run is suitable for the worker without min instances + always-allocated CPU (or use GCE/GKE).**

### 3.4 Secrets

| Item | Status |
|------|--------|
| Cloud KMS | **VERIFIED** |
| Secret Manager | **VERIFIED** |
| Fit for KEK inject | **VERIFIED** (model) |

---

## 4. Microsoft Azure (research)

### 4.1 Azure Database for PostgreSQL Flexible Server

| Item | Status | Evidence |
|------|--------|----------|
| Managed PostgreSQL Flexible Server | **VERIFIED** | Product + [pricing](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/) |
| Automated backups + PITR | **VERIFIED** | Official backup/restore concepts — PITR creates **new** server |
| HA (same-zone / zone-redundant) | **VERIFIED** | Pricing FAQ: zone-redundant HA bills both primary and standby compute |
| TLS | **VERIFIED** (capability) | Flexible Server requires/enforces encrypted connections — confirm at provision |
| Networking / monitoring | **VERIFIED** (capability) | VNet integration + Azure Monitor categories exist |
| Exact staging USD | **DEPENDS_ON_PLAN** | Region + SKU + HA — calculator; **NOT_VERIFIED** single figure |

### 4.2 Azure Cache for Redis

| Item | Status | Evidence |
|------|--------|----------|
| Managed Redis | **VERIFIED** | Azure Cache for Redis |
| TLS default | **VERIFIED** | [TLS configuration](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-tls-configuration) — TLS on by default |
| HA | **VERIFIED** (Standard+) | Replication / zone redundancy docs; Basic tier HA **DEPENDS_ON_PLAN** |
| Auth | **VERIFIED** | Access keys / Microsoft Entra |
| Exact staging USD | **DEPENDS_ON_PLAN** | [Cache pricing](https://azure.microsoft.com/en-us/pricing/details/cache/) — portal hides some numbers as `$-`; **NOT_VERIFIED** |
| Product roadmap note | **NOT_VERIFIED** fully | Some third-party notes mention retirement timelines — OPS must confirm current Microsoft guidance before lock-in |

### 4.3 Compute / worker / secrets

| Item | Status | Notes |
|------|--------|-------|
| Container Apps / App Service / VM | **VERIFIED** | Product categories |
| Always-on worker | **DEPENDS_ON_PLAN** | Container Apps: set **min replicas ≥ 1** for continuous worker; Jobs = finite runs ([Jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs)) |
| Key Vault + Managed Identity | **VERIFIED** | [manage-secrets](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets) |
| HTTPS / LB | **VERIFIED** | Azure Front Door / App Gateway / Container Apps ingress |

---

## 5. DigitalOcean (research)

### 5.1 Managed PostgreSQL

| Item | Status | Evidence |
|------|--------|----------|
| Managed PostgreSQL | **VERIFIED** | [Managed Databases](https://docs.digitalocean.com/products/databases/) |
| Daily backups + PITR | **VERIFIED** | Feature matrix: daily point-in-time backups for PostgreSQL; restore to **new** cluster ([restore](https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/)) |
| PITR window | **VERIFIED** | Last **7 days** ([limits](https://docs.digitalocean.com/products/databases/postgresql/details/limits/)) |
| HA (standby nodes) | **VERIFIED** | Standby required for HA; automated failover |
| TLS / SSL | **VERIFIED** | Required TLS; `sslmode=verify-full` supported ([secure](https://docs.digitalocean.com/products/databases/postgresql/how-to/secure/)) |
| VPC | **VERIFIED** | Clusters in VPC by default |
| Metrics / logs | **VERIFIED** | Feature matrix |
| Staging list price (single-node entry) | **VERIFIED** | Docs: single-node from **$15.00/mo** (1 GiB); HA from **$30.00/mo** primary + matching standby ([PG pricing](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/), last verified on DO docs 2026-09) |
| Published plan table | **VERIFIED** | [Managed Databases pricing](https://www.digitalocean.com/pricing/managed-databases) — e.g. 1 GiB ~$15.15/mo, 2 GiB ~$30.45/mo (confirm at purchase) |

### 5.2 Managed Valkey

| Item | Status | Evidence |
|------|--------|----------|
| Managed Valkey (Redis-compatible) | **VERIFIED** | [Valkey product](https://www.digitalocean.com/products/managed-databases-valkey); Redis drop-in per DO docs |
| TLS | **VERIFIED** | Connections require TLS (`--tls`) ([connect](https://docs.digitalocean.com/products/databases/valkey/how-to/connect/)) |
| Auth | **VERIFIED** | Password / AUTH |
| HA | **VERIFIED** | Standby nodes; single-node has automatic failover but not HA per DO wording |
| Daily PITR backups | **NOT_AVAILABLE** for Valkey | Feature matrix: daily point-in-time backups **blank** for Valkey (unlike PostgreSQL) — acceptable for **rate-limit** cache (not financial SoT) |
| Staging list price | **VERIFIED** | Valkey from **$15.00/mo** single-node 1 GiB; HA from **$30.00/mo** + standby ([Valkey pricing](https://docs.digitalocean.com/products/databases/valkey/details/pricing/)) |

### 5.3 Compute / secrets / regions

| Item | Status | Notes |
|------|--------|-------|
| Droplets | **VERIFIED** | API + worker VMs or containers on Droplets |
| App Platform / DOKS | **VERIFIED** (category) | Optional; worker always-on on Droplet is simplest |
| Load Balancer + HTTPS | **VERIFIED** | Product exists |
| Managed KMS (AWS-style) | **NOT_AVAILABLE** | No DO Cloud KMS equivalent documented like AWS KMS |
| Secrets options | **DEPENDS_ON_PLAN** | App Platform encrypted env / DO API / external vault; limitations vs hyperscaler KMS — OPS must design injection for `MERCHANT_SECRET_KEK` |
| Regions (documented) | **VERIFIED** | Includes FRA1, AMS3, LON1, SGP1, BLR1, NYC*, etc. ([regional availability](https://docs.digitalocean.com/platform/regional-availability/)); Managed PG + Valkey marked available in FRA/AMS/LON/SGP/BLR |

### 5.4 DigitalOcean STAGING ESTIMATE (illustrative, published list prices)

Example **STAGING ESTIMATE** (not production capacity; not a quote):

| Component | Example plan (official list) | ~USD/mo |
|-----------|------------------------------|---------|
| Managed PostgreSQL | Single-node 2 GiB (~$30.45) | ~30 |
| Managed Valkey | Single-node 1 GiB ($15) | ~15 |
| Droplet API | Basic/shared — **NOT_VERIFIED** exact SKU here; use DO Droplet pricing at provision | **DEPENDS_ON_PLAN** |
| Droplet Worker | Same | **DEPENDS_ON_PLAN** |
| Load Balancer | Optional | **DEPENDS_ON_PLAN** |
| Spaces (object) | Optional (P1-6) | **DEPENDS_ON_PLAN** |

**Rough DB+cache subtotal (VERIFIED list prices only):** ~$45/mo before compute/LB.  
Full staging total = **DEPENDS_ON_PLAN** after Droplet/LB selection.  
Re-check [pricing](https://www.digitalocean.com/pricing/managed-databases) at purchase time.

---

## 6. Hetzner (research)

| Item | Status | Evidence |
|------|--------|----------|
| Cloud compute (VMs) | **VERIFIED** | [Hetzner Cloud](https://www.hetzner.com/cloud/) — DE/FI/SG/US locations |
| Networks / firewalls / LB | **VERIFIED** | Cloud features page |
| Managed PostgreSQL (Cloud managed DB) | **NOT_AVAILABLE** | Not listed on Hetzner Cloud product set; no official managed PG product equivalent to RDS/Cloud SQL/DO Managed DB found on official Cloud pages |
| Managed Redis/Valkey (Cloud) | **NOT_AVAILABLE** | Official Cloud does not advertise managed Redis/Valkey; konsoleH Redis is **Managed Server / webhosting** product — different model, not a drop-in for container API VPC private Redis |
| Managed KMS / Secrets Manager | **NOT_AVAILABLE** | No AWS-comparable KMS product on Hetzner Cloud identified |
| Backups / PITR as managed DB feature | **NOT_AVAILABLE** (managed) | Would require self-managed PostgreSQL on Cloud Servers — **out of scope** to invent that architecture here |
| Suitable for VaksinaMed P0 managed PG/Redis gates without self-ops | **NOT_AVAILABLE** as managed path | Compute-only fit; P0-1/P0-4 require managed services per project gates |

Exact Cloud Server EUR list prices fluctuate — **NOT_VERIFIED** in this session (pricing calculator on site). Do not invent figures.

---

## 7. Region analysis (Uzbekistan users)

Do **not** claim measured latency. Geographic relevance only.

| Provider | Example regions (documented) | Approx. geographic relevance to UZ | Managed PG | Managed Redis/Valkey | KMS | Compute | Latency |
|----------|------------------------------|------------------------------------|------------|----------------------|-----|---------|---------|
| AWS | `eu-central-1` (Frankfurt), `ap-south-1` (Mumbai), `me-central-1` if available | EU / South Asia nearer than US | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **LIVE_LATENCY_TEST_REQUIRED** |
| GCP | `europe-west3` (Frankfurt), `asia-south1` (Mumbai) | Similar | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **LIVE_LATENCY_TEST_REQUIRED** |
| Azure | West Europe / Germany / Central India (confirm SKU availability) | Similar | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **LIVE_LATENCY_TEST_REQUIRED** |
| DigitalOcean | FRA1, AMS3, LON1, SGP1, BLR1 | FRA/AMS/BLR often considered | **VERIFIED** | **VERIFIED** | **NOT_AVAILABLE** (hyperscaler KMS) | **VERIFIED** | **LIVE_LATENCY_TEST_REQUIRED** |
| Hetzner | Falkenstein/Nuremberg (DE), Helsinki, Singapore | EU / SG | **NOT_AVAILABLE** managed | **NOT_AVAILABLE** managed | **NOT_AVAILABLE** | **VERIFIED** | **LIVE_LATENCY_TEST_REQUIRED** |

No Uzbekistan local region found on these providers in this research → nearest foreign regions only.

---

## 8. Security capability comparison (no scores)

| Capability | AWS | GCP | Azure | DigitalOcean | Hetzner |
|------------|-----|-----|-------|--------------|---------|
| PG TLS | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | N/A managed PG |
| Redis/Valkey TLS | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | N/A managed |
| KMS | **VERIFIED** | **VERIFIED** | **VERIFIED** (Key Vault crypto) | **NOT_AVAILABLE** | **NOT_AVAILABLE** |
| Secret manager | **VERIFIED** | **VERIFIED** | **VERIFIED** | **DEPENDS_ON_PLAN** | **NOT_AVAILABLE** |
| Private networking | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** (VPC) | **VERIFIED** (Cloud Networks) |
| IAM | **VERIFIED** | **VERIFIED** | **VERIFIED** | **DEPENDS_ON_PLAN** (simpler RBAC) | **DEPENDS_ON_PLAN** |
| Audit | **VERIFIED** (CloudTrail etc.) | **VERIFIED** | **VERIFIED** | **DEPENDS_ON_PLAN** | **DEPENDS_ON_PLAN** |
| Backup + PITR (managed PG) | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** (7-day) | **NOT_AVAILABLE** managed |
| Restore to new/disposable | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **NOT_AVAILABLE** managed |

---

## 9. Operational complexity (factual, no ranking)

| Topic | Hyperscalers (AWS/GCP/Azure) | DigitalOcean | Hetzner Cloud |
|-------|------------------------------|--------------|---------------|
| Number of managed services | High (many SKUs) | Fewer managed DB engines + Droplets | Compute-centric; DBs self-managed |
| Deployment complexity | Higher (IAM, VPC, networking) | Lower surface | Low for VMs; high if self-managing PG/Redis |
| Secret management | Native KMS + secret stores | Env/API; no full KMS | Manual / external |
| Monitoring | Deep native | Metrics on managed DB + Droplet | Basic + DIY |
| Backup/PITR | Managed on DB services | Managed PG 7-day PITR | DIY for self-hosted |
| Worker deployment | Many patterns; Cloud Run needs min instances | Droplet always-on simple | Droplet/VM always-on simple |

---

## 10. VaksinaMed architecture fit

| Concern | Fit note |
|---------|----------|
| Expo mobile | Application-level; any HTTPS API |
| HTTPS API (TypeScript) | Container/VM on all providers with compute |
| PostgreSQL | Managed on AWS/GCP/Azure/DO; **NOT_AVAILABLE** managed on Hetzner Cloud |
| Redis/Valkey rate-limit | Managed on AWS/GCP/Azure/DO Valkey; Hetzner managed **NOT_AVAILABLE** |
| `worker_jobs` always-on | VM/container service; Cloud Run **DEPENDS_ON_PLAN** (min instances) |
| Admin web | Static/HTTPS on all |
| Payme / Click / Eskiz | **Application integrations** — not provider features |
| Future FOM / delivery | **CONTRACT_PENDING** — application-level |
| KMS | Hyperscalers **VERIFIED**; DO/Hetzner limited/**NOT_AVAILABLE** |
| Object storage | Optional P1-6 — S3/GCS/Blob/Spaces/Hetzner Object — provision only if Product requires |

---

## 11. Provider decision matrix

| Requirement | AWS | GCP | Azure | DigitalOcean | Hetzner |
|-------------|-----|-----|-------|--------------|---------|
| Managed PG | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **NOT_AVAILABLE** |
| PITR | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** (7d) | **NOT_AVAILABLE** |
| Restore | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **NOT_AVAILABLE** |
| HA | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** (standby) | **NOT_AVAILABLE** managed |
| TLS (PG) | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | N/A |
| Private networking | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** |
| Managed Redis/Valkey | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **NOT_AVAILABLE** |
| Redis TLS | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | N/A |
| Redis HA | **VERIFIED** | **VERIFIED** | **DEPENDS_ON_PLAN** | **VERIFIED** (standby) | N/A |
| KMS | **VERIFIED** | **VERIFIED** | **VERIFIED** | **NOT_AVAILABLE** | **NOT_AVAILABLE** |
| Secret Manager | **VERIFIED** | **VERIFIED** | **VERIFIED** | **DEPENDS_ON_PLAN** | **NOT_AVAILABLE** |
| Compute | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** |
| Worker always-on | **VERIFIED** | **DEPENDS_ON_PLAN** (Cloud Run) / **VERIFIED** (GCE) | **DEPENDS_ON_PLAN** (min replicas) | **VERIFIED** (Droplet) | **VERIFIED** |
| HTTPS/LB | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** |
| Monitoring | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **DEPENDS_ON_PLAN** |
| Backups (managed PG) | **VERIFIED** | **VERIFIED** | **VERIFIED** | **VERIFIED** | **NOT_AVAILABLE** |
| Regions relevant to UZ | **VERIFIED** (FRA/BOM etc.) | **VERIFIED** | **VERIFIED** | **VERIFIED** (FRA/AMS/BLR) | **VERIFIED** (DE/SG) |
| Staging pricing (exact total) | **DEPENDS_ON_PLAN** | **DEPENDS_ON_PLAN** | **DEPENDS_ON_PLAN** | **DEPENDS_ON_PLAN** (DB+Valkey list **VERIFIED**) | **DEPENDS_ON_PLAN** (compute only) |
| Production scaling path | **VERIFIED** (many SKUs) | **VERIFIED** | **VERIFIED** | **VERIFIED** (plan upgrades) | **DEPENDS_ON_PLAN** (self-managed DB) |

No numerical scores. No ranking.

---

## 12. STAGING COST MODEL

### Principles

- Label all money figures **STAGING ESTIMATE**.  
- **OBSERVED TEST RESULT ≠ PRODUCTION CAPACITY** (P13/P13.1).  
- Hyperscaler totals require official calculators at decision time → **DEPENDS_ON_PLAN**.

### DigitalOcean (list-price fragment — VERIFIED)

| Line | Status | Note |
|------|--------|------|
| PG 2 GiB single-node | **VERIFIED** ~$30.45/mo | Official pricing table |
| Valkey 1 GiB single-node | **VERIFIED** $15/mo | Official Valkey pricing |
| API + Worker Droplets + LB | **DEPENDS_ON_PLAN** | Select at provision |
| **Illustrative DB+cache only** | ~$45/mo | Incomplete staging total |

### AWS / GCP / Azure

| Line | Status |
|------|--------|
| Full staging stack USD | **NOT_VERIFIED** as a fixed number — use official pricing calculator for chosen region + SKUs |
| Free-tier eligibility | **DEPENDS_ON_PLAN** / account |

### Hetzner

| Line | Status |
|------|--------|
| Staging with **managed** PG+Redis | **NOT_AVAILABLE** |
| Compute-only cost | **NOT_VERIFIED** exact EUR without calculator |

---

## 13. PRODUCTION COST FACTORS (no false precision)

Drivers (measure on staging load before sizing):

- Branch count (200 / 500 / 1000 — P13 observed concurrency **≠** capacity claim)  
- Concurrent customers / RPS  
- DB size + connections + pool  
- Redis memory for rate-limit keys  
- Worker throughput / job backlog  
- Storage, bandwidth, backups, PITR retention  
- HA multipliers (often ~2× DB compute)  
- Monitoring / LB / KMS API calls  
- External fees: Payme, Click, Eskiz (application — not cloud)  

Production sizing: **OPS_REQUIRED** after staging evidence.

---

## 14. LIVE LATENCY TEST PLAN

Status: **LIVE_LATENCY_TEST_REQUIRED** (do not run until staging exists).

From Tashkent client (and/or staging host in candidate region):

1. TCP/TLS handshake latency to API hostname  
2. PostgreSQL connection establish time (private path)  
3. Redis/Valkey `PING` RTT  
4. API p50 / p95 / p99 on `/api/health/live` and `/api/health/ready`  
5. Representative checkout/payment prepare endpoint latency (sandbox)  

Record region, time of day, N samples. No fabricated results.

---

## 15. Options (non-ranked) — DECISION REQUIRED FROM OPS + PRODUCT

### OPTION A — Hyperscaler managed stack (AWS **or** GCP **or** Azure)

- **Strengths:** Managed PG+PITR, managed Redis/Valkey, native KMS/secrets, deep IAM/audit, clear HA paths.  
- **Limitations:** Higher operational surface; staging USD **DEPENDS_ON_PLAN**; Cloud Run/Container Apps worker needs careful always-on config.  
- **Implications:** Strongest match to P0-1/P0-2/P0-4 as written.  
- **Verified services:** See §§2–4.  
- **Unresolved:** Exact region latency (**LIVE_LATENCY_TEST_REQUIRED**); which hyperscaler; calculator quote.

### OPTION B — DigitalOcean managed PG + Valkey + Droplets

- **Strengths:** Published predictable DB/Valkey list prices; PITR (7d) + TLS + VPC; simple Droplet workers; regions FRA/AMS/BLR documented.  
- **Limitations:** No hyperscaler-class KMS; Valkey lacks daily PITR in feature matrix (OK for rate-limit); smaller ecosystem.  
- **Implications:** Can close managed PG/Redis **evidence path** with lower ops complexity; SECURITY must accept env/secret-manager design for KEK.  
- **Verified services:** §5.  
- **Unresolved:** Full staging USD with Droplets/LB; KEK ops model; latency test.

### OPTION C — Hetzner Cloud compute-only

- **Strengths:** Competitive compute; EU locations; networks/firewalls.  
- **Limitations:** **NOT_AVAILABLE** managed PostgreSQL / managed Redis/Valkey / KMS on Cloud — does **not** satisfy P0 managed gates without inventing self-managed DB architecture (explicitly out of scope here).  
- **Implications:** Not sufficient alone for current P0-1/P0-4 wording.  
- **Verified services:** Compute/network only.  
- **Unresolved:** Would require Product/OPS to change gate definitions or add third-party managed DB — **TO_BE_AGREED**, not invented here.

---

## 16. Open decisions

| Decision | Status | Owner |
|----------|--------|-------|
| Provider choice among Option A family / Option B | **TO_BE_AGREED** | OPS + PRODUCT |
| Region | **TO_BE_AGREED** + **LIVE_LATENCY_TEST_REQUIRED** | OPS |
| Hyperscaler calculator staging quote | **OPS_REQUIRED** | OPS |
| KEK via KMS vs env secret inject (esp. DO) | **TO_BE_AGREED** | SECURITY + OPS |
| Cloud Run vs GCE for GCP worker | **TO_BE_AGREED** | BACKEND + OPS |
| Whether Hetzner is in scope without managed DB | **TO_BE_AGREED** | PRODUCT |
| RPO/RTO numeric targets | **TO_BE_AGREED** | PRODUCT + OPS |

---

## 17. Production gates (unchanged)

| Gate | Status |
|------|--------|
| P0-1..P0-4 | **OPS_REQUIRED** |
| O-4 / P1-3 / SMS | **OPS_REQUIRED** / **NOT_PROVEN** |
| E-1..E-4 | **CONTRACT_PENDING** |
| Provider research | **DONE** (this document) |
| Provider selected | **TO_BE_AGREED** |
| Provisioning | **None** |

Blueprint research **DONE** ≠ operational gate **DONE**.

---

## 18. Final decision

**PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING**

No provider selected automatically. No infrastructure provisioned. No credentials created. No production enablement. No fabricated evidence. No git.

See also: `docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md`, `docs/PRODUCTION_GAP_MATRIX.md` § Phase 12.48.
