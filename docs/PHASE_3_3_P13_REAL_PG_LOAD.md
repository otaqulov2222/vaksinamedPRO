# P13 — Real PostgreSQL Load + Concurrency + Scale Validation

**Production Payme/Click:** DISABLED  
**FOM inventory writer:** OFF  
**Production cutover:** NOT performed by this phase  

External blockers from P12.2 remain **unchanged** (sandbox E2E creds, managed PITR, GitHub branch protection, secret-at-rest, HMAC mobile refresh, delivery contract, FOM stock contract).

---

## Framework

**Single project-standard tool:** Node.js staging harness (`tsx`) + `pg` Pool multi-connection concurrency.  
No k6/Artillery/autocannon introduced.

| Script | Purpose |
|--------|---------|
| `pnpm p13:load` | Entry + gate + report |
| `artifacts/api-server/src/scripts/p13-real-pg-load.ts` | Bootstrap real PG |
| `artifacts/api-server/src/scripts/p13-real-pg-runner.ts` | Scenarios + matrix |

---

## Real PostgreSQL requirement

```bash
REAL_POSTGRES_LOAD_TEST=1 pnpm p13:load
```

Connection sources (first match):

1. `TEST_DATABASE_URL` (preferred; name should contain `test`)
2. `DATABASE_URL` (must pass `assertSafeTestDatabaseUrl`)
3. `embedded-postgres` (optional local install — not a CI dependency):
   `pnpm --filter @workspace/api-server add -D embedded-postgres@18.4.0-beta.17`
4. Docker Compose profile:

```bash
docker compose --profile p13 up -d postgres
# postgresql://vaksinamed:vaksinamed@localhost:55432/vaksinamed_p13_test
```

If none available: **`REAL_PG_LOAD_PENDING`** — do not claim PASS.

Pool tuning (measure before raising):

| Env | Default |
|-----|---------|
| `PG_POOL_MAX` | 20 (harness sets 40) |
| `PG_POOL_IDLE_MS` | 30000 |
| `PG_POOL_CONNECT_TIMEOUT_MS` | 10000 |

Optional HTTP: `P13_API_BASE_URL=http://127.0.0.1:5000`

---

## Scenarios (repeat ×3 where critical)

| Scenario | Expectation |
|----------|-------------|
| Limited stock 10 + 100 concurrent reserves | successes ≤ 10; no negative; available = physical − reserved |
| Expiry + new reserve race | no double release / negative reserved |
| 100 duplicate captures + dual capture | exactly one capture row |
| Dual full refund + 10 partial | refund sum ≤ captured |
| Concurrent EARN / USE | one EARN per commercial; no negative balance |
| FOM duplicate receipt | ≤1 event; writer OFF |
| Multi-worker claim | one SUCCEEDED (`FOR UPDATE SKIP LOCKED`) |
| Scale seed | 200 / 500 / 1000 branches |
| Read matrix A–F | concurrent users 100–1000 against scale data |

---

## Integrity after load

- `physical >= reserved`, no negatives  
- one capture per intent  
- refund totals ≤ capture  
- FOM writer OFF  
- no multi-capture groups  

---

## Report artifact

`.data/p13-load/last-report.json`

Status vocabulary: **PASS** | **FAIL** | **PENDING** | **NOT_PROVEN**

---

## Evidence (this machine, 2026-09-21)

| Item | Result |
|------|--------|
| Postgres source | **EMBEDDED_POSTGRES** (real PG 18.4 binaries — not PGlite) |
| REAL_PG_LOAD | **PASS** (see `.data/p13-load/last-report.json`) |
| Inventory / expiry / payment / refund / cashback / FOM / worker | **PASS** ×3 |
| Scale 200 / 500 / 1000 branches | **PASS** |
| Matrix A–F (library SQL read paths) | **PASS** (0% error) |
| HTTP API load | **PENDING** (`P13_API_BASE_URL` unset) |
| Infra CPU/memory | **INFRA_METRICS_PENDING** |
| Production PSPs / FOM writer | **disabled** |

### Scale matrix (observed)

| Scenario | Branches | Concurrent Users | Result | p95 (ms) | Error % | DB |
|---|---:|---:|---|---:|---:|---|
| A | 200 | 100 | PASS | 207 | 0 | postgres |
| B | 200 | 250 | PASS | 336 | 0 | postgres |
| C | 200 | 500 | PASS | 719 | 0 | postgres |
| D | 500 | 500 | PASS | 595 | 0 | postgres |
| E | 500 | 1000 | PASS | 936 | 0 | postgres |
| F | 1000 | 1000 | PASS | 911 | 0 | postgres |

Mode: concurrent library SQL (catalog/branch/stock). Not a production capacity claim.
