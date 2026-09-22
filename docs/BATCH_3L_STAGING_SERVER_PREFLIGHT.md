# Batch 3L — Staging Server Discovery + Infrastructure Preflight

**Date:** 2026-09-22  
**Mode:** DISCOVERY + PREFLIGHT (no install, no production traffic)  
**Server SSH / host credentials:** **NOT PROVIDED** in this environment  

| Discovery item | Status |
|----------------|--------|
| OS / CPU / RAM / disk | **NOT_RUN** — no `STAGING_HOST` / `SSH_HOST` / deploy credentials |
| SSH / firewall / ports | **NOT_RUN** |
| Partitions / 1 TB layout | **NOT_RUN** (proposed layout only — do not format) |
| Live install of PG/Redis/API | **NOT DONE** (by design) |

**Local context only:** `P13_API_BASE_URL` points at loopback `http://127.0.0.1:5000` (dev), not a staging server.

Until operators provide SSH (or equivalent) access, all host-specific sizing remains **PENDING**.

---

## Architecture recommendation (codebase-driven; confirm after discovery)

### PostgreSQL (SoT)

**Preferred when server is a single VPS with ~1 TB disk and ops will own backups:**

**A. PostgreSQL 16+ on host** (not PGlite; not inventing managed provider).

| Option | When to choose |
|--------|----------------|
| **A. Host PostgreSQL** | Single staging/prod VPS; full control of WAL/backup paths; matches docker-compose image `postgres:16` |
| **B. PostgreSQL container** | Acceptable for **staging only** if host PG ops unavailable; data volume on dedicated disk path; still need host-level backup of volume |
| **C. External managed PostgreSQL** | Prefer for **production** if provider PITR/HA is available; this batch cannot assume provider |

**Default recommendation for first staging bring-up (until discovery):** **A (host PG 16)** for staging SoT on the new 1 TB server, with a **separate** `vaksinamed_staging` database and a **separate** `vaksinamed_*_test` DB for P13/HTTP IDOR. Redis is **optional** (see below).

### Redis

**Current code:** workers are **PostgreSQL `worker_jobs` + `FOR UPDATE SKIP LOCKED`**. No BullMQ/ioredis dependency in api-server.  

**Plan:** Do **not** install Redis until a concrete non-SoT need is proven (rate-limit store, future cache). Money / cashback / inventory / orders / payments remain PostgreSQL-only.

### Workers

Job types already in code (`artifacts/api-server/src/lib/workers.ts`):

- `reservation_expiry`
- `payment_expiry`
- `fom_retry`
- `notification`
- `delivery_provider_retry`

Enable via `ENABLE_BACKGROUND_WORKERS=1` on staging (never invent a second queue). Same API process or sibling `node dist/index.mjs` with worker flag — follow existing entrypoints; do not duplicate workers.

### API

```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start   # node dist/index.mjs
```

- Port: `PORT` (default 5000)  
- Live: `GET /api/health/live`  
- Ready: `GET /api/health/ready` (requires PostgreSQL)  
- `APP_ENV=staging`, `NODE_ENV=production`, `DB_DRIVER=postgres`, `DATABASE_URL=…`

### Reverse proxy / HTTPS

Internet → TLS terminator (Nginx **or** Caddy — choose after OS discovery) → `127.0.0.1:PORT` API.  
Production TLS: public CA (not self-signed). Staging may use Let's Encrypt on staging hostname.

---

## Proposed disk layout (~1 TB) — DO NOT APPLY until discovery + approval

Illustrative only (paths assume Linux; adjust after OS discovery):

| Mount / path | Role | Notes |
|--------------|------|-------|
| `/` | OS | Keep modest |
| `/var/lib/postgresql` | PG data | Separate volume/subdir; not the only backup location |
| `/opt/vaksinamed` | App checkout + `dist` | Deploy artifact |
| `/var/log/vaksinamed` | App/worker logs | Rotate |
| `/var/backups/vaksinamed` | Local backup staging | **Copy off-server** |
| temp | OS temp | Do not put WAL-only here long-term |

Do **not** give 100% of 1 TB to PostgreSQL. Reserve free space for WAL growth, backups, upgrades.

---

## PostgreSQL sizing template (fill numbers after RAM/CPU discovery)

| Setting | Guidance |
|---------|----------|
| Version | **16+** (compose uses 16-alpine) |
| `max_connections` | Start ~100–200; keep `PG_POOL_MAX` (app default 20, cap 200) × process count **well below** `max_connections` |
| `shared_buffers` | ~25% RAM typical starting point (measure) |
| `effective_cache_size` | ~50–75% RAM |
| WAL / archive | Required for PITR **if** claiming PITR |
| `pg_stat_statements` | **ON** for staging |
| Timezone | DB `timestamptz` UTC; app business day Asia/Tashkent |
| Autovacuum | ON; monitor bloat after load tests |
| Pool | App `pg` Pool via `PG_POOL_MAX`; optional PgBouncer later — not required day-1 |

