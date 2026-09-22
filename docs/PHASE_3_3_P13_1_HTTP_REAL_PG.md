# P13.1 — Real HTTP API + Real PostgreSQL Load Validation

**Status:** COMPLETE (non-production)
**Date:** 2026-09-22
**Artifact:** `.data/p13-1-http/last-report.json`
**Command:** `pnpm --filter @workspace/api-server exec tsx src/scripts/p13-1-http-real-pg.ts` (or `pnpm p13:1` when preinstall/sh available)

## Safety

| Flag | Value |
|------|-------|
| Payme production | OFF |
| Click production | OFF |
| FOM inventory writer | OFF |
| Target | Embedded real PostgreSQL 18.4 (not PGlite, not production) |
| API | `dist/index.mjs` on port 5100 |

## Decisions

| Gate | Result |
|------|--------|
| REAL_HTTP_API | **PASS** |
| REAL_POSTGRES | **PASS** |
| INVENTORY_HTTP_CONCURRENCY | **PASS** (3/3, successes=10, reserved=10) |
| PAYMENT_HTTP_CONCURRENCY | **PASS** (3/3, captures=1) |
| REFUND_HTTP_CONCURRENCY | **PASS** (3/3, refund total ≤ capture) |
| CASHBACK_HTTP_CONCURRENCY | **PASS** (3/3, one EARN, balance ≥ 0) |
| BRANCH_ISOLATION_HTTP | **PASS** |
| FAILURE_RECOVERY | **NOT_PROVEN** |
| PERFORMANCE | **OBSERVED** |
| PRODUCTION | **NOT READY** |
| QUERY_PROFILING | **NOT_PROVEN** |
| INFRA_METRICS | **NOT_PROVEN** |

## Performance matrix (read-heavy HTTP)

| Scenario | Branches | Users | Requests | Success | Errors | p50 | p95 | p99 | DB wait |
|----------|---------:|------:|---------:|--------:|-------:|----:|----:|----:|---------|
| A | 200 | 100 | 200 | 200 | 0 | 468 | 1408 | 1591 | NOT_PROVEN |
| B | 200 | 250 | 500 | 500 | 0 | 992 | 1684 | 2104 | NOT_PROVEN |
| C | 200 | 500 | 1000 | 1000 | 0 | 1826 | 3308 | 4003 | NOT_PROVEN |
| D | 500 | 500 | 1000 | 1000 | 0 | 1905 | 2872 | 3236 | NOT_PROVEN |
| E | 500 | 1000 | 1000 | 1000 | 0 | 2434 | 4838 | 4905 | NOT_PROVEN |
| F | 1000 | 1000 | 1000 | 1000 | 0 | 2743 | 4775 | 4811 | NOT_PROVEN |

Throughput (approx RPS): A 116, B 189, C 205, D 221, E 199, F 205.

## Notes

- Pool: `PG_POOL_MAX=40` (unchanged; no exhaustion requiring increase).
- Auth: invalid → 401; valid session `/api/auth/me` → OK. Concurrency races mint sessions via PG to avoid auth rate-limit (HTTP auth path still probed).
- Does **not** claim production capacity.
- Remaining external: staging HMAC/PITR/sandbox PSP, failure-injection infra, query/infra metrics.

FINAL LINE:

P13.1 COMPLETE — REAL HTTP API + REAL POSTGRESQL LOAD VALIDATION FINISHED — PRODUCTION PROVIDERS REMAIN DISABLED.
