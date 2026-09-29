# Production Gap Matrix

> **Authoritative production gap register** after P1–P13.1 and Admin Phase 12.6A–12.25.1.  
> Evidence window: repository code + docs as of 2026-09-25; Phase 12.45–12.48 + **Phase 12.49 provider decision 2026-09-28**.  
> **Not a product roadmap.** No invented dates, owners, APIs, or provider contracts.  
> Business logic / API contracts / database schema unchanged by this document.

---

## Executive State

| Decision | Status | Basis |
|----------|--------|-------|
| **TECHNICAL CODE READINESS** | **READY** (in-repo) | P1–P13.1 implemented; CI/typecheck/build/test evidence; Admin honesty console complete |
| **CONTROLLED STAGING** | **NOT READY** | 12.49: provider **DigitalOcean** selected; resources **not provisioned**; P0 evidence still MISSING |
| **PRODUCTION** | **NOT READY** | **OPERATIONAL EVIDENCE MISSING** — Payme/Click OFF; FOM writer OFF; dual-accept ON |

**PRODUCTION READINESS: NOT READY**

Do not treat repository green as production GO. Aligns with `docs/FINAL_PRODUCTION_CLOSURE.md` and `docs/PRODUCTION_OPS_RUNBOOK.md`.

---

## Phase 12.27 — P0 gate verification (2026-09-25)

Workspace verification only. **No managed staging/production infrastructure available from this environment.** No production enablement. No secrets printed.

### P0 closure matrix

