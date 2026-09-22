# Final Production Closure — Post-P13

**Date evidence window:** 2026-09-22
**Production Payme/Click:** DISABLED
**FOM inventory writer:** OFF
**Automatic production cutover:** NOT performed

This document is the final gate assessment. Repository tests alone do **not** make production READY.

**Operational procedures:** see `docs/PRODUCTION_OPS_RUNBOOK.md` (pre-prod gates, sandbox E2E, PSP/FOM/delivery cutover, HMAC, incidents, GO/NO-GO).

---

## Three decisions

| Decision | Status |
|----------|--------|
| **TECHNICAL CODE READINESS** | **READY** (in-repo P1–P13 + CI green evidence) |
| **CONTROLLED STAGING** | **NOT READY** (sandbox PSP, managed PITR, branch protection, failure recovery, infra/query metrics still EXTERNAL; local HTTP-on-real-PG closed by P13.1) |
| **PRODUCTION** | **NOT READY** |

---

## Checklist

| Area | Status | Evidence / gap |
|------|--------|----------------|
| CODE | **PASS** | P1–P13 implemented; typecheck/build/tests in CI |
| DATABASE | **PASS** (migrations/concurrency) · **EXTERNAL_REQUIRED** (managed PITR) | Migrations 0000–0008; P13 real PG concurrency PASS; managed backup unproven |
| SECURITY | **PASS** | Security suite; RBAC; redaction; fail-closed PSP flags |
| PAYMENTS | **PASS** (code) · **EXTERNAL_REQUIRED** (sandbox E2E) | Capture/idempotency/refund concurrency PASS ×3; live Payme/Click sandbox absent |
| REFUNDS | **PASS** | Concurrent refund ≤ captured; provider outbound CONTRACT_PENDING |
| INVENTORY | **PASS** | Limited-stock race PASS ×3; invariants checked |
| RESERVATIONS | **PASS** | Expiry race PASS ×3 |
| ORDERS | **PASS** | P5 axes + AuthZ contracts |
| DELIVERY | **BLOCKED** / **EXTERNAL_REQUIRED** | Internal OK; external `DELIVERY_CONTRACT_REQUIRED` |
| FOM | **PASS** (commercial/idempotency) · **EXTERNAL_REQUIRED** (stock) | Writer OFF; `FOM_STOCK_CONTRACT_REQUIRED` |
| WORKERS | **PASS** | SKIP LOCKED claim PASS ×3 |
| CI/CD | **PASS** (workflow) · **EXTERNAL_REQUIRED** (branch protection) | Jobs green on `f408a52`; required checks toggle is admin ops |
| BACKUP | **PARTIAL** · **EXTERNAL_REQUIRED** | PGlite logical drill PASS; managed PITR unproven |
| MONITORING | **NOT_PROVEN** / **EXTERNAL_REQUIRED** | No APM/host metrics in this environment |
| LOAD | **PASS** (SQL/PG + local HTTP P13.1) · staging host metrics still EXTERNAL | P13 SQL PASS; P13.1 HTTP→embedded PG PASS — see `docs/PHASE_3_3_P13_1_HTTP_REAL_PG.md` |
| ROLLBACK | **NOT_PROVEN** / **EXTERNAL_REQUIRED** | No staging failure-recovery drill executed here |

---

## External operations required (exact)

