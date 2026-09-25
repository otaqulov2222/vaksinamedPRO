# Production Gap Matrix

> **Authoritative production gap register** after P1–P13.1 and Admin Phase 12.6A–12.25.1.  
> Evidence window: repository code + docs as of 2026-09-25.  
> **Not a product roadmap.** No invented dates, owners, APIs, or provider contracts.  
> Business logic / API contracts / database schema unchanged by this document.

---

## Executive State

| Decision | Status | Basis |
|----------|--------|-------|
| **TECHNICAL CODE READINESS** | **READY** (in-repo) | P1–P13.1 implemented; CI/typecheck/build/test evidence; Admin honesty console complete |
| **CONTROLLED STAGING** | **NOT READY** | Sandbox PSP E2E, managed PITR, branch protection, failure recovery, infra metrics still EXTERNAL/OPS |
| **PRODUCTION** | **NOT READY** | Same unresolved gates; production Payme/Click OFF; FOM writer OFF |

**PRODUCTION READINESS: NOT READY**

Do not treat repository green as production GO. Aligns with `docs/FINAL_PRODUCTION_CLOSURE.md` and `docs/PRODUCTION_OPS_RUNBOOK.md`.

---

## Phase 12.27 — P0 gate verification (2026-09-25)

Workspace verification only. **No managed staging/production infrastructure available from this environment.** No production enablement. No secrets printed.

### P0 closure matrix

| P0 | Current State | Evidence | Can verify here? | Result | Remaining action |
|----|---------------|----------|------------------|--------|------------------|
| P0-1 Managed PostgreSQL PITR + restore | Unproven managed PITR | Local TCP `5432=False`; `DATABASE_URL=MISSING`; in-repo `pnpm backup:drill` = PGlite logical only (`P12_2`, ops runbook §1.1); P13/P13.1 embedded PG ≠ managed PITR | No (no managed PG) | **OPS_REQUIRED** | Provision managed PG; enable automated backups + PITR; restore into empty staging; record RPO/RTO |
| P0-2 Merchant secret KMS-at-rest | Plaintext columns; no KMS | Schema `branches.payme_key` / `click_secret` text; `branchPaymentMerchant.ts` WeakMap + “Encryption-at-rest is NOT implemented”; homemade crypto forbidden | Code verified | **BLOCKED** | Implement KMS/Vault decrypt path after ops provisions KMS; then encrypt columns — do not invent crypto |
| P0-3a Payme sandbox E2E | Credentials absent | `PAYME_SANDBOX_*=MISSING`; harness → `PAYME_SANDBOX_E2E: PENDING` (`.data/sandbox-e2e/last-harness.json`); production PSP OFF | Harness yes; live E2E no | **OPS_REQUIRED** | Set sandbox key + merchant id + `SANDBOX_E2E_RUN=1` on staging; run `pnpm sandbox:e2e` |
| P0-3b Click sandbox E2E | Credentials absent | `CLICK_SANDBOX_*=MISSING`; harness → `CLICK_SANDBOX_E2E: PENDING`; same harness | Harness yes; live E2E no | **OPS_REQUIRED** | Set sandbox secret/service/merchant + `SANDBOX_E2E_RUN=1`; run harness |
| P0-4 Production Redis live verify | Code DONE; live Redis absent | `REDIS_URL=MISSING`; local `6379=False`; `redis.ts` fail-closed + PING for prod/staging; memory fallback for dev only | Code yes; live no | **OPS_REQUIRED** | Provision Redis; set `REDIS_URL`; warm PING; rate-limit + multi-instance verify on staging |

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

## Phase 12.30 — Redis production gate (checkpoint note)

**Not implemented as a full phase today** (daily checkpoint rule: no large new Redis implementation).

| Item | State |
|------|--------|
| In-repo rate-limit + Redis client | **READY_IN_REPO** (`redis.ts` fail-closed; `assertProductionRedisConfig`) |
| `REDIS_URL` in this workspace | **MISSING** |
| TCP `6379` | **CLOSED** (spot-check 2026-09-25) |
| Live multi-instance verify | **NOT_PROVEN** |
| Production Redis gate | **OPS_REQUIRED** |