| P0 | Current State | Evidence | Can verify here? | Result | Remaining action |
|----|---------------|----------|------------------|--------|------------------|
| P0-1 Managed PostgreSQL PITR + restore | Unproven managed PITR | 12.37 re-audit: provider MISSING; `DATABASE_URL=MISSING`; TCP 5432/55432 CLOSED; PGlite local only; PITR/restore/RPO/RTO still open | No (no managed PG) | **OPS_REQUIRED** (12.37) | Provision managed PG; enable automated backups + PITR; restore into empty staging; record RPO/RTO |
| P0-2 Merchant secret KMS-at-rest | App enc boundary DONE; managed KMS absent | 12.42 re-audit: AES-GCM `enc:v1:` **READY_IN_REPO**; `MERCHANT_SECRET_KEK=MISSING`; no cloud KMS SDK/IaC; CURRENT_KEY_SOURCE=ENVIRONMENT_KEK; KMS_BACKING NOT_PROVEN | Code yes; live KMS no | **OPS_REQUIRED** (12.42) | Inject KEK from approved manager/KMS; migrate plaintext → enc:v1; then prefer KMS-wrapped KEK — do not invent SDK |
| P0-3a Payme sandbox E2E | Credentials absent | 12.40 re-audit: code READY_IN_REPO; `PAYME_SANDBOX_*=MISSING`; harness → `PENDING`; live E2E **NOT_RUN**; production Payme OFF; outbound refund CONTRACT_PENDING | Harness yes; live E2E no | **OPS_REQUIRED** (12.40) | Set sandbox key + merchant id + `SANDBOX_E2E_RUN=1` on staging; run `pnpm sandbox:e2e` to PASS |
| P0-3b Click sandbox E2E | Credentials absent | 12.41 re-audit: code READY_IN_REPO; `CLICK_SANDBOX_*=MISSING`; harness → `PENDING`; live E2E **NOT_RUN**; production Click OFF; outbound refund CONTRACT_PENDING | Harness yes; live E2E no | **OPS_REQUIRED** (12.41) | Set sandbox secret/service/merchant + `SANDBOX_E2E_RUN=1` on staging; run `pnpm sandbox:e2e` to PASS |
| P0-4 Production Redis live verify | Code DONE; live Redis absent | 12.38 re-audit: provider MISSING; `REDIS_URL=MISSING`; TCP 6379/6380 CLOSED; no compose Redis; FakeRedis only; TLS/PING/failover NOT_PROVEN | Code yes; live no | **OPS_REQUIRED** (12.38) | Provision managed Redis; set `REDIS_URL` (prefer rediss://); warm PING; dual-instance + failure drill on staging |

### Environment presence (values never printed)

| Variable | Presence |
|----------|----------|
| DATABASE_URL | MISSING |
| TEST_DATABASE_URL | MISSING |
| REDIS_URL | MISSING |
| PAYME_SANDBOX_KEY / MERCHANT_ID | MISSING |
| CLICK_SANDBOX_SECRET / SERVICE_ID / MERCHANT_ID | MISSING |
| SANDBOX_E2E_RUN | MISSING |
| NODE_ENV | MISSING (local shell) |

### Security exposure spot-check (categories only)

| Category | Finding |
|----------|---------|
| `console.log` of secret/password/token fields | No DTO dumps found; p13.1 logs admin token presence as `ok`/`MISSING` only |
| Logger redaction | `payme_key` / `click_secret` in logger redact paths |
| API DTO stripping | `securityEnv` masks payme_key/click_secret |
| Secret access path | WeakMap via `getPaymentMerchantSecretMaterial` only |

### Production enablement

| Gate | Status after 12.27 |
|------|-------------------|
| Production Payme/Click | Remains **OFF** |
| FOM inventory writer | Remains **false** |
| FOM_POS | Remains **CONTRACT_PENDING** |
| Overall production | Remains **NOT READY** (any P0 unresolved) |

---

## Phase 12.28 — P0-2 Secret Encryption Closure

Security-critical application boundary only. **No cloud KMS client invented. No production data migrated. No PSP enablement.**

### Architecture (implemented)

```
DATABASE (text columns; ciphertext enc:v1:…)
  → decrypt at application boundary (MERCHANT_SECRET_KEK)
  → WeakMap handle (runtime only; not encryption-at-rest)
  → Payme/Click adapter via getPaymentMerchantSecretMaterial
```

| Item | Status |
|------|--------|
| Current storage columns | `branches.payme_key`, `branches.click_secret` — **text unchanged** (ciphertext fits) |
| Ciphertext marker | `enc:v1:` + AES-256-GCM (IV.tag.ct base64url) |
| Encrypt on admin write | `prepareMerchantSecretForStorage` in `PATCH /admin/branches/:id` |
| Decrypt on payment resolve | `decryptMerchantSecretFromStorage` in `branchPaymentMerchant` |
| Provider interface | `SecretEncryptionProvider` in `merchantSecretCrypto.ts` |
| Production-like without KEK | **FAIL CLOSED** (`MERCHANT_SECRET_CRYPTO_REQUIRED`) |
| Plaintext fallback in prod | **Forbidden** unless temporary `MERCHANT_SECRET_ALLOW_PLAINTEXT_READ=1` migration window |
| Hardcoded master key | **None** |
| Cloud KMS / Vault SDK | **Absent** (not invented) |
| WeakMap | Runtime serialization guard only — **not** encryption-at-rest |
| Admin UI | Write-only fields unchanged; responses use `••••` / `hasPayme` / `hasClick` |
| Audit on credential change | Booleans `paymeCredentialUpdated` / `clickCredentialUpdated` only |
| Migration of existing rows | Helper `migrateMerchantSecretValue` + ops script dry-run; **not executed** against production |
| Payme / Click production | Remains **OFF** |

### P0-2 status transition

| Before (12.27) | After (12.28) | Why |
|----------------|---------------|-----|
| **BLOCKED** | **OPS_REQUIRED** | App encryption boundary + fail-closed prod path exist; remaining work is ops: inject `MERCHANT_SECRET_KEK` from approved secret manager / KMS, migrate existing plaintext rows, verify staging decrypt |

**Not DONE:** Cloud KMS-backed key management is not configured in this workspace. Do not claim “KMS-at-rest complete.”

### OPS remaining actions (P0-2)

1. Provision KEK (or DEK wrapped by cloud KMS) into runtime as `MERCHANT_SECRET_KEK` (32-byte key as base64 or hex).
2. Staging: set KEK → re-save branch secrets via Admin (or run controlled migrate with dry-run first) → verify `enc:v1:` in DB → payment resolve succeeds.
3. Disable `MERCHANT_SECRET_ALLOW_PLAINTEXT_READ` in staging/production after migration.
4. Rotate KEK only with a documented re-encrypt procedure (out of band).
5. Prefer eventual cloud KMS envelope (KEK in KMS) — wire real SDK only when provider is chosen; do not invent AWS/GCP/Azure clients here.

### Environment (12.28)

| Variable | Role |
|----------|------|
| `MERCHANT_SECRET_KEK` | Required in staging/production for encrypt/decrypt |
| `MERCHANT_SECRET_ALLOW_PLAINTEXT_READ` | Temporary migration only in production-like; default off |

---

## Phase 12.29 — P0-1 Managed PostgreSQL Closure

Infrastructure / readiness audit only. **No cloud provider invented. No managed instance provisioned. No PITR claimed. No production DB touched. No schema change.**

### Workspace re-verification (2026-09-25)

| Check | Result (values never printed) |
|-------|-------------------------------|
| `DATABASE_URL` (process / user / machine env) | **MISSING** |
| `TEST_DATABASE_URL` | **MISSING** |
| `.env` `DATABASE_URL` / `TEST_DATABASE_URL` | **MISSING** (file exists; keys unset) |
| `DB_DRIVER` / `PG_POOL_MAX` / `PGSSLMODE` / `PG_SSL` | **MISSING** |
| TCP `127.0.0.1:5432` | **CLOSED** |
| TCP `127.0.0.1:55432` (compose P13 profile) | **CLOSED** |
| Terraform / Pulumi / CDK IaC for managed PG | **Absent** |
| Selected managed provider (RDS / Cloud SQL / Azure / Neon / Supabase / …) | **None selected** |

### Architecture (application — verified in-repo)

| Layer | Finding |
|-------|---------|
| Production target | PostgreSQL via `DATABASE_URL` (`lib/db/src/env.ts` — staging/production **fail closed** without postgres URL; `DB_DRIVER=pglite` forbidden) |
| Local demo | PGlite under `.data/pglite` — **not** production architecture |
| Pool | `resolvePoolConfig()` — default `max=20` (cap 200), idle 30s, connect timeout 10s; overridable via `PG_POOL_MAX` / `PG_POOL_IDLE_MS` / `PG_POOL_CONNECT_TIMEOUT_MS` |
| Migrations | Versioned `0000`–`0010` under `lib/db/migrations/`; applied on boot; destructive ops blocked in staging/production |
| Health | `/health/live` = process only; `/health/ready` = `SELECT 1` DB check (`checkDatabaseHealth`) — distinguishes alive vs DB ready |
| TLS/SSL in app Pool | **Not enforced in code** (no `ssl` option; no `sslmode=disable` workaround). Production TLS must come from URL/provider — **OPS_REQUIRED** until verified on staging |
| In-repo backup drill | `pnpm backup:drill` → PGlite **logical / schema** restore only; optional `pg_dump` if `TEST_DATABASE_URL` + `pg_dump` present — **not** managed PITR |

### Durability gate (managed)

| Item | State |
|------|-------|
| Managed provider | **NOT SELECTED** / **OPS_REQUIRED** |
| Automated backups | **NOT_PROVEN** |
| PITR / continuous WAL | **NOT_PROVEN** |
| Retention policy | **NOT_PROVEN** |
| Staging restore drill (empty DB) | **NOT_PROVEN** — no staging managed DB reachable |
| RPO | **NOT ESTABLISHED** |
| RTO | **NOT ESTABLISHED** |

### P13 / P13.1 distinction (do not conflate)

| Evidence | Proves | Does **not** prove |
|----------|--------|---------------------|
| P13 real PG concurrency PASS (prior / embedded PG) | App SQL concurrency on real PostgreSQL | Managed durability, PITR, backup, RPO/RTO |
| P13.1 HTTP + real PG PASS (`.data/p13-1-http/last-report.json`) | Local HTTP API against embedded/real PG | Managed production backup/restore |

### P0-1 status

| Before | After 12.29 | Why |
|--------|-------------|-----|
| **OPS_REQUIRED** (12.27) | **OPS_REQUIRED** (re-verified) | Architecture + fail-closed prod DB path exist; managed PG + PITR + restore + RPO/RTO still absent |

**Not DONE.** Do not mark production DB gate open.

### OPS remaining actions (P0-1)

1. Select and provision managed PostgreSQL (ops chooses provider — do not invent in-repo).
2. Configure staging `DATABASE_URL` (TLS-verified); confirm `/health/ready` with `driver=postgres`.
3. Enable provider automated backups + PITR (or equivalent WAL archive); record retention.
4. Restore into **empty staging** DB; verify critical tables + migration journal; smoke app queries.
5. Record measured RPO/RTO from that drill (do not invent numbers beforehand).
6. Only then consider production `DATABASE_URL` cutover — still behind other P0 gates.

---

## Phase 12.49 — Provider decision & final staging architecture (2026-09-28)

**DECISION ONLY.** No provisioning · no credentials · no production enablement · no git.

Authoritative decision: [`docs/PHASE_12_49_PROVIDER_DECISION.md`](./PHASE_12_49_PROVIDER_DECISION.md)

### Final decision (unchanged for production)

**PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING**

**PRODUCTION READINESS: NOT READY**

### Selected staging provider

| Item | Value |
|------|--------|
| **SELECTED STAGING PROVIDER** | **DigitalOcean** |
| Fit | **FITS_WITH_TRADEOFFS** |
| Region candidate | **FRA1** (Frankfurt); alts AMS3/BLR1 |
| Latency | **LIVE_LATENCY_TEST_REQUIRED** |
| Managed PG + PITR (7d) + Valkey TLS | **PASS** (Phase 12.48 VERIFIED) |
| Cloud KMS | **NOT_AVAILABLE** → ENVIRONMENT_KEK **PASS_WITH_TRADEOFF** |
| Hetzner | **DOES_NOT_FIT_CURRENT_REQUIREMENTS** |
| Provisioning executed? | **No** |
| Any P0/P1 ops gate closed? | **No** — remain **OPS_REQUIRED** / **CONTRACT_PENDING** |

MONTHLY STAGING ESTIMATE (DB+Valkey list only): ~**$45.45**/mo + Droplet/LB **DEPENDS_ON_PLAN**.

---

## Phase 12.48 — Real cloud provider research & staging cost model (2026-09-28)

**RESEARCH ONLY.** No provisioning · no accounts · no credentials · no production enablement · no git.

Authoritative research: [`docs/PHASE_12_48_PROVIDER_RESEARCH.md`](./PHASE_12_48_PROVIDER_RESEARCH.md)

### Final decision (unchanged)

**PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING**

**PRODUCTION READINESS: NOT READY**

### Research status

| Item | Status |
|------|--------|
| AWS RDS PITR / Multi-AZ / ElastiCache TLS / KMS+Secrets Manager | Capability **VERIFIED** (official docs); staging USD **DEPENDS_ON_PLAN** |
| GCP Cloud SQL PITR/HA / Memorystore / Secret Manager | Capability **VERIFIED**; Cloud Run worker **DEPENDS_ON_PLAN** (min instances) |
| Azure Flexible Server PITR/HA / Cache TLS / Key Vault | Capability **VERIFIED**; staging USD **DEPENDS_ON_PLAN** |
| DigitalOcean Managed PG PITR (7d) + Managed Valkey TLS | Capability **VERIFIED**; list prices for DB/Valkey **VERIFIED** |
| Hetzner Cloud managed PG / managed Redis / KMS | **NOT_AVAILABLE** |
| Provider selected | **TO_BE_AGREED** |
| Live latency (Tashkent → region) | **LIVE_LATENCY_TEST_REQUIRED** |
| Any P0/P1 ops gate closed? | **No** — remain **OPS_REQUIRED** / **CONTRACT_PENDING** |

### Options (non-ranked)

- **OPTION A** — Hyperscaler (AWS or GCP or Azure) managed stack  
- **OPTION B** — DigitalOcean managed PG + Valkey + Droplets  
- **OPTION C** — Hetzner Cloud compute-only (does not satisfy managed PG/Redis gates alone)

**DECISION REQUIRED FROM OPS + PRODUCT**

---

## Phase 12.47 — Infrastructure provider selection & staging blueprint (2026-09-28)

**BLUEPRINT ONLY.** No provisioning · no provider auto-selected · no credentials · no production enablement · no git.

Authoritative blueprint: [`docs/STAGING_INFRASTRUCTURE_BLUEPRINT.md`](./STAGING_INFRASTRUCTURE_BLUEPRINT.md)

### Final decision (unchanged)

**PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING**

**PRODUCTION READINESS: NOT READY**

### Blueprint deliverable status

| Item | Status |
|------|--------|
| Staging architecture / dependency map | **DONE** (blueprint doc) |
| Provider-neutral requirements (PG/Redis/Compute/KMS) | **DONE** |
| Candidate provider comparison framework | **DONE** (capabilities mostly **NOT_VERIFIED**; no scores; no winner) |
| Staging topology + network + env separation | **DONE** |
| Evidence checklists for P0/O-4/SMS/PSP | Cross-linked; operational gates unchanged |
| Object storage | **OPTIONAL** / Product (P1-6) — not required for minimum staging |
| Provider selected | **TO_BE_AGREED** |
| Infrastructure provisioned | **No** |
| Any P0/P1 ops gate closed? | **No** — remain **OPS_REQUIRED** / **CONTRACT_PENDING** / **NOT_PROVEN** |

### Operational gates (unchanged from 12.45/12.46)

| Gate | Status |
|------|--------|
| P0-1 Managed PG + PITR + restore | **OPS_REQUIRED** |
| P0-2 Merchant KEK/KMS | **OPS_REQUIRED** |
| P0-3a Payme sandbox E2E | **OPS_REQUIRED** |
| P0-3b Click sandbox E2E | **OPS_REQUIRED** |
| P0-4 Managed Redis | **OPS_REQUIRED** |
| O-4 Worker live drill | **OPS_REQUIRED** / **NOT_PROVEN** |
| P1-3 HMAC retirement | **OPS_REQUIRED** / **NOT_PROVEN** |
| SMS Eskiz | **OPS_REQUIRED** |
| E-1..E-4 | **CONTRACT_PENDING** |

Blueprint **DONE** ≠ operational gate **DONE**.

---

## Phase 12.46 — Staging infrastructure bootstrap & evidence gate (2026-09-28)

Provider-neutral **staging readiness plan** after Phase 12.45.  
**No cloud provider invented. No credentials invented. No OPS_REQUIRED gate closed. Production enablement CLOSED.**

This phase converts missing operational evidence into concrete checklists + repo boot readiness. It does **not** claim LIVE_VERIFIED.

### Final decision (unchanged)

**PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING**

**PRODUCTION READINESS: NOT READY**

### Environment inventory (2026-09-28) — values never printed

| Variable | Presence |
|----------|----------|
| DATABASE_URL | **DOCUMENTED_EXAMPLE** (not set for managed staging) |
| TEST_DATABASE_URL | **DOCUMENTED_EXAMPLE** |
| REDIS_URL | **DOCUMENTED_EXAMPLE** |
| MERCHANT_SECRET_KEK | **MISSING** |
| PAYME_SANDBOX_KEY / MERCHANT_ID | **DOCUMENTED_EXAMPLE** |
| CLICK_SANDBOX_SECRET / SERVICE_ID / MERCHANT_ID | **DOCUMENTED_EXAMPLE** |
| SANDBOX_E2E_RUN | **DOCUMENTED_EXAMPLE** |
| ESKIZ_EMAIL / PASSWORD | **DOCUMENTED_EXAMPLE** |
| ALLOW_LEGACY_HMAC_TOKENS / LEGACY_HMAC_DEADLINE | **DOCUMENTED_EXAMPLE** (unset → dual-accept ON) |
| PAYME_MERCHANT_API_ENABLED / CLICK_MERCHANT_API_ENABLED | **SET_DOTENV=0** (OFF) |
| ENABLE_BACKGROUND_WORKERS | **SET_DOTENV=0** |
| WORKER_STALE_RUNNING_MS | **DOCUMENTED_EXAMPLE** (code default 30m) |
| EXTERNAL_DELIVERY_ENABLED | **DOCUMENTED_EXAMPLE** |
| EXPO_PUBLIC_API_URL | **SET_DOTENV** (mobile staging target via env) |
| CORS_ORIGIN / API_PUBLIC_URL | **MISSING** |
| Dockerfile / docker-compose.yml | **PRESENT** |
| docker-compose.staging.yml | **MISSING** (not invented) |

### Repo boot readiness (code)

| Question | Answer | Class |
|----------|--------|-------|
| A. API boot against managed PostgreSQL? | Yes when `DATABASE_URL` postgres set; PGlite forbidden staging/prod | **READY_IN_REPO** |
| B. API boot against managed Redis? | Yes when `REDIS_URL` set; warm PING | **READY_IN_REPO** |
| C. Fail closed without PostgreSQL (staging/prod)? | Yes | **READY_IN_REPO** / **TEST_VERIFIED** |
| D. Fail closed without Redis (staging/prod)? | Yes | **READY_IN_REPO** / **TEST_VERIFIED** |
| E. Fail closed without MERCHANT_SECRET_KEK (staging/prod)? | Yes | **READY_IN_REPO** / **TEST_VERIFIED** |
| F. Always-on workers? | Gated by `ENABLE_BACKGROUND_WORKERS` / `run-due`; not running here | **READY_IN_REPO**; live **OPS_REQUIRED** |
| G. Worker restart / reclaim? | Stale RUNNING reclaim in code | **READY_IN_REPO** / **TEST_VERIFIED**; live **NOT_PROVEN** |
| H. Mobile → staging API without code change? | Via `EXPO_PUBLIC_API_URL` | **READY_IN_REPO** |
| I. Admin → staging API? | Same-origin / proxy to API host in deploy | **READY_IN_REPO** (ops wiring) |
| J. Health suitable for staging monitors? | `/health/live` process; `/health/ready` PG only | **READY_IN_REPO** |

Compose notes: `Dockerfile` + `docker-compose.yml` exist; API healthcheck hits `/api/health/ready`; PSP flags forced `0`; workers `0`; optional `postgres` profile = **P13 local only** (not managed evidence).

### P0-1 Managed PostgreSQL — evidence checklist (provider-neutral)

| # | Evidence required to close | Current |
|---|----------------------------|---------|
| 1 | Staging `DATABASE_URL` set (TLS) — value not printed | **MISSING** |
| 2 | `/health/ready` healthy with `driver=postgres` | **NOT_PROVEN** |
| 3 | Migrations 0000–0010 applied | **READY_IN_REPO** path; live **NOT_PROVEN** |
| 4 | Automated backups ON | **NOT_PROVEN** |
| 5 | PITR / WAL continuous | **NOT_PROVEN** |
| 6 | Retention policy documented | **NOT_PROVEN** |
| 7 | Restore into **empty disposable** staging DB | **NOT_PROVEN** |
| 8 | App connects to restored DB | **NOT_PROVEN** |
| 9 | Measured restore duration → provisional RTO observation | **NOT_ESTABLISHED** |
| 10 | Measured/documented loss window → RPO | **NOT_ESTABLISHED** |

Gate remains **OPS_REQUIRED**. `pnpm backup:drill` ≠ managed PITR.

### P0-4 Managed Redis — evidence checklist

| # | Evidence | Current |
|---|----------|---------|
| 1 | Managed Redis + `REDIS_URL` (prefer `rediss://`) | **MISSING** |
| 2 | Boot warm PING | Code path **READY_IN_REPO**; live **NOT_PROVEN** |
| 3 | Two API instances share counters | FakeRedis **TEST_VERIFIED**; live **NOT_PROVEN** |
| 4 | Redis down → 503 `RATE_LIMIT_REDIS_UNAVAILABLE` | **TEST_VERIFIED**; live **NOT_PROVEN** |
| 5 | Recovery after Redis returns | **NOT_PROVEN** |
| 6 | No memory fallback in staging | **READY_IN_REPO** |
| 7 | No URL/password in logs | **READY_IN_REPO** / **TEST_VERIFIED** |

Gate remains **OPS_REQUIRED**.

### P0-2 Merchant KEK / KMS — evidence checklist

| # | Evidence | Current |
|---|----------|---------|
| 1 | App `enc:v1` AES-GCM + WeakMap boundary | **READY_IN_REPO** / **TEST_VERIFIED** |
| 2 | `MERCHANT_SECRET_KEK` injected (32-byte) | **MISSING** |
| 3 | Prefer KMS-wrapped KEK / envelope when provider chosen | **NOT_PROVEN** (no SDK invented) |
| 4 | Plaintext rows migrated; plaintext-read flag OFF | **NOT_PROVEN** |
| 5 | Wrong KEK / missing KEK fail closed | **TEST_VERIFIED** |
| 6 | Key rotation procedure documented + tested staging | **OPS_REQUIRED** / **NOT_PROVEN** |

Env KEK ≠ managed KMS. Gate remains **OPS_REQUIRED**.

### O-4 Worker staging — evidence checklist

| # | Evidence | Current |
|---|----------|---------|
| 1 | Always-on staging worker (`ENABLE_BACKGROUND_WORKERS=1` or dedicated runner) | **MISSING** (flag **0**) |
| 2 | Claim → RUNNING | **TEST_VERIFIED** |
| 3 | Kill mid-RUNNING | **NOT_PROVEN** |
| 4 | Stale reclaim via `WORKER_STALE_RUNNING_MS` | Code **READY_IN_REPO** / **TEST_VERIFIED** |
| 5 | Second worker re-claims; late complete → LEASE_LOST | **TEST_VERIFIED**; live **NOT_PROVEN** |
| 6 | Exactly-once business effect | Domain idempotency **READY_IN_REPO** |
| 7 | `WORKER_STALE_JOB_RECLAIMED` alert | **READY_IN_REPO** |

Gate remains **OPS_REQUIRED** / **NOT_PROVEN**.

### P0-3a/b Payme / Click — operator checklist (do not execute without creds)

**Payme** (creds + `SANDBOX_E2E_RUN=1`; keep `PAYME_MERCHANT_API_ENABLED=0` for prod): CreateTransaction → CheckPerform → Perform → capture → duplicate Perform/callback → Cancel path; expect one capture; no auto cashback; harness `pnpm sandbox:e2e`. Current: **PENDING** / **NOT_RUN**. Outbound refund **CONTRACT_PENDING**.

**Click**: Prepare → Complete → capture → duplicate Complete (ALREADY_PAID) → error≠0 cancel path. Current: **PENDING** / **NOT_RUN**. Outbound refund **CONTRACT_PENDING**.

### P1-3 HMAC / mobile s1 — evidence checklist

| Evidence | Current |
|----------|---------|
| Issuance s1-only; no client HMAC | **READY_IN_REPO** / **TEST_VERIFIED** |
| Mobile store population proof | **NOT_PROVEN** |
| Legacy-accept telemetry | **NOT_PROVEN** |
| Quiet period | **NOT_PROVEN** |
| `ALLOW_LEGACY_HMAC_TOKENS=0` | **Do not set** until above |

Gate remains **OPS_REQUIRED** / **NOT_PROVEN**.

### SMS / Eskiz

Code path **READY_IN_REPO** (prod-like fail closed without creds). Live Eskiz credentials **OPS_REQUIRED** / **NOT_PROVEN**.

### Staging deployment sequence (provider-neutral)

| Step | Prerequisite | Action | Pass criteria | Rollback | Owner |
|------|--------------|--------|---------------|----------|-------|
| 1 | Account | Provision managed PG | URL set (secret) | Destroy staging instance | OPS |
| 2 | PG | Enforce TLS | App connects ssl | Revert URL | OPS |
| 3 | PG | Enable backup + PITR | Console shows ON + retention | — | OPS |
| 4 | Backup | Empty restore drill | App ready on restored DB; duration logged | Drop restore target | OPS + BACKEND |
| 5 | Network | Provision managed Redis | PING OK | Destroy | OPS |
| 6 | Redis | TLS/auth | Dual-instance shared RL + 503 fail-closed | — | OPS + BACKEND |
| 7 | Secrets | Inject KEK/KMS | encrypt write + decrypt resolve | Rotate/revoke KEK | SECURITY + OPS |
| 8 | PG+Redis+KEK | Deploy API staging | `/health/live`+`/ready` | Prior revision | OPS + BACKEND |
| 9 | API | Deploy Admin staging | UI loads against staging API | Prior revision | OPS |
| 10 | API | Always-on worker | Claim/reclaim drill PASS | Disable workers flag | OPS + BACKEND |
| 11 | SMS | Eskiz staging/prod-like | OTP send without bypass | Unset Eskiz | OPS |
| 12 | Payme sandbox | Creds only | `sandbox:e2e` Payme PASS | Unset SANDBOX_E2E_RUN | FINANCE + BACKEND |
| 13 | Click sandbox | Creds only | Click PASS | Unset | FINANCE + BACKEND |
| 14 | Mobile | Point `EXPO_PUBLIC_API_URL` | Login s1 against staging | Revert URL | MOBILE |
| 15 | Auth | HMAC telemetry + quiet | Zero required legacy accepts | Keep dual-accept | SECURITY + MOBILE |
| 16 | All above | Failure drills | Matrix dated PASS | — | OPS |
| 17 | Drills | Staging acceptance | GO checklist signed | NO-GO | PRODUCT + OPS |

External E-1..E-4 remain **CONTRACT_PENDING** unless product scope requires them for production GO.

### Staging GO/NO-GO matrix (summary)

| Gate | Staging req? | Prod req? | Status | Owner |
|------|--------------|-----------|--------|-------|
| Managed PG + PITR + restore | Yes | Yes | **OPS_REQUIRED** | OPS |
| Managed Redis | Yes | Yes | **OPS_REQUIRED** | OPS |
| Merchant KEK/KMS | Yes | Yes | **OPS_REQUIRED** | SECURITY |
| Payme sandbox E2E | Yes (before Payme prod) | Yes if Payme in scope | **OPS_REQUIRED** | FINANCE |
| Click sandbox E2E | Yes (before Click prod) | Yes if Click in scope | **OPS_REQUIRED** | FINANCE |
| Worker live reclaim | Yes | Yes | **OPS_REQUIRED** | OPS |
| SMS Eskiz | Yes for OTP | Yes | **OPS_REQUIRED** | OPS |
| Mobile s1 + HMAC quiet | Before HMAC off | Before HMAC off | **OPS_REQUIRED** / **NOT_PROVEN** | MOBILE + SECURITY |
| FOM stock/POS | If FOM required | If FOM required | **CONTRACT_PENDING** | EXTERNAL + PRODUCT |
| External delivery | If courier required | If courier required | **CONTRACT_PENDING** | EXTERNAL + PRODUCT |
| Outbound PSP refund | If auto-refund in scope | If in scope | **CONTRACT_PENDING** | FINANCE |
| Observability scrape | Recommended | Yes | **OPS_REQUIRED** | OPS |
| Production PSP flags | Must stay 0 until cutover | Explicit GO | **OFF** | FINANCE + OPS |

### What this phase did NOT do

No provider selection · no credential invent · no LIVE_VERIFIED claims · no production enablement · no product features · no git.

---

## Phase 12.45 — Final full-system gap re-audit (2026-09-28)

Authoritative reconciliation of repository + workspace evidence after Phases **12.26–12.44**.  
**No new features. No fabricated infra/providers/credentials/telemetry. Production enablement CLOSED.**

Evidence window for this section: source + docs + local env/TCP scan **2026-09-28**. Historical phase sections preserved below.

### Final decision

| Decision | Status |
|----------|--------|
| TECHNICAL CODE READINESS (in-repo) | **READY** (P1–P13.1 + Admin honesty console + 12.28–12.36 code gates) |
| CONTROLLED STAGING | **NOT READY** |
| PRODUCTION | **NOT READY** |

**PRODUCTION NOT READY — OPERATIONAL EVIDENCE MISSING**

**PRODUCTION READINESS: NOT READY**

### Workspace re-verification (2026-09-28) — values never printed

| Check | Result |
|-------|--------|
| DATABASE_URL / TEST_DATABASE_URL | **MISSING** |
| TCP 5432 / 55432 | **CLOSED** |
| REDIS_URL | **MISSING**; TCP 6379 **CLOSED** |
| MERCHANT_SECRET_KEK | **MISSING** |
| PAYME_SANDBOX_* / CLICK_SANDBOX_* / SANDBOX_E2E_RUN | **MISSING** |
| ALLOW_LEGACY_HMAC_TOKENS / LEGACY_HMAC_DEADLINE | **MISSING** → dual-accept **ON** |
| PAYME_MERCHANT_API_ENABLED / CLICK_MERCHANT_API_ENABLED (.env) | **0** (OFF) |
| ENABLE_BACKGROUND_WORKERS (.env) | **0** |
| EXTERNAL_DELIVERY_ENABLED | **MISSING** (keep OFF / CONTRACT_PENDING) |
| Managed PG / Redis / KMS / staging worker IaC | **MISSING** |
| Named external delivery provider | **MISSING** |

### System inventory (current)

| Area | Code | Tests | Live / infra | External contract | Gate |
|------|------|-------|--------------|-------------------|------|
| Mobile (s1 Bearer, cart/orders/cashback) | **READY_IN_REPO** | **TEST_VERIFIED** | **NOT_PROVEN** (store pop.) | — | HMAC retire **OPS_REQUIRED** |
| API / domain engines | **READY_IN_REPO** | **TEST_VERIFIED** | Local PGlite only | — | — |
| PostgreSQL migrations 0000–0010 | **READY_IN_REPO** | **TEST_VERIFIED** | Managed **OPS_REQUIRED** | — | P0-1 |
| Redis rate-limit | **READY_IN_REPO** | **TEST_VERIFIED** | Managed **OPS_REQUIRED** | — | P0-4 |
| Workers + stale reclaim | **READY_IN_REPO** | **TEST_VERIFIED** | Live drill **NOT_PROVEN** | — | O-4 / 12.44 |
| Auth s1 + dual-accept HMAC | **READY_IN_REPO** | **TEST_VERIFIED** | Quiet/telemetry **NOT_PROVEN** | — | P1-3 / 12.39 |
| Merchant enc:v1 | **READY_IN_REPO** | **TEST_VERIFIED** | KMS **OPS_REQUIRED** | — | P0-2 |
| Payme Merchant API | **READY_IN_REPO** | **TEST_VERIFIED** | Sandbox E2E **NOT_RUN** | Core **VERIFIED_IN_REPO**; refund **CONTRACT_PENDING** | P0-3a |
| Click Shop API | **READY_IN_REPO** | **TEST_VERIFIED** | Sandbox E2E **NOT_RUN** | Core **VERIFIED_IN_REPO**; refund **CONTRACT_PENDING** | P0-3b |
| Cashback SoT | **READY_IN_REPO** | **TEST_VERIFIED** | — | FOM_POS **CONTRACT_PENDING** | — |
| Inventory / reservation | **READY_IN_REPO** | **TEST_VERIFIED** | — | — | — |
| Orders axes | **READY_IN_REPO** | **TEST_VERIFIED** | — | — | — |
| Internal delivery | **READY_IN_REPO** | **TEST_VERIFIED** | — | — | — |
| External delivery | Stub **READY_IN_REPO** | **TEST_VERIFIED** | — | **CONTRACT_PENDING** | E-3 / 12.43 |
| FOM | Status honest | **TEST_VERIFIED** | — | Writer OFF; POS **CONTRACT_PENDING** | E-1/E-2 |
| SMS OTP (Eskiz) | **READY_IN_REPO** | **TEST_VERIFIED** (fail-closed) | Prod creds **OPS_REQUIRED** | Eskiz | — |
| Push / email commerce notify | **NOT_IMPLEMENTED** | — | — | — | P2 |
| Admin honesty console | **READY_IN_REPO** | **TEST_VERIFIED** | Browser sanity | — | — |
| Admin users CRUD | UI honest / API **MISSING** | — | — | — | P1 product/API |
| Deep reports / export | UI honest “Hali ulanmagan” | — | — | — | P2 reporting |
| Financial correction UI | **OPEN** / not invented | — | — | — | Product |

### P0 / P1 production blockers (authoritative)

| ID | Severity | Status | Evidence | Next action | Blocks prod? |
|----|----------|--------|----------|-------------|--------------|
| P0-1 | P0 | **OPS_REQUIRED** | No managed PG/PITR/restore; RPO/RTO **NOT_ESTABLISHED** (12.37) | Provision managed PG + PITR + empty-staging restore | **Yes** |
| P0-2 | P0 | **OPS_REQUIRED** | App enc:v1 READY; KEK/KMS **MISSING** (12.42) | Inject KEK/KMS; migrate plaintext rows | **Yes** (merchant secrets) |
| P0-3a | P0 | **OPS_REQUIRED** | Payme sandbox creds **MISSING**; E2E **NOT_RUN** (12.40) | Staging sandbox E2E PASS | **Yes** (Payme cutover) |
| P0-3b | P0 | **OPS_REQUIRED** | Click sandbox creds **MISSING**; E2E **NOT_RUN** (12.41) | Staging sandbox E2E PASS | **Yes** (Click cutover) |
| P0-4 | P0 | **OPS_REQUIRED** | Redis URL **MISSING**; live PING **NOT_PROVEN** (12.38) | Managed Redis + dual-instance verify | **Yes** (multi-instance rate limit) |
| P1-3 | P1 | **OPS_REQUIRED** / **NOT_PROVEN** | HMAC dual-accept ON; telemetry/quiet/population **NOT_PROVEN** (12.39) | Ops quiet period → then `ALLOW_LEGACY_HMAC_TOKENS=0` | Attack-surface until closed |
| O-4 | P1 | **OPS_REQUIRED** | Worker reclaim TEST_VERIFIED; live kill **NOT_PROVEN** (12.44) | Staging always-on worker + kill drill | Reliability |
| E-1/E-2 | P0/P1 ext | **CONTRACT_PENDING** | FOM writer OFF; FOM_POS pending | Vendor stock/POS contract | If FOM required |
| E-3 | P1 ext | **CONTRACT_PENDING** | External delivery stub only (12.43) | Courier contract | If external delivery required |
| E-4 | P1 ext | **CONTRACT_PENDING** | Outbound PSP refund | Provider refund contract | Finance ops |

### Contradictions reconciled

| Topic | Historical note | Current truth (12.45) |
|-------|-----------------|------------------------|
| P0-2 “BLOCKED” in early 12.27 row | Pre-12.28 | App boundary **IMPLEMENTED**; gate = **OPS_REQUIRED** (managed KMS still open) — executive P0 table already updated 12.42 |
| BATCH_3L “no ioredis” | Stale vs rate-limit | Workers ≠ Redis SoT; **ioredis used for rate-limit only** (12.30) |
| RPO/RTO from P13 | Local concurrency | **NOT_ESTABLISHED** until managed PITR + restore |

### Explicit non-enablement (unchanged)

| Gate | State |
|------|-------|
| Production Payme / Click | **OFF** |
| FOM inventory writer | **OFF** |
| FOM_POS | **CONTRACT_PENDING** |
| External delivery success | **CONTRACT_PENDING** |
| Legacy HMAC dual-accept | **ON** (do not disable without ops proof) |
| Production enablement | **CLOSED** |

### Recommended next actions (ordered)

1. **DevOps:** managed PostgreSQL staging + PITR + restore drill → provisional RPO/RTO.
2. **DevOps:** managed Redis staging (`rediss://`) + dual-instance rate-limit + failure drill.
3. **SecOps:** inject `MERCHANT_SECRET_KEK` (prefer KMS-wrapped); migrate merchant rows.
4. **Payments ops:** Payme then Click sandbox credentials + `SANDBOX_E2E_RUN=1` → live PASS.
5. **DevOps:** always-on staging worker + Phase 12.44 kill drill.
6. **Security/Frontend ops:** mobile s1 population + HMAC quiet period → retirement.
7. **External:** FOM stock/POS contracts; courier contract; PSP outbound refund contracts.
8. **Product/Backend (non-P0):** admin users CRUD API; deep reports; financial correction workflow — only after product lock.

### What this phase did NOT do

No business-logic change · no schema change · no API contract invent · no provider invent · no production enablement · no git.

---

## Phase 12.44 — Worker live crash / recovery operational gate (2026-09-28)

Operational re-attempt after Phase 12.36. **No staging worker invented. No DATABASE_URL invented. No crash/RTO fabricated. Production enablement CLOSED. No production process terminated.**

In-repo stale RUNNING reclaim + unit/PGlite tests remain **CODE / TEST evidence**. They do **not** prove a live staging kill drill.

### Workspace re-verification (2026-09-28)

| Check | Result (values never printed) |
|-------|-------------------------------|
| Managed / staging PostgreSQL (`DATABASE_URL`) | **MISSING** |
| TCP 127.0.0.1:5432 / 55432 | **CLOSED** |
| Dedicated staging worker process / container / k8s | **MISSING** |
| Terraform / Pulumi / helm worker deploy | **MISSING** |
| docker-compose `ENABLE_BACKGROUND_WORKERS` | **"0"** (workers not always-on) |
| WORKER_STALE_RUNNING_MS (env) | **MISSING** → code default 30m |
| ENABLE_BACKGROUND_WORKERS / WORKER_* (process) | **MISSING** |
| Live kill mid-RUNNING drill | **NOT RUN** |

### Layer status

| Layer | Status |
|-------|--------|
| WORKER IMPLEMENTATION | **READY_IN_REPO** — PG `worker_jobs`; `FOR UPDATE SKIP LOCKED`; claim/reclaim/complete race-safe |
| STALE RECLAIM | **READY_IN_REPO** / **TEST_VERIFIED** — `reclaimStaleRunningJobs`; floor 60s / default 30m / cap 24h |
| WORKER PROCESS MODEL | API-gated `POST /workers/run-due` (+ optional background flag) — not a separate always-on staging supervisor here |
| STAGING WORKER | **MISSING** → **OPS_REQUIRED** |
| STAGING POSTGRES | **NOT_PROVEN** / **MISSING** |
| TEST JOB / CLAIM / CRASH / RECLAIM (live) | **NOT_PROVEN** / **NOT_RUN** |
| LATE_COMPLETION_LIVE | **NOT_PROVEN** (code LEASE_LOST path **TEST_VERIFIED**) |
| FINAL COMPLETION / RETRY / MAX ATTEMPTS (live) | **NOT_PROVEN** |
| FINANCIAL SAFETY | **READY_IN_REPO** / **TEST_VERIFIED** — domain idempotency + SKIP LOCKED; no live financial crash |
| OBSERVABILITY | **READY_IN_REPO** — `WORKER_STALE_JOB_RECLAIMED` (jobId/type/attempt/nextStatus) |
| OBSERVED_STAGING_RECOVERY_TIME | **NOT_ESTABLISHED** |
| PRODUCTION_RTO | **NOT_ESTABLISHED** |
| LIVE_STAGING_DRILL | **NOT_PROVEN** |
| WORKER LIVE CRASH GATE | **OPS_REQUIRED** / **NOT_PROVEN** |

### Architecture (unchanged — verified only)

```
PENDING/FAILED → claim (SKIP LOCKED, attempt++) → RUNNING
crash → stale RUNNING (locked_at older than WORKER_STALE_RUNNING_MS)
→ reclaimStaleRunningJobs → FAILED/DEAD (attempt not incremented by reclaim)
→ eligible → second claim → SUCCEEDED
late complete with old locked_by → rejected (lease lost)
```

Redis is **not** worker SoT. PGlite ≠ staging PostgreSQL evidence.

### OPS remaining

1. Provision staging PostgreSQL + always-on worker supervisor (`ENABLE_BACKGROUND_WORKERS` / dedicated runner).
2. Disposable non-financial test job via documented enqueue path.
3. Kill worker A mid-RUNNING; wait stale threshold; worker B reclaim → re-claim → SUCCEEDED.
4. Record OBSERVED_STAGING_RECOVERY_TIME only (not production RTO).
5. Keep production kill drills out of scope until staging PASS.

Other gates unchanged: managed PG PITR / Redis / Payme / Click / KMS / HMAC **OPS_REQUIRED**; FOM / external delivery **CONTRACT_PENDING**.

---

## Phase 12.43 — External delivery production contract & operational gate (2026-09-28)

Re-audit of external courier boundary. **No delivery provider invented. No credentials/endpoints/tracking/ETA fabricated. No fake DELIVERED. Production external delivery remains OFF.**

Internal delivery lifecycle + `ExternalDeliveryAdapter` stub remain **CODE / TEST evidence**. They do **not** prove a vendor contract.

### Workspace re-verification (2026-09-28)

| Check | Result (values never printed) |
|-------|-------------------------------|
| Named external provider (Express24/Yandex/Uzum/BTS/Fargo/…) | **None** / **MISSING** |
| Provider SDK / IaC / staging URL | **MISSING** |
| DELIVERY_PROVIDER / DELIVERY_API_* / provider-specific keys | **MISSING** |
| EXTERNAL_DELIVERY_ENABLED (.env) | **MISSING** (`.env.example` documents keep `0` / CONTRACT_PENDING) |
| Live create/quote/assign/webhook/tracking | **NOT RUN** |

### Layer status

| Layer | Status |
|-------|--------|
| INTERNAL DELIVERY LIFECYCLE | **READY_IN_REPO** — statuses pending→assigned→picked_up→on_the_way→delivered/cancelled/failed |
| INTERNAL ADAPTER | **READY_IN_REPO** — `InternalDeliveryAdapter` (local-only; NOT_APPLICABLE) |
| EXTERNAL ADAPTER STUB | **READY_IN_REPO** — `ExternalDeliveryAdapter` always returns **CONTRACT_PENDING** (no fake success) |
| EXTERNAL_PROVIDER | **MISSING** |
| PROVIDER_CONTRACT | **CONTRACT_PENDING** |
| CREDENTIALS | **OPS_REQUIRED** / **MISSING** |
| STAGING_ENDPOINT / TLS | **NOT_PROVEN** |
| CREATE / QUOTE / ASSIGN (live) | **NOT_IMPLEMENTED** / **NOT_PROVEN** |
| STATUS_SYNC (live) | **CONTRACT_PENDING** (`syncStatus` stub) |
| WEBHOOK | **CONTRACT_PENDING** / **NOT_PRESENT** |
| TRACKING / ETA | **CONTRACT_PENDING** — Admin honest “Hali ulanmagan” |
| FAILURE_DRILL (live) | **NOT_PROVEN** |
| RETRY | Worker `delivery_provider_retry` **READY_IN_REPO** against stub; live **NOT_PROVEN** |
| SECURITY | No invented provider secrets; no `rejectUnauthorized:false` in delivery adapters |
| DATABASE_E2E | **NOT_PROVEN** (no live provider run) |
| ADMIN_UI | **READY_IN_REPO** — honest external capability; no fake Connected/tracking |
| PAYMENT SEPARATION | **READY_IN_REPO** — delivery axis ≠ payment_status; PAID ≠ auto cashback |
| LIVE_PROVIDER_VERIFIED | **No** |
| EXTERNAL DELIVERY GATE | **CONTRACT_PENDING** / **OPS_REQUIRED** |
| PRODUCTION EXTERNAL DELIVERY | **OFF** |

### Architecture (unchanged — verified only)

- Fulfillment / payment / delivery axes remain separate (`deliveryLifecycle.ts` does not mutate `orders.payment_status`)
- `getDeliveryAdapter("external")` → stub CONTRACT_PENDING
- Worker path imports adapter; returns pending — no vendor invent
- Admin Delivery page: capability labels map CONTRACT_PENDING → “Hali ulanmagan”

### OPS / contract remaining (E-3)

1. Select and document a real courier provider (ops — do not invent in-repo).
2. Capture authoritative auth, schema, status map, webhook, retry, idempotency, cancel.
3. Inject staging credentials + HTTPS endpoints; enable only after contract verification.
4. Keep `EXTERNAL_DELIVERY_ENABLED=0` until staging PASS; no fake success.

Other gates unchanged: managed PG/Redis/Payme/Click/KMS/HMAC **OPS_REQUIRED**; FOM stock/POS **CONTRACT_PENDING**.

---

## Phase 12.42 — Merchant secret KMS production operational gate (2026-09-28)

Operational re-audit after Phase 12.28. **No cloud KMS provider invented. No key IDs fabricated. No KEK values printed. Production PSP remains OFF.**

Application AES-256-GCM `enc:v1:` + `MERCHANT_SECRET_KEK` remain **CODE / TEST evidence**. They are **not** managed KMS.

### Workspace re-verification (2026-09-28)

| Check | Result (values never printed) |
|-------|-------------------------------|
| Managed KMS provider (AWS/GCP/Azure/Vault/…) | **None** / **MISSING** |
| Terraform / Pulumi / Helm / k8s KMS wiring | **MISSING** |
| Cloud KMS SDK in package.json | **MISSING** |
| AWS_KMS_* / GCP_KMS_* / AZURE_KEY_* / VAULT_* / KMS_KEY_* | **MISSING** |
| MERCHANT_SECRET_KEK (process / .env) | **MISSING** |
| MERCHANT_SECRET_ALLOW_PLAINTEXT_READ | **MISSING** (good — migration flag not left ON) |
| Live KMS encrypt/decrypt / rotation drill | **NOT RUN** |

### Layer status

| Layer | Status |
|-------|--------|
| APPLICATION ENCRYPTION BOUNDARY | **READY_IN_REPO** — `merchantSecretCrypto.ts` AES-256-GCM `enc:v1:`; IV.tag.ct base64url; `local_kek` provider |
| CURRENT_KEY_SOURCE | **ENVIRONMENT_KEK** (when injected) — **not** cloud KMS |
| KMS_BACKING | **NOT_PROVEN** / **MISSING** |
| KMS_PROVIDER | **MISSING** → **OPS_REQUIRED** |
| ENVELOPE MODEL (cloud DEK/CMK) | **NOT_PROVEN** — local AES-GCM with env KEK only |
| IAM / LEAST_PRIVILEGE | **NOT_VERIFIED** (no KMS to inspect) |
| TLS / private endpoint to KMS | **NOT_VERIFIED** |
| KEY_ROTATION | **OPS_REQUIRED** / live **NOT_PROVEN** |
| KEY VERSIONING | App marker `enc:v1:` only — no cloud key-version integration |
| FAILURE BEHAVIOR | **TEST_VERIFIED** (wrong KEK / missing KEK / malformed ciphertext fail-closed) |
| DB AT-REST (this workspace) | **NOT_VERIFIABLE** (no staging DB with merchant rows; KEK unset) |
| MIGRATION TOOLING | **READY_IN_REPO** — dry-run migrate script; not executed against production |
| PAYME / CLICK SECRET BOUNDARY | **READY_IN_REPO** / **TEST_VERIFIED** — decrypt → WeakMap → adapter only |
| LOGS / DTO / AUDIT | **READY_IN_REPO** / **TEST_VERIFIED** — mask; audit booleans only |
| LIVE_KMS_VERIFIED | **No** |
| P0-2 GATE | **OPS_REQUIRED** / **NOT_PROVEN** |
| PRODUCTION PSP | **OFF** |

### Architecture (unchanged — verified only)

```
Admin PATCH → prepareMerchantSecretForStorage() → DB enc:v1:…
DB read → decryptMerchantSecretFromStorage() → WeakMap → Payme/Click adapter
```

Production-like without `MERCHANT_SECRET_KEK` → fail closed (`assertProductionMerchantSecretCryptoReady`).
Plaintext fallback forbidden unless temporary `MERCHANT_SECRET_ALLOW_PLAINTEXT_READ=1` migration window.

### OPS remaining (P0-2)

1. Choose managed secret manager / KMS (ops — do not invent in-repo SDK).
2. Inject 32-byte KEK as `MERCHANT_SECRET_KEK` (base64/hex) from approved manager; prefer KMS-wrapped KEK later.
3. Staging: encrypt writes → verify `enc:v1:` in DB → payment resolve succeeds.
4. Migrate legacy plaintext rows (dry-run first); disable plaintext-read flag.
5. Document rotation procedure; do not claim LIVE_KMS until provider + IAM + rotation evidence exist.

Other gates unchanged: managed PG/Redis/Payme/Click/HMAC **OPS_REQUIRED**; FOM/delivery **CONTRACT_PENDING**.

---

## Phase 12.41 — Click sandbox E2E operational gate (2026-09-28)

Operational re-attempt after Phase 12.32. **No credentials invented. No fake provider responses. No live PASS. Production Click remains OFF (`CLICK_MERCHANT_API_ENABLED=0`).**

In-repo Shop API (Prepare/Complete) + harness remain **CODE / TEST evidence**. They do **not** prove live Click sandbox E2E.

### Workspace re-verification (2026-09-28)

| Check | Result (values never printed) |
|-------|-------------------------------|
| CLICK_SANDBOX_SECRET / CLICK_TEST_SECRET | **MISSING** |
| CLICK_SANDBOX_SERVICE_ID / CLICK_SERVICE_ID / CLICK_TEST_SERVICE_ID | **MISSING** |
| CLICK_SANDBOX_MERCHANT_ID / CLICK_MERCHANT_ID / CLICK_TEST_MERCHANT_ID | **MISSING** |
| CLICK_SANDBOX_URL / CLICK_CALLBACK_URL | **MISSING** |
| SANDBOX_E2E_RUN | **MISSING** |
| .env sandbox keys | **MISSING** (commented examples in `.env.example` only) |
| CLICK_MERCHANT_API_ENABLED (.env) | **0** (production enable OFF) |
| MERCHANT_SECRET_KEK | **MISSING** → cloud KMS still **OPS_REQUIRED** |
| Harness `pnpm sandbox:e2e` this run | `CLICK_SANDBOX_E2E` = **PENDING** |
| Live Prepare/Complete/callback network | **NOT RUN** |

### Layer status

| Layer | Status |
|-------|--------|
| CLICK ADAPTER | **READY_IN_REPO** (`ClickAdapter`; outbound `refund()` → **CONTRACT_PENDING**) |
| CLICK CONTRACT (Shop API Prepare/Complete) | **VERIFIED_IN_REPO** — action 0/1; MD5 `sign_string`; timing-safe verify; soum integer amount |
| SHA1 Merchant API / other undocumented APIs | **CONTRACT_PENDING** |
| SANDBOX CREDENTIALS | **MISSING** → **OPS_REQUIRED** |
| LIVE SANDBOX E2E | **NOT_RUN** / **NOT_PROVEN** |
| SANDBOX ENDPOINT / TLS | **NOT_PROVEN** (no authoritative URL + creds in workspace) |
| PREPARE / COMPLETE (live) | **NOT_PROVEN** |
| CALLBACK LIVE | **NOT_PROVEN** (inbound Shop API handler **VERIFIED_IN_REPO** only) |
| DUPLICATE / IDEMPOTENCY (live) | **NOT_PROVEN** (duplicate Complete → one capture / ALREADY_PAID **TEST_VERIFIED**) |
| FAILURE SCENARIO (sandbox) | **NOT_PROVEN** |
| INBOUND CANCEL / error≠0 | **READY_IN_REPO** / **TEST_VERIFIED** (not live-proven) |
| OUTBOUND REFUND | **CONTRACT_PENDING** |
| FINANCIAL INTEGRITY (live) | **NOT_PROVEN** — PAID still does not auto-earn cashback in code |
| SECRET SECURITY | App `enc:v1` **READY_IN_REPO**; production KMS **OPS_REQUIRED** |
| PRODUCTION CLICK | **OFF** |
| P0-3b GATE | **OPS_REQUIRED** / **NOT_PROVEN** |

### Architecture (unchanged — verified only)

- Provider-neutral payment core; Click isolated in `clickMerchantApi` / `clickContract` / `ClickAdapter`
- Integer soum amounts; MD5 sign_string with timing-safe comparison
- One capture per intent; duplicate Complete protected in-repo
- PostgreSQL SoT; fulfillment separate; PAID ≠ automatic cashback

### OPS remaining (P0-3b)

1. Inject staging-only `CLICK_SANDBOX_SECRET` + `CLICK_SANDBOX_SERVICE_ID` + `CLICK_SANDBOX_MERCHANT_ID` (never commit; never use production keys).
2. Register staging HTTPS Prepare/Complete URL with Click.
3. Set `SANDBOX_E2E_RUN=1` on staging runner with disposable DB fixture.
4. Execute Prepare → Complete → capture; prove duplicate Complete → one capture / ALREADY_PAID.
5. Keep `CLICK_MERCHANT_API_ENABLED=0` until pilot cutover (runbook §3) after sandbox PASS.

Other gates unchanged: Payme sandbox / Redis / managed PG / KMS / HMAC **OPS_REQUIRED**; FOM/delivery **CONTRACT_PENDING**.

---

## Phase 12.40 — Payme sandbox E2E operational gate (2026-09-28)

Operational re-attempt after Phase 12.31. **No credentials invented. No fake provider responses. No live PASS. Production Payme remains OFF (`PAYME_MERCHANT_API_ENABLED=0`).**

In-repo Merchant API + harness remain **CODE / TEST evidence**. They do **not** prove live Payme sandbox E2E.

### Workspace re-verification (2026-09-28)

| Check | Result (values never printed) |
|-------|-------------------------------|
| PAYME_SANDBOX_KEY / PAYME_TEST_KEY | **MISSING** |
| PAYME_SANDBOX_MERCHANT_ID / PAYME_TEST_MERCHANT_ID / PAYME_MERCHANT_ID | **MISSING** |
| PAYME_SANDBOX_URL / PAYME_CALLBACK_URL | **MISSING** |
| SANDBOX_E2E_RUN | **MISSING** |
| .env sandbox keys | **MISSING** (commented examples in `.env.example` only) |
| PAYME_MERCHANT_API_ENABLED (.env) | **0** (production enable OFF) |
| MERCHANT_SECRET_KEK | **MISSING** → cloud KMS still **OPS_REQUIRED** |
| Harness `pnpm sandbox:e2e` this run | `PAYME_SANDBOX_E2E` = **PENDING** |
| Live Create/Perform/callback/refund network | **NOT RUN** |

### Layer status

| Layer | Status |
|-------|--------|
| PAYME ADAPTER | **READY_IN_REPO** (`PaymeAdapter`; outbound `refund()` → **CONTRACT_PENDING**) |
| PAYME CONTRACT (core Merchant RPC) | **VERIFIED_IN_REPO** — CheckPerform / Create / Perform / Cancel / Check; tiyin; Basic auth; capture uniqueness |
| GetStatement / Subscribe / fiscal | **CONTRACT_PENDING** |
| SANDBOX CREDENTIALS | **MISSING** → **OPS_REQUIRED** |
| LIVE SANDBOX E2E | **NOT_RUN** / **NOT_PROVEN** |
| SANDBOX ENDPOINT / TLS | **NOT_PROVEN** (no authoritative URL + creds in workspace) |
| PAYMENT CREATION / PERFORM / CAPTURE (live) | **NOT_PROVEN** |
| CALLBACK LIVE | **NOT_PROVEN** (inbound Merchant handler **VERIFIED_IN_REPO** only) |
| DUPLICATE / IDEMPOTENCY (live) | **NOT_PROVEN** (in-repo capture uniqueness **TEST_VERIFIED**) |
| FAILURE SCENARIO (sandbox) | **NOT_PROVEN** |
| INBOUND CANCEL | **READY_IN_REPO** / **TEST_VERIFIED** (not live-proven) |
| OUTBOUND REFUND | **CONTRACT_PENDING** |
| FINANCIAL INTEGRITY (live) | **NOT_PROVEN** — PAID still does not auto-earn cashback in code |
| SECRET SECURITY | App `enc:v1` **READY_IN_REPO**; production KMS **OPS_REQUIRED** |
| PRODUCTION PAYME | **OFF** |
| P0-3a GATE | **OPS_REQUIRED** / **NOT_PROVEN** |

### Architecture (unchanged — verified only)

- Provider-neutral payment core; Payme isolated in `paymeMerchantApi` / `paymeContract` / `PaymeAdapter`
- Integer money; UZS ↔ tiyin (*100)
- One capture per intent; duplicate Perform/callback protected in-repo
- PostgreSQL SoT; fulfillment separate; PAID ≠ automatic cashback

### OPS remaining (P0-3a)

1. Inject staging-only `PAYME_SANDBOX_KEY` + `PAYME_SANDBOX_MERCHANT_ID` (never commit; never use production keys).
2. Set `SANDBOX_E2E_RUN=1` on staging runner with disposable DB fixture.
3. Execute harness / Merchant RPC lifecycle; prove Create→Perform→Cancel + duplicate idempotency.
4. Record callback/failure only with real sandbox evidence.
5. Keep `PAYME_MERCHANT_API_ENABLED=0` until pilot cutover (runbook §3) after sandbox PASS.

Other gates unchanged: Click sandbox / Redis / managed PG / KMS / HMAC **OPS_REQUIRED**; FOM/delivery **CONTRACT_PENDING**.

---

## Phase 12.39 — HMAC legacy auth retirement operational gate (2026-09-28)

Operational evidence audit after 12.33 / 12.34. **Legacy HMAC NOT disabled. Dual-accept left ON. No invented telemetry, quiet period, adoption %, or mobile release population. Production enablement CLOSED.**

s1.* issuance + mobile opaque Bearer remain **CODE / TEST evidence**. They do **not** prove installed-client population or zero legacy usage in production.

### Workspace re-verification (2026-09-28)

| Check | Result (values never printed) |
|-------|-------------------------------|
| ALLOW_LEGACY_HMAC_TOKENS (env) | **MISSING** → default dual-accept **ON** |
| LEGACY_HMAC_DEADLINE (env) | **MISSING** / **NOT_CONFIGURED** |
| .env flags | Commented examples only in `.env.example` |
| signCustomerToken / signAdminToken call sites (app source) | **Definitions only** — unused by login/register/OTP/admin login |
| Mobile createHmac / CUSTOMER_SECRET / id:exp:sig construction | **Absent** |
| Admin web HMAC construction | **Absent** (stores opaque `vm-admin-token` Bearer) |
| auth_events / metrics counter for “legacy HMAC accepted” | **Absent** → usage **NOT_PROVEN** |
| Store release / min-version / migration completion record | **Absent** → population **NOT_PROVEN** |
| Documented quiet-period execution evidence | **Absent** → **NOT_PROVEN** |

### Layer status

| Layer | Status |
|-------|--------|
| CODE VERIFIED | OTP/password/admin login → `issue*Session` → `s1.*`; `auth_sessions` SoT; revoke/expiry; `read*Token` gated by `allowLegacyHmacTokens()`; timing-safe compare |
| TEST VERIFIED | security-p3 dual-accept / flag / deadline; phase12-33/34; auth session tests |
| LIVE TELEMETRY VERIFIED | **NOT_PROVEN** (`LEGACY_HMAC_USAGE_TELEMETRY = NOT_PROVEN`) |
| MOBILE RELEASE VERIFIED | **NOT_PROVEN** (`MOBILE_S1_POPULATION_PROOF = NOT_PROVEN`) |
| QUIET PERIOD VERIFIED | **NOT_PROVEN** (`HMAC_QUIET_PERIOD = NOT_PROVEN`) |
| LEGACY HMAC ISSUANCE | **UNUSED / DEPRECATED** (helpers remain for tests / dual-accept fixtures) |
| LEGACY HMAC VERIFICATION | Still **active** while dual-accept ON (via `requireCustomer` / `requireAdmin`) |
| HMAC_ISSUANCE_RETIREMENT | Not blocked by issuance (already unused) |
| HMAC RETIREMENT GATE | **OPS_REQUIRED** / **NOT_PROVEN** — do **not** set `ALLOW_LEGACY_HMAC_TOKENS=0` yet |

### Compatibility boundary (unchanged)

| Mechanism | Classification |
|-----------|----------------|
| Customer/admin Bearer `s1.*` | Current session auth |
| Customer/admin legacy HMAC Bearer | Compatibility only (dual-accept) |
| POS QR `VM1.*` | **Separate** — not session HMAC retirement |
| Telegram header auth | **Separate** — non-prod gated |
| Payme / Click / FOM webhook secrets | **Separate** — provider auth |

### Health of retirement controls

| Control | Semantics |
|---------|-----------|
| Default (both unset) | Dual-accept **ON** |
| `ALLOW_LEGACY_HMAC_TOKENS=0/false/no` | Reject legacy HMAC; s1 unaffected |
| `ALLOW_LEGACY_HMAC_TOKENS=1/true/yes` | Force dual-accept ON (emergency rollback) |
| `LEGACY_HMAC_DEADLINE=<ISO>` | Dual-accept until timestamp; after → reject legacy |
| This phase action | **None** — flags left unset; compatibility code retained |

### P1-3 after 12.39

| Before | After | Why |
|--------|-------|-----|
| **OPEN** / **OPS_REQUIRED** (12.34) | **OPEN** / **OPS_REQUIRED** (re-verified) | Code READY_IN_REPO; ops evidence (telemetry + release population + quiet period) still missing |

### OPS remaining (before ALLOW_LEGACY_HMAC_TOKENS=0)

1. Ship/confirm store mobile builds that only store opaque API tokens (s1 from login).
2. Add or scrape **real** legacy-accept telemetry (do not invent counters here).
3. Observe quiet period with zero **required** legacy accepts (duration = ops policy).
4. Set `LEGACY_HMAC_DEADLINE`, then `ALLOW_LEGACY_HMAC_TOKENS=0` (staging first).
5. Keep emergency rollback: staging-first `ALLOW_LEGACY_HMAC_TOKENS=1`.

Other gates unchanged: managed PG/Redis/Payme/Click/KMS **OPS_REQUIRED**; FOM/delivery **CONTRACT_PENDING**.

---

## Phase 12.38 — Production Redis staging provisioning & live resilience gate (2026-09-28)

Re-audit after Phase 12.30 / 12.35 / 12.37. **No Redis provider invented. No REDIS_URL invented. No live PING fabricated. Production enablement CLOSED.**

FakeRedis / in-memory rate-limit / unit multi-instance tests remain **CODE / TEST evidence only** — not managed Redis durability or live staging resilience.

### Workspace re-verification (2026-09-28)

| Check | Result (values never printed) |
|-------|-------------------------------|
| Managed provider (ElastiCache / Memorystore / Azure Cache / Upstash / Redis Cloud / …) | **None** / **MISSING** |
| Terraform / Pulumi / CDK / helm / k8s Redis | **MISSING** |
| docker-compose Redis service | **MISSING** (no redis service in compose) |
| REDIS_URL (process / user / machine env) | **MISSING** |
| REDIS_HOST / REDIS_PORT / REDIS_USERNAME / REDIS_PASSWORD / REDIS_TLS | **MISSING** |
| .env REDIS_URL | **MISSING** (commented examples in `.env.example` only) |
| TCP 127.0.0.1:6379 | **CLOSED** |
| TCP 127.0.0.1:6380 | **CLOSED** |
| Live PING / rate-limit / failover drill | **NOT RUN** |

### Layer status

| Layer | Status |
|-------|--------|
| CODE VERIFIED | ioredis@5.6.1; singleton lazyConnect; assertProductionRedisConfig; warmRedisForBoot PING; connectTimeout 5s; commandTimeout 2s; maxRetriesPerRequest 2; no `rejectUnauthorized: false` |
| TEST VERIFIED | FakeRedis multi-instance shared INCR; prod-like 503 `RATE_LIMIT_REDIS_UNAVAILABLE`; config assert; phase12-30 gate |
| LIVE STAGING VERIFIED | **NOT_PROVEN** |
| MANAGED PROVIDER | **MISSING** → **OPS_REQUIRED** |
| REDIS_URL | **MISSING** / **NOT_VERIFIABLE** |
| TLS (`rediss://` + cert validation) | **NOT_PROVEN** |
| AUTH / ACL | **NOT_PROVEN** / **NOT_VERIFIABLE** |
| LIVE PING | **NOT_PROVEN** |
| LIVE RATE LIMIT | **NOT_PROVEN** |
| LIVE MULTI-INSTANCE | **NOT_PROVEN** (FakeRedis only = TEST_VERIFIED) |
| REDIS FAILURE DRILL | **NOT_PROVEN** / **OPS_REQUIRED** |
| RECOVERY | **NOT_PROVEN** |
| FAILOVER | **NOT_PROVEN** / **OPS_REQUIRED** |
| SoT | Redis **not** financial SoT — PG remains authoritative for orders/payments/cashback/reservations/inventory/FOM/worker_jobs |

### Health / readiness (unchanged contract)

| Endpoint | Redis dependency |
|----------|------------------|
| `/health/live` | None (process up only) |
| `/health/ready` | **PostgreSQL only** — Redis intentionally **not** part of readiness |

Do not change readiness semantics for this phase.

### Failure matrix (Redis)

| Scenario | Evidence class |
|----------|----------------|
| Redis unavailable (mid-request, prod-like) | **TEST_VERIFIED** (503 RATE_LIMIT_REDIS_UNAVAILABLE); live **NOT_PROVEN** |
| Redis authentication failure | **NOT_PROVEN** |
| Redis TLS failure | **NOT_PROVEN** |
| Redis timeout | **CODE_VERIFIED** (commandTimeout); live **NOT_PROVEN** |
| Redis reconnect | **CODE_VERIFIED** (ioredis reconnect statuses); live **NOT_PROVEN** |
| Redis failover | **NOT_PROVEN** / **OPS_REQUIRED** |
| Redis recovery after outage | **NOT_PROVEN** / **OPS_REQUIRED** |

### P0-4 after 12.38

| Before | After | Why |
|--------|-------|-----|
| **OPS_REQUIRED** (12.30) | **OPS_REQUIRED** (re-verified) | Still no managed Redis / REDIS_URL / TLS / live PING / dual-instance / failover |

**Not DONE.** Unit tests ≠ production Redis.

### OPS remaining (P0-4 checklist)

1. Provision managed Redis staging (ops chooses provider — do not invent in-repo).
2. Set staging `REDIS_URL` (prefer `rediss://`); confirm boot warm PING.
3. Verify auth required; ACL least privilege where available.
4. Live rate-limit on protected routes; dual API instance shared counter.
5. Controlled Redis stop → 503; restore → reconnect without inventing memory bypass.
6. Optional provider failover drill; record observed recovery only (no invented RTO).
7. Wire alert scrape for `RATE_LIMIT_REDIS_UNAVAILABLE`.

Other gates unchanged: managed PG/PITR **OPS_REQUIRED**; Payme/Click/KMS/HMAC **OPS_REQUIRED**; FOM/delivery **CONTRACT_PENDING**; worker live crash drill **OPS_REQUIRED**.

---

## Phase 12.37 — Managed PostgreSQL staging provisioning & restore gate (2026-09-28)

Re-audit after Phase 12.36. **No managed provider invented. No DATABASE_URL invented. No restore fabricated. Production enablement CLOSED.**

PGlite / `pnpm backup:drill` / P13 compose postgres (`55432`) remain **local/demo/concurrency evidence only** — not managed durability.

### Workspace re-verification (2026-09-28)

| Check | Result (values never printed) |
|-------|-------------------------------|
| Managed provider selected (RDS/Cloud SQL/Azure/Neon/…) | **None** / **MISSING** |
| Terraform / Pulumi / CDK for managed PG | **MISSING** |
| DATABASE_URL (process env) | **MISSING** |
| TEST_DATABASE_URL | **MISSING** |
| .env DATABASE_URL / TEST_DATABASE_URL | **MISSING** |
| DB_DRIVER | **PGLITE_LOCAL** (local demo) |
| TCP 127.0.0.1:5432 | **CLOSED** |
| TCP 127.0.0.1:55432 (compose P13) | **CLOSED** (profile not required for this gate) |
| Live restore into empty staging | **NOT RUN** |

### Layer status

| Layer | Status |
|-------|--------|
| IMPLEMENTED IN REPO | Fail-closed staging/prod without postgres URL; PGlite forbidden in staging/prod; pool defaults; live≠ready; migrations 0000–0010; logical backup drill script |
| REAL STAGING EVIDENCE | **NOT_PROVEN** |
| MANAGED PROVIDER | **MISSING** → **OPS_REQUIRED** |
| BACKUP (managed automated) | **NOT_PROVEN** |
| PITR | **NOT_PROVEN** |
| RESTORE (empty staging drill) | **NOT_PROVEN** / **OPS_REQUIRED** |
| RPO | **NOT_ESTABLISHED** |
| RTO | **NOT_ESTABLISHED** |
| TLS (staging connection) | **NOT_PROVEN** |

### P0-1 after 12.37

| Before | After | Why |
|--------|-------|-----|
| **OPS_REQUIRED** (12.29) | **OPS_REQUIRED** (re-verified) | Still no managed instance / URL / PITR / restore evidence |

**Not DONE.** Local PGlite ≠ managed PostgreSQL.

### OPS remaining (unchanged checklist)

1. Select managed provider; provision staging instance.
2. Set staging DATABASE_URL (prefer TLS); confirm `/health/ready` driver=postgres.
3. Enable automated backups + PITR; record retention.
4. Restore into **empty** disposable staging; measure duration → provisional RTO observation; derive RPO from PITR window.
5. Only then consider production cutover (still behind other P0 gates).

Other gates unchanged: Redis/Payme/Click/KMS/HMAC OPS_REQUIRED; FOM/delivery CONTRACT_PENDING; worker live crash drill OPS_REQUIRED.

---

## Phase 12.36 — Worker crash recovery & stale RUNNING reclaim (2026-09-28)

Closes the Phase 12.35 gap: `worker_jobs` left in **RUNNING** after process crash. **PostgreSQL remains SoT. No Redis/BullMQ invent. Production enablement CLOSED.**

### Previous gap

RUNNING + crash before SUCCEEDED/FAILED → job never re-claimed (claim filter was PENDING/FAILED only).

### Stale RUNNING definition

`status = 'RUNNING'` AND `locked_at` older than `WORKER_STALE_RUNNING_MS` (default **30 minutes**, floor 60s, cap 24h).

Must exceed longest expected handler duration. Documented in `.env.example`.

### Reclaim mechanism (IMPLEMENTED IN REPO)

1. `reclaimStaleRunningJobs()` — `FOR UPDATE SKIP LOCKED` on stale RUNNING rows.
2. Transition: RUNNING → **FAILED** (or **DEAD** if `attempts >= max_attempts`).
3. Does **not** increment attempts (already counted at claim).
4. Clears `locked_at` / `locked_by`; sets `last_error = stale_running_reclaimed`; backoff on `run_after`.
5. Called at start of `runDueWorkerJobs()` (before claim).
6. Completion/failure updates require `status=RUNNING` AND `locked_by=workerId` (race-safe).

### Race safety

| Scenario | Outcome |
|----------|---------|
| Active worker still within lease | Not selected (`locked_at` fresh) |
| Legitimate SUCCEEDED before reclaim | Reclaim updates 0 rows |
| Reclaim then second worker claim | Single SKIP LOCKED claim → one SUCCEEDED |
| Late success after reclaim | LEASE_LOST — success ignored; domain handlers must be idempotent |

### Attempt / retry

Preserve existing policy: attempts increment on claim only; reclaim → FAILED/DEAD; backoff unchanged.

### Idempotency (workers)

| Job | Idempotency note |
|-----|------------------|
| reservation_expiry | Release-only; already-released safe |
| payment_expiry | failPaymentIntent + release; invalid transition ignored |
| fom_retry | receipt-idempotent; writer OFF |
| delivery_provider_retry | CONTRACT_PENDING adapter |
| notification | best-effort noop |
| cashback_integrity | read-only |

Reclaim does not make a non-idempotent handler safe — these handlers already tolerate retry.

### Evidence labels

| Item | Status |
|------|--------|
| Stale RUNNING reclaim code | **READY_IN_REPO** |
| Local PGlite crash/reclaim tests | **TEST_VERIFIED** |
| Real production/staging worker kill drill | **OPS_REQUIRED** / **NOT_PROVEN** |
| Alert | `WORKER_STALE_JOB_RECLAIMED` |

### Observability

`ALERT.WORKER_STALE_JOB_RECLAIMED` — jobId / jobType / attempt / nextStatus only (no secrets/PII).

### Production limitations

Local reclaim tests ≠ HA. Always-on worker supervisor + staging kill drill still **OPS_REQUIRED**. RPO/RTO remain **NOT_ESTABLISHED**.

---

## Phase 12.35 — Failure recovery & operational resilience (2026-09-28)

Audit only. **No invented HA. No fabricated outage drills. No RPO/RTO invented. Production enablement CLOSED.**

Evidence labels used below: **CODE_VERIFIED** · **TEST_VERIFIED** · **READY_IN_REPO** · **LOCAL_SIMULATION** · **REAL_STAGING** · **REAL_PRODUCTION** · **OPS_REQUIRED** · **NOT_PROVEN** · **CONTRACT_PENDING**.

This workspace: **REAL_STAGING** / **REAL_PRODUCTION** drills = **NOT_PROVEN**. Local unit/FakeRedis/PGlite ≠ production failover.

### Failure matrix (summary)

| ID | Failure | Detection / response | Integrity | Evidence |
|----|---------|----------------------|-----------|----------|
| A | PG unavailable | `/health/ready` 503; writes fail | Fail-closed new money writes | CODE_VERIFIED · TEST_VERIFIED; live drill OPS_REQUIRED |
| B | PG connect timeout | pool `connectionTimeoutMillis` 10s | Request fail | READY_IN_REPO; query `statement_timeout` NOT_PROVEN |
| C | Pool exhaustion | wait then fail | Load shed by error | READY_IN_REPO; ops metrics OPS_REQUIRED |
| D | Tx failure | abort; unique/FOR UPDATE races | Idempotent money paths | CODE_VERIFIED |
| E | Redis unavailable | boot exit prod-like; mid-request 503 on limited routes; no memory bypass | Rate-limit fail-closed; PG SoT | CODE_VERIFIED · TEST_VERIFIED; live OPS_REQUIRED |
| F | Redis timeout | connect 5s / command 2s → E | Same | CODE_VERIFIED |
| G | Redis reconnect | ensureRedisConnected | Same | CODE_VERIFIED; multi-instance live NOT_PROVEN |
| H | Worker restart | claim PENDING/FAILED via SKIP LOCKED | Domain idempotency | CODE_VERIFIED · TEST_VERIFIED; always-on runner OPS_REQUIRED |
| I | Worker crash mid-job | stale lease reclaim (12.36) | RUNNING → FAILED/DEAD then re-claim | CODE_VERIFIED · TEST_VERIFIED; live drill OPS_REQUIRED |
| J | API graceful restart | SIGTERM close + 15s | Sessions in PG | CODE_VERIFIED; load drill OPS_REQUIRED |
| K | API crash | process death | Idempotent captures | READY_IN_REPO; crash drill NOT_PROVEN |
| L | PSP timeout | inbound retry / pending | One capture design | READY_IN_REPO; sandbox E2E OPS_REQUIRED |
| M | Duplicate callback | unique event + capture uidx | No double capture | CODE_VERIFIED · TEST_VERIFIED |
| N | PSP failure | fail intent; prod PSP OFF | No fake PAID | CODE_VERIFIED |
| O | FOM unavailable | no inbound; fom_retry worker | Writer OFF | READY_IN_REPO · CONTRACT_PENDING stock |
| P | FOM timeout | inbound N/A; writer OFF | No inventory corruption | CODE_VERIFIED |
| Q | Delivery external | CONTRACT_PENDING adapter | No fake tracking | CONTRACT_PENDING |
| R | SMS unavailable | prod 503 unconfigured; send 502 | OTP hashed; no OTP in logs | CODE_VERIFIED; live Eskiz OPS_REQUIRED |
| S | Object storage | Not used | N/A | MISSING / N/A |
| T/U | Missing prod config | DATABASE_URL / REDIS_URL / KEK / secrets fail-closed | Boot refuse | CODE_VERIFIED · TEST_VERIFIED |
| V | Expired session | 401 | — | CODE_VERIFIED · TEST_VERIFIED |
| W | Revoked session | 401 | — | CODE_VERIFIED · TEST_VERIFIED |

### Health / readiness

| Endpoint | Meaning | Dependencies |
|----------|---------|--------------|
| `/api/health/live` | Process up | None |
| `/api/health/ready` | DB `SELECT 1` | PostgreSQL only — **Redis not included** |

### RPO / RTO

| Metric | Status |
|--------|--------|
| RPO | **NOT_ESTABLISHED** |
| RTO | **NOT_ESTABLISHED** |
| Managed PITR | **NOT_PROVEN** / **OPS_REQUIRED** |
| Local PGlite backup drill | Does **not** establish production RPO/RTO |

### Local simulations vs real infra

| Proven locally / CI | Still OPS_REQUIRED |
|---------------------|--------------------|
| Ready≠live; Redis FakeRedis 503; SKIP LOCKED claim; capture/webhook idempotency; session expire/revoke; config fail-closed | Managed PG PITR; live Redis; staging API/worker kill under load; RUNNING reclaim ops; Payme/Click sandbox; SMS prod; delivery vendor |

### Operator actions remaining

1. Provision managed PG + PITR + restore drill → establish RPO/RTO.
2. Staging failure drills: DB blip, Redis stop, API restart under light write, worker kill with RUNNING reclaim procedure.
3. Always-on worker supervisor + monitor stuck RUNNING / DEAD jobs.
4. Wire alert scrape for RATE_LIMIT_REDIS_UNAVAILABLE / WORKER_JOB_* / PAYMENT_* / FOM_*.
5. Keep production PSP OFF and FOM writer OFF until contracts + sandbox PASS.

### Final resilience gate (12.35)

| Layer | Status |
|-------|--------|
| In-repo fail-closed + idempotency patterns | **READY_IN_REPO** / **TEST_VERIFIED** |
| Production HA / DR verified | **NOT_PROVEN** |
| Overall operational resilience for production | **OPS_REQUIRED** — **NOT READY** |
| Production enablement | **CLOSED** |

Other gates unchanged: Redis/Payme/Click/KMS/HMAC retirement OPS_REQUIRED; FOM/delivery CONTRACT_PENDING.

---

## Phase 12.34 — Mobile s1.* migration & HMAC retirement readiness (2026-09-28)

Readiness audit only. **Legacy HMAC NOT disabled. ALLOW_LEGACY_HMAC_TOKENS not set to 0. No invented telemetry/deadlines/client versions.**

### A. Current mobile authentication

| Step | Behavior | Status |
|------|----------|--------|
| Login / OTP / register | API returns `token` from `issueCustomerSession` | DONE |
| Token format | `s1.{publicId}.{secret}` | DONE |
| Mobile storage | AsyncStorage key `vaksinamed-customer-token` (opaque) | READY_IN_REPO |
| Request attach | `Authorization: Bearer <token>` via `artifacts/soglom-apteka/lib/api.ts` | READY_IN_REPO |
| App restart | Token reloaded from AsyncStorage | READY_IN_REPO |
| Logout | POST `/api/auth/logout` + clear storage | DONE |
| Expiry | Server rejects expired/revoked s1; client must re-login | READY_IN_REPO (server) |
| Refresh endpoint | **NOT_PRESENT** | Documented |
| Client HMAC construction | **Absent** — no createHmac / CUSTOMER_SECRET in mobile | VERIFIED_IN_REPO |

Flow: LOGIN/OTP → API → createSession → s1.* → AsyncStorage → Bearer → validateSessionToken → customer → logout revoke.

### B. Legacy HMAC generation status

| Location | Status |
|----------|--------|
| `signCustomerToken` / `signAdminToken` | PRESENT / @deprecated |
| Called by login/register/OTP/admin login | **UNUSED** (issuance uses issue*Session only) |
| Call sites outside auth.ts definitions | **None found** in application source |
| Test fixtures | May synthesize HMAC for dual-accept tests only |
| New mobile login creates legacy HMAC? | **NO** |

### C. Legacy HMAC verification status

| Item | Status |
|------|--------|
| Dual-accept default | **ON** (ALLOW_LEGACY_HMAC_TOKENS / LEGACY_HMAC_DEADLINE unset) |
| requireCustomer / requireAdmin | Accept s1 OR legacy HMAC when dual-accept ON |
| This phase disabled dual-accept? | **NO** |

### D. Routes accepting legacy HMAC (via requireCustomer / requireAdmin)

All routes using `requireCustomer` or `requireAdmin` dual-accept while flag open, including:

- Customer: `/api/auth/me`, `/api/auth/logout`, loyalty/*, cart/*, orders (customer), payments (customer), deliveries (customer), pos/card, integrations customer paths
- Admin/staff: `/api/admin/*`, POS staff routes, payments admin, deliveries admin, workers admin, FOM status

Telegram header auth (non-prod) and POS VM1 QR HMAC remain **separate** mechanisms (unchanged).

### E. Refresh status

| Item | Status |
|------|--------|
| `/auth/refresh` | NOT_PRESENT |
| Session TTL | Customer ~30d; Admin ~12h |
| After s1 expiry | Re-authenticate via OTP/password/login (mobile already has login/OTP flows) |
| Blocks code migration of issuance? | No — issuance already s1-only |
| Blocks HMAC retirement alone? | No — retirement blocked by **usage proof**, not refresh absence |
| Refresh required before retirement? | NOT required by repo architecture; re-login is the recovery path |

### F–H. Migration evidence / telemetry / quiet period

| Evidence | Status |
|----------|--------|
| Supported / deployed mobile version list | NOT_PROVEN |
| Telemetry of legacy HMAC accepts | NOT_PROVEN (no dashboard in repo) |
| Server log query proving zero legacy accepts | NOT_PROVEN |
| Client release notes “s1-only storage” | NOT_PROVEN |
| Migration percentage | NOT_PROVEN (do not invent) |
| Quiet period executed | NOT_PROVEN |

**MOBILE s1-ONLY PROOF = NOT_PROVEN**

### I. Retirement criteria (before ALLOW_LEGACY_HMAC_TOKENS=0)

1. Supported mobile clients store/use opaque tokens from API (new logins already s1).
2. No application code issues legacy HMAC (already true for login paths).
3. No required integration depends on legacy session HMAC (POS VM1 / PSP auth are separate).
4. Ops evidence: quiet period with **zero required** legacy accepts (auth_events / access logs) — duration chosen by ops, not invented here.
5. Re-auth after expiry verified on staging (login/OTP).
6. Rollback: can set ALLOW_LEGACY_HMAC_TOKENS=1 in staging/emergency.

### J. Rollback strategy

Staging-first reopen of dual-accept (`ALLOW_LEGACY_HMAC_TOKENS=1`); prefer client upgrade over long dual-accept. See runbook §6.

### K. Final gate (12.34)

| Decision | Status |
|----------|--------|
| Code readiness for s1-only *issuance* | DONE |
| Mobile client does not construct HMAC | READY_IN_REPO |
| Production s1-only proof | NOT_PROVEN |
| Legacy HMAC retirement | **OPS_REQUIRED** (do not disable yet) |
| HMAC_MOBILE_REFRESH_REQUIRED | Still required |
| Production enablement | CLOSED |

---

## Phase 12.33 — HMAC legacy auth closure & security gate (2026-09-28)

Audit of authentication stack and legacy HMAC dual-accept. **No blind HMAC removal. No secrets printed. Production enablement CLOSED.**

### Authentication architecture (source inventory)

| Mechanism | Status | Evidence |
|-----------|--------|----------|
| Customer phone + OTP | USED / READY_IN_REPO | routes/auth.ts → issueCustomerSession → s1.* |
| Customer password register/login | USED / READY_IN_REPO | Same; issues s1.* |
| Customer PIN | NOT_PRESENT | — |
| Mobile/admin Bearer `s1.*` session | USED / DONE (issuance) | sessions.ts; auth_sessions hash SoT |
| Legacy customer HMAC Bearer (`id:exp:sig`) | USED (verify only, dual-accept) | readCustomerToken gated by allowLegacyHmacTokens() |
| Legacy admin HMAC Bearer (`id:role:branch:exp:sig`) | USED (verify only, dual-accept) | readAdminToken |
| Telegram header / auto-provision | USED non-prod; OFF production-like | securityEnv allowTelegram* |
| Admin email/password | USED / READY_IN_REPO | issueAdminSession → s1.* |
| POS QR HMAC `VM1.*` | USED (separate scan token) | pos.ts — NOT the legacy API session gate |
| FOM / Payme / Click webhook auth | USED (provider secrets) | Not session HMAC |

### Current authentication (`s1.*`)

| Item | Status |
|------|--------|
| Format | s1.{publicId}.{secret} |
| Issuance | DONE on OTP / login / register / admin login |
| Storage | PostgreSQL auth_sessions (secret hashed; never raw) |
| Verification | validateSessionToken — expiry + revoke + timing-safe |
| Logout/revocation | DONE for s1.* only |
| Refresh endpoint | NOT_PRESENT (re-login) |
| TTL | Customer ~30d; Admin ~12h |

### Legacy HMAC inventory

| Item | Status |
|------|--------|
| signCustomerToken / signAdminToken | PRESENT / @deprecated; UNUSED by login issuance |
| readCustomerToken / readAdminToken | USED when dual-accept open |
| Secret env names | CUSTOMER_SECRET / ADMIN_SECRET (values never printed) |
| ALLOW_LEGACY_HMAC_TOKENS | MISSING in this workspace → default dual-accept ON |
| LEGACY_HMAC_DEADLINE | MISSING |
| Legacy revocation | NOT_PRESENT (stateless until exp) |
| Routes accepting | Any requireCustomer / requireAdmin while dual-accept ON |

### Legacy HMAC actual usage

| Question | Result |
|----------|--------|
| Still accepted on API when dual-accept ON? | YES (code path) |
| Created by new logins? | NO — new logins issue s1.* only |
| Mobile constructs HMAC client-side? | NO (opaque Bearer storage only) |
| Mobile enforces s1.*-only storage? | NO — NOT_PROVEN migration wipe |
| Production quiet period / zero legacy accepts? | NOT_PROVEN |
| Safe to mark CLOSED now? | NO — BLOCKED / OPS_REQUIRED |

### Migration / compatibility strategy (repo evidence)

**B — Deprecate** (keep dual-accept temporarily). Issuance migration already DONE. Do **not** D-remove now.

Runbook path (ops): ship mobile that stores only s1.* → set LEGACY_HMAC_DEADLINE → quiet period → ALLOW_LEGACY_HMAC_TOKENS=0.

### Security (session/HMAC)

| Check | Status |
|-------|--------|
| Timing-safe HMAC / session hash compare | READY_IN_REPO |
| Malformed / expired rejected | READY_IN_REPO (tests) |
| Secrets fail-closed in production-like | READY_IN_REPO |
| Dual-accept residual risk documented | YES |
| Production secrets printed this phase | Never |

### Retirement gate

| Decision | Status |
|----------|--------|
| Legacy HMAC CLOSED | **NOT** — remains dual-accept |
| Gate | **OPS_REQUIRED** / **NOT_PROVEN** (mobile refresh + quiet period) |
| Code close controls | READY_IN_REPO (flag + deadline) |
| Label in docs | HMAC_MOBILE_REFRESH_REQUIRED / PENDING_MOBILE_REFRESH |

### Test evidence

security-p3, p12-2-pilot-gates, final-production-closure, p3-sessions-rbac, security-env, phase12-33-hmac-legacy-gate.

### Production readiness

| Item | Status |
|------|--------|
| Production enablement | CLOSED |
| P1-3 Legacy HMAC dual-accept close | OPEN / OPS_REQUIRED (12.33 re-verified) |
| Other P0 gates | Unchanged (PG/Redis/Payme/Click/KMS OPS; FOM CONTRACT_PENDING) |

---

## Phase 12.32 — Click sandbox E2E production gate (2026-09-28)

Audit of in-repo Click Shop API + sandbox harness. **No credentials invented. No fake E2E PASS. Production Click remains OFF.**

### 1. Code readiness (IMPLEMENTED IN REPO)

| Item | Evidence |
|------|----------|
| Shop API handler | artifacts/api-server/src/lib/clickMerchantApi.ts — Prepare (action=0) / Complete (action=1) |
| Contract helpers | artifacts/api-server/src/lib/clickContract.ts — MD5 sign, error codes, checkout URL, enable flag |
| Adapter boundary | paymentAdapters.ts ClickAdapter — provider fields isolated; refund() → CONTRACT_PENDING |
| Route | POST /api/payments/click/merchant (+ webhook forward for Prepare/Complete) |
| Production enable | CLICK_MERCHANT_API_ENABLED fail-closed in production-like (default OFF) |
| Checkout host | Non-prod → my.click.uz/services/pay; prod host gated by CLICK_CHECKOUT_BASE_URL or CLICK_LIVE=1 |
| Amount | UZS soums; compared via ×100 integer tiyin |
| Capture path | Complete → capturePayment; provider failure does not invent PAID |
| Outbound Merchant API (SHA1) / fiscal / Click Pass | CONTRACT_PENDING (explicit in source) |

### 2. Contract verification

| Dimension | Status |
|-----------|--------|
| Endpoint (inbound Shop API Prepare/Complete) | VERIFIED_IN_REPO |
| Authentication (MD5 sign_string + timing-safe compare) | VERIFIED_IN_REPO |
| Merchant/service identity (branch clickMerchantId + clickServiceId + secret) | VERIFIED_IN_REPO |
| Request/response schema (core Shop API fields) | VERIFIED_IN_REPO |
| Prepare/Complete lifecycle | VERIFIED_IN_REPO |
| Transaction identity (click_trans_id / merchant_trans_id / prepare id) | VERIFIED_IN_REPO |
| Amount representation (soums) | VERIFIED_IN_REPO |
| Error codes (0, -1 … -9) | VERIFIED_IN_REPO |
| Duplicate Complete → ALREADY_PAID (-4) | VERIFIED_IN_REPO |
| Sign-time clock-skew window | CONTRACT_PENDING (format validated only) |
| Outbound provider refund API | CONTRACT_PENDING |
| Complete cancel (Click error≠0 → TRANSACTION_CANCELLED) | READY_IN_REPO |
| Outbound SHA1 Merchant API | CONTRACT_PENDING |

Sources cited in code headers: docs.click.uz Shop API / click-api-request / click-api-error / click-button. Do not invent undocumented fields.

### 3. Credential availability (values never printed)

| Check | Result |
|-------|--------|
| CLICK_SANDBOX_SECRET | MISSING |
| CLICK_SANDBOX_SERVICE_ID | MISSING |
| CLICK_SANDBOX_MERCHANT_ID | MISSING |
| SANDBOX_E2E_RUN | MISSING |
| CLICK_MERCHANT_API_ENABLED | OFF_OR_ZERO (prod enable not active) |
| CLICK_LIVE / CLICK_CHECKOUT_BASE_URL | MISSING |

### 4. Sandbox execution

| Item | Status |
|------|--------|
| Harness script | READY_IN_REPO — pnpm sandbox:e2e → sandbox-e2e-harness.ts |
| This workspace run | CLICK_SANDBOX_E2E = **PENDING** (credentials absent) |
| Fake/mock PASS | **Not claimed** — harness refuses PASS without real network proof |
| Live network E2E | **NOT RUN** — credentials/fixture unavailable |
| Gate | **OPS_REQUIRED** |

### 5. Test evidence (in-repo)

| Suite | Covers |
|-------|--------|
| lib/db p7-6-4-click-merchant | Prepare/Complete, sign, duplicate complete, one capture |
| payment-p7-contracts / payment-p7-accelerated | Adapter boundary, fail-closed flags |
| p12-1-sandbox-e2e / phase12-27-p0-gates | Harness PENDING ≠ PASS |
| phase12-28-secret-encryption | click_secret enc:v1 + DTO mask |
| phase12-32-click-sandbox-gate | This phase documentation invariants |

Passing unit/integration tests ≠ live sandbox PASS.

### 6. Production readiness

| Decision | Status |
|----------|--------|
| Production Click | **OFF** |
| Production enablement | **CLOSED** |
| P0-3b Click sandbox E2E | **OPS_REQUIRED** (re-verified 12.32) |
| Technical code (core Shop API settle) | **READY_IN_REPO** |
| Live sandbox proof | **NOT_PROVEN** |

### 7. Remaining OPS work (P0-3b)

1. Obtain Click **sandbox** secret + service_id + merchant_id (never commit; staging secret store only).
2. Configure branch click_* fields (encrypted via MERCHANT_SECRET_KEK when available).
3. Register staging HTTPS Prepare/Complete URL with Click.
4. Set CLICK_SANDBOX_* + SANDBOX_E2E_RUN=1 on staging runner with non-prod DB fixture.
5. Execute Prepare → Complete → capture; duplicate Complete → one capture / ALREADY_PAID.
6. Keep CLICK_MERCHANT_API_ENABLED=0 until pilot cutover checklist (runbook §3) after sandbox PASS.
7. Outbound refund / SHA1 Merchant API remain CONTRACT_PENDING until verified provider contracts exist.

### Merchant secret flow (unchanged from 12.28)

Admin/DB → enc:v1: AES-GCM when MERCHANT_SECRET_KEK set → decrypt on payment resolve → WeakMap material bag (clickSecret). Admin DTOs mask secrets; audit booleans only. Cloud KMS = **OPS_REQUIRED**.

### Payment / fulfillment separation (unchanged)

Order payment axis: PENDING / PAID / FAILED / REFUNDED / PARTIALLY_REFUNDED. Capture does not auto-earn cashback. Fulfillment remains separate. Payme sandbox gate (12.31) remains **OPS_REQUIRED**.

---

## Phase 12.31 — Payme sandbox E2E production gate (2026-09-28)

Audit of in-repo Payme Merchant API + sandbox harness. **No credentials invented. No fake E2E PASS. Production Payme remains OFF.**

### 1. Code readiness (IMPLEMENTED IN REPO)

| Item | Evidence |
|------|----------|
| Merchant API handler | artifacts/api-server/src/lib/paymeMerchantApi.ts — CheckPerform / Create / Perform / Cancel / Check |
| Contract helpers | artifacts/api-server/src/lib/paymeContract.ts — tiyin math, Basic auth, checkout URL, enable flag |
| Adapter boundary | paymentAdapters.ts PaymeAdapter — provider fields isolated; refund() → CONTRACT_PENDING |
| Route | POST /api/payments/payme/merchant (+ webhook forward) |
| Production enable | PAYME_MERCHANT_API_ENABLED fail-closed in production-like (default OFF) |
| Checkout host | Non-prod → checkout.test.paycom.uz; prod host only with PAYME_CHECKOUT_BASE_URL or PAYME_LIVE=1 |
| Amount | Integer UZS ↔ tiyin (*100); invalid amounts rejected |
| Capture path | Perform → capturePayment; provider failure does not invent PAID |
| GetStatement | Explicit METHOD_NOT_FOUND / CONTRACT_PENDING (not invented) |

### 2. Contract verification

| Dimension | Status |
|-----------|--------|
| Endpoint (inbound Merchant JSON-RPC) | VERIFIED_IN_REPO |
| Authentication (HTTP Basic Paycom:key) | VERIFIED_IN_REPO |
| Merchant identity (branch paymeMerchantId + key) | VERIFIED_IN_REPO |
| Request/response schema (core methods) | VERIFIED_IN_REPO |
| GetStatement / Subscribe / fiscal | CONTRACT_PENDING |
| Callback/webhook (inbound Merchant API) | VERIFIED_IN_REPO |
| Transaction lifecycle Create→Perform→Cancel | VERIFIED_IN_REPO |
| Idempotency (attempt key payme:create:id + capture uniqueness) | VERIFIED_IN_REPO |
| Error codes (-31001…-32601) | VERIFIED_IN_REPO |
| Outbound provider refund API | CONTRACT_PENDING |
| Inbound cancel-after-perform → ledger refund | READY_IN_REPO |
| HMAC signature (separate from Basic) | NOT_PRESENT (N/A — auth is Basic) |

Sources cited in code headers: developer.help.paycom.uz Merchant API pages. Do not invent undocumented fields.

### 3. Credential availability (values never printed)

| Check | Result |
|-------|--------|
| PAYME_SANDBOX_KEY / PAYME_TEST_KEY | MISSING |
| PAYME_SANDBOX_MERCHANT_ID / PAYME_TEST_MERCHANT_ID | MISSING |
| SANDBOX_E2E_RUN | MISSING |
| PAYME_MERCHANT_API_ENABLED | OFF_OR_ZERO (prod enable not active) |
| PAYME_LIVE / PAYME_CHECKOUT_BASE_URL | MISSING |
| MERCHANT_SECRET_KEK | MISSING (app encrypt path ready; cloud KMS still OPS_REQUIRED) |

### 4. Sandbox execution

| Item | Status |
|------|--------|
| Harness script | READY_IN_REPO — pnpm sandbox:e2e → sandbox-e2e-harness.ts |
| This workspace run | PAYME_SANDBOX_E2E = **PENDING** (credentials absent) |
| Fake/mock PASS | **Not claimed** — harness refuses PASS without real network proof |
| Live network E2E | **NOT RUN** — credentials/contract fixture unavailable |
| Gate | **OPS_REQUIRED** |

### 5. Test evidence (in-repo)

| Suite | Covers |
|-------|--------|
| payment-p7-contracts / payment-p7-accelerated | Payment axis, capture, idempotency contracts |
| payment-p7-6-2-merchant / lib p7-6-3-payme-merchant | Merchant resolve + Payme RPC unit paths |
| p12-1-sandbox-e2e / phase12-27-p0-gates | Harness PENDING ≠ PASS |
| phase12-28-secret-encryption / p12-28 merchant crypto | enc:v1 + DTO mask |
| phase12-31-payme-sandbox-gate | This phase documentation invariants |

Passing unit/integration tests ≠ live sandbox PASS.

### 6. Production readiness

| Decision | Status |
|----------|--------|
| Production Payme | **OFF** |
| Production enablement | **CLOSED** |
| P0-3a Payme sandbox E2E | **OPS_REQUIRED** (re-verified 12.31) |
| Technical code (core settle) | **READY_IN_REPO** |
| Live sandbox proof | **NOT_PROVEN** |

### 7. Remaining OPS work (P0-3a)

1. Obtain Payme **sandbox** merchant id + key (never commit; staging secret store only).
2. Register staging HTTPS merchant callback URL with Payme.
3. Set PAYME_SANDBOX_* + SANDBOX_E2E_RUN=1 on staging runner with non-prod DB fixture.
4. Execute CheckPerform → Create → Perform → capture; duplicate callback → one capture.
5. Keep PAYME_MERCHANT_API_ENABLED=0 until pilot cutover checklist (runbook §3) after sandbox PASS.
6. Outbound refund remains CONTRACT_PENDING until verified provider refund contract exists.

### Merchant secret flow (unchanged from 12.28)

Admin/DB → enc:v1: AES-GCM when MERCHANT_SECRET_KEK set → decrypt on payment resolve → WeakMap material bag. Admin DTOs mask secrets; audit booleans only. Cloud KMS = **OPS_REQUIRED**.

### Payment / fulfillment separation (unchanged)

Order payment axis: PENDING / PAID / FAILED / REFUNDED / PARTIALLY_REFUNDED. Capture does not auto-earn cashback. Fulfillment remains separate.

---

## Phase 12.30 — Redis production gate audit (2026-09-28)

Full audit of in-repo Redis / rate-limit code. **No Redis provider invented. No REDIS_URL invented. No production enablement.**

### Workspace re-verification

| Check | Result (values never printed) |
|-------|-------------------------------|
| REDIS_URL (process env) | **MISSING** |
| .env REDIS_URL | **MISSING** |
| TCP 127.0.0.1:6379 | **CLOSED** |
| Managed Redis provider selected | **None** |
| Live PING | **NOT_PROVEN** |

### IMPLEMENTED IN REPO

| Item | Evidence |
|------|----------|
| Client | ioredis@5.6.1 via artifacts/api-server/src/lib/redis.ts |
| Env contract | REDIS_URL only (redis:// or rediss:// documented) |
| Singleton lifecycle | One shared client per process; lazyConnect: true |
| Timeouts | connectTimeout: 5000 ms; commandTimeout: 2000 ms; maxRetriesPerRequest: 2 |
| Boot | assertProductionRedisConfig() + warmRedisForBoot() (connect + PING) in index.ts |
| Prod/staging without URL | **Fail closed** at boot |
| Rate-limit algorithm | Fixed-window INCR + PEXPIRE on first hit; PTTL repair if TTL missing |
| Key privacy | Logical key → sha256 hex truncated to 40 chars → rl:v1:{digest} (toStorageKey) |
| Prod Redis unavailable mid-request | Middleware returns **503** RATE_LIMIT_REDIS_UNAVAILABLE (no memory bypass) |
| Dev/test without Redis | Intentional **memory** fallback (MemoryRateLimitBackend) |
| Alerts | RATE_LIMITED, RATE_LIMIT_REDIS_UNAVAILABLE via alerts.ts (log alertCode) |
| SoT boundary | Redis **not** used for cashback/orders/payments/inventory/workers (PG worker_jobs) |

### TEST VERIFIED (in-repo)

| Item | Evidence |
|------|----------|
| Multi-instance shared counter | rate-limit-redis.test.ts FakeRedis shared by two backends |
| Atomic concurrent INCR | Same suite — 20 parallel hits → counts 1..20 |
| Window expiry | FakeRedis clock advance |
| Production fail-closed middleware | Injected failing backend → 503 in production-like |
| Config requires REDIS_URL | assertProductionRedisConfig throws when unset in prod-like |

### PRODUCTION INFRASTRUCTURE

| Item | State |
|------|-------|
| Managed Redis endpoint | **OPS_REQUIRED** / absent |
| Authentication (ACL / password in URL) | **NOT_VERIFIABLE** (no URL) |
| TLS (rediss:// / cert validation) | **NOT_PROVEN** — app accepts URL; no custom rejectUnauthorized:false; live TLS untested |
| Live PING on staging/prod | **NOT_PROVEN** |
| Multi-instance on real Redis | **NOT_PROVEN** (FakeRedis only) |
| Observability / APM for Redis | **OPS_REQUIRED** (alerts log-only) |
| Failover / recovery runbook drill | **NOT_PROVEN** |

### Protected endpoint inventory (source)

| Route | Limiter | Window / max | Logical key (hashed before Redis) |
|-------|---------|--------------|-----------------------------------|
| POST /auth/otp/request | otpLimiter | 15m / 8 | otp:{ip}:{phone} |
| POST /auth/register | authLimiter | 15m / 30 | auth:{ip} |
| POST /auth/login | authLimiter | 15m / 30 | auth:{ip} |
| POST /auth/otp/verify | authLimiter | 15m / 30 | auth:{ip} |
| POST /admin/login | adminLoginLimiter | 15m / 20 | admin-login:{ip} |
| POST /orders | orderCreateLimiter | 60s / 20 | order-create:{ip}:{authPrefix24} |
| GET /loyalty/cashback-history | cashbackHistoryLimiter | 60s / 60 | cashback-history:{ip}:{authPrefix24} |
| POST /loyalty/redeem | redeemLimiter | 60s / 20 | loyalty-redeem:{ip} |
| GET /pos/card | cardLimiter | 60s / 30 | pos-card:{ip} |
| POST /pos/lookup | scanLimiter | 60s / 60 | pos-scan:{ip} |
| POST /pos/preview | scanLimiter | 60s / 60 | pos-scan:{ip} |
| POST /pos/sale | saleLimiter | 60s / 40 | pos-sale:{ip} |
| POST /pos/void | saleLimiter | 60s / 40 | pos-sale:{ip} |

Failure: prod-like Redis errors → **503** (not unlimited). Dev → memory limiter.

### P0-4 status after 12.30

| Before | After | Why |
|--------|-------|-----|
| **OPS_REQUIRED** (code DONE; live absent) | **OPS_REQUIRED** (re-verified) | In-repo **READY_IN_REPO**; live Redis / TLS / PING / multi-instance ops still missing |

**Not DONE.** Passing unit tests ≠ production Redis.

### OPS remaining (P0-4)

1. Provision managed Redis (ops chooses provider — do not invent in-repo).
2. Set staging REDIS_URL (prefer rediss://); confirm boot warm PING.
3. Verify 503 when Redis stopped under production-like flags.
4. Two API instances + one Redis: confirm shared 429 behavior on a limited route.
5. Wire alert scrape / dashboard for RATE_LIMIT_REDIS_UNAVAILABLE (observability).

---

## Daily production checkpoint — 2026-09-25

End-of-day engineering checkpoint. **PRODUCTION ENABLEMENT = CLOSED.**

### Status taxonomy (honest)

| Category | Items |
|----------|-------|
| **DONE** / **READY_IN_REPO** | Auth/RBAC; cashback SoT; inventory; orders; payments (code); workers (code); Redis rate-limit **code**; merchant secret **encryption boundary**; Admin honesty console (12.6A–12.25.1); P13/P13.1 local evidence; CI workflows |
| **OPS_REQUIRED** | Managed PostgreSQL; PITR; managed restore; RPO/RTO; cloud KMS for merchant secrets; production Redis live; Payme sandbox E2E; Click sandbox E2E; GitHub required checks toggle; staging failure drills; observability/APM; worker always-on process; SMS production credentials; Docker registry push |
| **CONTRACT_PENDING** | FOM stock/inventory writer contract; FOM POS; external delivery execution |
| **NOT_PROVEN** | Managed PITR; managed restore drill; failure-recovery drills; infra/query metrics |
| **BLOCKED** | None forced green — P0 items that remain infra-blocked stay **OPS_REQUIRED** (not marked DONE) |

### P0 snapshot

| P0 | State |
|----|-------|
| P0-1 Managed PG + PITR + restore | **OPS_REQUIRED** (12.37 re-verified) |
| P0-2 Merchant secret KMS | App **READY_IN_REPO**; managed KMS **OPS_REQUIRED** (12.42) |
| P0-3a/b Sandbox Payme/Click E2E | **OPS_REQUIRED** (12.40 Payme + 12.41 Click PENDING/NOT_RUN) |
| P0-4 Redis live | **OPS_REQUIRED** (12.38 re-verified) |

### Explicit non-enablement

| Gate | State |
|------|-------|
| Production Payme/Click | **OFF** |
| FOM inventory writer | **OFF** |
| FOM POS | **CONTRACT_PENDING** |
| External delivery success | **CONTRACT_PENDING** (12.43 re-verified) |
| Production PGlite | **Forbidden** (staging/prod) |
| Plaintext merchant secret fallback (prod-like) | **Forbidden** (fail closed) |

---

## Classification legend

| State | Meaning |
|-------|---------|
| **DONE** | Verified in code and/or tests |
| **OPEN** | Gap remains; work possible in-repo or product decision |
| **BLOCKED** | Cannot close without prerequisite (usually EXTERNAL/OPS) |
| **CONTRACT_PENDING** | Needs verified external provider contract |
| **OPS_REQUIRED** | Needs infrastructure / cloud / GitHub admin actions |
| **NOT_SUPPORTED** | Intentionally unavailable / disabled by design |
| **DEFERRED** | Post-launch / non-blocking enhancement |

Owner types: Backend · Frontend · DevOps · Security · External Provider · Product Decision

---

## P0 — Production Blockers

Launching production money/ops would be unsafe or impossible without these.

| # | Capability | Current State | Evidence | Why it matters | Owner Type | Next Action |
|---|------------|---------------|----------|----------------|------------|-------------|
| P0-1 | Managed PostgreSQL backup / PITR + restore drill | **OPS_REQUIRED** (12.29 re-verified) | `DATABASE_URL=MISSING`; TCP 5432/55432 CLOSED; no provider IaC; PGlite `backup:drill` ≠ PITR; P13/P13.1 ≠ durability | Data durability unproven | DevOps | Provision managed PG; TLS; backups+PITR; empty-staging restore; record RPO/RTO |
| P0-2 | Branch merchant secret encryption at rest (KMS/Vault) | **OPS_REQUIRED** (12.42 re-verified: app **READY_IN_REPO**; managed KMS **MISSING**) | `merchantSecretCrypto.ts` AES-GCM `enc:v1:`; fail-closed without `MERCHANT_SECRET_KEK`; no cloud KMS SDK | Ciphertext path ready; KEK/KMS provisioning + row migration remain | Security + DevOps + Backend | Inject KEK from approved secret manager; migrate plaintext → `enc:v1:`; then prefer KMS-wrapped KEK |
| P0-3 | Payme + Click sandbox E2E (before any production PSP enable) | **OPS_REQUIRED** (12.27: both PENDING) | Harness executable; all sandbox env MISSING → PENDING | Cannot safely enable live PSP | External Provider + DevOps | Staging sandbox secrets + `pnpm sandbox:e2e` PASS |
| P0-4 | Production/staging Redis (`REDIS_URL`) live multi-instance verify | **OPS_REQUIRED** (12.30 audit: code **READY_IN_REPO**; live **NOT_PROVEN**) | `REDIS_URL=MISSING`; TCP 6379 CLOSED; fail-closed + FakeRedis multi-instance tests PASS | Rate limits must be shared across instances | DevOps | Provision Redis; TLS URL; warm PING; dual-instance verify |

---

## P1 — Required Before Production

| # | Capability | Current State | Evidence | Why it matters | Owner Type | Next Action |
|---|------------|---------------|----------|----------------|------------|-------------|
| P1-1 | GitHub branch protection (required CI checks) | **OPS_REQUIRED** | `GITHUB_REQUIRED_CHECKS.md`; CI jobs exist; toggle is admin ops | Unprotected main allows ship without gates | DevOps | Require Typecheck + Build/tests + Docker jobs on default branch |
| P1-2 | Staging failure-recovery drills (API/worker/DB restart) | **OPS_REQUIRED** | P13.1 `FAILURE_RECOVERY: NOT_PROVEN`; FINAL checklist | Unknown recovery behavior under fault | DevOps | Execute restart drills on staging; record results |
| P1-3 | Close legacy HMAC dual-accept after mobile `s1.*`-only | **OPEN** / **OPS_REQUIRED** (12.39) | 12.39: issuance UNUSED/DEPRECATED; mobile/admin no HMAC construct; telemetry/quiet/population **NOT_PROVEN**; dual-accept left ON | Dual-accept widens auth attack surface | Frontend + Security + Ops | Telemetry + store release + quiet period → then `ALLOW_LEGACY_HMAC_TOKENS=0` |
| P1-4 | Infra / host / queue / DB connection metrics | **OPS_REQUIRED** | FINAL MONITORING NOT_PROVEN; `alerts.ts` log `alertCode` only | No production alerting beyond logs | DevOps | Wire APM/host dashboards + scrape `alertCode` |
| P1-5 | Query profiling (`pg_stat_statements` or equivalent) | **OPS_REQUIRED** | P13.1 QUERY_PROFILING NOT_PROVEN | Cannot tune real staging bottlenecks | DevOps | Enable on staging PG; capture top queries |
| P1-6 | Object storage for production media (if product requires CDN/S3) | **OPS_REQUIRED** / **OPEN** | MASTER_SPEC lists S3-compatible storage; local/assets still used | Scale/CDN/media durability | DevOps + Product Decision | Decide requirement; provision if required for launch |

---

## P2 — Scale / Early Production

| # | Capability | Current State | Evidence | Why it matters | Owner Type | Next Action |
|---|------------|---------------|----------|----------------|------------|-------------|
| P2-1 | Admin user / role management API | **OPEN** | No `/admin/users` CRUD; Adminlar honesty page (12.23) | Ops cannot manage staff without DB seed | Backend + Product Decision | Design + implement admin-user API when product prioritizes |
| P2-2 | Deep reports / export / BI | **OPEN** / **DEFERRED** | Reports = dashboard snapshot (12.20); no CSV/charts API | HQ analytics incomplete | Backend + Product Decision | Only after reporting API exists — do not invent UI |
| P2-3 | Controlled financial correction workflow (beyond reverse/refund) | **OPEN** | Cashback incident runbook §16 | Manual SoT corrections need governed path | Product Decision + Backend | Spec then implement; never invent balances |
| P2-4 | 1000+ branch capacity optimizations | **DEFERRED** | P13.1 observed to 1000 branches local HTTP; staging metrics EXTERNAL | Near-term 200+ OK locally; 1000+ needs staging proof | Backend + DevOps | Re-run load on staging host with metrics |
| P2-5 | Catalog / payment / audit pagination hardening under growth | **DONE** (contracts) / **OPEN** (ops observe) | Catalog 3G pagination tests; audit growth unprofiled | Table growth risk | Backend + DevOps | Monitor sizes; add indexes only with evidence |

---

## P3 — Post-Launch

| # | Capability | Current State | Evidence | Why it matters | Owner Type | Next Action |
|---|------------|---------------|----------|----------------|------------|-------------|
| P3-1 | Inventory low-stock threshold policy | **NOT_SUPPORTED** (not invented) | Admin status: MISSING threshold | Product policy absent | Product Decision | Define threshold then API |
| P3-2 | Dedicated cashback metrics dashboard | **OPEN** | Incident runbook | Nice-to-have ops visibility | Backend + Frontend | After SoT metrics API |
| P3-3 | Q3 FOM pickup earn exact timing | **OPEN** | FINAL / MASTER open business | Policy clarity | Product Decision | Decide; keep current safe earn rules until then |
| P3-4 | Batch 3K open policies (cashier cancel, PAID cancel↔PSP, etc.) | **OPEN** | FINAL_PRODUCTION_CLOSURE open policies | Avoid guessing cutover | Product Decision | Decide; keep least-privilege defaults |
| P3-5 | Admin FilterBar full migration polish | **DEFERRED** | ADMIN_IMPLEMENTATION_STATUS PARTIAL | UX consistency only | Frontend | Incremental; not a launch gate |

---

## External / Contract Pending

| # | Capability | Current State | Evidence | Why it matters | Owner Type | Next Action |
|---|------------|---------------|----------|----------------|------------|-------------|
| E-1 | FOM inventory / stock write contract | **CONTRACT_PENDING** | `fomAdapter.ts` writer `false`; `fom/status` CONTRACT_PENDING; writer must stay OFF | Blind stock writes = oversell risk | External Provider | Vendor contract checklist in FINAL/P12.2 — then gates |
| E-2 | FOM_POS stable external receipt identity | **CONTRACT_PENDING** | `fomPosContract`; confirm-pos = ORDER `order:{id}` | Invented receipts break cashback SoT | External Provider | Stable receipt ID contract; do not invent |
| E-3 | External delivery / courier provider | **CONTRACT_PENDING** / **OPS_REQUIRED** (12.43) | 12.43: provider MISSING; `ExternalDeliveryAdapter` stub only; credentials MISSING; live E2E NOT_PROVEN; Admin honest Hali ulanmagan | External ETA/tracking not available | External Provider | Verified courier API contract + staging creds — do not invent |
| E-4 | PSP outbound refund adapter (Payme/Click) | **CONTRACT_PENDING** | `paymentService` / adapters refund CONTRACT_PENDING | Auto provider refund not invented | External Provider | Documented refund API + sandbox proof |
| E-5 | Production Payme/Click live credentials | **NOT_SUPPORTED** (intentionally OFF) until E2E | Fail-closed production flags | Premature enable = financial risk | External Provider + DevOps | After sandbox PASS only |

---

## Operations Required

| # | Item | Current State | Evidence | Next Action |
|---|------|---------------|----------|-------------|
| O-1 | Staging environment with HTTPS + secrets | **OPS_REQUIRED** | Ops runbook | Provision staging |
| O-2 | Docker image push/registry (CI builds only) | **OPS_REQUIRED** | CI docker job PASS; no push | Decide registry + push policy |
| O-3 | TLS termination / CORS production config | **OPS_REQUIRED** | Assumptions in security docs | Document and configure edge |
| O-4 | Worker process always-on in production | **OPS_REQUIRED** (12.44: code **READY_IN_REPO**; live crash drill **NOT_PROVEN**) | 12.44: staging worker MISSING; DATABASE_URL MISSING; TCP 5432/55432 CLOSED; compose workers OFF; reclaim TEST_VERIFIED only | Run worker supervisor with prod flags + staging kill drill |
| O-5 | SMS/OTP provider production credentials | **OPS_REQUIRED** | Auth OTP hashed; provider env | Configure production SMS |

---

## Not Supported / Intentionally Disabled

| Capability | Current State | Evidence |
|------------|---------------|----------|
| FOM inventory writer | **NOT_SUPPORTED** / DISABLED | `FOM_INVENTORY_WRITER_ENABLED = false` |
| FOM_POS cashback source | **NOT_SUPPORTED** until contract | Reserved; confirm-pos remains ORDER |
| External delivery execution success | **NOT_SUPPORTED** | Always CONTRACT_PENDING — no fake success |
| Fake Admin FOM probe/sync/KPI | **NOT_SUPPORTED** | Admin 12.24 honesty console |
| Fake Admin users CRUD | **NOT_SUPPORTED** | Admin 12.23 access boundary |
| Fake Reports charts/export | **NOT_SUPPORTED** | Admin 12.20 |
| Production PSP without sandbox | **NOT_SUPPORTED** | Fail-closed flags |

---

## Completed / Verified

| Area | Capability | Current State | Evidence |
|------|------------|---------------|----------|
| Auth | OTP hash/expiry/attempts; sessions | **DONE** | `auth.ts`; security contracts |
| RBAC | Permissions + branch scope | **DONE** | `rbac.ts`; admin IDOR tests |
| Cashback | Universal SoT (accounts/ledger/commercial_tx); 30% max; EARN/USE/REVERSAL; ORDER/POS/SYSTEM | **DONE** | P6 locks; cashback contract tests; UC 2.0 |
| Inventory | physical/reserved/available; reservations authority; concurrency | **DONE** | P4; inventory contracts; P13 races PASS |
| Orders | Three axes (fulfillment/payment/reservation) | **DONE** | P5; order lifecycle contracts |
| Payments | Intent/capture/idempotency/refund≤capture (in-ledger) | **DONE** (code) | paymentService; P13/P13.1 concurrency |
| POS | QR lookup/sale/void cashback | **DONE** | pos-qr-contracts |
| Workers | PG `worker_jobs` + FOR UPDATE SKIP LOCKED; expiry/FOM retry/notify | **DONE** (code) | workers.ts; P13 claim PASS |
| Redis rate limit | Fixed-window INCR/PEXPIRE; hashed keys; fail-closed prod | **DONE** (code) | rateLimit.ts; redis.ts |
| FOM sale bridge | Webhook sale commercial path; writer OFF | **DONE** (commercial) | fomBridge; integrations status |
| Postgres | Migrations 0000–0010; pool; real PG load | **DONE** (code + P13/P13.1) | P13 reports; P13.1 HTTP PASS |
| Security suite | Redaction; RBAC; PSP flags | **DONE** | security-contracts.test.ts |
| Admin UI | Ops modules + honesty (Reports/Audit/Settings/Adminlar/FOM); lucide sidebar 12.25.1 | **DONE** (UI) | Admin phase tests 12.x |
| CI | typecheck / build-test / docker workflow | **DONE** (repo) | `.github/workflows/ci.yml` |

---

## Evidence Matrix

| Area | Unit | Integration | E2E | Real PostgreSQL | Real HTTP | Browser | Status |
|------|------|-------------|-----|-----------------|-----------|---------|--------|
| Auth / OTP / session | PASS | PASS | PARTIAL | PASS (P13.1 auth probe) | PASS | N/A | **DONE** code |
| RBAC / branch scope | PASS | PASS | PARTIAL | — | — | Admin | **DONE** |
| Cashback SoT | PASS | PASS | PASS (scripts) | PASS | PASS | Admin CRM | **DONE** |
| Inventory / reservations | PASS | PASS | — | PASS ×3 | PASS ×3 | Admin | **DONE** |
| Payments capture/refund | PASS | PASS | PENDING sandbox | PASS ×3 | PASS ×3 | Admin | **DONE** code · **OPS** sandbox |
| POS | PASS | PASS | — | — | — | Admin | **DONE** |
| Delivery internal | PASS | PASS | — | — | — | Admin | **DONE** |
| Delivery external | — | CONTRACT | — | — | — | Honest UI | **CONTRACT_PENDING** |
| FOM commercial | PASS | PASS | — | — | — | Admin status | **DONE** · writer **OFF** |
| FOM stock / FOM_POS | — | OFF / PENDING | — | — | — | Honest | **CONTRACT_PENDING** |
| Workers | PASS | PASS | — | PASS claim | — | — | **DONE** code · **OPS** deploy |
| Redis rate limit | PASS | PASS (test) | — | — | — | — | **DONE** code · **OPS** Redis |
| Backup logical | PASS drill | — | — | PGlite | — | — | **PARTIAL** · managed **OPS** |
| Load / concurrency | — | — | — | P13 PASS | P13.1 PASS | — | **DONE** local · staging **OPS** |
| Admin UI | PASS (phase tests) | — | — | — | — | Edge fixtures | **DONE** honesty |
| PSP sandbox E2E | Harness | PENDING | PENDING | — | — | — | **OPS_REQUIRED** |
| Observability APM | alertCode logs | — | — | — | — | — | **OPS_REQUIRED** |

---

## Cutover Gates (must remain closed until evidence)

1. **FOM_INVENTORY_WRITER_ENABLED** stays `false` until FOM stock contract verified.  
2. **FOM_POS** remains CONTRACT_PENDING until stable external receipt identity.  
3. **Production Payme/Click** remain OFF until sandbox E2E PASS + production credentials process.  
4. **External delivery** remains CONTRACT_PENDING — no invented success.  
5. **PSP outbound refund** remains CONTRACT_PENDING — ledger refund ≠ provider refund.  
6. **Secret encryption at rest** before treating merchant keys as production-safe.  
7. **Managed PITR + restore drill** before production GO.  
8. **REDIS_URL** required for production/staging multi-instance.  
9. **Legacy HMAC** close only after mobile refresh proof.

---

## Open Questions (Product Decision — do not guess)

| ID | Question | Current safe behavior |
|----|----------|------------------------|
| A | Cashier `orders:cancel`? | Denied |
| B | PAID cancel → automatic PSP refund? | Cancel OK; payment axis unchanged; `paymentRefundRequired` + CONTRACT_PENDING |
| C | Reservation expiry auto-cancel fulfillment? | Release + EXPIRED mirror; fulfillment unchanged |
| D | COMPLETED always require PAID? | Not globally locked |
| E | Admin list phone masking policy? | List omits; detail may show |
| Q3 | FOM pickup earn exact timing | Existing earn rules; OPEN |

---

## Domain Status Summaries

### Security
OTP hashed; rate limits; RBAC; audit scrub; PSP fail-closed; alertCode hooks. **Gaps:** KMS at-rest secrets; HMAC dual-accept; TLS/CORS ops; monitoring.

### Payments
In-repo state machine + capture/idempotency/refund caps **DONE**. Outbound refund **CONTRACT_PENDING**. Production PSP **OFF**. Sandbox E2E **OPS_REQUIRED**.

### Cashback
Universal engine **DONE**. FOM_POS **CONTRACT_PENDING**. Correction workflow **OPEN**. Redis≠money (rate limit only).

### Inventory
Axes + reservations + concurrency **DONE**. FOM writer **DISABLED**. Low-stock threshold **NOT_SUPPORTED** (not invented).

### FOM
Status API honest; sale webhook bridge exists; writer OFF; FOM_POS pending; confirm-pos = ORDER. Admin console honesty **DONE** (12.24).

### Delivery
Internal **DONE**. External **CONTRACT_PENDING**.

### Workers
PG queue + SKIP LOCKED **DONE**. Production always-on process **OPS_REQUIRED**.

### Redis
Implementation **DONE**; production provision **OPS_REQUIRED**.

### PostgreSQL / backup
Migrations + P13/P13.1 **DONE**. Managed PITR **OPS_REQUIRED**.

### Observability
Structured logs + alertCode **DONE**. APM/host metrics **OPS_REQUIRED**.

### Scale
Local P13.1 to 1000 branches observed — not production capacity claim. Staging metrics **OPS_REQUIRED**. Near-term 200+ branches: code-supported pending ops proof.

### Admin UI
Not a production blocker. Honesty locks preserved (Reports/Audit/Settings/Adminlar/FOM). Sidebar lucide icons (12.25.1) do not change routes/RBAC.

### Mobile
Critical paths depend on auth/orders/inventory/cashback/checkout/payment APIs already in repo. Production depends on same P0/P1 gates. HMAC mobile refresh is P1.

---

## Git / release state (informational — no commit)

| Item | Value |
|------|-------|
| Branch | `main` (tracks `origin/main`) |
| Working tree | Dirty — Admin Phase 12.x UI + tests + docs uncommitted |
| Last related checkpoints | Universal Cashback 2.0 / Admin hardening commits on history |
| This phase | Documentation + invariant test only — **NO GIT** |

---

## Document control

| Field | Value |
|-------|-------|
| Artifact | `docs/PRODUCTION_GAP_MATRIX.md` |
| Supersedes for gap register | Complements (does not delete) FINAL_PRODUCTION_CLOSURE + OPS runbook |
| Implementation in this phase | None (audit only) |
| Production providers | Remain DISABLED |

**FINAL LINE:**  
PRODUCTION GAP MATRIX AUTHORITATIVE — PRODUCTION NOT READY — P0/P1 GATES EXPLICIT — BUSINESS LOGIC UNCHANGED — NO PROVIDER ENABLED.