1. **HTTP_LOAD_LOCAL_P13_1_PASS** — Closed locally via `pnpm p13:1` (embedded real PG 18.4 + `dist/index.mjs`). Managed/staging PG + host metrics remain EXTERNAL.
2. **FAILURE_RECOVERY_EXTERNAL_STAGING_REQUIRED** — API/worker/DB restart drills on staging
3. **QUERY_PROFILING_NOT_PROVEN** — Enable `pg_stat_statements` (or equivalent) on staging PG
4. **INFRA_METRICS_EXTERNAL_REQUIRED** — CPU/memory/queue/DB connection dashboards
5. **PAYME_SANDBOX_E2E_EXTERNAL_REQUIRED** — Sandbox keys + `SANDBOX_E2E_RUN=1` on staging
6. **CLICK_SANDBOX_E2E_EXTERNAL_REQUIRED** — Same for Click
7. **MANAGED_POSTGRES_PITR_EXTERNAL_REQUIRED** — Provider backup/PITR + restore drill evidence
8. **GITHUB_REQUIRED_CHECKS_EXTERNAL_REQUIRED** — Branch protection requiring CI job names (see `docs/GITHUB_REQUIRED_CHECKS.md`)
9. **DOCKER_RUNNER_EXTERNAL_REQUIRED** (local) — Local Docker CLI absent; **CI docker job PASS** on GitHub
10. **SECRET_ENCRYPTION_AT_REST_REQUIRED** — KMS/Vault before encrypting `payme_key` / `click_secret`
11. **HMAC_MOBILE_REFRESH_REQUIRED** — Ship `s1.*`-only mobile, then close dual-accept
12. **DELIVERY_CONTRACT_REQUIRED** — Verified external courier API
13. **FOM_STOCK_CONTRACT_REQUIRED** — Vendor stock write contract (writer stays OFF)

---

## FOM stock contract (required before any writer enable)

| Field | Requirement |
|-------|-------------|
| Branch identity | Stable FOM branch → internal branch map |
| SKU/barcode | Explicit product map; unknown → reject |
| Quantity | Integer; absolute vs delta defined |
| Semantics | Physical vs available; never blind overwrite of reserved |
| Event ID | Vendor-stable unique id |
| Timestamp | Event UTC + ingest time |
| Retry / duplicate | Idempotent unique constraint |
| Auth | Shared secret / signed webhook |
| Reconciliation | Diff report before cutover |
| Correction/reversal | Explicit correction events — no invent |

---

## HMAC closure gate

1. Mobile stores only `s1.*` sessions
2. Set `LEGACY_HMAC_DEADLINE`
3. Quiet period with zero legacy accepts
4. `ALLOW_LEGACY_HMAC_TOKENS=0`

Until then: **HMAC_MOBILE_REFRESH_REQUIRED**

---

## Validation evidence (this closure batch)

| Suite | Result |
|-------|--------|
| typecheck | **PASS** |
| build (api + admin) | **PASS** |
| DB tests | **PASS** 173/173 |
| API tests | **PASS** 119/119 |
| security | **PASS** 43/43 |
| backup drill (PGlite logical) | **PASS** |
| sandbox E2E | **PENDING** (no credentials) |
| HTTP load (`P13_API_BASE_URL` → local PGlite) | **SUPERSEDED** by P13.1 |
| HTTP load P13.1 (real API → embedded PG) | **PASS** — `.data/p13-1-http/last-report.json` |
| P13 real-PG concurrency | **PASS** (prior evidence `.data/p13-load/last-report.json` / embedded PG 18.4) |
| GitHub CI (`f408a52`) | **PASS** (typecheck + build/tests + docker) |
| Local Docker CLI | **ABSENT** → runner ops still useful for local rebuilds |

---

## Commands

```bash
pnpm sandbox:e2e
pnpm --filter @workspace/api-server exec tsx src/scripts/p13-1-http-real-pg.ts   # P13.1 local real-PG HTTP
P13_API_BASE_URL=https://staging.example pnpm p13:http
REAL_POSTGRES_LOAD_TEST=1 TEST_DATABASE_URL=postgresql://... pnpm p13:load
pnpm run typecheck && pnpm test && pnpm test:security
```

---

## Production enablement (manual only — NOT done here)

Operators must explicitly:

1. Close all EXTERNAL_REQUIRED items with evidence
2. Enable Payme/Click merchant flags only after sandbox E2E PASS
3. Keep FOM inventory writer OFF until stock contract verified
4. Cut over with documented rollback

**FINAL LINE:**
FINAL PRODUCTION CLOSURE COMPLETE — CODE AND STAGING READINESS ASSESSED — ALL REMAINING EXTERNAL GATES EXPLICIT — NO PRODUCTION PROVIDER ENABLED.