Do not claim production Redis without live PING + shared rate-limit evidence on staging.

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
| P0-1 Managed PG + PITR + restore | **OPS_REQUIRED** |
| P0-2 Merchant secret KMS | App **READY_IN_REPO**; KMS **OPS_REQUIRED** |
| P0-3a/b Sandbox Payme/Click E2E | **OPS_REQUIRED** |
| P0-4 Redis live | **OPS_REQUIRED** |

### Explicit non-enablement

| Gate | State |
|------|-------|
| Production Payme/Click | **OFF** |
| FOM inventory writer | **OFF** |
| FOM POS | **CONTRACT_PENDING** |
| External delivery success | **CONTRACT_PENDING** |
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
| P0-2 | Branch merchant secret encryption at rest (KMS/Vault) | **OPS_REQUIRED** (12.28: app boundary **IMPLEMENTED**; cloud KMS still ops) | `merchantSecretCrypto.ts` AES-GCM `enc:v1:`; fail-closed without `MERCHANT_SECRET_KEK`; no cloud KMS SDK | Ciphertext path ready; KEK/KMS provisioning + row migration remain | Security + DevOps + Backend | Inject KEK from approved secret manager; migrate plaintext → `enc:v1:`; then prefer KMS-wrapped KEK |
| P0-3 | Payme + Click sandbox E2E (before any production PSP enable) | **OPS_REQUIRED** (12.27: both PENDING) | Harness executable; all sandbox env MISSING → PENDING | Cannot safely enable live PSP | External Provider + DevOps | Staging sandbox secrets + `pnpm sandbox:e2e` PASS |
| P0-4 | Production/staging Redis (`REDIS_URL`) live multi-instance verify | **OPS_REQUIRED** (12.27; code **DONE**) | REDIS_URL MISSING; port 6379 closed; fail-closed code intact | Rate limits must be shared | DevOps | Provision Redis; live PING + rate-limit verify |

---

## P1 — Required Before Production

| # | Capability | Current State | Evidence | Why it matters | Owner Type | Next Action |
|---|------------|---------------|----------|----------------|------------|-------------|
| P1-1 | GitHub branch protection (required CI checks) | **OPS_REQUIRED** | `GITHUB_REQUIRED_CHECKS.md`; CI jobs exist; toggle is admin ops | Unprotected main allows ship without gates | DevOps | Require Typecheck + Build/tests + Docker jobs on default branch |
| P1-2 | Staging failure-recovery drills (API/worker/DB restart) | **OPS_REQUIRED** | P13.1 `FAILURE_RECOVERY: NOT_PROVEN`; FINAL checklist | Unknown recovery behavior under fault | DevOps | Execute restart drills on staging; record results |
| P1-3 | Close legacy HMAC dual-accept after mobile `s1.*`-only | **OPEN** | `securityEnv.ts` `allowLegacyHmacTokens`; FINAL HMAC_MOBILE_REFRESH_REQUIRED | Dual-accept widens auth attack surface | Frontend + Security | Ship mobile `s1.*` only → quiet period → `ALLOW_LEGACY_HMAC_TOKENS=0` |
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
| E-3 | External delivery / courier provider | **CONTRACT_PENDING** | `deliveryAdapters.ts`; deliveries route probe | External ETA/tracking not available | External Provider | Verified courier API contract |
| E-4 | PSP outbound refund adapter (Payme/Click) | **CONTRACT_PENDING** | `paymentService` / adapters refund CONTRACT_PENDING | Auto provider refund not invented | External Provider | Documented refund API + sandbox proof |
| E-5 | Production Payme/Click live credentials | **NOT_SUPPORTED** (intentionally OFF) until E2E | Fail-closed production flags | Premature enable = financial risk | External Provider + DevOps | After sandbox PASS only |

---

## Operations Required

| # | Item | Current State | Evidence | Next Action |
|---|------|---------------|----------|-------------|
| O-1 | Staging environment with HTTPS + secrets | **OPS_REQUIRED** | Ops runbook | Provision staging |
| O-2 | Docker image push/registry (CI builds only) | **OPS_REQUIRED** | CI docker job PASS; no push | Decide registry + push policy |
| O-3 | TLS termination / CORS production config | **OPS_REQUIRED** | Assumptions in security docs | Document and configure edge |
| O-4 | Worker process always-on in production | **OPS_REQUIRED** (code **DONE**) | `worker_jobs` + SKIP LOCKED; explicit enable flag | Run worker supervisor with prod flags |
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