---

## Secrets — names only (never commit values)

| Category | Variable names (from `.env.example` / code) |
|----------|-----------------------------------------------|
| Database | `DATABASE_URL`, `TEST_DATABASE_URL`, `DB_DRIVER`, `PG_POOL_MAX` |
| Runtime | `PORT`, `APP_ENV`, `NODE_ENV` |
| Auth | `ADMIN_SECRET`, `CUSTOMER_SECRET`, `POS_SECRET` |
| Sessions | `ALLOW_LEGACY_HMAC_TOKENS`, `LEGACY_HMAC_DEADLINE` |
| SMS | `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM` |
| FOM | `FOM_WEBHOOK_SECRET` (writer stays OFF in code) |
| Payme | `PAYME_MERCHANT_API_ENABLED` (keep `0`), sandbox aliases, branch `paymeKey` at rest |
| Click | `CLICK_MERCHANT_API_ENABLED` (keep `0`), sandbox aliases, branch `clickSecret` |
| Delivery | `EXTERNAL_DELIVERY_ENABLED` (keep unset/`0`) |
| Workers | `ENABLE_BACKGROUND_WORKERS` |
| P13 / IDOR | `REAL_POSTGRES_LOAD_TEST`, `P13_API_BASE_URL`, `P13_FOREIGN_ORDER_ID`, `SANDBOX_E2E_RUN` |

**At-rest:** KMS/Vault (or OS secret store) for PSP merchant keys before production. Staging secrets ≠ production secrets.

---

## Backup / PITR plan (not complete until tested)

1. Logical: `pg_dump` scheduled + retention  
2. WAL archive / provider PITR if architecture supports it  
3. Encrypt backups  
4. **Off-server** copy (not only same 1 TB disk)  
5. Restore drill into empty staging DB  
6. Document RPO/RTO after measured restore  
7. Alert on backup failure  

Status today: **NOT_PROVEN** for managed/host PITR.

---

## Monitoring plan

| Layer | Metrics | Source |
|-------|---------|--------|
| Host | CPU, RAM, disk, I/O, network | OS / agent (**INFRASTRUCTURE-NOT-YET-PROVEN**) |
| Postgres | connections, locks, slow queries, disk, WAL | `pg_stat_statements` + OS |
| API | latency, 4xx/5xx, uptime, `/health/*` | reverse proxy + app logs (pino) |
| Workers | failures, DEAD jobs, schedule lag | `worker_jobs` + alerts module |

Do not invent APM product names as installed.

---

## Failure drills (staging only)

1. API restart  
2. Worker restart  
3. PostgreSQL restart  
4. Redis restart (N/A until installed)  
5. Network interruption  
6. Failed worker job  
7. Connection exhaustion (`PG_POOL_MAX` / `max_connections`)  
8. Disk pressure  
9. Backup restore  

Never against production.

---

## HTTP IDOR + P13 (after staging API + real PG)

```bash
# Migrations 0000–0010 on staging/test DB first
REAL_POSTGRES_LOAD_TEST=1
TEST_DATABASE_URL='postgresql://…/vaksinamed_test'   # name must contain "test"
P13_API_BASE_URL='https://staging.example'           # real staging HTTPS API
P13_FOREIGN_ORDER_ID='<branch-B-order-id>'
pnpm --filter @workspace/api-server exec tsx src/scripts/admin-3j-http-idor.ts
pnpm --filter @workspace/api-server run p13:load
# optional local embedded: pnpm --filter @workspace/api-server run p13:1
```

Do not claim PASS without report files. Production PSP/FOM writer/external delivery stay OFF.

---

## Exact next commands for operators

1. Provide staging SSH (or console) access: host, user, auth method (no passwords in chat).  
2. Re-run Batch 3L §1–3 discovery on the live host; fill measured CPU/RAM/disk.  
3. Approve PG architecture (A/B/C) for **staging**.  
4. Create OS users, firewall allowlist, non-root deploy user.  
5. Install **only after** signed plan: PostgreSQL 16 → migrate 0000–0010 → API build → reverse proxy TLS → workers flag.  
6. Seed Branch A/B cashiers + foreign order → HTTP IDOR + P13.  
7. PSP **sandbox** only when credentials exist (`SANDBOX_E2E_RUN=1`).  

**Hard rules:** no production PSP, no FOM inventory writer, no external delivery enablement, no git add/commit/push from this batch.
